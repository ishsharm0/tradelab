import crypto from "node:crypto";
import { URL } from "node:url";

import { normalizeCandles } from "../../data/csv.js";
import { BrokerAdapter } from "./interface.js";

function queryString(params = {}) {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.join("&");
}

function mapOrderStatus(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "PARTIALLY_FILLED") return "partially_filled";
  if (normalized === "FILLED") return "filled";
  if (normalized === "CANCELED" || normalized === "CANCELLED") return "canceled";
  if (normalized === "REJECTED") return "rejected";
  if (normalized === "EXPIRED" || normalized === "EXPIRED_IN_MATCH") return "expired";
  return "new";
}

/**
 * Binance spot/futures adapter.
 */
export class BinanceBroker extends BrokerAdapter {
  constructor({ fetchImpl = globalThis.fetch } = {}) {
    super();
    this.fetch = fetchImpl;
    this.connected = false;
    this.config = {};
    this.subscriptions = { bars: new Map(), trades: new Map(), quotes: new Map() };
  }

  async connect(config = {}) {
    this.config = { ...config };
    const useFutures = Boolean(config.futures);
    if (config.baseUrl) {
      this.baseUrl = config.baseUrl;
    } else if (config.paper && useFutures) {
      this.baseUrl = "https://testnet.binancefuture.com";
    } else if (config.paper) {
      this.baseUrl = "https://testnet.binance.vision";
    } else if (useFutures) {
      this.baseUrl = "https://fapi.binance.com";
    } else {
      this.baseUrl = "https://api.binance.com";
    }
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
    return true;
  }

  _signedParams(params = {}) {
    const base = {
      ...params,
      timestamp: Date.now(),
    };
    const payload = queryString(base);
    const signature = crypto
      .createHmac("sha256", this.config.apiSecret || "")
      .update(payload)
      .digest("hex");
    return { ...base, signature };
  }

