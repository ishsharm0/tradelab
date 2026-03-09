import { buildMetrics } from "../metrics/buildMetrics.js";
import { backtest } from "./backtest.js";
import { estimateBarMs } from "./execution.js";

function scoreOf(metrics, scoreBy) {
  const value = metrics?.[scoreBy];
  return Number.isFinite(value) ? value : -Infinity;
}

function stitchEquitySeries(target, source) {
  if (!source?.length) return;
  if (!target.length) {
    target.push(...source);
    return;
  }

  const lastTime = target[target.length - 1].time;
  const nextPoints = source.filter((point) => point.time > lastTime);
  target.push(...nextPoints);
}

/**
 * Run rolling walk-forward optimization over a single candle series.
 *
 * Each window selects the best parameter set on the training segment and then
 * evaluates that parameter set on the following out-of-sample segment.
 */
export function walkForwardOptimize({
  candles = [],
  signalFactory,
  parameterSets = [],
  trainBars,
  testBars,
  stepBars = testBars,
  scoreBy = "profitFactor",
  backtestOptions = {},
} = {}) {
  if (!Array.isArray(candles) || candles.length === 0) {
    throw new Error("walkForwardOptimize() requires a non-empty candles array");
  }
  if (typeof signalFactory !== "function") {
    throw new Error("walkForwardOptimize() requires a signalFactory function");
  }
  if (!Array.isArray(parameterSets) || parameterSets.length === 0) {
    throw new Error("walkForwardOptimize() requires parameterSets");
  }
  if (!(trainBars > 0) || !(testBars > 0) || !(stepBars > 0)) {
    throw new Error("walkForwardOptimize() requires positive trainBars, testBars, and stepBars");
  }

  const windows = [];
  const allTrades = [];
  const allPositions = [];
  const eqSeries = [];
  let rollingEquity = backtestOptions.equity ?? 10_000;

  for (
    let start = 0;
    start + trainBars + testBars <= candles.length;
    start += stepBars
  ) {
    const trainSlice = candles.slice(start, start + trainBars);
    const testSlice = candles.slice(start + trainBars, start + trainBars + testBars);

    let best = null;
    for (const params of parameterSets) {
      const trainResult = backtest({
        ...backtestOptions,
        candles: trainSlice,
        equity: rollingEquity,
        signal: signalFactory(params),
      });
      const score = scoreOf(trainResult.metrics, scoreBy);
      if (!best || score > best.score) {
        best = { params, score, metrics: trainResult.metrics };
      }
    }

    const testResult = backtest({
      ...backtestOptions,
      candles: testSlice,
      equity: rollingEquity,
      signal: signalFactory(best.params),
    });

    rollingEquity = testResult.metrics.finalEquity;
    allTrades.push(...testResult.trades);
    allPositions.push(...testResult.positions);
    stitchEquitySeries(eqSeries, testResult.eqSeries);

    windows.push({
      train: {
        start: trainSlice[0]?.time ?? null,
        end: trainSlice[trainSlice.length - 1]?.time ?? null,
      },
      test: {
        start: testSlice[0]?.time ?? null,
        end: testSlice[testSlice.length - 1]?.time ?? null,
      },
      bestParams: best.params,
      trainScore: best.score,
      trainMetrics: best.metrics,
      testMetrics: testResult.metrics,
      result: testResult,
    });
  }

  const metrics = buildMetrics({
    closed: allTrades,
    equityStart: backtestOptions.equity ?? 10_000,
    equityFinal: rollingEquity,
    candles,
    estBarMs: estimateBarMs(candles),
    eqSeries,
  });

  return {
    windows,
    trades: allTrades,
    positions: allPositions,
    metrics,
    eqSeries,
    replay: { frames: [], events: [] },
    bestParams: windows.map((window) => window.bestParams),
  };
}
