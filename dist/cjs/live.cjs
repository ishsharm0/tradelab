"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/live/index.js
var index_exports = {};
__export(index_exports, {
  AlpacaBroker: () => AlpacaBroker,
  BinanceBroker: () => BinanceBroker,
  BrokerAdapter: () => BrokerAdapter,
  BrokerClock: () => BrokerClock,
  BrokerFeed: () => BrokerFeed,
  CandleAggregator: () => CandleAggregator,
  CoinbaseBroker: () => CoinbaseBroker,
  EventBus: () => EventBus,
  FeedProvider: () => FeedProvider,
  InteractiveBrokersBroker: () => InteractiveBrokersBroker,
  JsonFileStorage: () => JsonFileStorage,
  LIVE_EVENTS: () => LIVE_EVENTS,
  LiveEngine: () => LiveEngine,
  LiveLogger: () => LiveLogger,
  LiveOrchestrator: () => LiveOrchestrator,
  PaperEngine: () => PaperEngine,
  PollingFeed: () => PollingFeed,
  RiskManager: () => RiskManager,
  SessionManager: () => SessionManager,
  StateManager: () => StateManager,
  StorageProvider: () => StorageProvider,
  TradingSession: () => TradingSession,
  createAlpacaBroker: () => createAlpacaBroker,
  createBinanceBroker: () => createBinanceBroker,
  createBrokerFeed: () => createBrokerFeed,
  createCandleAggregator: () => createCandleAggregator,
  createClock: () => createClock,
  createCoinbaseBroker: () => createCoinbaseBroker,
  createDashboardServer: () => createDashboardServer,
  createEventBus: () => createEventBus,
  createInteractiveBrokersBroker: () => createInteractiveBrokersBroker,
  createJsonFileStorage: () => createJsonFileStorage,
  createLiveEngine: () => createLiveEngine,
  createLiveOrchestrator: () => createLiveOrchestrator,
  createLogger: () => createLogger,
  createPaperEngine: () => createPaperEngine,
  createPollingFeed: () => createPollingFeed,
  createRiskManager: () => createRiskManager,
  createSessionManager: () => createSessionManager,
  createStateManager: () => createStateManager
});
module.exports = __toCommonJS(index_exports);

// src/live/events.js
var import_node_events = require("node:events");
var LIVE_EVENTS = [
  "signal",
  "order:submitted",
  "order:filled",
  "order:canceled",
  "order:rejected",
  "order:modified",
  "position:opened",
  "position:updated",
  "position:closed",
  "equity:update",
  "risk:warning",
  "risk:halt",
  "bar",
  "tick",
  "error",
  "connected",
  "disconnected",
  "reconnecting",
  "shutdown",
  "stateRestored",
  "reconciled"
];
var EventBus = class extends import_node_events.EventEmitter {
  emitEvent(event, payload = {}) {
    this.emit(event, payload);
    this.emit("*", { event, payload });
    return true;
  }
  onAny(handler) {
    this.on("*", handler);
    return () => this.off("*", handler);
  }
};
function createEventBus() {
  return new EventBus();
}

// src/live/logger.js
var LOG_PRIORITIES = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100
};
function normalizeLevel(level) {
  return Object.prototype.hasOwnProperty.call(LOG_PRIORITIES, level) ? level : "info";
}
var LiveLogger = class {
  constructor({ level = "info", stream = process.stdout } = {}) {
    this.level = normalizeLevel(level);
    this.stream = stream;
    this._unsub = null;
  }
  shouldLog(level) {
    return LOG_PRIORITIES[level] >= LOG_PRIORITIES[this.level];
  }
  write(level, message, fields = {}) {
    const normalizedLevel = normalizeLevel(level);
    if (!this.shouldLog(normalizedLevel)) return;
    const record = {
      t: (/* @__PURE__ */ new Date()).toISOString(),
      level: normalizedLevel,
      msg: message,
      ...fields
    };
    this.stream.write(`${JSON.stringify(record)}
`);
  }
  debug(message, fields) {
    this.write("debug", message, fields);
  }
  info(message, fields) {
    this.write("info", message, fields);
  }
  warn(message, fields) {
    this.write("warn", message, fields);
  }
  error(message, fields) {
    this.write("error", message, fields);
  }
  attach(eventBus) {
    if (!eventBus || typeof eventBus.onAny !== "function") return () => {
    };
    this.detach();
    this._unsub = eventBus.onAny(({ event, payload }) => {
      const level = event === "error" ? "error" : event.startsWith("risk:") ? "warn" : event === "reconnecting" || event === "disconnected" ? "warn" : "info";
      this.write(level, event, { event, payload });
    });
    return () => this.detach();
  }
  detach() {
    if (typeof this._unsub === "function") {
      this._unsub();
      this._unsub = null;
    }
  }
};
function createLogger(options) {
  return new LiveLogger(options);
}

// src/live/clock.js
var BrokerClock = class {
  constructor({ warnThresholdMs = 2e3 } = {}) {
    this.warnThresholdMs = Math.max(0, warnThresholdMs);
    this.offsetMs = 0;
    this.syncedAt = null;
  }
  now() {
    return Date.now() + this.offsetMs;
  }
  getOffsetMs() {
    return this.offsetMs;
  }
  async syncWithBroker(broker) {
    if (!broker || typeof broker.getServerTime !== "function") {
      this.offsetMs = 0;
      this.syncedAt = Date.now();
      return {
        serverTime: null,
        localTime: this.syncedAt,
        offsetMs: this.offsetMs,
        warning: null
      };
    }
    let serverTime = null;
    try {
      serverTime = Number(await broker.getServerTime());
    } catch {
      serverTime = null;
    }
    const localTime = Date.now();
    this.offsetMs = Number.isFinite(serverTime) ? serverTime - localTime : 0;
    this.syncedAt = localTime;
    const warning = Math.abs(this.offsetMs) > this.warnThresholdMs ? `clock offset ${this.offsetMs}ms exceeds threshold ${this.warnThresholdMs}ms` : null;
    return {
      serverTime,
      localTime,
      offsetMs: this.offsetMs,
      warning
    };
  }
};
function createClock(options) {
  return new BrokerClock(options);
}

// src/live/broker/interface.js
var import_node_events2 = require("node:events");
function notImplemented(method) {
  throw new Error(`BrokerAdapter.${method}() not implemented`);
}
var BrokerAdapter = class extends import_node_events2.EventEmitter {
  async connect(_config = {}) {
    notImplemented("connect");
  }
  async disconnect() {
    notImplemented("disconnect");
  }
  isConnected() {
    notImplemented("isConnected");
  }
  async getAccount() {
    notImplemented("getAccount");
  }
  async getPositions() {
    notImplemented("getPositions");
  }
  async getServerTime() {
    return Date.now();
  }
  async submitOrder(_order) {
    notImplemented("submitOrder");
  }
  async cancelOrder(_orderId) {
    notImplemented("cancelOrder");
  }
  async modifyOrder(_orderId, _changes) {
    notImplemented("modifyOrder");
  }
  async getOpenOrders() {
    notImplemented("getOpenOrders");
  }
  async getOrderStatus(_orderId) {
    notImplemented("getOrderStatus");
  }
  async subscribeQuotes(_symbol, _handler) {
    notImplemented("subscribeQuotes");
  }
  async subscribeTrades(_symbol, _handler) {
    notImplemented("subscribeTrades");
  }
  async subscribeBars(_symbol, _interval, _handler) {
    notImplemented("subscribeBars");
  }
  async getHistoricalBars(_symbol, _interval, _limit = 200) {
    notImplemented("getHistoricalBars");
  }
  supportsPaperNative() {
    return false;
  }
};

// src/live/broker/alpaca.js
var import_node_url = require("node:url");

// src/data/csv.js
function resolveDate(value, customDateParser) {
  if (value === void 0 || value === null || value === "") {
    throw new Error("Missing date value");
  }
  if (typeof customDateParser === "function") {
    const parsed2 = customDateParser(value);
    const time = parsed2 instanceof Date ? parsed2.getTime() : Number(parsed2);
    if (Number.isFinite(time)) return time;
  }
  if (value instanceof Date) {
    const time = value.getTime();
    if (Number.isFinite(time)) return time;
  }
  const raw = String(value).trim().replace(/^['"]|['"]$/g, "");
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return numeric < 1e11 ? numeric * 1e3 : numeric;
  }
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return parsed;
  const mt = raw.match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (mt) {
    const [, year, month, day, hour, minute, second = "0"] = mt;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    ).getTime();
  }
  throw new Error(`Cannot parse date: ${raw}`);
}
function normalizeCandles(candles) {
  if (!Array.isArray(candles)) return [];
  const parsed = candles.map((bar) => {
    try {
      const time = resolveDate(bar?.time ?? bar?.timestamp ?? bar?.date);
      const open = Number(bar?.open ?? bar?.o);
      const high = Number(bar?.high ?? bar?.h);
      const low = Number(bar?.low ?? bar?.l);
      const close = Number(bar?.close ?? bar?.c);
      const volume = Number(bar?.volume ?? bar?.v ?? 0);
      if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
        return null;
      }
      return {
        time,
        open,
        high: Math.max(high, open, close),
        low: Math.min(low, open, close),
        close,
        volume: Number.isFinite(volume) ? volume : 0
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
  let reordered = false;
  let duplicateCount = 0;
  for (let index = 1; index < parsed.length; index += 1) {
    const prev = parsed[index - 1].time;
    const current = parsed[index].time;
    if (current < prev) reordered = true;
    if (current === prev) duplicateCount += 1;
  }
  const normalized = parsed.sort((left, right) => left.time - right.time);
  const deduped = [];
  let lastTime = null;
  for (const candle of normalized) {
    if (candle.time === lastTime) continue;
    deduped.push(candle);
    lastTime = candle.time;
  }
  const removedDuplicates = normalized.length - deduped.length;
  if (reordered || removedDuplicates > 0 || duplicateCount > 0) {
    console.warn(
      `[tradelab] normalizeCandles() reordered or deduplicated candles (input=${candles.length}, valid=${parsed.length}, output=${deduped.length})`
    );
  }
  return deduped;
}

// src/live/broker/alpaca.js
function withQuery(url, query = {}) {
  const target = new import_node_url.URL(url);
  for (const [key, value] of Object.entries(query)) {
    if (value === void 0 || value === null) continue;
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
    avgFillPrice: Number.isFinite(Number(order.filled_avg_price)) ? Number(order.filled_avg_price) : void 0,
    filledAt: order.filled_at ? Date.parse(order.filled_at) : void 0,
    symbol: order.symbol,
    side: order.side,
    type: String(order.type || "").toLowerCase(),
    qty: Number(order.qty || 0),
    rejectReason: order.reject_reason
  };
}
var AlpacaBroker = class extends BrokerAdapter {
  constructor({ fetchImpl = globalThis.fetch } = {}) {
    super();
    this.fetch = fetchImpl;
    this.connected = false;
    this.config = {};
    this.subscriptions = {
      bars: /* @__PURE__ */ new Map(),
      quotes: /* @__PURE__ */ new Map(),
      trades: /* @__PURE__ */ new Map()
    };
  }
  async connect(config = {}) {
    this.config = { ...config };
    this.baseUrl = config.baseUrl || (config.paper ? "https://paper-api.alpaca.markets" : "https://api.alpaca.markets");
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
      ...extra
    };
  }
  async _request(method, path3, { query = null, body = null, dataApi = false } = {}) {
    if (!this.fetch) throw new Error("global fetch is unavailable");
    const base = dataApi ? this.dataUrl : this.baseUrl;
    const url = withQuery(`${base}${path3}`, query || {});
    const response = await this.fetch(url, {
      method,
      headers: this._headers(),
      body: body ? JSON.stringify(body) : void 0
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message = payload?.message || payload?.error || `alpaca request failed (${response.status})`;
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
      marginUsed: Number(account.initial_margin || 0)
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
      unrealizedPnl: Number(position.unrealized_pl || 0)
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
      client_order_id: order.clientOrderId
    };
    if (order.limitPrice !== void 0) payload.limit_price = String(order.limitPrice);
    if (order.stopPrice !== void 0) payload.stop_price = String(order.stopPrice);
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
    if (changes.qty !== void 0) payload.qty = String(changes.qty);
    if (changes.limitPrice !== void 0) payload.limit_price = String(changes.limitPrice);
    if (changes.stopPrice !== void 0) payload.stop_price = String(changes.stopPrice);
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
      }
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
      }
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
      }
    };
  }
  async getHistoricalBars(symbol, interval, limit = 200) {
    const response = await this._request("GET", `/v2/stocks/${symbol}/bars`, {
      dataApi: true,
      query: {
        timeframe: interval,
        limit
      }
    });
    const bars = Array.isArray(response?.bars) ? response.bars.map((bar) => ({
      time: Date.parse(bar.t),
      open: Number(bar.o),
      high: Number(bar.h),
      low: Number(bar.l),
      close: Number(bar.c),
      volume: Number(bar.v ?? 0)
    })) : [];
    return normalizeCandles(bars);
  }
};
function createAlpacaBroker(options) {
  return new AlpacaBroker(options);
}

