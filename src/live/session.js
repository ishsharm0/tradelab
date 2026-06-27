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

function matchesOrderRef(reference, order) {
  if (!reference || !order) return false;
  if (reference.orderId && order.orderId && reference.orderId === order.orderId) return true;
  if (
    reference.clientOrderId &&
    order.clientOrderId &&
    reference.clientOrderId === order.clientOrderId
  ) {
    return true;
  }
  return false;
}

export class TradingSession {
  constructor({
    id,
    symbol,
    symbols,
    interval = "1m",
    broker,
    mode = "paper",
    equity = 10_000,
    riskPct = 1,
    maxDailyLossPct = 0,
    maxPositionPct = 1,
    maxGrossExposurePct = 0,
    maxNetExposurePct = 0,
    qtyStep = 0.001,
    minQty = 0.001,
    maxLeverage = 2,
    confirmLive = false,
    eventBus,
  } = {}) {
    if (mode === "live" && (!TradingSession.liveAllowed() || !confirmLive)) {
      throw new Error(
        "live trading is gated: set TRADELAB_ALLOW_LIVE=true and pass confirmLive:true with a credentialed broker"
      );
    }
    if (!broker) throw new Error("TradingSession requires a broker (PaperEngine by default)");

    const symbolList = Array.isArray(symbols) && symbols.length ? symbols : symbol ? [symbol] : null;
    if (!symbolList) throw new Error("TradingSession requires a symbol or symbols");

    this.symbols = symbolList;
    this.symbol = symbolList[0]; // back-compat primary symbol

    this.id = id || `${this.symbol}-${interval}`;
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
    this.riskManager = new RiskManager({ maxDailyLossPct, maxDrawdownPct: 0, maxGrossExposurePct, maxNetExposurePct });
    this.running = false;
    this.events = [];
    this.brackets = new Map(); // symbol -> { stopId, targetId }
    this._pendingBrackets = new Map(); // symbol -> staged bracket
    this._entryMeta = new Map(); // clientOrderId -> { sizing, rationale }
    this._legMeta = new Map();   // clientOrderId -> { parentEntryId, leg }
    this._cachedPositions = [];
    this._cachedOpenOrders = [];
    this._lastPrice = new Map();      // symbol -> price
    this._candleBuffers = new Map();  // symbol -> bar[]
    this._strategies = new Map();     // symbol -> signalFn
    for (const sym of this.symbols) this._candleBuffers.set(sym, []);

    this._wireBrokerEvents();
  }

  // Back-compat getters/setters for single-symbol usage and MCP feed_price handler
  get lastPrice() { return this._lastPrice.get(this.symbol) ?? null; }
  set lastPrice(v) { this._lastPrice.set(this.symbol, v); }
  get candleBuffer() { return this._candleBuffers.get(this.symbol) ?? []; }
  set candleBuffer(v) { this._candleBuffers.set(this.symbol, v); }
  get _strategy() { return this._strategies.get(this.symbol) ?? null; }
  set _strategy(fn) { this._strategies.set(this.symbol, fn); }
  // Back-compat for tests that read/write _pendingBracket directly (primary symbol only)
  get _pendingBracket() { return this._pendingBrackets.get(this.symbol) ?? null; }
  set _pendingBracket(v) {
    if (v == null) this._pendingBrackets.delete(this.symbol);
    else this._pendingBrackets.set(this.symbol, v);
  }

  // Per-symbol accessors
  lastPriceFor(sym = this.symbol) { return this._lastPrice.get(sym) ?? null; }
  candleBufferFor(sym = this.symbol) { return this._candleBuffers.get(sym) ?? []; }

  _resolveSymbol(symbol) {
    if (symbol) return symbol;
    if (this.symbols.length === 1) return this.symbol;
    throw new Error("symbol is required for a multi-symbol session");
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
    this.broker.on?.("order:submitted", (order) => this._record("order:submitted", this._withMeta(order)));
    this.broker.on?.("order:canceled", (order) =>
      this._onBrokerTerminalOrderSync("order:canceled", order)
    );
    this.broker.on?.("order:rejected", (order) =>
      this._onBrokerTerminalOrderSync("order:rejected", order)
    );
    this.broker.on?.("equity:update", (acct) => this._record("equity:update", acct));
  }

