import { EventBus } from "./events.js";
import { RiskManager } from "./engine/riskManager.js";
import { calculatePositionSize } from "../utils/positionSizing.js";
import { roundStep } from "../engine/execution.js";
import { PaperEngine } from "./engine/paperEngine.js";

function oppositeSide(side) {
  return side === "long" || side === "buy" ? "sell" : "buy";
}

function toBrokerSide(side) {
  return side === "long" || side === "buy" ? "buy" : "sell";
}

export class TradingSession {
  constructor({
    id,
    symbol,
    interval = "1m",
    broker,
    mode = "paper",
    equity = 10_000,
    riskPct = 1,
    maxDailyLossPct = 0,
    maxPositionPct = 1,
    qtyStep = 0.001,
    minQty = 0.001,
    maxLeverage = 2,
    eventBus,
  } = {}) {
    if (mode === "live" && !TradingSession.liveAllowed()) {
      throw new Error(
        "live trading is gated: set TRADELAB_ALLOW_LIVE=true and pass confirmLive:true with a credentialed broker"
      );
    }
    if (!broker) throw new Error("TradingSession requires a broker (PaperEngine by default)");
    if (!symbol) throw new Error("TradingSession requires a symbol");

    this.id = id || `${symbol}-${interval}`;
    this.symbol = symbol;
    this.interval = interval;
    this.broker = broker;
    this.mode = mode;
    this.equity = equity;
    this._startEquity = equity;
    this.riskPct = riskPct;
    this.maxPositionPct = maxPositionPct;
    this.qtyStep = qtyStep;
    this.minQty = minQty;
    this.maxLeverage = maxLeverage;
    this.eventBus = eventBus || new EventBus();
    this.riskManager = new RiskManager({ maxDailyLossPct, maxDrawdownPct: 0 });
    this.lastPrice = null;
    this.running = false;
    this.events = [];
    this.brackets = new Map(); // symbol -> { stopId, targetId }
    this._pendingBracket = null;
    this._cachedPositions = [];
    this._cachedOpenOrders = [];
    this.candleBuffer = [];
    this._strategy = null;

    this._wireBrokerEvents();
  }

  static liveAllowed() {
    return process.env.TRADELAB_ALLOW_LIVE === "true";
  }

  _record(event, payload) {
    const msg = { event, payload, t: Date.now() };
    this.events.push(msg);
    if (this.events.length > 500) this.events.shift();
    this.eventBus.emitEvent(event, { sessionId: this.id, symbol: this.symbol, ...payload });
  }

  _wireBrokerEvents() {
    // Forward broker fills/cancels onto the session bus, and run OCO bracket logic.
    this.broker.on?.("order:filled", (order) => this._onBrokerFillSync(order));
    this.broker.on?.("order:submitted", (order) => this._record("order:submitted", order));
    this.broker.on?.("order:canceled", (order) => this._record("order:canceled", order));
    this.broker.on?.("equity:update", (acct) => this._record("equity:update", acct));
  }

  // Sync event handler — fire-and-forget async OCO work via a stored promise
  _onBrokerFillSync(order) {
    this._record("order:filled", order);
    // Track bracket leg fills for OCO
    const bracket = this.brackets.get(this.symbol);
    if (bracket && (order.orderId === bracket.stopId || order.orderId === bracket.targetId)) {
      const siblingId = order.orderId === bracket.stopId ? bracket.targetId : bracket.stopId;
      // Schedule the cancel — simulateBar is still iterating orders, so we must not await here.
      // We keep a pending cancel promise that refresh() awaits.
      this._pendingCancelPromise = (async () => {
        if (siblingId) await this.broker.cancelOrder(siblingId).catch(() => {});
        this.brackets.delete(this.symbol);
        this._record("position:closed", { reason: order.orderId === bracket.stopId ? "SL" : "TP" });
      })();
    }
  }

  async start() {
    if (!this.broker.isConnected?.()) await this.broker.connect?.({});
    const acct = await this.broker.getAccount?.().catch(() => null);
    if (Number.isFinite(acct?.equity)) {
      this.equity = acct.equity;
      this._startEquity = acct.equity;
    }
    this.riskManager.initialize(this.equity, Date.now());
    this.running = true;
    this._record("connected", { mode: this.mode });
  }

  async stop({ flatten = false } = {}) {
    if (flatten) await this.flatten();
    this.running = false;
    this._record("shutdown", {});
  }

