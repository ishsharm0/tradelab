import { URL } from "node:url";

import { normalizeCandles } from "../../data/csv.js";
import { BrokerAdapter } from "./interface.js";

function withQuery(url, query = {}) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    target.searchParams.set(key, String(value));
  }
  return target.toString();
}

function mapOrderStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "partially_filled") return "partially_filled";
  if (normalized === "filled") return "filled";
  if (normalized === "canceled" || normalized === "cancelled") return "canceled";
  if (normalized === "rejected") return "rejected";
  if (normalized === "expired") return "expired";
  return "new";
}

function mapOrderReceipt(order) {
  return {
    orderId: String(order.id),
    clientOrderId: order.client_order_id,
    status: mapOrderStatus(order.status),
    filledQty: Number(order.filled_qty || 0),
    avgFillPrice: Number.isFinite(Number(order.filled_avg_price))
      ? Number(order.filled_avg_price)
      : undefined,
    filledAt: order.filled_at ? Date.parse(order.filled_at) : undefined,
    symbol: order.symbol,
    side: order.side,
    type: String(order.type || "").toLowerCase(),
    qty: Number(order.qty || 0),
    rejectReason: order.reject_reason,
  };
}

/**
 * Alpaca Markets broker adapter.
 */
export class AlpacaBroker extends BrokerAdapter {
  constructor({ fetchImpl = globalThis.fetch } = {}) {
    super();
    this.fetch = fetchImpl;
    this.connected = false;
    this.config = {};
    this.subscriptions = {
      bars: new Map(),
      quotes: new Map(),
      trades: new Map(),
    };
  }

  async connect(config = {}) {
    this.config = { ...config };
    this.baseUrl =
      config.baseUrl ||
      (config.paper ? "https://paper-api.alpaca.markets" : "https://api.alpaca.markets");
    this.dataUrl = config.dataUrl || "https://data.alpaca.markets";
    this.connected = true;
  }

  async disconnect() {
    this.connected = false;
    this.subscriptions.bars.clear();
    this.subscriptions.quotes.clear();
    this.subscriptions.trades.clear();
  }

  isConnected() {
    return this.connected;
  }

  supportsPaperNative() {
    return true;
  }

  _headers(extra = {}) {
    return {
      "content-type": "application/json",
      "APCA-API-KEY-ID": this.config.apiKey || "",
      "APCA-API-SECRET-KEY": this.config.apiSecret || "",
      ...extra,
    };
  }

  async _request(method, path, { query = null, body = null, dataApi = false } = {}) {
    if (!this.fetch) throw new Error("global fetch is unavailable");
    const base = dataApi ? this.dataUrl : this.baseUrl;
    const url = withQuery(`${base}${path}`, query || {});
    const response = await this.fetch(url, {
      method,
      headers: this._headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message =
        payload?.message || payload?.error || `alpaca request failed (${response.status})`;
      throw new Error(message);
    }
    return payload;
  }

  async getAccount() {
    const account = await this._request("GET", "/v2/account");
    return {
      equity: Number(account.equity || 0),
      buyingPower: Number(account.buying_power || 0),
      cash: Number(account.cash || 0),
      currency: account.currency || "USD",
      marginUsed: Number(account.initial_margin || 0),
    };
  }

  async getPositions() {
    const positions = await this._request("GET", "/v2/positions");
    return positions.map((position) => ({
      symbol: position.symbol,
      side: String(position.side || "long").toLowerCase(),
      qty: Number(position.qty || 0),
      avgEntry: Number(position.avg_entry_price || 0),
      marketValue: Number(position.market_value || 0),
      unrealizedPnl: Number(position.unrealized_pl || 0),
    }));
  }

  async getServerTime() {
    const clock = await this._request("GET", "/v2/clock");
    return clock.timestamp ? Date.parse(clock.timestamp) : Date.now();
  }

  async submitOrder(order) {
    const payload = {
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      qty: String(order.qty),
      time_in_force: order.timeInForce || "day",
      client_order_id: order.clientOrderId,
    };
    if (order.limitPrice !== undefined) payload.limit_price = String(order.limitPrice);
    if (order.stopPrice !== undefined) payload.stop_price = String(order.stopPrice);
    const response = await this._request("POST", "/v2/orders", { body: payload });
    const receipt = mapOrderReceipt(response);
    this.emit("order:submitted", receipt);
    return receipt;
  }

  async cancelOrder(orderId) {
    await this._request("DELETE", `/v2/orders/${orderId}`);
    this.emit("order:canceled", { orderId });
  }

  async modifyOrder(orderId, changes) {
    const payload = {};
    if (changes.qty !== undefined) payload.qty = String(changes.qty);
    if (changes.limitPrice !== undefined) payload.limit_price = String(changes.limitPrice);
    if (changes.stopPrice !== undefined) payload.stop_price = String(changes.stopPrice);
    const response = await this._request("PATCH", `/v2/orders/${orderId}`, { body: payload });
    const receipt = mapOrderReceipt(response);
    this.emit("order:modified", receipt);
    return receipt;
  }

  async getOpenOrders() {
    const orders = await this._request("GET", "/v2/orders", { query: { status: "open" } });
    return orders.map(mapOrderReceipt);
  }

  async getOrderStatus(orderId) {
    const order = await this._request("GET", `/v2/orders/${orderId}`);
    return mapOrderReceipt(order);
  }

  async subscribeQuotes(symbol, handler) {
    const key = symbol;
    const list = this.subscriptions.quotes.get(key) || [];
    list.push(handler);
    this.subscriptions.quotes.set(key, list);
    return {
      unsubscribe: () => {
        const current = this.subscriptions.quotes.get(key) || [];
        this.subscriptions.quotes.set(
          key,
          current.filter((candidate) => candidate !== handler)
        );
      },
    };
  }

  async subscribeTrades(symbol, handler) {
    const key = symbol;
    const list = this.subscriptions.trades.get(key) || [];
    list.push(handler);
    this.subscriptions.trades.set(key, list);
    return {
      unsubscribe: () => {
        const current = this.subscriptions.trades.get(key) || [];
        this.subscriptions.trades.set(
          key,
          current.filter((candidate) => candidate !== handler)
        );
      },
    };
  }

  async subscribeBars(symbol, interval, handler) {
    const key = `${symbol}::${interval}`;
    const list = this.subscriptions.bars.get(key) || [];
    list.push(handler);
    this.subscriptions.bars.set(key, list);
    return {
      unsubscribe: () => {
        const current = this.subscriptions.bars.get(key) || [];
        this.subscriptions.bars.set(
          key,
          current.filter((candidate) => candidate !== handler)
        );
      },
    };
  }

  async getHistoricalBars(symbol, interval, limit = 200) {
    const response = await this._request("GET", `/v2/stocks/${symbol}/bars`, {
      dataApi: true,
      query: {
        timeframe: interval,
        limit,
      },
    });
    const bars = Array.isArray(response?.bars)
      ? response.bars.map((bar) => ({
          time: Date.parse(bar.t),
          open: Number(bar.o),
          high: Number(bar.h),
          low: Number(bar.l),
          close: Number(bar.c),
          volume: Number(bar.v ?? 0),
        }))
      : [];
    return normalizeCandles(bars);
  }
}

export function createAlpacaBroker(options) {
  return new AlpacaBroker(options);
}
