export { backtest } from "./engine/backtest.js";
export { backtestPortfolio } from "./engine/portfolio.js";
export { walkForwardOptimize } from "./engine/walkForward.js";

export { buildMetrics } from "./metrics/buildMetrics.js";
export {
  backtestHistorical,
  cachedCandlesPath,
  candleStats,
  fetchHistorical,
  fetchLatestCandle,
  getHistoricalCandles,
  loadCandlesFromCache,
  loadCandlesFromCSV,
  mergeCandles,
  normalizeCandles,
  saveCandlesToCache,
} from "./data/index.js";

export {
  renderHtmlReport,
  exportHtmlReport,
} from "./reporting/renderHtmlReport.js";
export { exportTradesCsv } from "./reporting/exportTradesCsv.js";
export { exportMetricsJSON } from "./reporting/exportMetricsJson.js";
export { exportBacktestArtifacts } from "./reporting/exportBacktestArtifacts.js";

export {
  ema,
  atr,
  swingHigh,
  swingLow,
  detectFVG,
  lastSwing,
  structureState,
  bpsOf,
  pct,
} from "./utils/indicators.js";
export { calculatePositionSize } from "./utils/positionSizing.js";
export {
  offsetET,
  minutesET,
  isSession,
  parseWindowsCSV,
  inWindowsET,
} from "./utils/time.js";
