export type Side = "long" | "short";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  [key: string]: unknown;
}

export interface Tick {
  time: number;
  price?: number;
  last?: number;
  bid?: number;
  ask?: number;
  high?: number;
  low?: number;
  close?: number;
  size?: number;
  volume?: number;
  [key: string]: unknown;
}

/** Realized equity snapshot captured during a backtest. */
export interface EquityPoint {
  /** Bar timestamp in Unix milliseconds. */
  time: number;
  /** Alias of `time` kept for charting/export compatibility. */
  timestamp: number;
  /** Realized account equity at this point in the run. */
  equity: number;
  /** Capital currently locked by open positions, when available. */
  lockedCapital?: number;
  /** Capital currently available for new positions, when available. */
  availableCapital?: number;
}

/** Lightweight chart frame for replay/export consumers. */
export interface ReplayFrame {
  /** ISO timestamp string. */
  t: string;
  /** Close or mark price for the frame. */
  price: number;
  /** Realized equity at the frame time. */
  equity: number;
  /** Active position side, or `null` when flat. */
  posSide: Side | null;
  /** Active position size at the frame time. */
  posSize: number;
  lockedCapital?: number;
  availableCapital?: number;
}

/** Replay event emitted for entries, exits, adds, and scale-outs. */
export interface ReplayEvent {
  /** ISO timestamp string. */
  t: string;
  /** Event price. */
  price: number;
  /** Event label such as `ENTRY`, `EXIT`, `SCALE`, or `ADD`. */
  type: string;
  side?: Side;
  size?: number;
  tradeId?: number;
  reason?: string;
  pnl?: number;
}

/** Chart-friendly replay payload returned by `backtest()`. */
export interface ReplayPayload {
  /** Sequential per-bar frames. */
  frames: ReplayFrame[];
  /** Sparse trade/execution events. */
  events: ReplayEvent[];
}

export interface TradeExit {
  price: number;
  time: number;
  reason: string;
  pnl: number;
  financing?: number;
  exitATR?: number;
}

export interface BacktestTrade {
  symbol?: string;
  id?: number;
  side: Side;
  entry: number;
  stop: number;
  takeProfit: number;
  size: number;
  openTime: number;
  entryFill?: number;
  entryFeeTotal?: number;
  initSize?: number;
  baseSize?: number;
  entryATR?: number;
  mfeR?: number;
  maeR?: number;
  adds?: number;
  _initRisk?: number;
  _rr?: number;
  exit: TradeExit;
  [key: string]: unknown;
}

export interface OpenPosition {
  id?: number;
  symbol?: string;
  side: Side;
  entry: number;
  entryFill?: number;
  stop: number;
  takeProfit: number;
  size: number;
  openTime: number;
  markPrice: number;
  unrealizedPnl: number;
  _initRisk?: number;
  [key: string]: unknown;
}

export interface SideBreakdownEntry {
  trades: number;
  winRate: number;
  avgPnL: number;
  avgR: number;
}

export interface BenchmarkStats {
  alpha: number | null;
  beta: number | null;
  correlation: number | null;
  informationRatio: number | null;
  trackingError: number | null;
}