  async pushBar(b) {
    this.lastPrice = b.close;
    if (typeof this.broker.simulateBar === "function") {
      await this.broker.simulateBar(this.symbol, this.interval, b);
    }
    // Wait for any pending OCO cancel triggered by simulateBar fills
    if (this._pendingCancelPromise) {
      await this._pendingCancelPromise;
      this._pendingCancelPromise = null;
    }
    this.candleBuffer.push(b);
    if (this.candleBuffer.length > 200) this.candleBuffer.shift();
    this._record("bar", { close: b.close, time: b.time });
    await this._syncEquityAndRisk();
    await this.refresh();
  }

  _riskHalted() {
    const state = this.riskManager.getState?.() || {};
    return Boolean(state.halted);
  }

  async placeOrder({ side, type = "market", qty, riskPct, stop, target, rr, limitPrice } = {}) {
    if (!this.running) throw new Error("session not started");
    if (this._riskHalted()) throw new Error("session is risk-halted for the day");
    const entryRef = type === "limit" ? limitPrice : this.lastPrice;
    if (!Number.isFinite(entryRef)) throw new Error("no price available; pushBar() a price first");

    let size = qty;
    if (!Number.isFinite(size)) {
      const fraction = Number.isFinite(riskPct) ? riskPct / 100 : this.riskPct / 100;
      if (!Number.isFinite(stop)) throw new Error("risk-based sizing requires a stop");
      size = calculatePositionSize({
        equity: this.equity,
        entry: entryRef,
        stop,
        riskFraction: fraction,
        qtyStep: this.qtyStep,
        minQty: this.minQty,
        maxLeverage: this.maxLeverage,
      });
    }
    size = roundStep(size, this.qtyStep);
    if (!(size >= this.minQty)) throw new Error(`sized below minQty (${size})`);

    const receipt = await this.broker.submitOrder({
      symbol: this.symbol,
      side: toBrokerSide(side),
      type,
      qty: size,
      limitPrice: type === "limit" ? limitPrice : undefined,
      clientOrderId: `${this.id}-entry-${Date.now()}`,
    });

    // Stage bracket if needed — market orders fill synchronously in PaperEngine
    if (Number.isFinite(stop) || Number.isFinite(target) || Number.isFinite(rr)) {
      if (receipt.status === "filled") {
        await this._attachBracket({ side, size, stop, target, rr, entryRef, receipt });
      } else {
        this._pendingBracket = { side, size, stop, target, rr, entryRef };
      }
    }

    await this.refresh();
    return receipt;
  }

  async _attachBracket({ side, size, stop, target, rr, entryRef, receipt }) {
    const entryFill = receipt?.avgFillPrice ?? entryRef;
    const risk = Number.isFinite(stop) ? Math.abs(entryFill - stop) : null;
    const targetPrice = Number.isFinite(target)
      ? target
      : Number.isFinite(rr) && risk
        ? side === "long" || side === "buy"
          ? entryFill + rr * risk
          : entryFill - rr * risk
        : null;
    const exitSide = oppositeSide(side);
    const bracket = {};

    if (Number.isFinite(stop)) {
      const stopOrder = await this.broker.submitOrder({
        symbol: this.symbol,
        side: exitSide,
        type: "stop",
        qty: size,
        stopPrice: stop,
        clientOrderId: `${this.id}-stop-${Date.now()}`,
      });
      bracket.stopId = stopOrder.orderId;
    }
    if (Number.isFinite(targetPrice)) {
      const tgtOrder = await this.broker.submitOrder({
        symbol: this.symbol,
        side: exitSide,
        type: "limit",
        qty: size,
        limitPrice: targetPrice,
        clientOrderId: `${this.id}-target-${Date.now()}`,
      });
      bracket.targetId = tgtOrder.orderId;
    }
    this.brackets.set(this.symbol, bracket);
  }

  async _syncEquityAndRisk() {
    const acct = await this.broker.getAccount?.().catch(() => null);
    if (!Number.isFinite(acct?.equity)) return;
    const prevEquity = this.equity;
    this.equity = acct.equity;
    const pnlDelta = this.equity - prevEquity;
    // Record the trade pnl change so RiskManager can check daily loss
    if (pnlDelta !== 0) {
      this.riskManager.recordTrade({ pnl: pnlDelta, timeMs: Date.now(), equity: this.equity });
    } else {
      this.riskManager.update({ timeMs: Date.now(), equity: this.equity });
    }
  }

