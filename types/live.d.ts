import type {
  BacktestTrade,
  Candle,
  EquityPoint,
  ExecutionCostOptions,
  OpenPosition,
  PendingOrder,
  SignalFunction,
  SignalResult,
} from "./index.d.ts";

export interface BrokerConfig {
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string;
  paper?: boolean;
  baseUrl?: string;
  wsUrl?: string;
  [key: string]: unknown;
}

export interface AccountInfo {
  equity: number;
  buyingPower: number;
  cash: number;
  currency: string;
  marginUsed?: number;
}

export interface LiveOrder {
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit";
  qty: number;
  limitPrice?: number;
  stopPrice?: number;
  timeInForce?: "day" | "gtc" | "ioc" | "fok";
  clientOrderId?: string;
}

export interface OrderModification {
  qty?: number;
  limitPrice?: number;
  stopPrice?: number;
}

export interface OrderReceipt {
  orderId: string;
  clientOrderId?: string;
  status: "new" | "partially_filled" | "filled" | "canceled" | "rejected" | "expired";
  filledQty: number;
  avgFillPrice?: number;
  filledAt?: number;
  symbol: string;
  side: "buy" | "sell";
  type: string;
  qty: number;
  rejectReason?: string;
}

export interface BrokerPosition {
  symbol: string;
  side: "long" | "short";
  qty: number;
  avgEntry: number;
  marketValue: number;
  unrealizedPnl: number;
}

export interface Subscription {
  unsubscribe(): void;
}

export interface StoredState {
  openPosition: OpenPosition | null;
  pendingOrder: PendingOrder | null;
  equity: number;
  candleBuffer: Candle[];
  strategyState: Record<string, unknown>;
  lastBarTime: number | null;
  dayPnl: number;
  dayTrades: number;
  tradeIdCounter: number;
  savedAt: number;
}

export class EventBus extends import("node:events").EventEmitter {
  emitEvent(event: string, payload?: Record<string, unknown>): true;
  onAny(handler: (input: { event: string; payload: Record<string, unknown> }) => void): () => void;
}

export class LiveLogger {
  constructor(options?: {
    level?: "debug" | "info" | "warn" | "error" | "silent";
    stream?: NodeJS.WritableStream;
  });
  attach(eventBus: EventBus): () => void;
  detach(): void;
}

export class BrokerClock {
  constructor(options?: { warnThresholdMs?: number });
  syncWithBroker(broker: BrokerAdapter): Promise<{
    serverTime: number | null;
    localTime: number;
    offsetMs: number;
    warning: string | null;
  }>;
  now(): number;
}

export class BrokerAdapter extends import("node:events").EventEmitter {
  connect(config?: BrokerConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getAccount(): Promise<AccountInfo>;
  getPositions(): Promise<BrokerPosition[]>;
  getServerTime(): Promise<number>;
  submitOrder(order: LiveOrder): Promise<OrderReceipt>;
  cancelOrder(orderId: string): Promise<void>;
  modifyOrder(orderId: string, changes: OrderModification): Promise<OrderReceipt>;
  getOpenOrders(): Promise<OrderReceipt[]>;
  getOrderStatus(orderId: string): Promise<OrderReceipt>;
  subscribeQuotes(symbol: string, handler: (quote: unknown) => void): Promise<Subscription>;
  subscribeTrades(symbol: string, handler: (trade: unknown) => void): Promise<Subscription>;
  subscribeBars(
    symbol: string,
    interval: string,
    handler: (bar: Candle) => void
  ): Promise<Subscription>;
  getHistoricalBars(symbol: string, interval: string, limit: number): Promise<Candle[]>;
  supportsPaperNative(): boolean;
}

export class AlpacaBroker extends BrokerAdapter {}
export class BinanceBroker extends BrokerAdapter {}
export class CoinbaseBroker extends BrokerAdapter {}
export class InteractiveBrokersBroker extends BrokerAdapter {}

export class FeedProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribeBars(
    symbol: string,
    interval: string,
    handler: (bar: Candle) => void
  ): Subscription | Promise<Subscription>;
  subscribeTicks(
    symbol: string,
    handler: (tick: unknown) => void
  ): Subscription | Promise<Subscription>;
  getHistoricalBars(symbol: string, interval: string, count: number): Promise<Candle[]>;
}

