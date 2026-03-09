import path from "path";
import { fileURLToPath } from "url";

import { backtest, ema, exportBacktestArtifacts } from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return value > 0 ? "Inf" : "0";
  return value.toFixed(digits);
}

function generateCandles(count = 900) {
  const candles = [];
  const start = Date.UTC(2025, 0, 2, 14, 30, 0);
  let price = 100;

  for (let index = 0; index < count; index += 1) {
    const drift = Math.sin(index / 24) * 0.3 + Math.cos(index / 11) * 0.15;
    const shock = Math.sin(index / 7) * 0.6;
    const close = Math.max(20, price + drift + shock);
    const open = price;
    const high = Math.max(open, close) + 0.35 + Math.abs(Math.sin(index / 5)) * 0.2;
    const low = Math.min(open, close) - 0.35 - Math.abs(Math.cos(index / 6)) * 0.2;

    candles.push({
      time: start + index * 5 * 60 * 1000,
      open,
      high,
      low,
      close,
      volume: 1_000 + index,
    });

    price = close;
  }

  return candles;
}

const candles = generateCandles();

const result = backtest({
  candles,
  symbol: "DEMO",
  interval: "5m",
  range: "synthetic",
  equity: 25_000,
  riskPct: 0.5,
  collectEqSeries: true,
  collectReplay: true,
  signal({ candles: history }) {
    if (history.length < 60) return null;

    const closes = history.map((bar) => bar.close);
    const fast = ema(closes, 12);
    const slow = ema(closes, 26);
    const lastIndex = closes.length - 1;

    const fastNow = fast[lastIndex];
    const slowNow = slow[lastIndex];
    const fastPrev = fast[lastIndex - 1];
    const slowPrev = slow[lastIndex - 1];

    const crossedUp = fastPrev <= slowPrev && fastNow > slowNow;
    const crossedDown = fastPrev >= slowPrev && fastNow < slowNow;
    if (!crossedUp && !crossedDown) return null;

    const recentBars = history.slice(-20);
    const entry = history[lastIndex].close;
    const stop = crossedUp
      ? Math.min(...recentBars.map((bar) => bar.low))
      : Math.max(...recentBars.map((bar) => bar.high));
    const risk = Math.abs(entry - stop);
    if (!Number.isFinite(risk) || risk <= 0) return null;

    return {
      side: crossedUp ? "long" : "short",
      entry,
      stop,
      takeProfit: crossedUp ? entry + risk * 2.2 : entry - risk * 2.2,
      _rr: 2.2,
      _entryExpiryBars: 2,
      _breakevenAtR: 1,
      _trailAfterR: 1.5,
      _cooldownBars: 6,
    };
  },
});

const outputDir = path.join(__dirname, "output");
const artifacts = exportBacktestArtifacts({
  result,
  outDir: outputDir,
});

console.table({
  trades: result.metrics.trades,
  winRate: `${(result.metrics.winRate * 100).toFixed(1)}%`,
  profitFactor: formatNumber(result.metrics.profitFactor),
  totalPnL: formatNumber(result.metrics.totalPnL),
  returnPct: `${(result.metrics.returnPct * 100).toFixed(2)}%`,
  maxDrawdownPct: `${(result.metrics.maxDrawdownPct * 100).toFixed(2)}%`,
});

console.log("CSV:", artifacts.csv);
console.log("HTML:", artifacts.html);
