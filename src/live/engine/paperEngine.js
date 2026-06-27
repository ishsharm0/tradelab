import { applyFill, roundStep, touchedLimit } from "../../engine/execution.js";
import { BrokerAdapter } from "../broker/interface.js";

function asNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeOrderSide(side) {
  const normalized = String(side || "").toLowerCase();
  if (normalized === "buy") return "buy";
  if (normalized === "sell") return "sell";
  throw new Error(`Unsupported paper order side "${side}"`);
}

function normalizeOrderType(type) {
  const normalized = String(type || "market").toLowerCase();
  if (normalized === "market") return "market";
  if (normalized === "limit") return "limit";
  if (normalized === "stop") return "stop";
  if (normalized === "stop_limit") return "stop_limit";
  throw new Error(`Unsupported paper order type "${type}"`);
}

function cloneOrder(order) {
  return {
    orderId: order.orderId,
    clientOrderId: order.clientOrderId,
    status: order.status,
    filledQty: order.filledQty,
    avgFillPrice: order.avgFillPrice,
    filledAt: order.filledAt,
    symbol: order.symbol,
    side: order.side,
    type: order.type,
    qty: order.qty,
    limitPrice: order.limitPrice,
    stopPrice: order.stopPrice,
    timeInForce: order.timeInForce,
    rejectReason: order.rejectReason,
  };
}

function sideToDirection(side) {
  return side === "buy" ? 1 : -1;
}

/**
 * In-process broker simulator that implements the BrokerAdapter interface.
 */
export class PaperEngine extends BrokerAdapter {
  constructor({
    equity = 10_000,
    currency = "USD",
    slippageBps = 0,
    feeBps = 0,
    costs = null,
    qtyStep = 0.001,
  } = {}) {
    super();
    this.connected = false;
    this.config = {};
    this.currency = currency;
    this.startingEquity = Math.max(0, Number(equity) || 0);
    this.cash = this.startingEquity;
    this.slippageBps = slippageBps;
    this.feeBps = feeBps;
    this.costs = costs;
    this.qtyStep = qtyStep;
    this.positions = new Map();
    this.openOrders = new Map();
    this.orderHistory = new Map();
    this.lastPrices = new Map();
    this.barSubscribers = new Map();
    this.tradeSubscribers = new Map();
    this.quoteSubscribers = new Map();
    this.historicalBars = new Map();
    this.orderIdCounter = 1;
  }

  async connect(config = {}) {
    this.config = { ...config };
    this.connected = true;
  }

  async disconnect() {
    this.connected = false;
    this.barSubscribers.clear();
    this.tradeSubscribers.clear();
    this.quoteSubscribers.clear();
  }

  isConnected() {
    return this.connected;
  }

  supportsPaperNative() {
    return true;
  }

  async getServerTime() {
    return Date.now();
  }

  _positionMark(position) {
    const mark = this.lastPrices.get(position.symbol) ?? position.avgEntry;
    if (position.side === "long") {
      return {
        mark,
        marketValue: mark * position.qty,
        unrealizedPnl: (mark - position.avgEntry) * position.qty,
      };
    }
    return {
      mark,
      marketValue: mark * position.qty,
      unrealizedPnl: (position.avgEntry - mark) * position.qty,
    };
  }

  _realizedUnrealizedSummary() {
    let unrealized = 0;
    let marketValue = 0;
    for (const position of this.positions.values()) {
      const marked = this._positionMark(position);
      unrealized += marked.unrealizedPnl;
      marketValue += marked.marketValue;
    }
    return { unrealized, marketValue };
  }

  async getAccount() {
    const { unrealized, marketValue } = this._realizedUnrealizedSummary();
    const equity = this.cash + unrealized;
    return {
      equity,
      buyingPower: Math.max(0, equity),
      cash: this.cash,
      currency: this.currency,
      marginUsed: Math.max(0, marketValue - this.cash),
    };
  }

  async getPositions() {
    const rows = [];
    for (const position of this.positions.values()) {
      const marked = this._positionMark(position);
      rows.push({
        symbol: position.symbol,
        side: position.side,
        qty: position.qty,
        avgEntry: position.avgEntry,
        marketValue: marked.marketValue,
        unrealizedPnl: marked.unrealizedPnl,
      });
    }
    return rows;
  }

  _streamKey(symbol, interval = "*") {
    return `${symbol}::${interval}`;
  }

  _subscribe(map, key, handler) {
    const list = map.get(key) || [];
    list.push(handler);
    map.set(key, list);
    return {
      unsubscribe: () => {
        const current = map.get(key) || [];
        map.set(
          key,
          current.filter((candidate) => candidate !== handler)
        );
      },
    };
  }

