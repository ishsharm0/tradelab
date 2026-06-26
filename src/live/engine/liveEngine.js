import { calculatePositionSize } from "../../utils/positionSizing.js";
import { normalizeCandles } from "../../data/csv.js";
import { isEODBar, ocoExitCheck } from "../../engine/execution.js";
import {
  callSignalWithContextAsync,
  normalizeSignal,
  snapshotOpenPosition,
} from "../../engine/barSystemRunner.js";
import { BrokerClock } from "../clock.js";
import { EventBus } from "../events.js";
import { BrokerFeed } from "../feed/brokerFeed.js";
import { PollingFeed } from "../feed/pollingFeed.js";
import { RiskManager } from "./riskManager.js";
import { StateManager } from "./stateManager.js";
import { JsonFileStorage } from "../storage/jsonFileStorage.js";

function asNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function oppositeSide(side) {
  return side === "long" ? "sell" : "buy";
}

function nowIso() {
  return new Date().toISOString();
}

function matchesPendingOrder(pendingOrder, order) {
  if (!pendingOrder || !order) return false;
  if (order.orderId && pendingOrder.orderId && order.orderId === pendingOrder.orderId) return true;
  if (
    order.clientOrderId &&
    pendingOrder.clientOrderId &&
    order.clientOrderId === pendingOrder.clientOrderId
  ) {
    return true;
  }
  return false;
}

function isOrderForSymbol(order, symbol) {
  return !order?.symbol || order.symbol === symbol;
}

/**
 * Bar-driven live engine that reuses the same signal contract as backtest.
 */
export class LiveEngine {
  constructor(options = {}) {
    if (typeof options.signal !== "function") {
      throw new Error(`liveEngine requires a signal function, got ${typeof options.signal}`);
    }
    if (!options.broker) {
      throw new Error("liveEngine requires a broker adapter");
    }
    if (!options.symbol) {
      throw new Error("liveEngine requires symbol");
    }

    this.options = {
      interval: "1m",
      mode: "streaming",
      pollIntervalMs: 60_000,
      warmupBars: 200,
      equity: 10_000,
      riskPct: 1,
      finalTP_R: 3,
      flattenAtClose: false,
      qtyStep: 0.001,
      minQty: 0.001,
      maxLeverage: 2,
      dailyMaxTrades: 0,
      entryChase: {
        enabled: true,
        afterBars: 2,
        maxSlipR: 0.2,
        convertOnExpiry: false,
      },
      logLevel: "info",
      ...options,
    };

    this.symbol = this.options.symbol;
    this.interval = this.options.interval;
    this.namespace =
      this.options.id || `${this.symbol}-${this.interval}`.replace(/[^a-zA-Z0-9._-]/g, "_");
    this.broker = this.options.broker;
    this.feed =
      this.options.feed ||
      (this.options.mode === "polling"
        ? new PollingFeed({
            broker: this.broker,
            pollIntervalMs: this.options.pollIntervalMs,
          })
        : new BrokerFeed({ broker: this.broker }));
    this.eventBus = this.options.eventBus || new EventBus();
    this.storage = this.options.storage || new JsonFileStorage();
    this.stateManager = new StateManager({ storage: this.storage });
    this.riskManager = new RiskManager({
      maxDailyLossPct: this.options.maxDailyLossPct,
      maxDailyTrades: this.options.dailyMaxTrades,
      ...(this.options.risk || {}),
    });
    this.clock = new BrokerClock();

    this.running = false;
    this.connected = false;
    this.subscriptions = [];
    this.candleBuffer = [];
    this.lastBarTime = null;
    this.openPosition = null;
    this.pendingOrder = null;
    this.tradeIdCounter = 0;
    this.trades = [];
    this.eqSeries = [];
    this.equity = this.options.equity;
    this.dayPnl = 0;
    this.dayTrades = 0;
    this.startedAt = null;

    this._boundOrderSubmitted = (payload) => this._forwardBrokerEvent("order:submitted", payload);
    this._boundOrderFilled = (payload) => this._handleOrderFilled(payload);
    this._boundOrderCanceled = (payload) => this._handleOrderCanceled(payload);
    this._boundOrderRejected = (payload) => this._handleOrderRejected(payload);
    this._boundOrderModified = (payload) => this._forwardBrokerEvent("order:modified", payload);
  }

