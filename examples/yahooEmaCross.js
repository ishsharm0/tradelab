import path from "path";
import { fileURLToPath } from "url";

import {
  backtest,
  ema,
  exportBacktestArtifacts,
  getHistoricalCandles,
} from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return value > 0 ? "Inf" : "0";
  return value.toFixed(digits);
}

const symbol = process.argv[2] || "SPY";
const interval = process.argv[3] || "1d";
const period = process.argv[4] || "1y";

const candles = await getHistoricalCandles({
  source: "yahoo",
  symbol,
  interval,
  period,
  cache: true,
});

const result = backtest({
  candles,
  symbol,
  interval,
  range: period,
  equity: 25_000,
  riskPct: 1,
  collectEqSeries: true,
  collectReplay: true,
  warmupBars: 50,
  signal({ candles: history }) {
    if (history.length < 50) return null;

    const closes = history.map((bar) => bar.close);
    const fast = ema(closes, 10);
    const slow = ema(closes, 20);
    const last = closes.length - 1;

    const crossedUp = fast[last - 1] <= slow[last - 1] && fast[last] > slow[last];
    const crossedDown = fast[last - 1] >= slow[last - 1] && fast[last] < slow[last];
    if (!crossedUp && !crossedDown) return null;

    const lookback = history.slice(-12);
    const entry = history[last].close;
    const stop = crossedUp
      ? Math.min(...lookback.map((bar) => bar.low))
      : Math.max(...lookback.map((bar) => bar.high));
    const risk = Math.abs(entry - stop);
    if (!(risk > 0)) return null;

    return {
      side: crossedUp ? "long" : "short",
      entry,
      stop,
      rr: 2,
      _entryExpiryBars: 1,
    };
  },
});

const outDir = path.join(__dirname, "output");
const artifacts = exportBacktestArtifacts({
  result,
  outDir,
});

console.table({
  symbol,
  candles: candles.length,
  trades: result.metrics.trades,
  winRate: `${(result.metrics.winRate * 100).toFixed(1)}%`,
  profitFactor: formatNumber(result.metrics.profitFactor),
  totalPnL: formatNumber(result.metrics.totalPnL),
  returnPct: `${(result.metrics.returnPct * 100).toFixed(2)}%`,
});

console.log("CSV:", artifacts.csv);
console.log("HTML:", artifacts.html);