// src/live/broker/binance.js
var import_node_crypto = __toESM(require("node:crypto"), 1);
var import_node_url2 = require("node:url");
function queryString(params = {}) {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === void 0 || value === null) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.join("&");
}
function mapOrderStatus2(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "PARTIALLY_FILLED") return "partially_filled";
  if (normalized === "FILLED") return "filled";
  if (normalized === "CANCELED" || normalized === "CANCELLED") return "canceled";
  if (normalized === "REJECTED") return "rejected";
  if (normalized === "EXPIRED" || normalized === "EXPIRED_IN_MATCH") return "expired";
  return "new";
}
var BinanceBroker = class extends BrokerAdapter {
  constructor({ fetchImpl = globalThis.fetch } = {}) {
    super();
    this.fetch = fetchImpl;
    this.connected = false;
    this.config = {};
    this.subscriptions = { bars: /* @__PURE__ */ new Map(), trades: /* @__PURE__ */ new Map(), quotes: /* @__PURE__ */ new Map() };
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
      timestamp: Date.now()
    };
    const payload = queryString(base);
    const signature = import_node_crypto.default.createHmac("sha256", this.config.apiSecret || "").update(payload).digest("hex");
    return { ...base, signature };
  }
  async _request(method, path3, { signed = false, params = {}, body = null } = {}) {
    if (!this.fetch) throw new Error("global fetch is unavailable");
    const finalParams = signed ? this._signedParams(params) : params;
    const qs = queryString(finalParams);
    const url = new import_node_url2.URL(`${this.baseUrl}${path3}${qs ? `?${qs}` : ""}`);
    const headers = {
      "content-type": "application/json"
    };
    if (this.config.apiKey) headers["X-MBX-APIKEY"] = this.config.apiKey;
    const response = await this.fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : void 0
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message = payload?.msg || payload?.message || `binance request failed (${response.status})`;
      throw new Error(message);
    }
    return payload;
  }
  async getServerTime() {
    const path3 = this.config.futures ? "/fapi/v1/time" : "/api/v3/time";
    const data = await this._request("GET", path3);
    return Number(data.serverTime || Date.now());
  }
  async getAccount() {
    if (this.config.futures) {
      const account2 = await this._request("GET", "/fapi/v2/account", { signed: true });
      return {
        equity: Number(account2.totalWalletBalance || 0),
        buyingPower: Number(account2.availableBalance || 0),
        cash: Number(account2.availableBalance || 0),
        currency: "USDT",
        marginUsed: Number(account2.totalPositionInitialMargin || 0)
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
      marginUsed: 0
    };
  }
  async getPositions() {
    if (this.config.futures) {
      const rows = await this._request("GET", "/fapi/v2/positionRisk", { signed: true });
      return rows.map((row) => ({
        symbol: row.symbol,
        qty: Math.abs(Number(row.positionAmt || 0)),
        side: Number(row.positionAmt || 0) >= 0 ? "long" : "short",
        avgEntry: Number(row.entryPrice || 0),
        marketValue: Math.abs(Number(row.positionAmt || 0) * Number(row.markPrice || 0)),
        unrealizedPnl: Number(row.unRealizedProfit || 0)
      })).filter((row) => row.qty > 0);
    }
    const account = await this._request("GET", "/api/v3/account", { signed: true });
    return (account.balances || []).map((asset) => ({
      symbol: `${asset.asset}USDT`,
      side: "long",
      qty: Number(asset.free || 0),
      avgEntry: 0,
      marketValue: Number(asset.free || 0),
      unrealizedPnl: 0
    })).filter((position) => position.qty > 0);
  }
  _orderPayload(order) {
    const payload = {
      symbol: order.symbol,
      side: String(order.side || "").toUpperCase(),
      quantity: String(order.qty),
      type: order.type === "stop_limit" ? "STOP_LOSS_LIMIT" : String(order.type || "market").toUpperCase(),
      timeInForce: String(order.timeInForce || "GTC").toUpperCase(),
      newClientOrderId: order.clientOrderId
    };
    if (order.limitPrice !== void 0) payload.price = String(order.limitPrice);
    if (order.stopPrice !== void 0) payload.stopPrice = String(order.stopPrice);
    if (payload.type === "MARKET") delete payload.timeInForce;
    return payload;
  }
  async submitOrder(order) {
    const path3 = this.config.futures ? "/fapi/v1/order" : "/api/v3/order";
    const response = await this._request("POST", path3, {
      signed: true,
      params: this._orderPayload(order)
    });
    const receipt = {
      orderId: String(response.orderId),
      clientOrderId: response.clientOrderId,
      status: mapOrderStatus2(response.status),
      filledQty: Number(response.executedQty || 0),
      avgFillPrice: Number.isFinite(Number(response.avgPrice)) ? Number(response.avgPrice) : void 0,
      filledAt: response.transactTime ? Number(response.transactTime) : void 0,
      symbol: response.symbol,
      side: String(response.side || "").toLowerCase(),
      type: String(response.type || "").toLowerCase(),
      qty: Number(response.origQty || 0),
      rejectReason: response.rejectReason
    };
    this.emit("order:submitted", receipt);
    return receipt;
  }
  async cancelOrder(orderId) {
    const path3 = this.config.futures ? "/fapi/v1/order" : "/api/v3/order";
    await this._request("DELETE", path3, {
      signed: true,
      params: {
        orderId
      }
    });
    this.emit("order:canceled", { orderId: String(orderId) });
  }
  async modifyOrder(orderId, changes = {}) {
    const path3 = this.config.futures ? "/fapi/v1/order" : "/api/v3/order";
    const response = await this._request("PUT", path3, {
      signed: true,
      params: {
        orderId,
        quantity: changes.qty,
        price: changes.limitPrice,
        stopPrice: changes.stopPrice
      }
    });
    const receipt = {
      orderId: String(response.orderId),
      clientOrderId: response.clientOrderId,
      status: mapOrderStatus2(response.status),
      filledQty: Number(response.executedQty || 0),
      avgFillPrice: Number(response.avgPrice || 0) || void 0,
      filledAt: response.updateTime ? Number(response.updateTime) : void 0,
      symbol: response.symbol,
      side: String(response.side || "").toLowerCase(),
      type: String(response.type || "").toLowerCase(),
      qty: Number(response.origQty || 0)
    };
    this.emit("order:modified", receipt);
    return receipt;
  }
  async getOpenOrders() {
    const path3 = this.config.futures ? "/fapi/v1/openOrders" : "/api/v3/openOrders";
    const rows = await this._request("GET", path3, { signed: true });
    return rows.map((row) => ({
      orderId: String(row.orderId),
      clientOrderId: row.clientOrderId,
      status: mapOrderStatus2(row.status),
      filledQty: Number(row.executedQty || 0),
      avgFillPrice: Number(row.avgPrice || 0) || void 0,
      filledAt: row.updateTime ? Number(row.updateTime) : void 0,
      symbol: row.symbol,
      side: String(row.side || "").toLowerCase(),
      type: String(row.type || "").toLowerCase(),
      qty: Number(row.origQty || 0),
      rejectReason: row.rejectReason
    }));
  }
  async getOrderStatus(orderId) {
    const path3 = this.config.futures ? "/fapi/v1/order" : "/api/v3/order";
    const row = await this._request("GET", path3, {
      signed: true,
      params: { orderId }
    });
    return {
      orderId: String(row.orderId),
      clientOrderId: row.clientOrderId,
      status: mapOrderStatus2(row.status),
      filledQty: Number(row.executedQty || 0),
      avgFillPrice: Number(row.avgPrice || 0) || void 0,
      filledAt: row.updateTime ? Number(row.updateTime) : void 0,
      symbol: row.symbol,
      side: String(row.side || "").toLowerCase(),
      type: String(row.type || "").toLowerCase(),
      qty: Number(row.origQty || 0),
      rejectReason: row.rejectReason
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
      }
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
      }
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
      }
    };
  }
  async getHistoricalBars(symbol, interval, limit = 200) {
    const path3 = this.config.futures ? "/fapi/v1/klines" : "/api/v3/klines";
    const rows = await this._request("GET", path3, {
      params: { symbol, interval, limit }
    });
    const bars = rows.map((row) => ({
      time: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5] || 0)
    }));
    return normalizeCandles(bars);
  }
};
function createBinanceBroker(options) {
  return new BinanceBroker(options);
}

// src/live/broker/coinbase.js
var import_node_crypto2 = __toESM(require("node:crypto"), 1);
var import_node_url3 = require("node:url");
function base64url(input) {
  return Buffer.from(input).toString("base64url");
}
function buildJwt({ key, secret, method, host, path: path3 }) {
  const now = Math.floor(Date.now() / 1e3);
  const header = { alg: "HS256", typ: "JWT", kid: key };
  const payload = {
    iss: "cdp",
    sub: key,
    nbf: now - 5,
    exp: now + 120,
    uri: `${method.toUpperCase()} ${host}${path3}`
  };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = import_node_crypto2.default.createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}