  _emit(event, payload = {}) {
    this.eventBus.emitEvent(event, payload);
  }

  _forwardBrokerEvent(event, payload = {}) {
    if (!isOrderForSymbol(payload, this.symbol)) return;
    this._emit(event, { ...payload, symbol: payload.symbol || this.symbol });
  }

  _attachBrokerListeners() {
    this.broker.on("order:submitted", this._boundOrderSubmitted);
    this.broker.on("order:filled", this._boundOrderFilled);
    this.broker.on("order:canceled", this._boundOrderCanceled);
    this.broker.on("order:rejected", this._boundOrderRejected);
    this.broker.on("order:modified", this._boundOrderModified);
  }

  _detachBrokerListeners() {
    this.broker.off("order:submitted", this._boundOrderSubmitted);
    this.broker.off("order:filled", this._boundOrderFilled);
    this.broker.off("order:canceled", this._boundOrderCanceled);
    this.broker.off("order:rejected", this._boundOrderRejected);
    this.broker.off("order:modified", this._boundOrderModified);
  }

  _appendBar(bar) {
    this.candleBuffer.push(bar);
    const maxSize = Math.max(10, Number(this.options.warmupBars || 200) + 100);
    if (this.candleBuffer.length > maxSize) {
      this.candleBuffer.splice(0, this.candleBuffer.length - maxSize);
    }
    this.lastBarTime = bar.time;
  }

  _currentMarkPrice(defaultPrice = null) {
    return this.candleBuffer.length
      ? this.candleBuffer[this.candleBuffer.length - 1].close
      : defaultPrice;
  }

  _markedEquity(markPrice = null) {
    if (!this.openPosition) return this.equity;
    const mark = Number.isFinite(markPrice)
      ? markPrice
      : this._currentMarkPrice(this.openPosition.entryFill);
    const direction = this.openPosition.side === "long" ? 1 : -1;
    return this.equity + (mark - this.openPosition.entryFill) * direction * this.openPosition.size;
  }

  _signalContext(bar) {
    const markEquity = this._markedEquity(bar.close);
    return {
      candles: this.candleBuffer,
      index: this.candleBuffer.length - 1,
      bar,
      equity: markEquity,
      openPosition: this.openPosition ? snapshotOpenPosition(this.openPosition, bar.close) : null,
      pendingOrder: this.pendingOrder,
    };
  }

  async _persistState() {
    await this.stateManager.save(this.namespace, {
      openPosition: this.openPosition,
      pendingOrder: this.pendingOrder,
      equity: this.equity,
      candleBuffer: this.candleBuffer,
      strategyState: {},
      lastBarTime: this.lastBarTime,
      dayPnl: this.dayPnl,
      dayTrades: this.dayTrades,
      tradeIdCounter: this.tradeIdCounter,
      savedAt: Date.now(),
    });
  }

  async _recordEquity(timeMs, markPrice) {
    const point = {
      time: timeMs,
      timestamp: timeMs,
      equity: this._markedEquity(markPrice),
    };
    this.eqSeries.push(point);
    await this.stateManager.appendEquityPoint(this.namespace, point);
    this._emit("equity:update", {
      symbol: this.symbol,
      equity: point.equity,
      time: point.time,
    });
  }