export class BrokerFeed extends FeedProvider {
  constructor(options: { broker: BrokerAdapter });
}

export class PollingFeed extends FeedProvider {
  constructor(options: {
    broker: BrokerAdapter;
    pollIntervalMs?: number;
    defaultBarsPerPoll?: number;
  });
  pollOnce(): Promise<void>;
  startPolling(): void;
  stopPolling(): void;
}

export class StorageProvider {
  load(namespace: string): Promise<StoredState | null>;
  save(namespace: string, state: StoredState): Promise<void>;
  appendTrade(namespace: string, trade: BacktestTrade): Promise<void>;
  appendEquityPoint(namespace: string, point: EquityPoint): Promise<void>;
  loadTrades(namespace: string): Promise<BacktestTrade[]>;
  loadEquityCurve(namespace: string): Promise<EquityPoint[]>;
  clear(namespace: string): Promise<void>;
}

export class JsonFileStorage extends StorageProvider {
  constructor(options?: { baseDir?: string });
}

export interface RiskManagerOptions {
  maxDailyLossPct?: number;
  maxDailyLossDollars?: number;
  maxDrawdownPct?: number;
  maxPositions?: number;
  maxPositionPct?: number;
  maxDailyTrades?: number;
  cooldownAfterLossMs?: number;
  allowedSessions?: string;
  allowedWindows?: string;
}

export class RiskManager {
  constructor(options?: RiskManagerOptions);
  initialize(equity: number, timeMs?: number): void;
  update(input: { timeMs: number; equity: number }): void;
  canTrade(input?: { timeMs?: number }): { ok: boolean; reason: string | null };
  canOpenPosition(input?: {
    timeMs?: number;
    positionCount?: number;
    positionValue?: number;
    equity?: number | null;
  }): { ok: boolean; reason: string | null };
  recordTrade(input?: { pnl?: number; timeMs?: number; equity?: number | null }): void;
  halt(reason?: string): void;
  clearHalt(): void;
  getState(): Record<string, unknown>;
}

export class StateManager {
  constructor(options: { storage: StorageProvider });
  load(namespace: string): Promise<StoredState | null>;
  save(namespace: string, state: StoredState): Promise<void>;
  appendTrade(namespace: string, trade: BacktestTrade): Promise<void>;
  appendEquityPoint(namespace: string, point: EquityPoint): Promise<void>;
  loadTrades(namespace: string): Promise<BacktestTrade[]>;
  loadEquityCurve(namespace: string): Promise<EquityPoint[]>;
  clear(namespace: string): Promise<void>;
  reconcile(input: {
    persistedState: StoredState | null;
    brokerPositions?: BrokerPosition[];
    symbol: string;
  }): {
    status: "ok" | "warn" | "error";
    action: "none" | "adopt-broker" | "closed-externally" | "external-position" | "mismatch";
    message: string;
    adoptedPosition: OpenPosition | null;
    mismatch: { persisted: OpenPosition; broker: BrokerPosition } | null;
  };
}

export class CandleAggregator extends import("node:events").EventEmitter {
  constructor(options?: {
    mode?: "stream" | "tick" | "poll";
    interval?: string;
    graceMs?: number;
    session?: string;
  });
  processBar(bar: Candle, options?: { isFinal?: boolean }): void;
  processTick(tick: unknown): void;
  processPolledBars(bars: Candle[]): void;
  forceClose(timeMs?: number): void;
}

export class PaperEngine extends BrokerAdapter {
  constructor(options?: {
    equity?: number;
    currency?: string;
    slippageBps?: number;
    feeBps?: number;
    costs?: ExecutionCostOptions | null;
    qtyStep?: number;
  });
  setHistoricalBars(symbol: string, interval: string, bars: Candle[]): void;
  simulateBar(symbol: string, interval: string, bar: Candle): Promise<void>;
}