function mapOrderStatus3(status) {
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
var CoinbaseBroker = class extends BrokerAdapter {
  constructor({ fetchImpl = globalThis.fetch } = {}) {
    super();
    this.fetch = fetchImpl;
    this.connected = false;
    this.config = {};
    this.baseUrl = "https://api.coinbase.com/api/v3/brokerage";
    this.subscriptions = { bars: /* @__PURE__ */ new Map(), trades: /* @__PURE__ */ new Map(), quotes: /* @__PURE__ */ new Map() };
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
    const target = new import_node_url3.URL(url);
    return buildJwt({
      key: this.config.apiKey || "",
      secret: this.config.apiSecret || "",
      method,
      host: target.host,
      path: target.pathname
    });
  }
  async _request(method, path3, { query = {}, body = null } = {}) {
    if (!this.fetch) throw new Error("global fetch is unavailable");
    const url = new import_node_url3.URL(`${this.baseUrl}${path3}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value === void 0 || value === null) continue;
      url.searchParams.set(key, String(value));
    }
    const response = await this.fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${this._authHeader(method, url)}`
      },
      body: body ? JSON.stringify(body) : void 0
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message = payload?.error_response?.message || payload?.message || `coinbase request failed (${response.status})`;
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
      marginUsed: 0
    };
  }
  async getPositions() {
    const payload = await this._request("GET", "/accounts");
    const accounts = payload.accounts || [];
    return accounts.map((entry) => {
      const qty = Number(entry.available_balance?.value || 0);
      return {
        symbol: productToSymbol(entry.currency),
        side: "long",
        qty,
        avgEntry: 0,
        marketValue: qty,
        unrealizedPnl: 0
      };
    }).filter((position) => position.qty > 0);
  }
  async submitOrder(order) {
    const orderType = String(order.type || "market").toLowerCase();
    const payload = {
      client_order_id: order.clientOrderId || import_node_crypto2.default.randomUUID(),
      product_id: order.symbol,
      side: String(order.side || "buy").toUpperCase(),
      order_configuration: {}
    };
    if (orderType === "market") {
      payload.order_configuration.market_market_ioc = {
        base_size: String(order.qty)
      };
    } else if (orderType === "limit") {
      payload.order_configuration.limit_limit_gtc = {
        base_size: String(order.qty),
        limit_price: String(order.limitPrice)
      };
    } else {
      payload.order_configuration.stop_limit_stop_limit_gtc = {
        base_size: String(order.qty),
        stop_price: String(order.stopPrice),
        limit_price: String(order.limitPrice ?? order.stopPrice)
      };
    }
    const response = await this._request("POST", "/orders", { body: payload });
    const result = response.success_response || response.order || {};
    const receipt = {
      orderId: String(result.order_id || response.order_id || payload.client_order_id),
      clientOrderId: payload.client_order_id,
      status: mapOrderStatus3(result.status || "PENDING"),
      filledQty: Number(result.filled_size || 0),
      avgFillPrice: Number(result.average_filled_price || 0) || void 0,
      filledAt: result.last_fill_time ? Date.parse(result.last_fill_time) : void 0,
      symbol: order.symbol,
      side: String(order.side || "buy").toLowerCase(),
      type: orderType,
      qty: Number(order.qty || 0),
      rejectReason: result.reject_reason
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
        size: changes.qty ? String(changes.qty) : void 0,
        limit_price: changes.limitPrice ? String(changes.limitPrice) : void 0,
        stop_price: changes.stopPrice ? String(changes.stopPrice) : void 0
      }
    });
    const result = response.success_response || {};
    const receipt = {
      orderId: String(result.order_id || orderId),
      clientOrderId: result.client_order_id,
      status: mapOrderStatus3(result.status || "PENDING"),
      filledQty: Number(result.filled_size || 0),
      avgFillPrice: Number(result.average_filled_price || 0) || void 0,
      filledAt: result.last_fill_time ? Date.parse(result.last_fill_time) : void 0,
      symbol: result.product_id || "",
      side: String(result.side || "").toLowerCase(),
      type: String(result.order_type || "").toLowerCase(),
      qty: Number(result.base_size || 0),
      rejectReason: result.reject_reason
    };
    this.emit("order:modified", receipt);
    return receipt;
  }
  async getOpenOrders() {
    const response = await this._request("GET", "/orders/historical/batch", {
      query: { order_status: "OPEN" }
    });
    const orders = response.orders || [];
    return orders.map((order) => ({
      orderId: String(order.order_id),
      clientOrderId: order.client_order_id,
      status: mapOrderStatus3(order.status),
      filledQty: Number(order.filled_size || 0),
      avgFillPrice: Number(order.average_filled_price || 0) || void 0,
      filledAt: order.last_fill_time ? Date.parse(order.last_fill_time) : void 0,
      symbol: order.product_id,
      side: String(order.side || "").toLowerCase(),
      type: String(order.order_type || "").toLowerCase(),
      qty: Number(order.base_size || 0),
      rejectReason: order.reject_reason
    }));
  }
  async getOrderStatus(orderId) {
    const response = await this._request("GET", `/orders/historical/${orderId}`);
    const order = response.order || {};
    return {
      orderId: String(order.order_id || orderId),
      clientOrderId: order.client_order_id,
      status: mapOrderStatus3(order.status),
      filledQty: Number(order.filled_size || 0),
      avgFillPrice: Number(order.average_filled_price || 0) || void 0,
      filledAt: order.last_fill_time ? Date.parse(order.last_fill_time) : void 0,
      symbol: order.product_id || "",
      side: String(order.side || "").toLowerCase(),
      type: String(order.order_type || "").toLowerCase(),
      qty: Number(order.base_size || 0),
      rejectReason: order.reject_reason
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
      }
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
      }
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
      }
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
        limit
      }
    });
    const rows = response.candles || response || [];
    const bars = rows.map((row) => ({
      time: Number(row.start || row.time || row[0]) * 1e3,
      low: Number(row.low ?? row[1]),
      high: Number(row.high ?? row[2]),
      open: Number(row.open ?? row[3]),
      close: Number(row.close ?? row[4]),
      volume: Number(row.volume ?? row[5] ?? 0)
    }));
    return normalizeCandles(bars);
  }
};
function createCoinbaseBroker(options) {
  return new CoinbaseBroker(options);
}

// src/live/broker/interactiveBrokers.js
var InteractiveBrokersBroker = class extends BrokerAdapter {
  constructor() {
    super();
    this.connected = false;
    this.config = {};
    this.ibModule = null;
    this.orderCounter = 1;
    this.orders = /* @__PURE__ */ new Map();
    this.positions = /* @__PURE__ */ new Map();
  }
  async connect(config = {}) {
    this.config = { ...config };
    try {
      this.ibModule = await import("@stoqey/ib");
    } catch {
      throw new Error(
        'InteractiveBrokersBroker requires optional peer dependency "@stoqey/ib". Install it to enable IB support.'
      );
    }
    this.connected = true;
  }
  async disconnect() {
    this.connected = false;
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
  async getAccount() {
    return {
      equity: 0,
      buyingPower: 0,
      cash: 0,
      currency: "USD",
      marginUsed: 0
    };
  }
  async getPositions() {
    return [...this.positions.values()];
  }
  async submitOrder(order) {
    const receipt = {
      orderId: String(this.orderCounter++),
      clientOrderId: order.clientOrderId,
      status: "new",
      filledQty: 0,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      qty: Number(order.qty || 0),
      avgFillPrice: void 0,
      filledAt: void 0
    };
    this.orders.set(receipt.orderId, receipt);
    this.emit("order:submitted", receipt);
    return receipt;
  }
  async cancelOrder(orderId) {
    const order = this.orders.get(String(orderId));
    if (!order) return;
    order.status = "canceled";
    this.emit("order:canceled", { ...order });
  }
  async modifyOrder(orderId, changes = {}) {
    const order = this.orders.get(String(orderId));
    if (!order) throw new Error(`IB order "${orderId}" not found`);
    if (changes.qty !== void 0) order.qty = Number(changes.qty || order.qty);
    if (changes.limitPrice !== void 0) order.limitPrice = Number(changes.limitPrice);
    if (changes.stopPrice !== void 0) order.stopPrice = Number(changes.stopPrice);
    this.emit("order:modified", { ...order });
    return { ...order };
  }
  async getOpenOrders() {
    return [...this.orders.values()].filter((order) => order.status === "new");
  }
  async getOrderStatus(orderId) {
    const order = this.orders.get(String(orderId));
    if (!order) throw new Error(`IB order "${orderId}" not found`);
    return { ...order };
  }
  async subscribeQuotes(_symbol, _handler) {
    return { unsubscribe: () => {
    } };
  }
  async subscribeTrades(_symbol, _handler) {
    return { unsubscribe: () => {
    } };
  }
  async subscribeBars(_symbol, _interval, _handler) {
    return { unsubscribe: () => {
    } };
  }
  async getHistoricalBars(_symbol, _interval, _limit = 200) {
    return [];
  }
};
function createInteractiveBrokersBroker(options) {
  return new InteractiveBrokersBroker(options);
}

// src/live/feed/interface.js
function notImplemented2(method) {
  throw new Error(`FeedProvider.${method}() not implemented`);
}
var FeedProvider = class {
  async connect() {
    notImplemented2("connect");
  }
  async disconnect() {
    notImplemented2("disconnect");
  }
  subscribeBars(_symbol, _interval, _handler) {
    notImplemented2("subscribeBars");
  }
  subscribeTicks(_symbol, _handler) {
    notImplemented2("subscribeTicks");
  }
  async getHistoricalBars(_symbol, _interval, _count) {
    notImplemented2("getHistoricalBars");
  }
};

// src/live/feed/brokerFeed.js
var BrokerFeed = class extends FeedProvider {
  constructor({ broker }) {
    super();
    this.broker = broker;
  }
  async connect() {
    return void 0;
  }
  async disconnect() {
    return void 0;
  }
  subscribeBars(symbol, interval, handler) {
    return this.broker.subscribeBars(symbol, interval, handler);
  }
  subscribeTicks(symbol, handler) {
    return this.broker.subscribeTrades(symbol, handler);
  }
  async getHistoricalBars(symbol, interval, count) {
    return this.broker.getHistoricalBars(symbol, interval, count);
  }
};
function createBrokerFeed(options) {
  return new BrokerFeed(options);
}

// src/live/feed/pollingFeed.js
function keyFor(symbol, interval) {
  return `${symbol}::${interval}`;
}
var PollingFeed = class extends FeedProvider {
  constructor({ broker, pollIntervalMs = 6e4, defaultBarsPerPoll = 2 } = {}) {
    super();
    this.broker = broker;
    this.pollIntervalMs = Math.max(500, Number(pollIntervalMs) || 6e4);
    this.defaultBarsPerPoll = Math.max(1, Number(defaultBarsPerPoll) || 2);
    this.barSubscriptions = /* @__PURE__ */ new Map();
    this.tickSubscriptions = /* @__PURE__ */ new Map();
    this.lastEmittedByStream = /* @__PURE__ */ new Map();
    this.timer = null;
    this.connected = false;
  }
  async connect() {
    this.connected = true;
  }
  async disconnect() {
    this.connected = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  subscribeBars(symbol, interval, handler) {
    const streamKey = keyFor(symbol, interval);
    const list = this.barSubscriptions.get(streamKey) || [];
    list.push(handler);
    this.barSubscriptions.set(streamKey, list);
    return {
      unsubscribe: () => {
        const current = this.barSubscriptions.get(streamKey) || [];
        this.barSubscriptions.set(
          streamKey,
          current.filter((candidate) => candidate !== handler)
        );
      }
    };
  }
  subscribeTicks(symbol, handler) {
    const list = this.tickSubscriptions.get(symbol) || [];
    list.push(handler);
    this.tickSubscriptions.set(symbol, list);
    return {
      unsubscribe: () => {
        const current = this.tickSubscriptions.get(symbol) || [];
        this.tickSubscriptions.set(
          symbol,
          current.filter((candidate) => candidate !== handler)
        );
      }
    };
  }
  async getHistoricalBars(symbol, interval, count) {
    return this.broker.getHistoricalBars(symbol, interval, count);
  }
  async pollOnce() {
    const streams = [...this.barSubscriptions.keys()];
    for (const stream of streams) {
      const [symbol, interval] = stream.split("::");
      const bars = await this.broker.getHistoricalBars(symbol, interval, this.defaultBarsPerPoll);
      const ordered = [...bars].sort((left, right) => left.time - right.time);
      const lastSeen = this.lastEmittedByStream.get(stream) ?? -Infinity;
      const next = ordered.filter((bar) => bar.time > lastSeen);
      if (!next.length) continue;
      const handlers = this.barSubscriptions.get(stream) || [];
      for (const bar of next) {
        for (const handler of handlers) {
          await handler(bar);
        }
      }
      this.lastEmittedByStream.set(stream, next[next.length - 1].time);
    }
  }
  startPolling() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.pollOnce().catch(() => {
      });
    }, this.pollIntervalMs);
  }
  stopPolling() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
};
function createPollingFeed(options) {
  return new PollingFeed(options);
}