  async subscribeBars(symbol, interval, handler) {
    return this._subscribe(this.barSubscribers, this._streamKey(symbol, interval), handler);
  }

  async subscribeTrades(symbol, handler) {
    return this._subscribe(this.tradeSubscribers, symbol, handler);
  }

  async subscribeQuotes(symbol, handler) {
    return this._subscribe(this.quoteSubscribers, symbol, handler);
  }

  async _emitTo(map, key, payload) {
    const handlers = map.get(key) || [];
    for (const handler of handlers) {
      await Promise.resolve(handler(payload));
    }
  }

  setHistoricalBars(symbol, interval, bars) {
    const streamKey = this._streamKey(symbol, interval);
    this.historicalBars.set(streamKey, [...bars]);
  }

  async getHistoricalBars(symbol, interval, limit = 200) {
    const streamKey = this._streamKey(symbol, interval);
    const all = this.historicalBars.get(streamKey) || [];
    return all.slice(Math.max(0, all.length - limit));
  }

  _nextOrderId() {
    const id = `paper-${this.orderIdCounter}`;
    this.orderIdCounter += 1;
    return id;
  }

  _recordOrder(order) {
    this.orderHistory.set(order.orderId, { ...order });
  }

  _fillOrder(order, fillPrice, kind = "market", fillTime = Date.now()) {
    const side = normalizeOrderSide(order.side);
    const qty = Math.max(0, asNumber(order.qty, 0));
    if (!(qty > 0)) {
      order.status = "rejected";
      order.rejectReason = "invalid quantity";
      this._recordOrder(order);
      this.emit("order:rejected", cloneOrder(order));
      return cloneOrder(order);
    }

    const sideForFill = side === "buy" ? "long" : "short";
    const filled = applyFill(fillPrice, sideForFill, {
      slippageBps: this.slippageBps,
      feeBps: this.feeBps,
      kind,
      qty,
      costs: this.costs,
    });

    const direction = sideToDirection(side);
    let remaining = qty;
    const position = this.positions.get(order.symbol) || null;
    let realizedPnl = 0;

    if (!position) {
      const nextSide = direction > 0 ? "long" : "short";
      this.positions.set(order.symbol, {
        symbol: order.symbol,
        side: nextSide,
        qty: remaining,
        avgEntry: filled.price,
      });
    } else {
      const signedQty = position.side === "long" ? position.qty : -position.qty;
      const signedIncoming = direction * remaining;
      if ((signedQty >= 0 && signedIncoming >= 0) || (signedQty <= 0 && signedIncoming <= 0)) {
        const totalAbs = Math.abs(signedQty) + Math.abs(signedIncoming);
        const nextAvg =
          totalAbs > 0
            ? (Math.abs(signedQty) * position.avgEntry + Math.abs(signedIncoming) * filled.price) /
              totalAbs
            : filled.price;
        const nextSide = signedQty + signedIncoming >= 0 ? "long" : "short";
        this.positions.set(order.symbol, {
          symbol: order.symbol,
          side: nextSide,
          qty: Math.abs(signedQty + signedIncoming),
          avgEntry: nextAvg,
        });
      } else {
        const closeQty = Math.min(Math.abs(signedQty), Math.abs(signedIncoming));
        if (position.side === "long") {
          realizedPnl += (filled.price - position.avgEntry) * closeQty;
        } else {
          realizedPnl += (position.avgEntry - filled.price) * closeQty;
        }
        const remainder = Math.abs(signedIncoming) - closeQty;
        if (remainder > 0) {
          const nextSide = direction > 0 ? "long" : "short";
          this.positions.set(order.symbol, {
            symbol: order.symbol,
            side: nextSide,
            qty: remainder,
            avgEntry: filled.price,
          });
        } else if (Math.abs(signedQty) - closeQty > 0) {
          this.positions.set(order.symbol, {
            symbol: order.symbol,
            side: position.side,
            qty: Math.abs(signedQty) - closeQty,
            avgEntry: position.avgEntry,
          });
        } else {
          this.positions.delete(order.symbol);
        }
      }
    }

    this.cash -= filled.feeTotal;
    this.cash += realizedPnl;

    order.status = "filled";
    order.filledQty = qty;
    order.avgFillPrice = filled.price;
    order.filledAt = fillTime;
    this._recordOrder(order);
    this.openOrders.delete(order.orderId);

    const receipt = cloneOrder(order);
    this.emit("order:filled", receipt);
    const account = {
      cash: this.cash,
      realizedPnl,
      feeTotal: filled.feeTotal,
      equity: this.cash + this._realizedUnrealizedSummary().unrealized,
    };
    this.emit("equity:update", account);
    return receipt;
  }

