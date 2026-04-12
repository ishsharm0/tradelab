import crypto from "node:crypto";
import { URL } from "node:url";

import { normalizeCandles } from "../../data/csv.js";
import { BrokerAdapter } from "./interface.js";

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function buildJwt({ key, secret, method, host, path }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT", kid: key };
  const payload = {
    iss: "cdp",
    sub: key,
    nbf: now - 5,
    exp: now + 120,
    uri: `${method.toUpperCase()} ${host}${path}`,
  };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

function mapOrderStatus(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized.includes("PARTIALLY")) return "partially_filled";
  if (normalized.includes("FILLED")) return "filled";
  if (normalized.includes("CANCEL")) return "canceled";
  if (normalized.includes("REJECT")) return "rejected";
  if (normalized.includes("EXPIRE")) return "expired";
  return "new";
}

function productToSymbol(productId) {
  return String(productId || "").replace("-", "");
}

/**
 * Coinbase Advanced Trade adapter.
 */
export class CoinbaseBroker extends BrokerAdapter {
  constructor({ fetchImpl = globalThis.fetch } = {}) {
    super();
    this.fetch = fetchImpl;
    this.connected = false;
    this.config = {};
    this.baseUrl = "https://api.coinbase.com/api/v3/brokerage";
    this.subscriptions = { bars: new Map(), trades: new Map(), quotes: new Map() };
  }

  async connect(config = {}) {
    this.config = { ...config };
    if (config.baseUrl) this.baseUrl = config.baseUrl;
    this.connected = true;
  }

  async disconnect() {
    this.connected = false;
    this.subscriptions.bars.clear();
    this.subscriptions.trades.clear();
    this.subscriptions.quotes.clear();
  }

  isConnected() {
    return this.connected;
  }

  supportsPaperNative() {
    return false;
  }

  async getServerTime() {
    return Date.now();
  }

  _authHeader(method, url) {
    const target = new URL(url);
    return buildJwt({
      key: this.config.apiKey || "",
      secret: this.config.apiSecret || "",
      method,
      host: target.host,
      path: target.pathname,
    });
  }