  async _submitEntry(signalDecision, { hasExplicitEntry }) {
    const riskFraction = Number.isFinite(signalDecision.riskFraction)
      ? signalDecision.riskFraction
      : Number.isFinite(signalDecision.riskPct)
        ? signalDecision.riskPct / 100
        : this.options.riskPct / 100;

    const requestedSize = Number.isFinite(signalDecision.qty)
      ? signalDecision.qty
      : calculatePositionSize({
          equity: this._markedEquity(signalDecision.entry),
          entry: signalDecision.entry,
          stop: signalDecision.stop,
          riskFraction,
          qtyStep: this.options.qtyStep,
          minQty: this.options.minQty,
          maxLeverage: this.options.maxLeverage,
        });
    if (!(requestedSize >= this.options.minQty)) return;

    const positionValue = Math.abs(signalDecision.entry * requestedSize);
    const canOpen = this.riskManager.canOpenPosition({
      timeMs: this.lastBarTime || Date.now(),
      positionCount: this.openPosition ? 1 : 0,
      positionValue,
      equity: this._markedEquity(signalDecision.entry),
    });
    if (!canOpen.ok) {
      this._emit("risk:warning", { symbol: this.symbol, reason: canOpen.reason });
      return;
    }

    const side = signalDecision.side === "long" ? "buy" : "sell";
    const orderType = hasExplicitEntry ? "limit" : "market";
    const clientOrderId = `${this.namespace}-entry-${Date.now()}`;
    const expiryBars = signalDecision._entryExpiryBars ?? 5;
    this.pendingOrder = {
      side: signalDecision.side,
      entry: signalDecision.entry,
      stop: signalDecision.stop,
      tp: signalDecision.takeProfit,
      riskFrac: riskFraction,
      fixedQty: signalDecision.qty ?? requestedSize,
      expiresAt: this.candleBuffer.length - 1 + Math.max(1, expiryBars),
      startedAtIndex: this.candleBuffer.length - 1,
      meta: signalDecision,
      plannedRiskAbs: Math.abs(
        signalDecision._initRisk ?? signalDecision.entry - signalDecision.stop
      ),
      orderId: null,
      clientOrderId,
      type: orderType,
      _chasedCE: false,
    };

    const receipt = await this.broker.submitOrder({
      symbol: this.symbol,
      side,
      type: orderType,
      qty: requestedSize,
      limitPrice: orderType === "limit" ? signalDecision.entry : undefined,
      clientOrderId,
    });
    if (!this.pendingOrder) return;
    this.pendingOrder.orderId = receipt.orderId || this.pendingOrder.orderId;
    if (receipt.clientOrderId) this.pendingOrder.clientOrderId = receipt.clientOrderId;
    await this._persistState();
    if (receipt.status === "filled") {
      await this._handleOrderFilled(receipt);
    }
  }

  async _submitExit(reason, priceHint, kind = "market") {
    if (!this.openPosition) return;
    this.openPosition._pendingExitReason = reason;
    this.openPosition._pendingExitPriceHint = priceHint;
    const receipt = await this.broker.submitOrder({
      symbol: this.symbol,
      side: oppositeSide(this.openPosition.side),
      type: kind,
      qty: this.openPosition.size,
      limitPrice: kind === "limit" ? priceHint : undefined,
      stopPrice: kind === "stop" ? priceHint : undefined,
      clientOrderId: `${this.namespace}-exit-${Date.now()}`,
    });
    if (
      receipt.status === "filled" &&
      this.openPosition &&
      isOrderForSymbol(receipt, this.symbol)
    ) {
      await this._handleOrderFilled(receipt);
    }
    await this._persistState();
  }

  async _managePending(_bar) {
    if (!this.pendingOrder) return;
    const index = this.candleBuffer.length - 1;

    if (index > this.pendingOrder.expiresAt) {
      if (this.pendingOrder.orderId) {
        await this.broker.cancelOrder(this.pendingOrder.orderId).catch(() => {});
      }
      this.pendingOrder = null;
      await this._persistState();
      return;
    }

    if (this.options.entryChase?.enabled) {
      const elapsedBars = index - (this.pendingOrder.startedAtIndex ?? index);
      const midpoint = asNumber(this.pendingOrder.meta?._imb?.mid);
      if (
        midpoint !== null &&
        !this.pendingOrder._chasedCE &&
        elapsedBars >= Math.max(1, this.options.entryChase.afterBars || 2) &&
        this.pendingOrder.orderId
      ) {
        await this.broker
          .modifyOrder(this.pendingOrder.orderId, { limitPrice: midpoint })
          .catch(() => {});
        this.pendingOrder.entry = midpoint;
        this.pendingOrder._chasedCE = true;
        await this._persistState();
      }
    }
  }

