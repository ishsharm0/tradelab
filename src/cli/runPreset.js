// src/cli/runPreset.js
import { getStrategy, listStrategies } from "../strategies/index.js";
import { backtest } from "../engine/backtest.js";
import { summarize } from "../reporting/summarize.js";

/**
 * Run a named built-in strategy over provided candles and return metrics + summary.
 *
 * @param {{ preset: string, candles: object[], params?: object, symbol?: string, interval?: string }} options
 * @returns {{ metrics: object, summary: string }}
 */
export function runPreset({ preset, candles, params = {}, symbol = "PRESET", interval = "1d" } = {}) {
  let factory;
  try {
    factory = getStrategy(preset);
  } catch {
    factory = null;
  }

  if (!factory) {
    const names = listStrategies()
      .map((s) => s.name)
      .join(", ");
    throw new Error(`unknown preset "${preset}". Available: ${names}`);
  }

  const signal = factory(params);
  const result = backtest({ candles, symbol, interval, signal, warmupBars: 0 });
  const m = result.metrics;

  // Normalize units: backtest metrics use fractions; summarize() expects percent-valued fields.
  const normalized = {
    trades: m.trades,
    winRate: m.winRate,
    totalReturnPct: m.returnPct * 100,
    maxDrawdownPct: m.maxDrawdown * 100,
    sharpe: m.sharpe,
  };

  const summary = summarize(normalized);
  return { metrics: result.metrics, summary };
}