// src/live/storage/interface.js
function notImplemented3(method) {
  throw new Error(`StorageProvider.${method}() not implemented`);
}
var StorageProvider = class {
  async load(_namespace) {
    notImplemented3("load");
  }
  async save(_namespace, _state) {
    notImplemented3("save");
  }
  async appendTrade(_namespace, _trade) {
    notImplemented3("appendTrade");
  }
  async appendEquityPoint(_namespace, _point) {
    notImplemented3("appendEquityPoint");
  }
  async loadTrades(_namespace) {
    notImplemented3("loadTrades");
  }
  async loadEquityCurve(_namespace) {
    notImplemented3("loadEquityCurve");
  }
  async clear(_namespace) {
    notImplemented3("clear");
  }
};

// src/live/storage/jsonFileStorage.js
var import_node_fs = __toESM(require("node:fs"), 1);
var import_promises = __toESM(require("node:fs/promises"), 1);
var import_node_path = __toESM(require("node:path"), 1);
function sanitizeNamespace(namespace) {
  return String(namespace || "default").replace(/[^a-zA-Z0-9._-]/g, "_");
}
async function ensureDir(dirPath) {
  await import_promises.default.mkdir(dirPath, { recursive: true });
}
async function readJsonFile(filePath) {
  try {
    const raw = await import_promises.default.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}
async function writeJsonAtomic(filePath, payload) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await import_promises.default.writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf8");
  await import_promises.default.rename(tmpPath, filePath);
}
async function appendJsonLine(filePath, payload) {
  await ensureDir(import_node_path.default.dirname(filePath));
  await import_promises.default.appendFile(filePath, `${JSON.stringify(payload)}
`, "utf8");
}
async function readJsonLines(filePath) {
  try {
    const raw = await import_promises.default.readFile(filePath, "utf8");
    return raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}
var JsonFileStorage = class extends StorageProvider {
  constructor({ baseDir = import_node_path.default.resolve(process.cwd(), "output/live-state") } = {}) {
    super();
    this.baseDir = baseDir;
  }
  namespaceDir(namespace) {
    return import_node_path.default.join(this.baseDir, sanitizeNamespace(namespace));
  }
  statePath(namespace) {
    return import_node_path.default.join(this.namespaceDir(namespace), "state.json");
  }
  tradesPath(namespace) {
    return import_node_path.default.join(this.namespaceDir(namespace), "trades.jsonl");
  }
  equityPath(namespace) {
    return import_node_path.default.join(this.namespaceDir(namespace), "equity.jsonl");
  }
  async load(namespace) {
    return readJsonFile(this.statePath(namespace));
  }
  async save(namespace, state) {
    const dir = this.namespaceDir(namespace);
    await ensureDir(dir);
    await writeJsonAtomic(this.statePath(namespace), state);
  }
  async appendTrade(namespace, trade) {
    await appendJsonLine(this.tradesPath(namespace), trade);
  }
  async appendEquityPoint(namespace, point) {
    await appendJsonLine(this.equityPath(namespace), point);
  }
  async loadTrades(namespace) {
    return readJsonLines(this.tradesPath(namespace));
  }
  async loadEquityCurve(namespace) {
    return readJsonLines(this.equityPath(namespace));
  }
  async clear(namespace) {
    const dir = this.namespaceDir(namespace);
    if (!import_node_fs.default.existsSync(dir)) return;
    await import_promises.default.rm(dir, { recursive: true, force: true });
  }
};
function createJsonFileStorage(options) {
  return new JsonFileStorage(options);
}

// src/live/engine/candleAggregator.js
var import_node_events3 = require("node:events");

// src/utils/time.js
function usDstBoundsUTC(year) {
  let marchCursor = new Date(Date.UTC(year, 2, 1, 7, 0, 0));
  let sundaysSeen = 0;
  while (marchCursor.getUTCMonth() === 2) {
    if (marchCursor.getUTCDay() === 0) sundaysSeen += 1;
    if (sundaysSeen === 2) break;
    marchCursor = new Date(marchCursor.getTime() + 24 * 60 * 60 * 1e3);
  }
  const dstStart = new Date(Date.UTC(year, 2, marchCursor.getUTCDate(), 7, 0, 0));
  let novemberCursor = new Date(Date.UTC(year, 10, 1, 6, 0, 0));
  while (novemberCursor.getUTCDay() !== 0) {
    novemberCursor = new Date(novemberCursor.getTime() + 24 * 60 * 60 * 1e3);
  }
  const dstEnd = new Date(Date.UTC(year, 10, novemberCursor.getUTCDate(), 6, 0, 0));
  return { dstStart, dstEnd };
}
function isUsEasternDST(timeMs) {
  const date = new Date(timeMs);
  const { dstStart, dstEnd } = usDstBoundsUTC(date.getUTCFullYear());
  return date >= dstStart && date < dstEnd;
}
function offsetET(timeMs) {
  return isUsEasternDST(timeMs) ? 4 : 5;
}
function minutesET(timeMs) {
  const date = new Date(timeMs);
  const offset = offsetET(timeMs);
  return (date.getUTCHours() - offset + 24) % 24 * 60 + date.getUTCMinutes();
}
function isSession(timeMs, session = "NYSE") {
  const day = new Date(timeMs).getUTCDay();
  if (day === 0 || day === 6) {
    if (session === "FUT") {
      const minutes2 = minutesET(timeMs);
      return minutes2 >= 18 * 60 || minutes2 < 17 * 60;
    }
    return false;
  }
  const minutes = minutesET(timeMs);
  if (session === "AUTO") return true;
  if (session === "FUT") {
    const maintenanceStart = 17 * 60;
    const maintenanceEnd = 18 * 60;
    return !(minutes >= maintenanceStart && minutes < maintenanceEnd);
  }
  const open = 9 * 60 + 30;
  const close = 16 * 60;
  return minutes >= open && minutes <= close;
}
function parseWindowsCSV(csv) {
  if (!csv) return null;
  return csv.split(",").map((token) => token.trim()).filter(Boolean).map((windowText) => {
    const [start, end] = windowText.split("-").map((value) => value.trim());
    const [startHour, startMinute] = start.split(":").map(Number);
    const [endHour, endMinute] = end.split(":").map(Number);
    return {
      aMin: startHour * 60 + startMinute,
      bMin: endHour * 60 + endMinute
    };
  });
}
function inWindowsET(timeMs, windows) {
  if (!windows?.length) return true;
  const minutes = minutesET(timeMs);
  return windows.some((window) => minutes >= window.aMin && minutes <= window.bMin);
}

// src/engine/execution.js
function resolveSlippageBps(kind, slippageBps, slippageByKind) {
  if (Number.isFinite(slippageByKind?.[kind])) {
    return slippageByKind[kind];
  }
  let effectiveSlippageBps = slippageBps;
  if (kind === "limit") effectiveSlippageBps *= 0.25;
  if (kind === "stop") effectiveSlippageBps *= 1.25;
  return effectiveSlippageBps;
}
function applyFill(price, side, { slippageBps = 0, feeBps = 0, kind = "market", qty = 0, costs = {} } = {}) {
  const model = costs || {};
  const modelSlippageBps = Number.isFinite(model.slippageBps) ? model.slippageBps : slippageBps;
  const modelFeeBps = Number.isFinite(model.commissionBps) ? model.commissionBps : feeBps;
  const effectiveSlippageBps = resolveSlippageBps(kind, modelSlippageBps, model.slippageByKind);
  const halfSpreadBps = Number.isFinite(model.spreadBps) ? model.spreadBps / 2 : 0;
  const slippage = (effectiveSlippageBps + halfSpreadBps) / 1e4 * price;
  const filledPrice = side === "long" ? price + slippage : price - slippage;
  const variableFeePerUnit = (modelFeeBps || 0) / 1e4 * Math.abs(filledPrice) + (Number.isFinite(model.commissionPerUnit) ? model.commissionPerUnit : 0);
  const variableFeeTotal = variableFeePerUnit * Math.max(0, qty);
  const fixedFeeTotal = Number.isFinite(model.commissionPerOrder) ? model.commissionPerOrder : 0;
  const grossFeeTotal = variableFeeTotal + fixedFeeTotal;
  const feeTotal = Math.max(
    Number.isFinite(model.minCommission) ? model.minCommission : 0,
    grossFeeTotal
  );
  const feePerUnit = qty > 0 ? feeTotal / qty : variableFeePerUnit;
  return { price: filledPrice, fee: feePerUnit, feeTotal };
}
function touchedLimit(side, limitPrice, bar, mode = "intrabar") {
  if (!bar || limitPrice === void 0 || limitPrice === null) return false;
  if (mode === "close") {
    return side === "long" ? bar.close <= limitPrice : bar.close >= limitPrice;
  }
  return side === "long" ? bar.low <= limitPrice : bar.high >= limitPrice;
}
function ocoExitCheck({ side, stop, tp, bar, mode = "intrabar", tieBreak = "pessimistic" }) {
  if (mode === "close") {
    const close = bar.close;
    if (side === "long") {
      if (close <= stop) return { hit: "SL", px: stop };
      if (close >= tp) return { hit: "TP", px: tp };
    } else {
      if (close >= stop) return { hit: "SL", px: stop };
      if (close <= tp) return { hit: "TP", px: tp };
    }
    return { hit: null, px: null };
  }
  const hitStop = side === "long" ? bar.low <= stop : bar.high >= stop;
  const hitTarget = side === "long" ? bar.high >= tp : bar.low <= tp;
  if (hitStop && hitTarget) {
    return tieBreak === "optimistic" ? { hit: "TP", px: tp } : { hit: "SL", px: stop };
  }
  if (hitStop) return { hit: "SL", px: stop };
  if (hitTarget) return { hit: "TP", px: tp };
  return { hit: null, px: null };
}
function isEODBar(timeMs) {
  return minutesET(timeMs) >= 16 * 60;
}
function roundStep(value, step = 1e-3) {
  return Math.floor(value / step) * step;
}
function estimateBarMs(candles) {
  if (candles.length >= 2) {
    const deltas = [];
    for (let index = 1; index < Math.min(candles.length, 500); index += 1) {
      const delta = candles[index].time - candles[index - 1].time;
      if (Number.isFinite(delta) && delta > 0) deltas.push(delta);
    }
    if (deltas.length) {
      deltas.sort((a, b) => a - b);
      const middle = Math.floor(deltas.length / 2);
      const median = deltas.length % 2 ? deltas[middle] : (deltas[middle - 1] + deltas[middle]) / 2;
      return Math.max(6e4, Math.min(median, 60 * 6e4));
    }
  }
  return 5 * 60 * 1e3;
}
function dayKeyUTC(timeMs) {
  const date = new Date(timeMs);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}
function dayKeyET(timeMs) {
  const date = new Date(timeMs);
  const minutes = minutesET(timeMs);
  const hoursET = Math.floor(minutes / 60);
  const minutesETDay = minutes % 60;
  const anchor = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0)
  );
  const pseudoEtTime = anchor.getTime() + hoursET * 60 * 60 * 1e3 + minutesETDay * 60 * 1e3;
  return dayKeyUTC(pseudoEtTime);
}
var MS_PER_YEAR = 365 * 24 * 60 * 60 * 1e3;