/** Aggregate performance metrics returned by `backtest()`. */
export interface BacktestMetrics {
  /** Count of completed positions included in the aggregate metrics. */
  trades: number;
  /** Percent of completed positions with positive PnL. */
  winRate: number;
  /** Gross profit divided by gross loss. */
  profitFactor: number;
  /** Average PnL per completed position. */
  expectancy: number;
  totalR: number;
  avgR: number;
  /** Daily Sharpe ratio alias for quick access. */
  sharpe: number;
  /** Annualized Sharpe ratio derived from the configured interval or bar spacing. */
  sharpeAnnualized: number;
  /** Annualized Sortino ratio derived from the configured interval or bar spacing. */
  sortinoAnnualized: number;
  /** Number of periods per year used for annualized metrics. */
  annualizationPeriods: number;
  sharpePerTrade: number;
  sortinoPerTrade: number;
  /** Maximum drawdown percent alias. */
  maxDrawdown: number;
  maxDrawdownPct: number;
  calmar: number;
  maxConsecWins: number;
  maxConsecLosses: number;
  /** Average hold time in minutes alias. */
  avgHold: number;
  avgHoldMin: number;
  exposurePct: number;
  totalPnL: number;
  returnPct: number;
  finalEquity: number;
  startEquity: number;
  profitFactor_pos: number;
  profitFactor_leg: number;
  winRate_pos: number;
  winRate_leg: number;
  /** Daily Sharpe ratio computed from realized equity changes. */
  sharpeDaily: number;
  sortinoDaily: number;
  benchmark: BenchmarkStats;
  /** Long/short breakdown grouped by completed position side. */
  sideBreakdown: {
    long: SideBreakdownEntry;
    short: SideBreakdownEntry;
  };
  /** Long-side breakdown alias. */
  long: SideBreakdownEntry;
  /** Short-side breakdown alias. */
  short: SideBreakdownEntry;
  rDist: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
  holdDistMin: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
  daily: {
    count: number;
    winRate: number;
    avgReturn: number;
  };
}

export interface SignalContext {
  candles: Candle[];
  index: number;
  bar: Candle;
  equity: number;
  openPosition: BacktestTrade | null;
  pendingOrder: PendingOrder | null;
}

export interface SignalResult {
  side?: Side | "buy" | "sell";
  direction?: Side | "buy" | "sell";
  action?: Side | "buy" | "sell";
  entry?: number;
  limit?: number;
  price?: number;
  stop?: number;
  stopLoss?: number;
  sl?: number;
  takeProfit?: number;
  target?: number;
  tp?: number;
  qty?: number;
  size?: number;
  riskPct?: number;
  riskFraction?: number;
  rr?: number;
  _rr?: number;
  _entryExpiryBars?: number;
  _cooldownBars?: number;
  _breakevenAtR?: number;
  _trailAfterR?: number;
  _maxBarsInTrade?: number;
  _maxHoldMin?: number;
  _initRisk?: number;
  _imb?: { mid?: number; [key: string]: unknown };
  [key: string]: unknown;
}

export type SignalFunction = (context: SignalContext) => SignalResult | null;
export type AsyncSignalFunction = (
  context: SignalContext
) => SignalResult | null | Promise<SignalResult | null>;

export interface PendingOrder {
  side: Side;
  entry: number;
  stop: number;
  tp: number;
  riskFrac: number;
  fixedQty?: number | null;
  expiresAt: number;
  startedAtIndex: number;
  meta: SignalResult;
  plannedRiskAbs: number;
  [key: string]: unknown;
}

export interface OCOOptions {
  mode?: "intrabar" | "close";
  tieBreak?: "pessimistic" | "optimistic";
  clampStops?: boolean;
  clampEpsBps?: number;
}

export interface ExecutionCostOptions {
  slippageBps?: number;
  spreadBps?: number;
  slippageByKind?: Partial<Record<"market" | "limit" | "stop", number>>;
  commissionBps?: number;
  commissionPerUnit?: number;
  commissionPerOrder?: number;
  minCommission?: number;
  carry?: {
    longAnnualBps?: number;
    shortAnnualBps?: number;
  };
  funding?: {
    rateBps?: number;
    intervalMs?: number;
    anchorMs?: number;
  };
}

export interface MfeTrailOptions {
  enabled?: boolean;
  armR?: number;
  givebackR?: number;
}

export interface PyramidingOptions {
  enabled?: boolean;
  addAtR?: number;
  addFrac?: number;
  maxAdds?: number;
  onlyAfterBreakEven?: boolean;
}

export interface VolScaleOptions {
  enabled?: boolean;
  atrPeriod?: number;
  cutIfAtrX?: number;
  cutFrac?: number;
  noCutAboveR?: number;
}

export interface EntryChaseOptions {
  enabled?: boolean;
  afterBars?: number;
  maxSlipR?: number;
  convertOnExpiry?: boolean;
}

