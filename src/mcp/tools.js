import { backtest } from "../engine/backtest.js";
import { walkForwardOptimize } from "../engine/walkForward.js";
import { getHistoricalCandles } from "../data/index.js";
import { getStrategy, listStrategies } from "../strategies/index.js";
import { liveTools } from "./liveTools.js";

function summarizeMetrics(metrics) {
  const {
    trades,
    winRate,
    profitFactor,
    expectancy,
    totalR,
    avgR,
    sharpe,
    sharpeAnnualized,
    sortinoAnnualized,
    maxDrawdown,
    calmar,
    returnPct,
    totalPnL,
    finalEquity,
    exposurePct,
    sideBreakdown,
  } = metrics;
  return {
    trades,
    winRate,
    profitFactor,
    expectancy,
    totalR,
    avgR,
    sharpe,
    sharpeAnnualized,
    sortinoAnnualized,
    maxDrawdown,
    calmar,
    returnPct,
    totalPnL,
    finalEquity,
    exposurePct,
    sideBreakdown,
  };
}

async function resolveCandles(args) {
  if (Array.isArray(args.candles) && args.candles.length) return args.candles;
  if (args.data) return getHistoricalCandles(args.data);
  throw new Error("Provide either `candles` (array) or `data` (getHistoricalCandles spec).");
}

function expandGrid(grid) {
  const keys = Object.keys(grid || {});
  if (!keys.length) return [{}];
  return keys.reduce(
    (acc, key) => acc.flatMap((base) => grid[key].map((v) => ({ ...base, [key]: v }))),
    [{}]
  );
}

export const researchTools = {
  list_strategies: {
    description: "List built-in trading strategies with their tunable parameters.",
    handler: async () => ({ strategies: listStrategies() }),
  },

  fetch_candles: {
    description: "Download/caches OHLCV candles from Yahoo or CSV. Returns a compact summary.",
    handler: async (args) => {
      const candles = await getHistoricalCandles(args);
      return {
        count: candles.length,
        first: candles[0] ?? null,
        last: candles[candles.length - 1] ?? null,
      };
    },
  },

  run_backtest: {
    description:
      "Run a single backtest using a named strategy + params. Returns a metrics summary and a small trade preview (no replay).",
    handler: async (args) => {
      const candles = await resolveCandles(args);
      const factory = getStrategy(args.strategy);
      const signal = factory(args.params || {});
      const result = backtest({
        candles,
        symbol: args.symbol ?? "UNKNOWN",
        interval: args.interval,
        signal,
        collectReplay: false,
        ...(args.backtestOptions || {}),
      });
      return {
        symbol: result.symbol,
        interval: result.interval,
        metrics: summarizeMetrics(result.metrics),
        tradesPreview: result.positions.slice(0, 10).map((p) => ({
          side: p.side,
          entry: p.entryFill ?? p.entry,
          exit: p.exit.price,
          pnl: p.exit.pnl,
          reason: p.exit.reason,
        })),
      };
    },
  },

  walk_forward: {
    description:
      "Walk-forward optimize a named strategy over a parameter grid. Returns out-of-sample metrics and winner stability.",
    handler: async (args) => {
      const candles = await resolveCandles(args);
      const factory = getStrategy(args.strategy);
      const wf = walkForwardOptimize({
        candles,
        mode: args.mode ?? "rolling",
        trainBars: args.trainBars,
        testBars: args.testBars,
        stepBars: args.stepBars ?? args.testBars,
        scoreBy: args.scoreBy ?? "profitFactor",
        parameterSets: expandGrid(args.grid),
        signalFactory: (params) => factory(params),
        backtestOptions: {
          interval: args.interval,
          collectReplay: false,
          ...(args.backtestOptions || {}),
        },
      });
      return {
        windows: wf.windows.length,
        metrics: summarizeMetrics(wf.metrics),
        stability: wf.bestParamsSummary,
        windowSummaries: wf.windows.map((w) => ({
          bestParams: w.bestParams,
          oosTrades: w.oosTrades,
          profitable: w.profitable,
          stabilityScore: w.stabilityScore,
        })),
      };
    },
  },
};

export const mcpTools = { ...researchTools, ...liveTools };