// src/live/engine/candleAggregator.js
function intervalToMs(interval) {
  const raw = String(interval || "1m").trim().toLowerCase();
  const match = raw.match(/^(\d+)(m|h|d)$/);
  if (!match) return 6e4;
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "m") return amount * 6e4;
  if (unit === "h") return amount * 60 * 6e4;
  return amount * 24 * 60 * 6e4;
}
function normalizeTick(tick) {
  const time = Number(tick?.time);
  const price = Number(tick?.price ?? tick?.last ?? tick?.close ?? tick?.bid ?? tick?.ask);
  const volume = Number(tick?.size ?? tick?.volume ?? 0);
  if (!Number.isFinite(time) || !Number.isFinite(price)) return null;
  return {
    time,
    price,
    volume: Number.isFinite(volume) ? volume : 0
  };
}
function bucketStart(time, bucketMs) {
  return Math.floor(time / bucketMs) * bucketMs;
}
var CandleAggregator = class extends import_node_events3.EventEmitter {
  constructor({ mode = "stream", interval = "1m", graceMs = 5e3, session = "AUTO" } = {}) {
    super();
    this.mode = mode;
    this.interval = interval;
    this.graceMs = Math.max(0, Number(graceMs) || 5e3);
    this.session = session;
    this.intervalMs = intervalToMs(interval);
    this.current = null;
    this.lastEmittedTime = -Infinity;
  }
  onBar(handler) {
    this.on("bar", handler);
    return () => this.off("bar", handler);
  }
  emitBar(bar) {
    if (!bar || !Number.isFinite(bar.time)) return;
    if (bar.time <= this.lastEmittedTime) return;
    this.lastEmittedTime = bar.time;
    this.emit("bar", bar);
  }
  processBar(bar, { isFinal = true } = {}) {
    if (!bar || !Number.isFinite(bar.time)) return;
    if (this.mode === "stream") {
      if (isFinal) this.emitBar(bar);
      return;
    }
    this.emitBar(bar);
  }
  processPolledBars(bars = []) {
    const ordered = [...bars].sort((left, right) => left.time - right.time);
    for (const bar of ordered) {
      this.emitBar(bar);
    }
  }
  processTick(rawTick) {
    const tick = normalizeTick(rawTick);
    if (!tick) return;
    const start = bucketStart(tick.time, this.intervalMs);
    if (!this.current) {
      this.current = {
        time: start,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: tick.volume,
        _lastTickTime: tick.time
      };
      return;
    }
    if (start === this.current.time) {
      this.current.high = Math.max(this.current.high, tick.price);
      this.current.low = Math.min(this.current.low, tick.price);
      this.current.close = tick.price;
      this.current.volume += tick.volume;
      this.current._lastTickTime = tick.time;
      return;
    }
    if (start > this.current.time) {
      this.emitBar({
        time: this.current.time,
        open: this.current.open,
        high: this.current.high,
        low: this.current.low,
        close: this.current.close,
        volume: this.current.volume
      });
      this.current = {
        time: start,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: tick.volume,
        _lastTickTime: tick.time
      };
    }
  }
  forceClose(timeMs = Date.now()) {
    if (!this.current) return;
    const closeDeadline = this.current.time + this.intervalMs + this.graceMs;
    const sessionOpen = isSession(this.current.time + this.intervalMs, this.session);
    if (timeMs >= closeDeadline || !sessionOpen) {
      this.emitBar({
        time: this.current.time,
        open: this.current.open,
        high: this.current.high,
        low: this.current.low,
        close: this.current.close,
        volume: this.current.volume
      });
      this.current = null;
    }
  }
  estimateFromSeries(candles) {
    const estimated = estimateBarMs(candles);
    if (Number.isFinite(estimated) && estimated > 0) {
      this.intervalMs = estimated;
    }
    return this.intervalMs;
  }
};
function createCandleAggregator(options) {
  return new CandleAggregator(options);
}

// src/live/engine/riskManager.js
function pctToFraction(value, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  return Math.abs(value) / 100;
}
var RiskManager = class {
  constructor(options = {}) {
    this.options = {
      maxDailyLossPct: 2,
      maxDailyLossDollars: null,
      maxDrawdownPct: 20,
      maxPositions: 10,
      maxPositionPct: 50,
      maxDailyTrades: 0,
      cooldownAfterLossMs: 0,
      allowedSessions: "AUTO",
      allowedWindows: null,
      ...options
    };
    this.allowedWindows = parseWindowsCSV(this.options.allowedWindows);
    this.startEquity = null;
    this.currentEquity = null;
    this.peakEquity = null;
    this.currentDayKey = null;
    this.dayPnl = 0;
    this.dayTrades = 0;
    this.lastLossAt = null;
    this.halted = false;
    this.haltReason = null;
  }
  initialize(equity, timeMs = Date.now()) {
    const value = Number.isFinite(equity) ? equity : 0;
    this.startEquity = value;
    this.currentEquity = value;
    this.peakEquity = value;
    this.currentDayKey = dayKeyET(timeMs);
    this.dayPnl = 0;
    this.dayTrades = 0;
    this.lastLossAt = null;
    this.halted = false;
    this.haltReason = null;
  }
  update({ timeMs, equity }) {
    if (this.startEquity === null) this.initialize(equity, timeMs);
    const nextDay = dayKeyET(timeMs);
    if (this.currentDayKey !== nextDay) {
      this.currentDayKey = nextDay;
      this.dayPnl = 0;
      this.dayTrades = 0;
      this.halted = false;
      this.haltReason = null;
    }
    this.currentEquity = Number.isFinite(equity) ? equity : this.currentEquity;
    if (this.currentEquity > this.peakEquity) this.peakEquity = this.currentEquity;
    this._maybeHaltForDrawdown();
    this._maybeHaltForDailyLoss();
  }
  _maybeHaltForDrawdown() {
    if (this.halted || !Number.isFinite(this.currentEquity) || !(this.peakEquity > 0)) return;
    const drawdown = (this.peakEquity - this.currentEquity) / this.peakEquity;
    const maxDrawdown = pctToFraction(this.options.maxDrawdownPct, 0.2);
    if (maxDrawdown > 0 && drawdown >= maxDrawdown) {
      this.halt(`max drawdown reached (${(drawdown * 100).toFixed(2)}%)`);
    }
  }
  _maybeHaltForDailyLoss() {
    if (this.halted) return;
    const maxLossPct = pctToFraction(this.options.maxDailyLossPct, 0.02);
    const maxLossDollars = Number.isFinite(this.options.maxDailyLossDollars) ? Math.abs(this.options.maxDailyLossDollars) : null;
    const lossesExceededPct = maxLossPct > 0 && this.dayPnl <= -Math.abs(this.startEquity * maxLossPct);
    const lossesExceededAbs = Number.isFinite(maxLossDollars) && this.dayPnl <= -Math.abs(maxLossDollars);
    if (lossesExceededPct || lossesExceededAbs) {
      this.halt("daily loss limit reached");
    }
  }
  isSessionAllowed(timeMs) {
    const sessionName = this.options.allowedSessions || "AUTO";
    if (!isSession(timeMs, sessionName)) return false;
    return inWindowsET(timeMs, this.allowedWindows);
  }
  canTrade({ timeMs = Date.now() } = {}) {
    if (this.halted) return { ok: false, reason: this.haltReason || "risk halt active" };
    if (!this.isSessionAllowed(timeMs))
      return { ok: false, reason: "outside allowed session/window" };
    if (Number.isFinite(this.options.cooldownAfterLossMs) && this.options.cooldownAfterLossMs > 0 && Number.isFinite(this.lastLossAt) && timeMs - this.lastLossAt < this.options.cooldownAfterLossMs) {
      return { ok: false, reason: "cooldown after loss active" };
    }
    return { ok: true, reason: null };
  }
  canOpenPosition({
    timeMs = Date.now(),
    positionCount = 0,
    positionValue = 0,
    equity = null
  } = {}) {
    const base = this.canTrade({ timeMs });
    if (!base.ok) return base;
    if (this.options.maxPositions > 0 && positionCount >= this.options.maxPositions) {
      return { ok: false, reason: "max positions reached" };
    }
    if (this.options.maxDailyTrades > 0 && this.dayTrades >= this.options.maxDailyTrades) {
      return { ok: false, reason: "max daily trades reached" };
    }
    const eq = Number.isFinite(equity) ? equity : this.currentEquity;
    const maxPositionFraction = pctToFraction(this.options.maxPositionPct, 0.5);
    if (maxPositionFraction > 0 && Number.isFinite(eq) && eq > 0) {
      const fraction = Math.abs(positionValue) / eq;
      if (fraction > maxPositionFraction) {
        return { ok: false, reason: "max position size exceeded" };
      }
    }
    return { ok: true, reason: null };
  }
  recordTrade({ pnl = 0, timeMs = Date.now(), equity = null } = {}) {
    if (this.currentDayKey !== dayKeyET(timeMs)) {
      this.currentDayKey = dayKeyET(timeMs);
      this.dayPnl = 0;
      this.dayTrades = 0;
      this.halted = false;
      this.haltReason = null;
    }
    const realized = Number.isFinite(pnl) ? pnl : 0;
    this.dayPnl += realized;
    this.dayTrades += 1;
    if (realized < 0) this.lastLossAt = timeMs;
    if (Number.isFinite(equity)) this.currentEquity = equity;
    this._maybeHaltForDailyLoss();
    this._maybeHaltForDrawdown();
  }
  halt(reason = "manual halt") {
    this.halted = true;
    this.haltReason = reason;
  }
  clearHalt() {
    this.halted = false;
    this.haltReason = null;
  }
  getState() {
    return {
      startEquity: this.startEquity,
      currentEquity: this.currentEquity,
      peakEquity: this.peakEquity,
      dayPnl: this.dayPnl,
      dayTrades: this.dayTrades,
      currentDayKey: this.currentDayKey,
      halted: this.halted,
      haltReason: this.haltReason,
      lastLossAt: this.lastLossAt
    };
  }
};
function createRiskManager(options) {
  return new RiskManager(options);
}