export interface BacktestOptions {
  candles: Candle[];
  symbol?: string;
  equity?: number;
  riskPct?: number;
  riskFraction?: number;
  signal: SignalFunction;
  interval?: string;
  range?: string;
  warmupBars?: number;
  slippageBps?: number;
  feeBps?: number;
  costs?: ExecutionCostOptions;
  scaleOutAtR?: number;
  scaleOutFrac?: number;
  finalTP_R?: number;
  maxDailyLossPct?: number;
  atrTrailMult?: number;
  atrTrailPeriod?: number;
  oco?: OCOOptions;
  triggerMode?: "intrabar" | "close";
  flattenAtClose?: boolean;
  dailyMaxTrades?: number;
  postLossCooldownBars?: number;
  mfeTrail?: MfeTrailOptions;
  pyramiding?: PyramidingOptions;
  volScale?: VolScaleOptions;
  qtyStep?: number;
  minQty?: number;
  maxLeverage?: number;
  entryChase?: EntryChaseOptions;
  reanchorStopOnFill?: boolean;
  maxSlipROnFill?: number;
  collectEqSeries?: boolean;
  collectReplay?: boolean;
  strict?: boolean;
}

export interface BacktestAsyncOptions extends Omit<BacktestOptions, "signal"> {
  signal: AsyncSignalFunction;
  signalBudgetMs?: number;
}

export interface BacktestTickOptions {
  ticks: Tick[];
  symbol?: string;
  equity?: number;
  riskPct?: number;
  signal: SignalFunction;
  interval?: string;
  range?: string;
  slippageBps?: number;
  feeBps?: number;
  costs?: ExecutionCostOptions;
  finalTP_R?: number;
  maxDailyLossPct?: number;
  dailyMaxTrades?: number;
  qtyStep?: number;
  minQty?: number;
  maxLeverage?: number;
  collectEqSeries?: boolean;
  collectReplay?: boolean;
  queueFillProbability?: number;
  seed?: string;
  oco?: OCOOptions;
}

/** Full result payload returned by `backtest()`. */
export interface BacktestResult {
  symbol?: string;
  interval?: string;
  range?: string;
  /** Realized legs, including scale-outs and partial exits. */
  trades: BacktestTrade[];
  /** Completed positions only, without intermediate realized legs. */
  positions: BacktestTrade[];
  /** Open positions still active at end-of-data (if any). */
  openPositions: OpenPosition[];
  /** Aggregate performance statistics. */
  metrics: BacktestMetrics;
  /** Realized equity points suitable for charts and exports. */
  eqSeries: EquityPoint[];
  /** Lightweight frames/events payload for report and chart consumers. */
  replay: ReplayPayload;
}

export interface PortfolioSystem extends Omit<BacktestOptions, "equity"> {
  weight?: number;
  maxAllocation?: number;
  maxAllocationPct?: number;
}

export interface PortfolioSystemResult {
  symbol: string;
  weight: number;
  equity: number;
  allocationCapPct?: number;
  allocationCap?: number;
  result: BacktestResult;
}

export interface PortfolioBacktestResult extends BacktestResult {
  systems: PortfolioSystemResult[];
}

export interface WalkForwardWindow {
  train: { start: number | null; end: number | null };
  test: { start: number | null; end: number | null };
  bestParams: Record<string, unknown>;
  trainScore: number;
  trainMetrics: BacktestMetrics;
  testMetrics: BacktestMetrics;
  oosTrades: number;
  profitable: boolean;
  stabilityScore: number;
  result: BacktestResult;
}

export interface WalkForwardBestParamsSummary {
  adjacentRepeatRate: number;
  uniqueWinnerCount: number;
  dominant: {
    params: Record<string, unknown>;
    wins: number;
    profitableWindows: number;
    oosTrades: number;
  } | null;
  leaderboard: Array<{
    params: Record<string, unknown>;
    wins: number;
    profitableWindows: number;
    oosTrades: number;
  }>;
}

export interface WalkForwardBestParams extends Array<Record<string, unknown>> {
  winners: Array<Record<string, unknown>>;
  stability: WalkForwardBestParamsSummary;
}