  _onBrokerTerminalOrderSync(event, order) {
    this._record(event, order);
    // Scan all pending brackets to clear any that match this terminal order
    for (const [sym, staged] of this._pendingBrackets) {
      if (matchesOrderRef(staged, order)) {
        this._pendingBrackets.delete(sym);
        break;
      }
    }
  }

  _withMeta(order) {
    const key = order.clientOrderId;
    if (key && this._entryMeta?.has(key)) {
      const m = this._entryMeta.get(key);
      return { ...order, sizing: m.sizing, ...(m.rationale ? { rationale: m.rationale } : {}) };
    }
    if (key && this._legMeta?.has(key)) {
      return { ...order, ...this._legMeta.get(key) };
    }
    return order;
  }

  // Sync event handler — fire-and-forget async OCO work via a stored promise
  _onBrokerFillSync(order) {
    this._record("order:filled", this._withMeta(order));

    // Resting entry order (e.g. a limit) just filled — attach its staged bracket.
    // Scan _pendingBrackets for a match (works for both single- and multi-symbol sessions).
    for (const [sym, staged] of this._pendingBrackets) {
      if (matchesOrderRef(staged, order)) {
        this._pendingBrackets.delete(sym);
        const parentEntryId = staged.parentEntryId ?? order.clientOrderId;
        // simulateBar may still be iterating orders, so schedule attach without awaiting.
        this._pendingCancelPromise = Promise.resolve(
          this._attachBracket({ ...staged, symbol: sym, receipt: order, parentEntryId })
        );
        return;
      }
    }

    // Track bracket leg fills for OCO — find which symbol this fill belongs to
    for (const [sym, bracket] of this.brackets) {
      if (bracket && (order.orderId === bracket.stopId || order.orderId === bracket.targetId)) {
        const siblingId = order.orderId === bracket.stopId ? bracket.targetId : bracket.stopId;
        // Schedule the cancel — simulateBar is still iterating orders, so we must not await here.
        // We keep a pending cancel promise that refresh() awaits.
        this._pendingCancelPromise = (async () => {
          if (siblingId) await this.broker.cancelOrder(siblingId).catch(() => {});
          this.brackets.delete(sym);
          this._record("position:closed", { symbol: sym, reason: order.orderId === bracket.stopId ? "SL" : "TP" });
        })();
        return;
      }
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

  async pushBar(b, symbol) {
    const sym = this._resolveSymbol(symbol);
    this._lastPrice.set(sym, b.close);
    if (typeof this.broker.simulateBar === "function") {
      await this.broker.simulateBar(sym, this.interval, b);
    }
    // Wait for any pending OCO cancel triggered by simulateBar fills
    if (this._pendingCancelPromise) {
      await this._pendingCancelPromise;
      this._pendingCancelPromise = null;
    }
    const buf = this._candleBuffers.get(sym) ?? [];
    buf.push(b);
    if (buf.length > 200) buf.shift();
    this._candleBuffers.set(sym, buf);
    this._record("bar", { symbol: sym, close: b.close, time: b.time });
    await this._syncEquityAndRisk();
    await this.refresh();
  }

  _riskHalted() {
    const state = this.riskManager.getState?.() || {};
    return Boolean(state.halted);
  }

  async placeOrder({ side, type = "market", qty, riskPct, stop, target, rr, limitPrice, rationale, symbol } = {}) {
    if (!this.running) throw new Error("session not started");
    if (this._riskHalted()) throw new Error("session is risk-halted for the day");
    const sym = this._resolveSymbol(symbol);
    const entryRef = type === "limit" ? limitPrice : this.lastPriceFor(sym);
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

    const fraction = Number.isFinite(riskPct) ? riskPct / 100 : this.riskPct / 100;
    const targetPx = Number.isFinite(target)
      ? target
      : Number.isFinite(rr) && Number.isFinite(stop)
        ? (side === "long" || side === "buy"
            ? entryRef + rr * Math.abs(entryRef - stop)
            : entryRef - rr * Math.abs(entryRef - stop))
        : null;
    const sizing = {
      entry: entryRef,
      stop: Number.isFinite(stop) ? stop : null,
      target: targetPx,
      rr: Number.isFinite(rr) ? rr : null,
      riskFraction: fraction,
      riskAmount: this.equity * fraction,
      qty: size,
      notional: size * entryRef,
    };

    const positions = this._cachedPositions ?? [];
    const newNotional = sizing.notional * ((side === "long" || side === "buy") ? 1 : -1);
    let gross = Math.abs(sizing.notional);
    let net = newNotional;
    for (const p of positions) {
      const pv = (p.qty ?? 0) * (p.avgPrice ?? p.entryPrice ?? entryRef);
      const signed = (p.side === "long" || p.side === "buy") ? pv : -pv;
      gross += Math.abs(pv);
      net += signed;
    }
    const gate = this.riskManager.checkExposure({
      grossExposure: gross,
      netExposure: net,
      equity: this.equity,
    });
    if (!gate.ok) throw new Error(`risk rejected: ${gate.reason}`);

    const entryClientOrderId = `${this.id}-entry-${Date.now()}`;
    this._entryMeta.set(entryClientOrderId, { sizing, rationale });

    const receipt = await this.broker.submitOrder({
      symbol: sym,
      side: toBrokerSide(side),
      type,
      qty: size,
      limitPrice: type === "limit" ? limitPrice : undefined,
      clientOrderId: entryClientOrderId,
    });

    // Stage bracket if needed — market orders fill synchronously in PaperEngine
    if (Number.isFinite(stop) || Number.isFinite(target) || Number.isFinite(rr)) {
      const parentEntryId = receipt?.clientOrderId ?? entryClientOrderId;
      if (receipt.status === "filled") {
        await this._attachBracket({ side, size, stop, target, rr, entryRef, receipt, parentEntryId, symbol: sym });
      } else if (receipt.status !== "rejected") {
        this._pendingBrackets.set(sym, {
          side,
          size,
          stop,
          target,
          rr,
          entryRef,
          orderId: receipt.orderId,
          clientOrderId: receipt.clientOrderId || entryClientOrderId,
          parentEntryId,
        });
      } else {
        this._pendingBrackets.delete(sym);
      }
    }

    await this.refresh();
    return receipt;
  }

  async _attachBracket({ side, size, stop, target, rr, entryRef, receipt, parentEntryId, symbol }) {
    const sym = symbol ?? this.symbol;
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
      const stopCoid = `${this.id}-stop-${Date.now()}`;
      if (parentEntryId) this._legMeta.set(stopCoid, { parentEntryId, leg: "stop" });
      const stopOrder = await this.broker.submitOrder({
        symbol: sym,
        side: exitSide,
        type: "stop",
        qty: size,
        stopPrice: stop,
        clientOrderId: stopCoid,
      });
      bracket.stopId = stopOrder.orderId;
    }
    if (Number.isFinite(targetPrice)) {
      const tgtCoid = `${this.id}-target-${Date.now()}`;
      if (parentEntryId) this._legMeta.set(tgtCoid, { parentEntryId, leg: "target" });
      const tgtOrder = await this.broker.submitOrder({
        symbol: sym,
        side: exitSide,
        type: "limit",
        qty: size,
        limitPrice: targetPrice,
        clientOrderId: tgtCoid,
      });
      bracket.targetId = tgtOrder.orderId;
    }
    this.brackets.set(sym, bracket);
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
      symbols: this.symbols,
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
    const session = new TradingSession({
      id,
      symbol,
      interval,
      broker: resolvedBroker,
      mode,
      equity,
      confirmLive,
      ...rest,
    });
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
    // Remove stopped sessions so list() does not retain them and re-runs don't collide.
    this.sessions.clear();
  }
}

export function createSessionManager(opts) {
  return new SessionManager(opts);
}