// src/live/engine/stateManager.js
function qtyCloseEnough(a, b, tolerancePct = 0.05) {
  const left = Math.abs(Number(a) || 0);
  const right = Math.abs(Number(b) || 0);
  if (left === 0 && right === 0) return true;
  const baseline = Math.max(left, right, 1e-12);
  return Math.abs(left - right) / baseline <= tolerancePct;
}
function sideMatches(openPosition, brokerPosition) {
  if (!openPosition || !brokerPosition) return false;
  const openSide = openPosition.side;
  const brokerSide = brokerPosition.side;
  return openSide === brokerSide;
}
var StateManager = class {
  constructor({ storage }) {
    this.storage = storage;
  }
  async load(namespace) {
    return this.storage.load(namespace);
  }
  async save(namespace, state) {
    await this.storage.save(namespace, {
      ...state,
      savedAt: Date.now()
    });
  }
  async appendTrade(namespace, trade) {
    await this.storage.appendTrade(namespace, trade);
  }
  async appendEquityPoint(namespace, point) {
    await this.storage.appendEquityPoint(namespace, point);
  }
  async loadTrades(namespace) {
    return this.storage.loadTrades(namespace);
  }
  async loadEquityCurve(namespace) {
    return this.storage.loadEquityCurve(namespace);
  }
  async clear(namespace) {
    await this.storage.clear(namespace);
  }
  reconcile({ persistedState, brokerPositions = [], symbol }) {
    const report = {
      status: "ok",
      action: "none",
      message: "no reconciliation needed",
      adoptedPosition: null,
      mismatch: null
    };
    const persistedOpen = persistedState?.openPosition || null;
    const brokerForSymbol = brokerPositions.find((position) => position.symbol === symbol) || null;
    if (persistedOpen && brokerForSymbol) {
      const sameSide = sideMatches(persistedOpen, brokerForSymbol);
      const similarQty = qtyCloseEnough(
        persistedOpen.size ?? persistedOpen.qty,
        brokerForSymbol.qty
      );
      if (sameSide && similarQty) {
        report.action = "adopt-broker";
        report.message = "persisted and broker positions matched";
        report.adoptedPosition = {
          ...persistedOpen,
          size: brokerForSymbol.qty,
          entryFill: brokerForSymbol.avgEntry ?? persistedOpen.entryFill ?? persistedOpen.entry
        };
        return report;
      }
      report.status = "error";
      report.action = "mismatch";
      report.message = "persisted and broker positions mismatch";
      report.mismatch = { persisted: persistedOpen, broker: brokerForSymbol };
      return report;
    }
    if (persistedOpen && !brokerForSymbol) {
      report.status = "warn";
      report.action = "closed-externally";
      report.message = "persisted open position missing at broker";
      return report;
    }
    if (!persistedOpen && brokerForSymbol) {
      report.status = "warn";
      report.action = "external-position";
      report.message = "broker has external position not present in persisted state";
      report.adoptedPosition = null;
      return report;
    }
    return report;
  }
};
function createStateManager(options) {
  return new StateManager(options);
}