  async _manageOpenPosition(bar) {
    if (!this.openPosition) return;

    if (this.options.flattenAtClose && isEODBar(bar.time)) {
      await this._submitExit("EOD", bar.close);
      return;
    }

    const barsHeld = this.candleBuffer.length - (this.openPosition._openedAtIndex ?? 0);
    if (
      Number.isFinite(this.openPosition._maxBarsInTrade) &&
      this.openPosition._maxBarsInTrade > 0 &&
      barsHeld >= this.openPosition._maxBarsInTrade
    ) {
      await this._submitExit("TIME", bar.close);
      return;
    }

    const { hit, px } = ocoExitCheck({
      side: this.openPosition.side,
      stop: this.openPosition.stop,
      tp: this.openPosition.takeProfit,
      bar,
      mode: this.options.oco?.mode || "intrabar",
      tieBreak: this.options.oco?.tieBreak || "pessimistic",
    });
    if (hit) {
      const kind = hit === "TP" ? "limit" : "stop";
      await this._submitExit(hit, px, kind);
    }
  }

  async _handleOrderFilled(order) {
    if (!isOrderForSymbol(order, this.symbol)) return;
    this._emit("order:filled", { symbol: this.symbol, ...order });
    const pendingMatches = matchesPendingOrder(this.pendingOrder, order);
    if (pendingMatches) {
      const entryFill = asNumber(order.avgFillPrice, this.pendingOrder.entry);
      this.openPosition = {
        id: ++this.tradeIdCounter,
        symbol: this.symbol,
        side: this.pendingOrder.side,
        entry: this.pendingOrder.entry,
        entryFill,
        stop: this.pendingOrder.stop,
        takeProfit: this.pendingOrder.tp,
        size: Number(order.filledQty || this.pendingOrder.fixedQty || 0),
        openTime: asNumber(order.filledAt, this.lastBarTime || Date.now()),
        _initRisk: Math.abs(
          this.pendingOrder.meta?._initRisk ?? this.pendingOrder.entry - this.pendingOrder.stop
        ),
        _maxBarsInTrade: this.pendingOrder.meta?._maxBarsInTrade,
        _maxHoldMin: this.pendingOrder.meta?._maxHoldMin,
        _openedAtIndex: this.candleBuffer.length - 1,
      };
      this.pendingOrder = null;
      this.dayTrades += 1;
      this._emit("position:opened", {
        symbol: this.symbol,
        position: snapshotOpenPosition(this.openPosition, entryFill),
      });
      await this._persistState();
      return;
    }

    if (this.openPosition && order.side === oppositeSide(this.openPosition.side)) {
      const closingPosition = this.openPosition;
      const exitPrice = asNumber(
        order.avgFillPrice,
        closingPosition._pendingExitPriceHint ?? this._currentMarkPrice(closingPosition.entryFill)
      );
      const direction = closingPosition.side === "long" ? 1 : -1;
      const qty = Number(order.filledQty || closingPosition.size || 0);
      const pnl = (exitPrice - closingPosition.entryFill) * direction * qty;
      this.equity += pnl;
      this.dayPnl += pnl;
      this.openPosition = null;
      this.riskManager.recordTrade({
        pnl,
        timeMs: asNumber(order.filledAt, Date.now()),
        equity: this.equity,
      });
      const trade = {
        symbol: this.symbol,
        id: closingPosition.id,
        side: closingPosition.side,
        entry: closingPosition.entry,
        stop: closingPosition.stop,
        takeProfit: closingPosition.takeProfit,
        size: qty,
        openTime: closingPosition.openTime,
        entryFill: closingPosition.entryFill,
        _initRisk: closingPosition._initRisk,
        exit: {
          price: exitPrice,
          time: asNumber(order.filledAt, Date.now()),
          reason: closingPosition._pendingExitReason || "EXIT",
          pnl,
        },
      };
      this.trades.push(trade);
      await this.stateManager.appendTrade(this.namespace, trade);
      this._emit("position:closed", {
        symbol: this.symbol,
        trade,
      });
      await this._persistState();
    }
  }