  async _request(method, path, { query = {}, body = null } = {}) {
    if (!this.fetch) throw new Error("global fetch is unavailable");
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
    const response = await this.fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${this._authHeader(method, url)}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message =
        payload?.error_response?.message ||
        payload?.message ||
        `coinbase request failed (${response.status})`;
      throw new Error(message);
    }
    return payload;
  }

  async getAccount() {
    const payload = await this._request("GET", "/accounts");
    const accounts = payload.accounts || [];
    const balances = accounts.map((entry) => Number(entry.available_balance?.value || 0));
    const equity = balances.reduce((sum, value) => sum + value, 0);
    return {
      equity,
      buyingPower: equity,
      cash: equity,
      currency: "USD",
      marginUsed: 0,
    };
  }

  async getPositions() {
    const payload = await this._request("GET", "/accounts");
    const accounts = payload.accounts || [];
    return accounts
      .map((entry) => {
        const qty = Number(entry.available_balance?.value || 0);
        return {
          symbol: productToSymbol(entry.currency),
          side: "long",
          qty,
          avgEntry: 0,
          marketValue: qty,
          unrealizedPnl: 0,
        };
      })
      .filter((position) => position.qty > 0);
  }

  async submitOrder(order) {
    const orderType = String(order.type || "market").toLowerCase();
    const payload = {
      client_order_id: order.clientOrderId || crypto.randomUUID(),
      product_id: order.symbol,
      side: String(order.side || "buy").toUpperCase(),
      order_configuration: {},
    };
    if (orderType === "market") {
      payload.order_configuration.market_market_ioc = {
        base_size: String(order.qty),
      };
    } else if (orderType === "limit") {
      payload.order_configuration.limit_limit_gtc = {
        base_size: String(order.qty),
        limit_price: String(order.limitPrice),
      };
    } else {
      payload.order_configuration.stop_limit_stop_limit_gtc = {
        base_size: String(order.qty),
        stop_price: String(order.stopPrice),
        limit_price: String(order.limitPrice ?? order.stopPrice),
      };
    }

    const response = await this._request("POST", "/orders", { body: payload });
    const result = response.success_response || response.order || {};
    const receipt = {
      orderId: String(result.order_id || response.order_id || payload.client_order_id),
      clientOrderId: payload.client_order_id,
      status: mapOrderStatus(result.status || "PENDING"),
      filledQty: Number(result.filled_size || 0),
      avgFillPrice: Number(result.average_filled_price || 0) || undefined,
      filledAt: result.last_fill_time ? Date.parse(result.last_fill_time) : undefined,
      symbol: order.symbol,
      side: String(order.side || "buy").toLowerCase(),
      type: orderType,
      qty: Number(order.qty || 0),
      rejectReason: result.reject_reason,
    };
    this.emit("order:submitted", receipt);
    return receipt;
  }

  async cancelOrder(orderId) {
    await this._request("POST", "/orders/batch_cancel", { body: { order_ids: [String(orderId)] } });
    this.emit("order:canceled", { orderId: String(orderId) });
  }

  async modifyOrder(orderId, changes = {}) {
    const response = await this._request("POST", "/orders/edit", {
      body: {
        order_id: String(orderId),
        size: changes.qty ? String(changes.qty) : undefined,
        limit_price: changes.limitPrice ? String(changes.limitPrice) : undefined,
        stop_price: changes.stopPrice ? String(changes.stopPrice) : undefined,
      },
    });
    const result = response.success_response || {};
    const receipt = {
      orderId: String(result.order_id || orderId),
      clientOrderId: result.client_order_id,
      status: mapOrderStatus(result.status || "PENDING"),
      filledQty: Number(result.filled_size || 0),
      avgFillPrice: Number(result.average_filled_price || 0) || undefined,
      filledAt: result.last_fill_time ? Date.parse(result.last_fill_time) : undefined,
      symbol: result.product_id || "",
      side: String(result.side || "").toLowerCase(),
      type: String(result.order_type || "").toLowerCase(),
      qty: Number(result.base_size || 0),
      rejectReason: result.reject_reason,
    };
    this.emit("order:modified", receipt);
    return receipt;
  }

  async getOpenOrders() {
    const response = await this._request("GET", "/orders/historical/batch", {
      query: { order_status: "OPEN" },
    });
    const orders = response.orders || [];
    return orders.map((order) => ({
      orderId: String(order.order_id),
      clientOrderId: order.client_order_id,
      status: mapOrderStatus(order.status),
      filledQty: Number(order.filled_size || 0),
      avgFillPrice: Number(order.average_filled_price || 0) || undefined,
      filledAt: order.last_fill_time ? Date.parse(order.last_fill_time) : undefined,
      symbol: order.product_id,
      side: String(order.side || "").toLowerCase(),
      type: String(order.order_type || "").toLowerCase(),
      qty: Number(order.base_size || 0),
      rejectReason: order.reject_reason,
    }));
  }

  async getOrderStatus(orderId) {
    const response = await this._request("GET", `/orders/historical/${orderId}`);
    const order = response.order || {};
    return {
      orderId: String(order.order_id || orderId),
      clientOrderId: order.client_order_id,
      status: mapOrderStatus(order.status),
      filledQty: Number(order.filled_size || 0),
      avgFillPrice: Number(order.average_filled_price || 0) || undefined,
      filledAt: order.last_fill_time ? Date.parse(order.last_fill_time) : undefined,
      symbol: order.product_id || "",
      side: String(order.side || "").toLowerCase(),
      type: String(order.order_type || "").toLowerCase(),
      qty: Number(order.base_size || 0),
      rejectReason: order.reject_reason,
    };
  }

  async subscribeQuotes(symbol, handler) {
    const list = this.subscriptions.quotes.get(symbol) || [];
    list.push(handler);
    this.subscriptions.quotes.set(symbol, list);
    return {
      unsubscribe: () => {
        const current = this.subscriptions.quotes.get(symbol) || [];
        this.subscriptions.quotes.set(
          symbol,
          current.filter((candidate) => candidate !== handler)
        );
      },
    };
  }

  async subscribeTrades(symbol, handler) {
    const list = this.subscriptions.trades.get(symbol) || [];
    list.push(handler);
    this.subscriptions.trades.set(symbol, list);
    return {
      unsubscribe: () => {
        const current = this.subscriptions.trades.get(symbol) || [];
        this.subscriptions.trades.set(
          symbol,
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
    const granularity = (() => {
      const raw = String(interval || "1m").toLowerCase();
      if (raw.endsWith("m")) return Number(raw.slice(0, -1)) * 60;
      if (raw.endsWith("h")) return Number(raw.slice(0, -1)) * 3600;
      if (raw.endsWith("d")) return Number(raw.slice(0, -1)) * 86400;
      return 60;
    })();
    const response = await this._request("GET", `/products/${symbol}/candles`, {
      query: {
        granularity,
        limit,
      },
    });
    const rows = response.candles || response || [];
    const bars = rows.map((row) => ({
      time: Number(row.start || row.time || row[0]) * 1000,
      low: Number(row.low ?? row[1]),
      high: Number(row.high ?? row[2]),
      open: Number(row.open ?? row[3]),
      close: Number(row.close ?? row[4]),
      volume: Number(row.volume ?? row[5] ?? 0),
    }));
    return normalizeCandles(bars);
  }
}

export function createCoinbaseBroker(options) {
  return new CoinbaseBroker(options);
}