// src/live/engine/paperEngine.js
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
    rejectReason: order.rejectReason
  };
}
function sideToDirection(side) {
  return side === "buy" ? 1 : -1;
}
var PaperEngine = class extends BrokerAdapter {
  constructor({
    equity = 1e4,
    currency = "USD",
    slippageBps = 0,
    feeBps = 0,
    costs = null,
    qtyStep = 1e-3
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
    this.positions = /* @__PURE__ */ new Map();
    this.openOrders = /* @__PURE__ */ new Map();
    this.orderHistory = /* @__PURE__ */ new Map();
    this.lastPrices = /* @__PURE__ */ new Map();
    this.barSubscribers = /* @__PURE__ */ new Map();
    this.tradeSubscribers = /* @__PURE__ */ new Map();
    this.quoteSubscribers = /* @__PURE__ */ new Map();
    this.historicalBars = /* @__PURE__ */ new Map();
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
        unrealizedPnl: (mark - position.avgEntry) * position.qty
      };
    }
    return {
      mark,
      marketValue: mark * position.qty,
      unrealizedPnl: (position.avgEntry - mark) * position.qty
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
      marginUsed: Math.max(0, marketValue - this.cash)
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
        unrealizedPnl: marked.unrealizedPnl
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
      }
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
  _rejectOrder(order, reason) {
    order.status = "rejected";
    order.rejectReason = reason;
    this._recordOrder(order);
    this.openOrders.delete(order.orderId);
    const receipt = cloneOrder(order);
    this.emit("order:rejected", receipt);
    return receipt;
  }
  _fillOrder(order, fillPrice, kind = "market", fillTime = Date.now()) {
    const side = normalizeOrderSide(order.side);
    const qty = Math.max(0, asNumber(order.qty, 0));
    if (!(qty > 0)) {
      return this._rejectOrder(order, "invalid quantity");
    }
    const sideForFill = side === "buy" ? "long" : "short";
    const filled = applyFill(fillPrice, sideForFill, {
      slippageBps: this.slippageBps,
      feeBps: this.feeBps,
      kind,
      qty,
      costs: this.costs
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
        avgEntry: filled.price
      });
    } else {
      const signedQty = position.side === "long" ? position.qty : -position.qty;
      const signedIncoming = direction * remaining;
      if (signedQty >= 0 && signedIncoming >= 0 || signedQty <= 0 && signedIncoming <= 0) {
        const totalAbs = Math.abs(signedQty) + Math.abs(signedIncoming);
        const nextAvg = totalAbs > 0 ? (Math.abs(signedQty) * position.avgEntry + Math.abs(signedIncoming) * filled.price) / totalAbs : filled.price;
        const nextSide = signedQty + signedIncoming >= 0 ? "long" : "short";
        this.positions.set(order.symbol, {
          symbol: order.symbol,
          side: nextSide,
          qty: Math.abs(signedQty + signedIncoming),
          avgEntry: nextAvg
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
            avgEntry: filled.price
          });
        } else if (Math.abs(signedQty) - closeQty > 0) {
          this.positions.set(order.symbol, {
            symbol: order.symbol,
            side: position.side,
            qty: Math.abs(signedQty) - closeQty,
            avgEntry: position.avgEntry
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
      equity: this.cash + this._realizedUnrealizedSummary().unrealized
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
      avgFillPrice: void 0,
      filledAt: void 0,
      symbol: String(order.symbol),
      side: normalizeOrderSide(order.side),
      type: normalizeOrderType(order.type),
      qty: roundStep(Math.max(0, asNumber(order.qty, 0)), this.qtyStep),
      limitPrice: asNumber(order.limitPrice),
      stopPrice: asNumber(order.stopPrice),
      timeInForce: order.timeInForce || "day",
      rejectReason: void 0
    };
    if (!(normalized.qty > 0)) {
      return this._rejectOrder(normalized, "invalid quantity");
    }
    this._recordOrder(normalized);
    this.emit("order:submitted", cloneOrder(normalized));
    if (normalized.type === "market") {
      const mark = this.lastPrices.get(normalized.symbol);
      const fillPrice = mark ?? normalized.limitPrice ?? normalized.stopPrice;
      if (!Number.isFinite(fillPrice)) {
        return this._rejectOrder(normalized, "no price available for market order");
      }
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
    if (changes.qty !== void 0) {
      order.qty = roundStep(Math.max(0, asNumber(changes.qty, order.qty)), this.qtyStep);
    }
    if (changes.limitPrice !== void 0) {
      order.limitPrice = asNumber(changes.limitPrice);
    }
    if (changes.stopPrice !== void 0) {
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
      volume: asNumber(bar.volume, 0)
    };
    this.lastPrices.set(symbol, normalizedBar.close);
    await this._emitTo(this.barSubscribers, this._streamKey(symbol, interval), normalizedBar);
    await this._emitTo(this.tradeSubscribers, symbol, {
      time: normalizedBar.time,
      price: normalizedBar.close,
      size: normalizedBar.volume ?? 0
    });
    const orders = [...this.openOrders.values()].filter((order) => order.symbol === symbol);
    for (const order of orders) {
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
};
function createPaperEngine(options) {
  return new PaperEngine(options);
}

// src/utils/positionSizing.js
function roundStep2(value, step) {
  return Math.floor(value / step) * step;
}
var warnedNonPositiveEquity = false;
function warnNonPositiveEquity(equity) {
  if (warnedNonPositiveEquity) return;
  warnedNonPositiveEquity = true;
  console.warn(
    `[tradelab] calculatePositionSize() received non-positive equity (${equity}); returning size 0`
  );
}
function calculatePositionSize({
  equity,
  entry,
  stop,
  riskFraction = 0.01,
  qtyStep = 1e-3,
  minQty = 1e-3,
  maxLeverage = 2
}) {
  if (!Number.isFinite(equity) || equity <= 0) {
    warnNonPositiveEquity(equity);
    return 0;
  }
  const riskPerUnit = Math.abs(entry - stop);
  if (!Number.isFinite(riskPerUnit) || riskPerUnit <= 0) return 0;
  const maxRiskDollars = Math.max(0, equity * riskFraction);
  let quantity = maxRiskDollars / riskPerUnit;
  const leverageCapQty = equity * maxLeverage / Math.max(1e-12, Math.abs(entry));
  quantity = Math.min(quantity, leverageCapQty);
  quantity = roundStep2(quantity, qtyStep);
  return quantity >= minQty ? quantity : 0;
}

// src/engine/barSystemRunner.js
function asNumber2(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
function formatIsoTime(time) {
  return Number.isFinite(time) ? new Date(time).toISOString() : "invalid-time";
}
async function callSignalWithContextAsync({ signal, context, index, bar, symbol }) {
  try {
    return await signal(context);
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(
      `signal() threw at index=${index}, time=${formatIsoTime(bar?.time)}, symbol=${symbol}: ${cause}`
    );
  }
}
function snapshotOpenPosition(open, markPrice) {
  if (!open) return null;
  const entryPrice = open.entryFill ?? open.entry;
  const direction = open.side === "long" ? 1 : -1;
  const unrealizedPnl = (markPrice - entryPrice) * direction * open.size;
  return {
    id: open.id,
    symbol: open.symbol,
    side: open.side,
    size: open.size,
    entry: open.entry,
    entryFill: open.entryFill,
    stop: open.stop,
    takeProfit: open.takeProfit,
    openTime: open.openTime,
    markPrice,
    unrealizedPnl,
    _initRisk: open._initRisk
  };
}
function normalizeSide(value) {
  if (value === "long" || value === "buy") return "long";
  if (value === "short" || value === "sell") return "short";
  return null;
}
function normalizeSignal(signal, bar, fallbackR) {
  if (!signal) return null;
  const side = normalizeSide(signal.side ?? signal.direction ?? signal.action);
  if (!side) return null;
  const entry = asNumber2(signal.entry ?? signal.limit ?? signal.price) ?? asNumber2(bar?.close);
  const stop = asNumber2(signal.stop ?? signal.stopLoss ?? signal.sl);
  if (entry === null || stop === null) return null;
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return null;
  let takeProfit = asNumber2(signal.takeProfit ?? signal.target ?? signal.tp);
  const rrHint = asNumber2(signal._rr ?? signal.rr);
  const targetR = rrHint ?? fallbackR;
  if (takeProfit === null && Number.isFinite(targetR) && targetR > 0) {
    takeProfit = side === "long" ? entry + risk * targetR : entry - risk * targetR;
  }
  if (takeProfit === null) return null;
  return {
    ...signal,
    side,
    entry,
    stop,
    takeProfit,
    qty: asNumber2(signal.qty ?? signal.size),
    riskPct: asNumber2(signal.riskPct),
    riskFraction: asNumber2(signal.riskFraction),
    _rr: rrHint ?? signal._rr,
    _initRisk: asNumber2(signal._initRisk) ?? signal._initRisk
  };
}

// src/live/engine/liveEngine.js
function asNumber3(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
function oppositeSide(side) {
  return side === "long" ? "sell" : "buy";
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function matchesPendingOrder(pendingOrder, order) {
  if (!pendingOrder || !order) return false;
  if (order.orderId && pendingOrder.orderId && order.orderId === pendingOrder.orderId) return true;
  if (order.clientOrderId && pendingOrder.clientOrderId && order.clientOrderId === pendingOrder.clientOrderId) {
    return true;
  }
  return false;
}
function isOrderForSymbol(order, symbol) {
  return !order?.symbol || order.symbol === symbol;
}
var LiveEngine = class {
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
      pollIntervalMs: 6e4,
      warmupBars: 200,
      equity: 1e4,
      riskPct: 1,
      finalTP_R: 3,
      flattenAtClose: false,
      qtyStep: 1e-3,
      minQty: 1e-3,
      maxLeverage: 2,
      dailyMaxTrades: 0,
      entryChase: {
        enabled: true,
        afterBars: 2,
        maxSlipR: 0.2,
        convertOnExpiry: false
      },
      logLevel: "info",
      ...options
    };
    this.symbol = this.options.symbol;
    this.interval = this.options.interval;
    this.namespace = this.options.id || `${this.symbol}-${this.interval}`.replace(/[^a-zA-Z0-9._-]/g, "_");
    this.broker = this.options.broker;
    this.feed = this.options.feed || (this.options.mode === "polling" ? new PollingFeed({
      broker: this.broker,
      pollIntervalMs: this.options.pollIntervalMs
    }) : new BrokerFeed({ broker: this.broker }));
    this.eventBus = this.options.eventBus || new EventBus();
    this.storage = this.options.storage || new JsonFileStorage();
    this.stateManager = new StateManager({ storage: this.storage });
    this.riskManager = new RiskManager({
      maxDailyLossPct: this.options.maxDailyLossPct,
      maxDailyTrades: this.options.dailyMaxTrades,
      ...this.options.risk || {}
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
    return this.candleBuffer.length ? this.candleBuffer[this.candleBuffer.length - 1].close : defaultPrice;
  }
  _markedEquity(markPrice = null) {
    if (!this.openPosition) return this.equity;
    const mark = Number.isFinite(markPrice) ? markPrice : this._currentMarkPrice(this.openPosition.entryFill);
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
      pendingOrder: this.pendingOrder
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
      savedAt: Date.now()
    });
  }
  async _recordEquity(timeMs, markPrice) {
    const point = {
      time: timeMs,
      timestamp: timeMs,
      equity: this._markedEquity(markPrice)
    };
    this.eqSeries.push(point);
    await this.stateManager.appendEquityPoint(this.namespace, point);
    this._emit("equity:update", {
      symbol: this.symbol,
      equity: point.equity,
      time: point.time
    });
  }
  async _submitEntry(signalDecision, { hasExplicitEntry }) {
    const riskFraction = Number.isFinite(signalDecision.riskFraction) ? signalDecision.riskFraction : Number.isFinite(signalDecision.riskPct) ? signalDecision.riskPct / 100 : this.options.riskPct / 100;
    const requestedSize = Number.isFinite(signalDecision.qty) ? signalDecision.qty : calculatePositionSize({
      equity: this._markedEquity(signalDecision.entry),
      entry: signalDecision.entry,
      stop: signalDecision.stop,
      riskFraction,
      qtyStep: this.options.qtyStep,
      minQty: this.options.minQty,
      maxLeverage: this.options.maxLeverage
    });
    if (!(requestedSize >= this.options.minQty)) return;
    const positionValue = Math.abs(signalDecision.entry * requestedSize);
    const canOpen = this.riskManager.canOpenPosition({
      timeMs: this.lastBarTime || Date.now(),
      positionCount: this.openPosition ? 1 : 0,
      positionValue,
      equity: this._markedEquity(signalDecision.entry)
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
      _chasedCE: false
    };
    const receipt = await this.broker.submitOrder({
      symbol: this.symbol,
      side,
      type: orderType,
      qty: requestedSize,
      limitPrice: orderType === "limit" ? signalDecision.entry : void 0,
      clientOrderId
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
      limitPrice: kind === "limit" ? priceHint : void 0,
      stopPrice: kind === "stop" ? priceHint : void 0,
      clientOrderId: `${this.namespace}-exit-${Date.now()}`
    });
    if (receipt.status === "filled" && this.openPosition && isOrderForSymbol(receipt, this.symbol)) {
      await this._handleOrderFilled(receipt);
    }
    await this._persistState();
  }
  async _managePending(_bar) {
    if (!this.pendingOrder) return;
    const index = this.candleBuffer.length - 1;
    if (index > this.pendingOrder.expiresAt) {
      if (this.pendingOrder.orderId) {
        await this.broker.cancelOrder(this.pendingOrder.orderId).catch(() => {
        });
      }
      this.pendingOrder = null;
      await this._persistState();
      return;
    }
    if (this.options.entryChase?.enabled) {
      const elapsedBars = index - (this.pendingOrder.startedAtIndex ?? index);
      const midpoint = asNumber3(this.pendingOrder.meta?._imb?.mid);
      if (midpoint !== null && !this.pendingOrder._chasedCE && elapsedBars >= Math.max(1, this.options.entryChase.afterBars || 2) && this.pendingOrder.orderId) {
        await this.broker.modifyOrder(this.pendingOrder.orderId, { limitPrice: midpoint }).catch(() => {
        });
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
    if (Number.isFinite(this.openPosition._maxBarsInTrade) && this.openPosition._maxBarsInTrade > 0 && barsHeld >= this.openPosition._maxBarsInTrade) {
      await this._submitExit("TIME", bar.close);
      return;
    }
    const { hit, px } = ocoExitCheck({
      side: this.openPosition.side,
      stop: this.openPosition.stop,
      tp: this.openPosition.takeProfit,
      bar,
      mode: this.options.oco?.mode || "intrabar",
      tieBreak: this.options.oco?.tieBreak || "pessimistic"
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
      const entryFill = asNumber3(order.avgFillPrice, this.pendingOrder.entry);
      this.openPosition = {
        id: ++this.tradeIdCounter,
        symbol: this.symbol,
        side: this.pendingOrder.side,
        entry: this.pendingOrder.entry,
        entryFill,
        stop: this.pendingOrder.stop,
        takeProfit: this.pendingOrder.tp,
        size: Number(order.filledQty || this.pendingOrder.fixedQty || 0),
        openTime: asNumber3(order.filledAt, this.lastBarTime || Date.now()),
        _initRisk: Math.abs(
          this.pendingOrder.meta?._initRisk ?? this.pendingOrder.entry - this.pendingOrder.stop
        ),
        _maxBarsInTrade: this.pendingOrder.meta?._maxBarsInTrade,
        _maxHoldMin: this.pendingOrder.meta?._maxHoldMin,
        _openedAtIndex: this.candleBuffer.length - 1
      };
      this.pendingOrder = null;
      this.dayTrades += 1;
      this._emit("position:opened", {
        symbol: this.symbol,
        position: snapshotOpenPosition(this.openPosition, entryFill)
      });
      await this._persistState();
      return;
    }
    if (this.openPosition && order.side === oppositeSide(this.openPosition.side)) {
      const closingPosition = this.openPosition;
      const exitPrice = asNumber3(
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
        timeMs: asNumber3(order.filledAt, Date.now()),
        equity: this.equity
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
          time: asNumber3(order.filledAt, Date.now()),
          reason: closingPosition._pendingExitReason || "EXIT",
          pnl
        }
      };
      this.trades.push(trade);
      await this.stateManager.appendTrade(this.namespace, trade);
      this._emit("position:closed", {
        symbol: this.symbol,
        trade
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
      equity: this._markedEquity(bar.close)
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
        await this.broker.cancelOrder(this.pendingOrder.orderId).catch(() => {
        });
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
        symbol: this.symbol
      });
      if (rawSignal) {
        this._emit("signal", {
          symbol: this.symbol,
          t: nowIso(),
          signal: rawSignal
        });
      }
      const nextSignal = normalizeSignal(rawSignal, bar, this.options.finalTP_R);
      if (nextSignal) {
        const hasExplicitEntry = rawSignal?.entry !== void 0 || rawSignal?.limit !== void 0 || rawSignal?.price !== void 0;
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
        reason: clock.warning
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
      this.tradeIdCounter = Number.isFinite(persisted.tradeIdCounter) ? persisted.tradeIdCounter : 0;
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
      symbol: this.symbol
    });
    if (reconcile.action === "adopt-broker" && reconcile.adoptedPosition) {
      this.openPosition = {
        ...this.openPosition,
        ...reconcile.adoptedPosition
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
      openPosition: this.openPosition ? snapshotOpenPosition(this.openPosition, this._currentMarkPrice()) : null,
      pendingOrder: this.pendingOrder,
      dayPnl: this.dayPnl,
      dayTrades: this.dayTrades,
      trades: this.trades.length,
      risk: this.riskManager.getState()
    };
  }
};
function createLiveEngine(options) {
  return new LiveEngine(options);
}

// src/live/orchestrator.js
function asWeight(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
function defaultSystemId(system, index) {
  return system.id || `${system.symbol}-${system.interval || "1m"}-${index + 1}`;
}
var LiveOrchestrator = class {
  constructor(options = {}) {
    if (!Array.isArray(options.systems) || options.systems.length === 0) {
      throw new Error("orchestrator requires a non-empty systems array");
    }
    if (!options.broker) {
      throw new Error("orchestrator requires a broker adapter");
    }
    this.options = {
      allocation: "equal",
      equity: 1e4,
      maxDailyLossPct: 0,
      ...options
    };
    this.eventBus = this.options.eventBus || new EventBus();
    this.engines = [];
    this.running = false;
    this.dayStartEquity = this.options.equity;
    this.currentDay = null;
  }
  _emit(event, payload = {}) {
    this.eventBus.emitEvent(event, payload);
  }
  _allocationWeights() {
    const systems = this.options.systems;
    if (this.options.allocation === "equal") {
      return systems.map(() => 1);
    }
    return systems.map((system) => asWeight(system.weight || 0));
  }
  _allocatedEquities(totalEquity) {
    const weights = this._allocationWeights();
    const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
    return weights.map((weight) => totalEquity * weight / totalWeight);
  }
  async start() {
    if (this.running) return;
    const account = await this.options.broker.getAccount().catch(() => null);
    const totalEquity = Number.isFinite(account?.equity) ? account.equity : this.options.equity;
    const perSystemEquity = this._allocatedEquities(totalEquity);
    this.engines = this.options.systems.map((system, index) => {
      const engineBus = new EventBus();
      engineBus.onAny(({ event, payload }) => {
        this._emit(event, {
          systemId: defaultSystemId(system, index),
          ...payload
        });
        if (event === "equity:update") this._checkPortfolioLimits();
      });
      return new LiveEngine({
        ...system,
        id: defaultSystemId(system, index),
        broker: this.options.broker,
        feed: this.options.feed,
        storage: this.options.storage,
        eventBus: engineBus,
        brokerConfig: this.options.brokerConfig,
        equity: perSystemEquity[index],
        useBrokerAccountEquity: false
      });
    });
    await Promise.all(this.engines.map((engine) => engine.start()));
    this.running = true;
    this.dayStartEquity = this.getStatus().aggregateEquity;
    this.currentDay = dayKeyET(Date.now());
  }
  _checkPortfolioLimits() {
    if (!this.options.maxDailyLossPct || this.options.maxDailyLossPct <= 0) return;
    const nowDay = dayKeyET(Date.now());
    if (this.currentDay !== nowDay) {
      this.currentDay = nowDay;
      this.dayStartEquity = this.getStatus().aggregateEquity;
      return;
    }
    const equity = this.getStatus().aggregateEquity;
    const maxLossFraction = Math.abs(this.options.maxDailyLossPct) / 100;
    if (equity <= this.dayStartEquity * (1 - maxLossFraction)) {
      for (const engine of this.engines) {
        engine.riskManager.halt("portfolio daily loss limit reached");
      }
      this._emit("risk:halt", {
        reason: "portfolio daily loss limit reached",
        aggregateEquity: equity
      });
    }
  }
  async stop() {
    await Promise.all(this.engines.map((engine) => engine.stop()));
    this.running = false;
  }
  getStatus() {
    const systems = this.engines.map((engine) => engine.getStatus());
    const aggregateEquity = systems.reduce((sum, status) => sum + (status.equity || 0), 0);
    const openPositions = systems.filter((status) => status.openPosition).length;
    return {
      running: this.running,
      systems,
      aggregateEquity,
      openPositions,
      dayStartEquity: this.dayStartEquity
    };
  }
};
function createLiveOrchestrator(options) {
  return new LiveOrchestrator(options);
}

// src/live/dashboard/server.js
var import_node_http = __toESM(require("node:http"), 1);
var import_node_fs2 = require("node:fs");
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_url4 = require("node:url");
var FALLBACK_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>tradelab live</title>
  </head>
  <body>
    <h1>tradelab live</h1>
    <pre id="state"></pre>
    <script>
      fetch("/state")
        .then((res) => res.json())
        .then((state) => {
          document.getElementById("state").textContent = JSON.stringify(state, null, 2);
        });
    </script>
  </body>
</html>`;
function callerModuleDir() {
  const stack = new Error().stack || "";
  const lines = stack.split("\n").slice(1);
  const match = lines.map((line) => line.match(/(?:\()?(file:\/\/\/[^\s)]+|\/[^\s)]+):\d+:\d+/)).find(Boolean);
  if (!match) return process.cwd();
  const filePath = match[1].startsWith("file://") ? (0, import_node_url4.fileURLToPath)(match[1]) : match[1];
  return import_node_path2.default.dirname(filePath);
}
function readDashboardHtml() {
  const here = callerModuleDir();
  const candidates = [
    import_node_path2.default.join(here, "..", "..", "..", "templates", "dashboard.html"),
    import_node_path2.default.join(here, "..", "..", "templates", "dashboard.html"),
    import_node_path2.default.join(process.cwd(), "templates", "dashboard.html")
  ];
  const htmlPath = candidates.find((candidate) => (0, import_node_fs2.existsSync)(candidate));
  if (htmlPath) return (0, import_node_fs2.readFileSync)(htmlPath, "utf8");
  try {
    return (0, import_node_fs2.readFileSync)(import_node_path2.default.join(process.cwd(), "templates", "dashboard.html"), "utf8");
  } catch {
    return FALLBACK_HTML;
  }
}
function createDashboardServer({ source, port = 4317, maxBuffer = 200 }) {
  if (!source?.eventBus || typeof source.eventBus.onAny !== "function") {
    throw new Error("dashboard source must expose an eventBus with onAny()");
  }
  const recent = [];
  const clients = /* @__PURE__ */ new Set();
  const unsubscribe = source.eventBus.onAny(({ event, payload }) => {
    const msg = { event, payload, t: Date.now() };
    recent.push(msg);
    if (recent.length > maxBuffer) recent.shift();
    const frame = `data: ${JSON.stringify(msg)}

`;
    for (const res of clients) res.write(frame);
  });
  const server = import_node_http.default.createServer(async (req, res) => {
    const url = (req.url || "/").split("?")[0];
    if (url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(readDashboardHtml());
      return;
    }
    if (url === "/state") {
      if (typeof source.refresh === "function") await source.refresh().catch(() => {
      });
      const status = typeof source.getStatus === "function" ? source.getStatus() : {};
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(status));
      return;
    }
    if (url === "/command" && req.method === "POST") {
      const WHITELIST = {
        flatten: "flatten",
        stop: "stop",
        closePosition: "closePosition",
        cancelOrder: "cancelOrder"
      };
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", async () => {
        let cmd;
        try {
          cmd = JSON.parse(body || "{}");
        } catch {
          cmd = {};
        }
        const method = WHITELIST[cmd.type];
        if (!method || typeof source[method] !== "function") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: `unsupported command "${cmd.type}"` }));
          return;
        }
        try {
          const arg = cmd.type === "closePosition" ? cmd.symbol : cmd.type === "cancelOrder" ? cmd.orderId : void 0;
          await source[method](arg);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (error) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : String(error)
            })
          );
        }
      });
      return;
    }
    if (url === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });
      res.flushHeaders();
      for (const msg of recent) res.write(`data: ${JSON.stringify(msg)}

`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });
  return {
    start() {
      return new Promise((resolve) => {
        server.listen(port, () => {
          const address = server.address();
          const actualPort = typeof address === "object" && address ? address.port : port;
          resolve(`http://localhost:${actualPort}`);
        });
      });
    },
    close() {
      unsubscribe();
      for (const res of clients) res.end();
      clients.clear();
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
    server
  };
}

// src/live/session.js
function oppositeSide2(side) {
  return side === "long" || side === "buy" ? "sell" : "buy";
}
function toBrokerSide(side) {
  return side === "long" || side === "buy" ? "buy" : "sell";
}
function matchesOrderRef(reference, order) {
  if (!reference || !order) return false;
  if (reference.orderId && order.orderId && reference.orderId === order.orderId) return true;
  if (reference.clientOrderId && order.clientOrderId && reference.clientOrderId === order.clientOrderId) {
    return true;
  }
  return false;
}
var TradingSession = class _TradingSession {
  constructor({
    id,
    symbol,
    interval = "1m",
    broker,
    mode = "paper",
    equity = 1e4,
    riskPct = 1,
    maxDailyLossPct = 0,
    maxPositionPct = 1,
    qtyStep = 1e-3,
    minQty = 1e-3,
    maxLeverage = 2,
    confirmLive = false,
    eventBus
  } = {}) {
    if (mode === "live" && (!_TradingSession.liveAllowed() || !confirmLive)) {
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
    this.brackets = /* @__PURE__ */ new Map();
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
    this.broker.on?.("order:filled", (order) => this._onBrokerFillSync(order));
    this.broker.on?.("order:submitted", (order) => this._record("order:submitted", order));
    this.broker.on?.(
      "order:canceled",
      (order) => this._onBrokerTerminalOrderSync("order:canceled", order)
    );
    this.broker.on?.(
      "order:rejected",
      (order) => this._onBrokerTerminalOrderSync("order:rejected", order)
    );
    this.broker.on?.("equity:update", (acct) => this._record("equity:update", acct));
  }
  _onBrokerTerminalOrderSync(event, order) {
    this._record(event, order);
    if (matchesOrderRef(this._pendingBracket, order)) {
      this._pendingBracket = null;
    }
  }
  // Sync event handler — fire-and-forget async OCO work via a stored promise
  _onBrokerFillSync(order) {
    this._record("order:filled", order);
    if (matchesOrderRef(this._pendingBracket, order)) {
      const staged = this._pendingBracket;
      this._pendingBracket = null;
      this._pendingCancelPromise = Promise.resolve(
        this._attachBracket({ ...staged, receipt: order })
      );
      return;
    }
    const bracket = this.brackets.get(this.symbol);
    if (bracket && (order.orderId === bracket.stopId || order.orderId === bracket.targetId)) {
      const siblingId = order.orderId === bracket.stopId ? bracket.targetId : bracket.stopId;
      this._pendingCancelPromise = (async () => {
        if (siblingId) await this.broker.cancelOrder(siblingId).catch(() => {
        });
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
        maxLeverage: this.maxLeverage
      });
    }
    size = roundStep(size, this.qtyStep);
    if (!(size >= this.minQty)) throw new Error(`sized below minQty (${size})`);
    const entryClientOrderId = `${this.id}-entry-${Date.now()}`;
    const receipt = await this.broker.submitOrder({
      symbol: this.symbol,
      side: toBrokerSide(side),
      type,
      qty: size,
      limitPrice: type === "limit" ? limitPrice : void 0,
      clientOrderId: entryClientOrderId
    });
    if (Number.isFinite(stop) || Number.isFinite(target) || Number.isFinite(rr)) {
      if (receipt.status === "filled") {
        await this._attachBracket({ side, size, stop, target, rr, entryRef, receipt });
      } else if (receipt.status !== "rejected") {
        this._pendingBracket = {
          side,
          size,
          stop,
          target,
          rr,
          entryRef,
          orderId: receipt.orderId,
          clientOrderId: receipt.clientOrderId || entryClientOrderId
        };
      } else {
        this._pendingBracket = null;
      }
    }
    await this.refresh();
    return receipt;
  }
  async _attachBracket({ side, size, stop, target, rr, entryRef, receipt }) {
    const entryFill = receipt?.avgFillPrice ?? entryRef;
    const risk = Number.isFinite(stop) ? Math.abs(entryFill - stop) : null;
    const targetPrice = Number.isFinite(target) ? target : Number.isFinite(rr) && risk ? side === "long" || side === "buy" ? entryFill + rr * risk : entryFill - rr * risk : null;
    const exitSide = oppositeSide2(side);
    const bracket = {};
    if (Number.isFinite(stop)) {
      const stopOrder = await this.broker.submitOrder({
        symbol: this.symbol,
        side: exitSide,
        type: "stop",
        qty: size,
        stopPrice: stop,
        clientOrderId: `${this.id}-stop-${Date.now()}`
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
        clientOrderId: `${this.id}-target-${Date.now()}`
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
    const bracket = this.brackets.get(symbol);
    if (bracket) {
      for (const id of [bracket.stopId, bracket.targetId]) {
        if (id) await this.broker.cancelOrder(id).catch(() => {
        });
      }
      this.brackets.delete(symbol);
    }
    const receipt = await this.broker.submitOrder({
      symbol,
      side: oppositeSide2(pos.side),
      type: "market",
      qty: pos.qty,
      clientOrderId: `${this.id}-close-${Date.now()}`
    });
    await this._syncEquityAndRisk();
    await this.refresh();
    return receipt;
  }
  async flatten() {
    const positions = await this.broker.getPositions();
    for (const p of positions) await this.closePosition(p.symbol);
    const open = await this.broker.getOpenOrders?.().catch(() => []) ?? [];
    for (const o of open) await this.broker.cancelOrder(o.orderId).catch(() => {
    });
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
      risk: { halted: Boolean(risk.halted), ...risk }
    };
  }
  /** Refresh sync caches used by getStatus() */
  async refresh() {
    if (this._pendingCancelPromise) {
      await this._pendingCancelPromise;
      this._pendingCancelPromise = null;
    }
    this._cachedPositions = await this.broker.getPositions().catch(() => []);
    this._cachedOpenOrders = await this.broker.getOpenOrders?.().catch(() => []) ?? [];
    const acct = await this.broker.getAccount?.().catch(() => null);
    if (Number.isFinite(acct?.equity)) this.equity = acct.equity;
    return this.getStatus();
  }
};
var SessionManager = class {
  constructor({ brokerFactory } = {}) {
    this.sessions = /* @__PURE__ */ new Map();
    this.brokerFactory = brokerFactory;
  }
  async create({
    id,
    mode = "paper",
    symbol,
    interval = "1m",
    equity = 1e4,
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
      ...rest
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
    this.sessions.clear();
  }
};
function createSessionManager(opts) {
  return new SessionManager(opts);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AlpacaBroker,
  BinanceBroker,
  BrokerAdapter,
  BrokerClock,
  BrokerFeed,
  CandleAggregator,
  CoinbaseBroker,
  EventBus,
  FeedProvider,
  InteractiveBrokersBroker,
  JsonFileStorage,
  LIVE_EVENTS,
  LiveEngine,
  LiveLogger,
  LiveOrchestrator,
  PaperEngine,
  PollingFeed,
  RiskManager,
  SessionManager,
  StateManager,
  StorageProvider,
  TradingSession,
  createAlpacaBroker,
  createBinanceBroker,
  createBrokerFeed,
  createCandleAggregator,
  createClock,
  createCoinbaseBroker,
  createDashboardServer,
  createEventBus,
  createInteractiveBrokersBroker,
  createJsonFileStorage,
  createLiveEngine,
  createLiveOrchestrator,
  createLogger,
  createPaperEngine,
  createPollingFeed,
  createRiskManager,
  createSessionManager,
  createStateManager
});
