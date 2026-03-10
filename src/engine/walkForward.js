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

function canonicalParams(params) {
  const entries = Object.entries(params || {}).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  return JSON.stringify(Object.fromEntries(entries));
}

function buildWindowRanges(length, trainBars, testBars, stepBars, mode) {
  const ranges = [];
  for (
    let start = 0;
    start + trainBars + testBars <= length;
    start += stepBars
  ) {
    const trainStart = mode === "anchored" ? 0 : start;
    const trainEnd = mode === "anchored" ? trainBars + start : start + trainBars;
    const testStart = trainEnd;
    const testEnd = testStart + testBars;
    if (testEnd > length) break;
    ranges.push({ trainStart, trainEnd, testStart, testEnd });
  }
  return ranges;
}

function summarizeBestParams(windows) {
  const summaryBySignature = new Map();
  let adjacentRepeats = 0;

  windows.forEach((window, index) => {
    const signature = window.bestParamsSignature ?? canonicalParams(window.bestParams);
    const current = summaryBySignature.get(signature) || {
      params: window.bestParams,
      wins: 0,
      profitableWindows: 0,
      oosTrades: 0,
    };
    current.wins += 1;
    current.profitableWindows += window.profitable ? 1 : 0;
    current.oosTrades += window.oosTrades;
    summaryBySignature.set(signature, current);

    if (
      index > 0 &&
      (windows[index - 1].bestParamsSignature ??
        canonicalParams(windows[index - 1].bestParams)) === signature
    ) {
      adjacentRepeats += 1;
    }
  });

  const byFrequency = [...summaryBySignature.values()].sort((left, right) => {
    if (right.wins !== left.wins) return right.wins - left.wins;
    return right.profitableWindows - left.profitableWindows;
  });
  const adjacentPairs = Math.max(0, windows.length - 1);

  return {
    winners: windows.map((window) => window.bestParams),
    stability: {
      adjacentRepeatRate: adjacentPairs ? adjacentRepeats / adjacentPairs : 0,
      uniqueWinnerCount: summaryBySignature.size,
      dominant: byFrequency[0] || null,
      leaderboard: byFrequency,
    },
  };
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
  mode = "rolling",
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
  if (mode !== "rolling" && mode !== "anchored") {
    throw new Error('walkForwardOptimize() mode must be "rolling" or "anchored"');
  }

  const windows = [];
  const allTrades = [];
  const allPositions = [];
  const eqSeries = [];
  let rollingEquity = backtestOptions.equity ?? 10_000;
  const ranges = buildWindowRanges(candles.length, trainBars, testBars, stepBars, mode);
  const trainBacktestOptions = {
    ...backtestOptions,
    collectEqSeries: false,
    collectReplay: false,
  };
  const testBacktestOptions = { ...backtestOptions };

  for (const range of ranges) {
    const trainSlice = candles.slice(range.trainStart, range.trainEnd);
    const testSlice = candles.slice(range.testStart, range.testEnd);

    let best = null;
    for (const params of parameterSets) {
      const trainResult = backtest({
        ...trainBacktestOptions,
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
      ...testBacktestOptions,
      candles: testSlice,
      equity: rollingEquity,
      signal: signalFactory(best.params),
    });
    const bestParamsSignature = canonicalParams(best.params);

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
      oosTrades: testResult.metrics.trades,
      profitable: testResult.metrics.totalPnL > 0,
      stabilityScore: 0,
      bestParamsSignature,
      result: testResult,
    });
  }

  for (let index = 0; index < windows.length; index += 1) {
    const currentSignature = windows[index].bestParamsSignature;
    const adjacent = [];
    if (index > 0) {
      adjacent.push(windows[index - 1].bestParamsSignature === currentSignature ? 1 : 0);
    }
    if (index + 1 < windows.length) {
      adjacent.push(windows[index + 1].bestParamsSignature === currentSignature ? 1 : 0);
    }
    windows[index].stabilityScore = adjacent.length
      ? adjacent.reduce((total, value) => total + value, 0) / adjacent.length
      : 1;
    delete windows[index].bestParamsSignature;
  }

  const metrics = buildMetrics({
    closed: allTrades,
    equityStart: backtestOptions.equity ?? 10_000,
    equityFinal: rollingEquity,
    candles,
    estBarMs: estimateBarMs(candles),
    eqSeries,
  });
  const bestParamsSummary = summarizeBestParams(windows);

  return {
    windows,
    trades: allTrades,
    positions: allPositions,
    metrics,
    eqSeries,
    replay: { frames: [], events: [] },
    bestParams: Object.assign(windows.map((window) => window.bestParams), bestParamsSummary),
    bestParamsSummary: bestParamsSummary.stability,
  };
}