  async _handleOrderCanceled(order) {
    if (!isOrderForSymbol(order, this.symbol)) return;
    this._emit("order:canceled", { symbol: this.symbol, ...order });
    const pendingMatches = matchesPendingOrder(this.pendingOrder, order);
    if (pendingMatches) {
      this.pendingOrder = null;
      await this._persistState();
    }
  }

  async _handleOrderRejected(order) {
    if (!isOrderForSymbol(order, this.symbol)) return;
    this._emit("order:rejected", { symbol: this.symbol, ...order });
    const pendingMatches = matchesPendingOrder(this.pendingOrder, order);
    if (pendingMatches) {
      this.pendingOrder = null;
      await this._persistState();
    }
  }

  async handleBar(rawBar) {
    const normalized = normalizeCandles([rawBar]);
    const bar = normalized[0];
    if (!bar) return;
    if (Number.isFinite(this.lastBarTime) && bar.time <= this.lastBarTime) return;
    if (!this.running) return;

    this._appendBar(bar);
    this._emit("bar", { symbol: this.symbol, bar });
    this.riskManager.update({
      timeMs: bar.time,
      equity: this._markedEquity(bar.close),
    });

    if (this.openPosition) {
      await this._manageOpenPosition(bar);
    }

    if (this.pendingOrder) {
      await this._managePending(bar);
    }

    const canTrade = this.riskManager.canTrade({ timeMs: bar.time });
    if (!canTrade.ok && this.pendingOrder) {
      if (this.pendingOrder.orderId) {
        await this.broker.cancelOrder(this.pendingOrder.orderId).catch(() => {});
      }
      this.pendingOrder = null;
      await this._persistState();
    }
    if (!canTrade.ok) {
      this._emit("risk:halt", { symbol: this.symbol, reason: canTrade.reason });
      await this._recordEquity(bar.time, bar.close);
      return;
    }

    if (!this.openPosition && !this.pendingOrder) {
      const context = this._signalContext(bar);
      const rawSignal = await callSignalWithContextAsync({
        signal: this.options.signal,
        context,
        index: context.index,
        bar,
        symbol: this.symbol,
      });
      if (rawSignal) {
        this._emit("signal", {
          symbol: this.symbol,
          t: nowIso(),
          signal: rawSignal,
        });
      }
      const nextSignal = normalizeSignal(rawSignal, bar, this.options.finalTP_R);
      if (nextSignal) {
        const hasExplicitEntry =
          rawSignal?.entry !== undefined ||
          rawSignal?.limit !== undefined ||
          rawSignal?.price !== undefined;
        await this._submitEntry(nextSignal, { hasExplicitEntry });
      }
    }

    await this._recordEquity(bar.time, bar.close);
  }

  async pollOnce() {
    if (typeof this.feed.pollOnce === "function") {
      await this.feed.pollOnce();
      return;
    }
    const bars = await this.feed.getHistoricalBars(this.symbol, this.interval, 2);
    const ordered = [...bars].sort((left, right) => left.time - right.time);
    for (const bar of ordered) {
      await this.handleBar(bar);
    }
  }