export interface LiveEngineOptions {
  id?: string;
  signal: SignalFunction;
  symbol: string;
  interval: string;
  broker: BrokerAdapter;
  brokerConfig?: BrokerConfig;
  feed?: FeedProvider;
  storage?: StorageProvider;
  eventBus?: EventBus;
  equity?: number;
  useBrokerAccountEquity?: boolean;
  mode?: "streaming" | "polling";
  pollIntervalMs?: number;
  paper?: boolean;
  warmupBars?: number;
  riskPct?: number;
  costs?: ExecutionCostOptions | null;
  finalTP_R?: number;
  maxDailyLossPct?: number;
  flattenAtClose?: boolean;
  qtyStep?: number;
  minQty?: number;
  maxLeverage?: number;
  dailyMaxTrades?: number;
  entryChase?: {
    enabled?: boolean;
    afterBars?: number;
    maxSlipR?: number;
    convertOnExpiry?: boolean;
  };
  risk?: RiskManagerOptions;
  logLevel?: "debug" | "info" | "warn" | "error" | "silent";
}

export class LiveEngine {
  constructor(options: LiveEngineOptions);
  readonly eventBus: EventBus;
  start(): Promise<void>;
  stop(options?: { flattenOnShutdown?: boolean }): Promise<void>;
  handleBar(bar: Candle): Promise<void>;
  pollOnce(): Promise<void>;
  getStatus(): Record<string, unknown>;
}

export interface LiveSystemConfig extends Omit<
  LiveEngineOptions,
  "broker" | "feed" | "storage" | "eventBus"
> {
  id?: string;
  weight?: number;
}

export class LiveOrchestrator {
  constructor(options: {
    systems: LiveSystemConfig[];
    broker: BrokerAdapter;
    brokerConfig?: BrokerConfig;
    feed?: FeedProvider;
    storage?: StorageProvider;
    eventBus?: EventBus;
    equity?: number;
    allocation?: "equal" | "weight";
    maxDailyLossPct?: number;
    risk?: RiskManagerOptions;
  });
  readonly eventBus: EventBus;
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): Record<string, unknown>;
}

export interface DashboardServer {
  start(): Promise<string>;
  close(): Promise<void>;
  server: import("node:http").Server;
}

export function createDashboardServer(options: {
  source: {
    eventBus: EventBus;
    getStatus?: () => Record<string, unknown>;
  };
  port?: number;
  maxBuffer?: number;
}): DashboardServer;

export function createEventBus(): EventBus;
export function createLogger(options?: {
  level?: "debug" | "info" | "warn" | "error" | "silent";
}): LiveLogger;
export function createClock(options?: { warnThresholdMs?: number }): BrokerClock;

export function createAlpacaBroker(options?: { fetchImpl?: typeof fetch }): AlpacaBroker;
export function createBinanceBroker(options?: { fetchImpl?: typeof fetch }): BinanceBroker;
export function createCoinbaseBroker(options?: { fetchImpl?: typeof fetch }): CoinbaseBroker;
export function createInteractiveBrokersBroker(
  options?: Record<string, unknown>
): InteractiveBrokersBroker;
export function createBrokerFeed(options: { broker: BrokerAdapter }): BrokerFeed;
export function createPollingFeed(options: {
  broker: BrokerAdapter;
  pollIntervalMs?: number;
  defaultBarsPerPoll?: number;
}): PollingFeed;
export function createJsonFileStorage(options?: { baseDir?: string }): JsonFileStorage;
export function createRiskManager(options?: RiskManagerOptions): RiskManager;
export function createStateManager(options: { storage: StorageProvider }): StateManager;
export function createCandleAggregator(options?: {
  mode?: "stream" | "tick" | "poll";
  interval?: string;
  graceMs?: number;
  session?: string;
}): CandleAggregator;
export function createPaperEngine(options?: {
  equity?: number;
  currency?: string;
  slippageBps?: number;
  feeBps?: number;
  costs?: ExecutionCostOptions | null;
  qtyStep?: number;
}): PaperEngine;
export function createLiveEngine(options: LiveEngineOptions): LiveEngine;
export function createLiveOrchestrator(options: {
  systems: LiveSystemConfig[];
  broker: BrokerAdapter;
  brokerConfig?: BrokerConfig;
  feed?: FeedProvider;
  storage?: StorageProvider;
  eventBus?: EventBus;
  equity?: number;
  allocation?: "equal" | "weight";
  maxDailyLossPct?: number;
  risk?: RiskManagerOptions;
}): LiveOrchestrator;

export type { SignalResult };