  async _request(method, path, { signed = false, params = {}, body = null } = {}) {
    if (!this.fetch) throw new Error("global fetch is unavailable");
    const finalParams = signed ? this._signedParams(params) : params;
    const qs = queryString(finalParams);
    const url = new URL(`${this.baseUrl}${path}${qs ? `?${qs}` : ""}`);
    const headers = {
      "content-type": "application/json",
    };
    if (this.config.apiKey) headers["X-MBX-APIKEY"] = this.config.apiKey;
    const response = await this.fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message =
        payload?.msg || payload?.message || `binance request failed (${response.status})`;
      throw new Error(message);
    }
    return payload;
  }

  async getServerTime() {
    const path = this.config.futures ? "/fapi/v1/time" : "/api/v3/time";
    const data = await this._request("GET", path);
    return Number(data.serverTime || Date.now());
  }

  async getAccount() {
    if (this.config.futures) {
      const account = await this._request("GET", "/fapi/v2/account", { signed: true });
      return {
        equity: Number(account.totalWalletBalance || 0),
        buyingPower: Number(account.availableBalance || 0),
        cash: Number(account.availableBalance || 0),
        currency: "USDT",
        marginUsed: Number(account.totalPositionInitialMargin || 0),
      };
    }

    const account = await this._request("GET", "/api/v3/account", { signed: true });
    const free = Number(
      (account.balances || []).reduce((sum, item) => sum + Number(item.free || 0), 0)
    );
    return {
      equity: free,
      buyingPower: free,
      cash: free,
      currency: "USDT",
      marginUsed: 0,
    };
  }

  async getPositions() {
    if (this.config.futures) {
      const rows = await this._request("GET", "/fapi/v2/positionRisk", { signed: true });
      return rows
        .map((row) => ({
          symbol: row.symbol,
          qty: Math.abs(Number(row.positionAmt || 0)),
          side: Number(row.positionAmt || 0) >= 0 ? "long" : "short",
          avgEntry: Number(row.entryPrice || 0),
          marketValue: Math.abs(Number(row.positionAmt || 0) * Number(row.markPrice || 0)),
          unrealizedPnl: Number(row.unRealizedProfit || 0),
        }))
        .filter((row) => row.qty > 0);
    }

    const account = await this._request("GET", "/api/v3/account", { signed: true });
    return (account.balances || [])
      .map((asset) => ({
        symbol: `${asset.asset}USDT`,
        side: "long",
        qty: Number(asset.free || 0),
        avgEntry: 0,
        marketValue: Number(asset.free || 0),
        unrealizedPnl: 0,
      }))
      .filter((position) => position.qty > 0);
  }

  _orderPayload(order) {
    const payload = {
      symbol: order.symbol,
      side: String(order.side || "").toUpperCase(),
      quantity: String(order.qty),
      type:
        order.type === "stop_limit"
          ? "STOP_LOSS_LIMIT"
          : String(order.type || "market").toUpperCase(),
      timeInForce: String(order.timeInForce || "GTC").toUpperCase(),
      newClientOrderId: order.clientOrderId,
    };
    if (order.limitPrice !== undefined) payload.price = String(order.limitPrice);
    if (order.stopPrice !== undefined) payload.stopPrice = String(order.stopPrice);
    if (payload.type === "MARKET") delete payload.timeInForce;
    return payload;
  }

  async submitOrder(order) {
    const path = this.config.futures ? "/fapi/v1/order" : "/api/v3/order";
    const response = await this._request("POST", path, {
      signed: true,
      params: this._orderPayload(order),
    });
    const receipt = {
      orderId: String(response.orderId),
      clientOrderId: response.clientOrderId,
      status: mapOrderStatus(response.status),
      filledQty: Number(response.executedQty || 0),
      avgFillPrice: Number.isFinite(Number(response.avgPrice))
        ? Number(response.avgPrice)
        : undefined,
      filledAt: response.transactTime ? Number(response.transactTime) : undefined,
      symbol: response.symbol,
      side: String(response.side || "").toLowerCase(),
      type: String(response.type || "").toLowerCase(),
      qty: Number(response.origQty || 0),
      rejectReason: response.rejectReason,
    };
    this.emit("order:submitted", receipt);
    return receipt;
  }

  async cancelOrder(orderId) {
    const path = this.config.futures ? "/fapi/v1/order" : "/api/v3/order";
    await this._request("DELETE", path, {
      signed: true,
      params: {
        orderId,
      },
    });
    this.emit("order:canceled", { orderId: String(orderId) });
  }

  async modifyOrder(orderId, changes = {}) {
    const path = this.config.futures ? "/fapi/v1/order" : "/api/v3/order";
    const response = await this._request("PUT", path, {
      signed: true,
      params: {
        orderId,
        quantity: changes.qty,
        price: changes.limitPrice,
        stopPrice: changes.stopPrice,
      },
    });
    const receipt = {
      orderId: String(response.orderId),
      clientOrderId: response.clientOrderId,
      status: mapOrderStatus(response.status),
      filledQty: Number(response.executedQty || 0),
      avgFillPrice: Number(response.avgPrice || 0) || undefined,
      filledAt: response.updateTime ? Number(response.updateTime) : undefined,
      symbol: response.symbol,
      side: String(response.side || "").toLowerCase(),
      type: String(response.type || "").toLowerCase(),
      qty: Number(response.origQty || 0),
    };
    this.emit("order:modified", receipt);
    return receipt;
  }

  async getOpenOrders() {
    const path = this.config.futures ? "/fapi/v1/openOrders" : "/api/v3/openOrders";
    const rows = await this._request("GET", path, { signed: true });
    return rows.map((row) => ({
      orderId: String(row.orderId),
      clientOrderId: row.clientOrderId,
      status: mapOrderStatus(row.status),
      filledQty: Number(row.executedQty || 0),
      avgFillPrice: Number(row.avgPrice || 0) || undefined,
      filledAt: row.updateTime ? Number(row.updateTime) : undefined,
      symbol: row.symbol,
      side: String(row.side || "").toLowerCase(),
      type: String(row.type || "").toLowerCase(),
      qty: Number(row.origQty || 0),
      rejectReason: row.rejectReason,
    }));
  }

  async getOrderStatus(orderId) {
    const path = this.config.futures ? "/fapi/v1/order" : "/api/v3/order";
    const row = await this._request("GET", path, {
      signed: true,
      params: { orderId },
    });
    return {
      orderId: String(row.orderId),
      clientOrderId: row.clientOrderId,
      status: mapOrderStatus(row.status),
      filledQty: Number(row.executedQty || 0),
      avgFillPrice: Number(row.avgPrice || 0) || undefined,
      filledAt: row.updateTime ? Number(row.updateTime) : undefined,
      symbol: row.symbol,
      side: String(row.side || "").toLowerCase(),
      type: String(row.type || "").toLowerCase(),
      qty: Number(row.origQty || 0),
      rejectReason: row.rejectReason,
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
    const path = this.config.futures ? "/fapi/v1/klines" : "/api/v3/klines";
    const rows = await this._request("GET", path, {
      params: { symbol, interval, limit },
    });
    const bars = rows.map((row) => ({
      time: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5] || 0),
    }));
    return normalizeCandles(bars);
  }
}

export function createBinanceBroker(options) {
  return new BinanceBroker(options);
}