export interface WalkForwardResult extends BacktestResult {
  windows: WalkForwardWindow[];
  bestParams: WalkForwardBestParams;
  bestParamsSummary: WalkForwardBestParamsSummary;
}

export interface CsvLoadOptions {
  delimiter?: string;
  skipRows?: number;
  hasHeader?: boolean;
  timeCol?: string | number;
  openCol?: string | number;
  highCol?: string | number;
  lowCol?: string | number;
  closeCol?: string | number;
  volumeCol?: string | number;
  startDate?: string | Date;
  endDate?: string | Date;
  customDateParser?: (value: unknown) => number | Date;
}

export interface HistoricalDataOptions {
  source?: "auto" | "yahoo" | "csv";
  symbol?: string;
  interval?: string;
  period?: string | number;
  cache?: boolean;
  refresh?: boolean;
  cacheDir?: string;
  csvPath?: string;
  csv?: CsvLoadOptions & { filePath?: string; path?: string };
  includePrePost?: boolean;
}

export interface BacktestHistoricalOptions {
  data?: HistoricalDataOptions;
  backtestOptions?: Omit<BacktestOptions, "candles" | "symbol" | "interval" | "range"> & {
    symbol?: string;
    interval?: string;
    range?: string;
  };
}

export interface CandleStats {
  count: number;
  firstTime: string;
  lastTime: string;
  durationDays: number;
  estimatedIntervalMin: number;
  priceRange: {
    low: number;
    high: number;
  };
}

export interface CacheMeta {
  symbol?: string;
  interval?: string;
  period?: string | number;
  outDir?: string;
  source?: string;
}

export interface ExportHtmlReportOptions {
  symbol: string;
  interval: string;
  range: string;
  metrics: BacktestMetrics;
  eqSeries: EquityPoint[];
  replay?: ReplayPayload;
  positions?: BacktestTrade[];
  outDir?: string;
  plotlyCdnUrl?: string;
}

export interface ExportTradesCsvOptions {
  symbol?: string;
  interval?: string;
  range?: string;
  outDir?: string;
}

export interface ExportMetricsJsonOptions {
  result: BacktestResult;
  symbol?: string;
  interval?: string;
  range?: string;
  outDir?: string;
}

export interface ExportArtifactsOptions {
  result: BacktestResult;
  symbol?: string;
  interval?: string;
  range?: string;
  outDir?: string;
  exportCsv?: boolean;
  exportHtml?: boolean;
  exportMetrics?: boolean;
  csvSource?: "trades" | "positions";
  plotlyCdnUrl?: string;
}

export interface ArtifactPaths {
  csv: string | null;
  html: string | null;
  metrics: string | null;
}

export interface LlmSignalOptions {
  resolve: AsyncSignalFunction;
  budgetMs?: number;
  onError?: "skip" | "throw";
}

export interface LlmDecisionLogEntry {
  index: number;
  time?: number;
  close?: number;
  latencyMs: number;
  result?: SignalResult | null;
  error?: string;
}

export interface StrategyParamSpec {
  type: string;
  default?: unknown;
  description?: string;
  [key: string]: unknown;
}

export interface StrategyDefinition {
  description: string;
  params: Record<string, StrategyParamSpec>;
  factory: (params?: Record<string, unknown>) => SignalFunction;
}

export interface StrategySummary {
  name: string;
  description: string;
  params: Record<string, StrategyParamSpec>;
}

export interface ResearchPercentileBands {
  p5: number;
  p25?: number;
  p50: number;
  p75?: number;
  p95: number;
}

export interface MonteCarloResult {
  iterations: number;
  blockSize: number;
  finalEquity: Required<ResearchPercentileBands>;
  maxDrawdown: Required<ResearchPercentileBands>;
  pathBands: Array<Pick<ResearchPercentileBands, "p5" | "p50" | "p95">>;
  probProfit: number;
}

export interface PboResult {
  pbo: number;
  combos: number;
  medianLogit: number;
}

export interface CpcvSplit {
  train: number[];
  test: number[];
  testGroups: number[];
}