  _touchesLimit(order, bar) {
    const side = order.side === "buy" ? "long" : "short";
    return touchedLimit(side, order.limitPrice, bar, "intrabar");
  }

  _touchesStop(order, bar) {
    if (order.side === "buy") return bar.high >= order.stopPrice;
    return bar.low <= order.stopPrice;
  }

  async submitOrder(order) {
    const normalized = {
      orderId: this._nextOrderId(),
      clientOrderId: order.clientOrderId,
      status: "new",
      filledQty: 0,
      avgFillPrice: undefined,
      filledAt: undefined,
      symbol: String(order.symbol),
      side: normalizeOrderSide(order.side),
      type: normalizeOrderType(order.type),
      qty: roundStep(Math.max(0, asNumber(order.qty, 0)), this.qtyStep),
      limitPrice: asNumber(order.limitPrice),
      stopPrice: asNumber(order.stopPrice),
      timeInForce: order.timeInForce || "day",
      rejectReason: undefined,
    };

    if (!(normalized.qty > 0)) {
      normalized.status = "rejected";
      normalized.rejectReason = "invalid quantity";
      this._recordOrder(normalized);
      this.emit("order:rejected", cloneOrder(normalized));
      return cloneOrder(normalized);
    }

    this._recordOrder(normalized);
    this.emit("order:submitted", cloneOrder(normalized));

    if (normalized.type === "market") {
      const mark = this.lastPrices.get(normalized.symbol);
      const fillPrice = mark ?? normalized.limitPrice ?? normalized.stopPrice ?? 0;
      return this._fillOrder(normalized, fillPrice, "market");
    }

    this.openOrders.set(normalized.orderId, normalized);
    return cloneOrder(normalized);
  }

  async cancelOrder(orderId) {
    const order = this.openOrders.get(orderId);
    if (!order) return;
    order.status = "canceled";
    this._recordOrder(order);
    this.openOrders.delete(orderId);
    this.emit("order:canceled", cloneOrder(order));
  }

  async modifyOrder(orderId, changes = {}) {
    const order = this.openOrders.get(orderId);
    if (!order) {
      throw new Error(`paper order "${orderId}" not found or already closed`);
    }
    if (changes.qty !== undefined) {
      order.qty = roundStep(Math.max(0, asNumber(changes.qty, order.qty)), this.qtyStep);
    }
    if (changes.limitPrice !== undefined) {
      order.limitPrice = asNumber(changes.limitPrice);
    }
    if (changes.stopPrice !== undefined) {
      order.stopPrice = asNumber(changes.stopPrice);
    }
    this._recordOrder(order);
    const receipt = cloneOrder(order);
    this.emit("order:modified", receipt);
    return receipt;
  }

  async getOpenOrders() {
    return [...this.openOrders.values()].map((order) => cloneOrder(order));
  }

  async getOrderStatus(orderId) {
    const order = this.openOrders.get(orderId) || this.orderHistory.get(orderId);
    if (!order) throw new Error(`paper order "${orderId}" not found`);
    return cloneOrder(order);
  }

  async simulateBar(symbol, interval, bar) {
    const normalizedBar = {
      time: Number(bar.time),
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
      volume: asNumber(bar.volume, 0),
    };
    this.lastPrices.set(symbol, normalizedBar.close);
    await this._emitTo(this.barSubscribers, this._streamKey(symbol, interval), normalizedBar);
    await this._emitTo(this.tradeSubscribers, symbol, {
      time: normalizedBar.time,
      price: normalizedBar.close,
      size: normalizedBar.volume ?? 0,
    });

    const orders = [...this.openOrders.values()].filter((order) => order.symbol === symbol);
    for (const order of orders) {
      // Skip orders already consumed this pass (e.g. an OCO sibling about to be
      // canceled, or any order removed by a prior fill). _fillOrder deletes from
      // openOrders before emitting, so this guard prevents bracket double-fills
      // when one bar straddles both stop and target.
      if (!this.openOrders.has(order.orderId)) continue;
      if (order.type === "limit") {
        if (this._touchesLimit(order, normalizedBar)) {
          this._fillOrder(order, order.limitPrice, "limit", normalizedBar.time);
        }
        continue;
      }

      if (order.type === "stop") {
        if (this._touchesStop(order, normalizedBar)) {
          this._fillOrder(order, order.stopPrice, "stop", normalizedBar.time);
        }
        continue;
      }

      if (order.type === "stop_limit") {
        order._triggered = Boolean(order._triggered) || this._touchesStop(order, normalizedBar);
        if (order._triggered && this._touchesLimit(order, normalizedBar)) {
          this._fillOrder(order, order.limitPrice, "limit", normalizedBar.time);
        }
      }
    }
  }
}

export function createPaperEngine(options) {
  return new PaperEngine(options);
}