  async closePosition(symbol = this.symbol) {
    const positions = await this.broker.getPositions();
    const pos = positions.find((p) => p.symbol === symbol);
    if (!pos) return null;

    // cancel any resting bracket first
    const bracket = this.brackets.get(symbol);
    if (bracket) {
      for (const id of [bracket.stopId, bracket.targetId]) {
        if (id) await this.broker.cancelOrder(id).catch(() => {});
      }
      this.brackets.delete(symbol);
    }

    const receipt = await this.broker.submitOrder({
      symbol,
      side: oppositeSide(pos.side),
      type: "market",
      qty: pos.qty,
      clientOrderId: `${this.id}-close-${Date.now()}`,
    });
    await this._syncEquityAndRisk();
    await this.refresh();
    return receipt;
  }

  async flatten() {
    const positions = await this.broker.getPositions();
    for (const p of positions) await this.closePosition(p.symbol);
    const open = (await this.broker.getOpenOrders?.().catch(() => [])) ?? [];
    for (const o of open) await this.broker.cancelOrder(o.orderId).catch(() => {});
    await this.refresh();
  }

  async cancelOrder(orderId) {
    await this.broker.cancelOrder(orderId);
    await this.refresh();
  }

  async getAccount() {
    return this.broker.getAccount();
  }

  async getPositions() {
    return this.broker.getPositions();
  }

  recentEvents(limit = 50) {
    return this.events.slice(-limit);
  }

  getStatus() {
    const risk = this.riskManager.getState?.() || {};
    return {
      id: this.id,
      symbol: this.symbol,
      interval: this.interval,
      mode: this.mode,
      running: this.running,
      equity: this.equity,
      dayPnl: risk.dayPnl ?? 0,
      lastPrice: this.lastPrice,
      positions: this._cachedPositions ?? [],
      openOrders: this._cachedOpenOrders ?? [],
      risk: { halted: Boolean(risk.halted), ...risk },
    };
  }

  /** Refresh sync caches used by getStatus() */
  async refresh() {
    // Wait for any pending OCO cancel before refreshing state
    if (this._pendingCancelPromise) {
      await this._pendingCancelPromise;
      this._pendingCancelPromise = null;
    }
    this._cachedPositions = await this.broker.getPositions().catch(() => []);
    this._cachedOpenOrders = (await this.broker.getOpenOrders?.().catch(() => [])) ?? [];
    const acct = await this.broker.getAccount?.().catch(() => null);
    if (Number.isFinite(acct?.equity)) this.equity = acct.equity;
    return this.getStatus();
  }
}

export class SessionManager {
  constructor({ brokerFactory } = {}) {
    this.sessions = new Map();
    this.brokerFactory = brokerFactory;
  }

  async create({
    id,
    mode = "paper",
    symbol,
    interval = "1m",
    equity = 10_000,
    confirmLive = false,
    broker,
    ...rest
  } = {}) {
    if (this.sessions.has(id)) throw new Error(`session "${id}" already exists`);
    let resolvedBroker = broker;
    if (mode === "live") {
      if (!TradingSession.liveAllowed() || !confirmLive) {
        throw new Error("live mode requires TRADELAB_ALLOW_LIVE=true and confirmLive:true");
      }
      if (!resolvedBroker && this.brokerFactory) {
        resolvedBroker = this.brokerFactory({ symbol, ...rest });
      }
      if (!resolvedBroker) throw new Error("live mode requires a credentialed broker");
    }
    if (!resolvedBroker) resolvedBroker = new PaperEngine({ equity });
    const session = new TradingSession({ id, symbol, interval, broker: resolvedBroker, mode, equity, ...rest });
    await session.start();
    this.sessions.set(session.id, session);
    return session;
  }

  get(id) {
    return this.sessions.get(id) ?? null;
  }

  list() {
    return [...this.sessions.values()];
  }

  async remove(id, { flatten = true } = {}) {
    const s = this.sessions.get(id);
    if (!s) return;
    await s.stop({ flatten });
    this.sessions.delete(id);
  }

  async haltAll() {
    for (const s of this.sessions.values()) await s.stop({ flatten: true });
  }
}

export function createSessionManager(opts) {
  return new SessionManager(opts);
}