export interface OptimizeResultEntry {
  params: Record<string, unknown>;
  metrics?: Partial<BacktestMetrics>;
  error?: string;
}

export interface OptimizeResult {
  results: OptimizeResultEntry[];
  leaderboard: OptimizeResultEntry[];
  best: OptimizeResultEntry | null;
}

/**
 * Run a candle-based backtest.
 *
 * Returns realized trade legs in `trades`, completed positions in `positions`,
 * aggregate statistics in `metrics`, realized equity points in `eqSeries`, and
 * chart-friendly replay frames/events in `replay`.
 */
export function backtest(options: BacktestOptions): BacktestResult;
export function backtestAsync(options: BacktestAsyncOptions): Promise<BacktestResult>;
export function backtestTicks(options: BacktestTickOptions): BacktestResult;
export function grid(spec?: Record<string, unknown | unknown[]>): Array<Record<string, unknown>>;
export function optimize(options: {
  candles: Candle[];
  signalModulePath: string;
  parameterSets: Array<Record<string, unknown>>;
  interval?: string;
  backtestOptions?: Partial<BacktestOptions>;
  concurrency?: number;
  scoreBy?: keyof BacktestMetrics | string;
}): Promise<OptimizeResult>;
export function backtestPortfolio(options: {
  systems: PortfolioSystem[];
  equity?: number;
  interval?: string;
  allocation?: "equal" | "weight";
  collectEqSeries?: boolean;
  collectReplay?: boolean;
  maxDailyLossPct?: number;
  processingOrder?: "sequential" | "shuffle";
  shuffleSeed?: number;
}): PortfolioBacktestResult;
export function walkForwardOptimize(options: {
  candles: Candle[];
  signalFactory: (params: Record<string, unknown>) => SignalFunction;
  parameterSets: Array<Record<string, unknown>>;
  trainBars: number;
  testBars: number;
  stepBars?: number;
  mode?: "rolling" | "anchored";
  scoreBy?: keyof BacktestMetrics;
  backtestOptions?: Omit<BacktestOptions, "candles" | "signal">;
}): WalkForwardResult;
export function buildMetrics(input: {
  closed: BacktestTrade[];
  equityStart: number;
  equityFinal: number;
  candles: Candle[];
  estBarMs: number;
  eqSeries?: EquityPoint[];
  interval?: string;
  benchmarkReturns?: number[];
}): BacktestMetrics;
export function benchmarkStats(
  strategyReturns: number[],
  benchmarkReturns: number[]
): BenchmarkStats;
export function clampFinite(value: unknown, fallback?: number): number;
export const BIG_NUMBER: number;
export function periodsPerYear(interval?: string, estBarMs?: number): number;

export class LlmSignal {
  constructor(options: LlmSignalOptions);
  resolve: AsyncSignalFunction;
  budgetMs: number;
  onError: "skip" | "throw";
  log: LlmDecisionLogEntry[];
  signal(context: SignalContext): Promise<SignalResult | null>;
}

export function registerStrategy(name: string, def: StrategyDefinition): void;
export function listStrategies(): StrategySummary[];
export function getStrategy(name: string): StrategyDefinition["factory"];

export interface ResearchEntry {
  at: string;
  hypothesis?: string;
  params?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  verdict?: Record<string, unknown> | null;
}

export interface ResearchRecord {
  id: string;
  goal: string;
  createdAt: string;
  closedAt: string | null;
  entries: ResearchEntry[];
}

export interface ResearchStore {
  open(id: string, goal?: string): Promise<ResearchRecord>;
  log(id: string, options?: {
    hypothesis?: string;
    params?: Record<string, unknown>;
    metrics?: Record<string, unknown>;
    verdict?: Record<string, unknown> | null;
  }): Promise<ResearchEntry>;
  recall(id: string, limit?: number): Promise<{ goal: string; entries: ResearchEntry[]; summary: string }>;
  close(id: string): Promise<ResearchRecord>;
}

export function createResearchStore(options?: { dir?: string }): ResearchStore;