  async start() {
    if (this.running) return;

    if (!(typeof this.broker.isConnected === "function" && this.broker.isConnected())) {
      await this.broker.connect(this.options.brokerConfig || {});
    }
    await this.feed.connect();
    this._attachBrokerListeners();

    const clock = await this.clock.syncWithBroker(this.broker);
    if (clock.warning) {
      this._emit("risk:warning", {
        symbol: this.symbol,
        reason: clock.warning,
      });
    }

    if (this.options.useBrokerAccountEquity !== false) {
      try {
        const account = await this.broker.getAccount();
        if (Number.isFinite(account?.equity) && account.equity > 0) {
          this.equity = account.equity;
        }
      } catch {
        this.equity = this.options.equity;
      }
    }

    const persisted = await this.stateManager.load(this.namespace);
    if (persisted) {
      this.openPosition = persisted.openPosition || null;
      this.pendingOrder = persisted.pendingOrder || null;
      this.equity = Number.isFinite(persisted.equity) ? persisted.equity : this.equity;
      this.candleBuffer = Array.isArray(persisted.candleBuffer) ? persisted.candleBuffer : [];
      this.lastBarTime = Number.isFinite(persisted.lastBarTime) ? persisted.lastBarTime : null;
      this.dayPnl = Number.isFinite(persisted.dayPnl) ? persisted.dayPnl : 0;
      this.dayTrades = Number.isFinite(persisted.dayTrades) ? persisted.dayTrades : 0;
      this.tradeIdCounter = Number.isFinite(persisted.tradeIdCounter)
        ? persisted.tradeIdCounter
        : 0;
      this._emit("stateRestored", { symbol: this.symbol, namespace: this.namespace });
    }

    const warmup = await this.feed.getHistoricalBars(
      this.symbol,
      this.interval,
      Math.max(1, this.options.warmupBars)
    );
    const normalizedWarmup = normalizeCandles(warmup || []);
    for (const bar of normalizedWarmup) {
      if (this.lastBarTime !== null && bar.time <= this.lastBarTime) continue;
      this._appendBar(bar);
    }

    const reconcile = this.stateManager.reconcile({
      persistedState: persisted,
      brokerPositions: await this.broker.getPositions().catch(() => []),
      symbol: this.symbol,
    });
    if (reconcile.action === "adopt-broker" && reconcile.adoptedPosition) {
      this.openPosition = {
        ...this.openPosition,
        ...reconcile.adoptedPosition,
      };
    }
    if (reconcile.action === "mismatch") {
      this.riskManager.halt("position mismatch on restart");
    }
    this._emit("reconciled", { symbol: this.symbol, reconcile });

    this.riskManager.initialize(this.equity, this.lastBarTime || Date.now());
    if (this.dayTrades > 0 || this.dayPnl !== 0) {
      this.riskManager.dayTrades = this.dayTrades;
      this.riskManager.dayPnl = this.dayPnl;
    }

    const subscription = await this.feed.subscribeBars(this.symbol, this.interval, async (bar) => {
      await this.handleBar(bar);
    });
    this.subscriptions.push(subscription);
    if (this.options.mode === "polling" && typeof this.feed.startPolling === "function") {
      this.feed.startPolling();
    }

    this.startedAt = Date.now();
    this.connected = true;
    this.running = true;
    this._emit("connected", { symbol: this.symbol, namespace: this.namespace });
    await this._persistState();
  }

  async stop({ flattenOnShutdown = false } = {}) {
    if (!this.connected) return;
    if (flattenOnShutdown && this.openPosition) {
      await this._submitExit("SHUTDOWN", this._currentMarkPrice(this.openPosition.entryFill));
    }
    if (typeof this.feed.stopPolling === "function") {
      this.feed.stopPolling();
    }
    for (const subscription of this.subscriptions) {
      if (subscription && typeof subscription.unsubscribe === "function") {
        subscription.unsubscribe();
      }
    }
    this.subscriptions = [];
    await this._persistState();
    await this.feed.disconnect();
    await this.broker.disconnect();
    this._detachBrokerListeners();
    this.running = false;
    this.connected = false;
    this._emit("shutdown", { symbol: this.symbol, namespace: this.namespace });
  }

  getStatus() {
    return {
      id: this.namespace,
      symbol: this.symbol,
      interval: this.interval,
      running: this.running,
      connected: this.connected,
      startedAt: this.startedAt,
      lastBarTime: this.lastBarTime,
      equity: this._markedEquity(),
      realizedEquity: this.equity,
      openPosition: this.openPosition
        ? snapshotOpenPosition(this.openPosition, this._currentMarkPrice())
        : null,
      pendingOrder: this.pendingOrder,
      dayPnl: this.dayPnl,
      dayTrades: this.dayTrades,
      trades: this.trades.length,
      risk: this.riskManager.getState(),
    };
  }
}

export function createLiveEngine(options) {
  return new LiveEngine(options);
}