export namespace research {
  function monteCarlo(options: {
    tradePnls: number[];
    equityStart?: number;
    iterations?: number;
    blockSize?: number;
    seed?: string | number;
  }): MonteCarloResult;
  function deflatedSharpe(options: {
    sharpe: number;
    sampleSize: number;
    numTrials?: number;
    sharpeStd?: number;
    skew?: number;
    kurtosis?: number;
  }): number;
  function sweepHaircut(options: { numTrials: number; sharpeStd: number }): {
    expectedMaxSharpe: number;
    numTrials: number;
  };
  function probabilityOfBacktestOverfitting(
    performanceMatrix: number[][],
    options?: { groups?: number }
  ): PboResult;
  function combinatorialPurgedSplits(options: {
    nObservations: number;
    nGroups?: number;
    nTestGroups?: number;
    embargo?: number;
  }): CpcvSplit[];
  function combinations(n: number, k: number): number[][];
  function normalCdf(x: number): number;
  function normalPpf(p: number): number;
  function moments(values: number[]): { mean: number; std: number; skew: number; kurtosis: number };
}

export function getHistoricalCandles(options?: HistoricalDataOptions): Promise<Candle[]>;
export function backtestHistorical(options: BacktestHistoricalOptions): Promise<BacktestResult>;
export function fetchHistorical(
  symbol: string,
  interval?: string,
  period?: string | number,
  options?: { includePrePost?: boolean }
): Promise<Candle[]>;
export function fetchLatestCandle(
  symbol: string,
  interval?: string,
  options?: { includePrePost?: boolean }
): Promise<Candle | null>;
export function loadCandlesFromCSV(filePath: string, options?: CsvLoadOptions): Candle[];
export function normalizeCandles(candles: Candle[]): Candle[];
export function mergeCandles(...arrays: Candle[][]): Candle[];
export function candleStats(candles: Candle[]): CandleStats | null;
export function saveCandlesToCache(candles: Candle[], meta?: CacheMeta): string;
export function cachedCandlesPath(
  symbol: string,
  interval: string,
  period: string | number,
  outDir?: string
): string;
export function loadCandlesFromCache(
  symbol: string,
  interval: string,
  period: string | number,
  outDir?: string
): Candle[] | null;

export function renderHtmlReport(options: ExportHtmlReportOptions): string;
export function exportHtmlReport(options: ExportHtmlReportOptions): string | null;
export function exportTradesCsv(
  trades: BacktestTrade[],
  options?: ExportTradesCsvOptions
): string | null;
export function exportMetricsJSON(options: ExportMetricsJsonOptions): string;
export function exportBacktestArtifacts(options: ExportArtifactsOptions): ArtifactPaths;

export function ema(values: number[], period?: number): number[];
export function atr(bars: Candle[], period?: number): Array<number | undefined>;
export function swingHigh(bars: Candle[], index: number, left?: number, right?: number): boolean;
export function swingLow(bars: Candle[], index: number, left?: number, right?: number): boolean;
export function detectFVG(
  bars: Candle[],
  index: number
): { type: "bull" | "bear"; top: number; bottom: number; mid: number } | null;
export function lastSwing(
  bars: Candle[],
  index: number,
  direction: "up" | "down"
): { idx: number; price: number } | null;
export function structureState(
  bars: Candle[],
  index: number
): {
  lastLow: { idx: number; price: number } | null;
  lastHigh: { idx: number; price: number } | null;
};
export function bpsOf(price: number, bps: number): number;
export function pct(a: number, b: number): number;

export function calculatePositionSize(input: {
  equity: number;
  entry: number;
  stop: number;
  riskFraction?: number;
  qtyStep?: number;
  minQty?: number;
  maxLeverage?: number;
}): number;

export function offsetET(timeMs: number): number;
export function minutesET(timeMs: number): number;
export function isSession(timeMs: number, session?: "NYSE" | "FUT" | "AUTO"): boolean;
export function parseWindowsCSV(csv: string): Array<{ aMin: number; bMin: number }> | null;
export function inWindowsET(
  timeMs: number,
  windows: Array<{ aMin: number; bMin: number }>
): boolean;
