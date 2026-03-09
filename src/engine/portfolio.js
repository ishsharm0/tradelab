import { buildMetrics } from "../metrics/buildMetrics.js";
import { backtest } from "./backtest.js";
import { estimateBarMs } from "./execution.js";

function asWeight(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function combineEquitySeries(systemRuns, totalEquity) {
  const timeline = new Set();
  for (const run of systemRuns) {
    for (const point of run.result.eqSeries || []) {
      timeline.add(point.time);
    }
  }

  const times = [...timeline].sort((left, right) => left - right);
  if (!times.length) {
    return [{ time: 0, timestamp: 0, equity: totalEquity }];
  }

  const states = systemRuns.map((run) => ({
    points: run.result.eqSeries || [],
    index: 0,
    lastEquity: run.allocationEquity,
  }));

  return times.map((time) => {
    let equity = 0;
    states.forEach((state) => {
      while (
        state.index < state.points.length &&
        state.points[state.index].time <= time
      ) {
        state.lastEquity = state.points[state.index].equity;
        state.index += 1;
      }
      equity += state.lastEquity;
    });

    return { time, timestamp: time, equity };
  });
}

function combineReplay(systemRuns, eqSeries, collectReplay) {
  if (!collectReplay) {
    return { frames: [], events: [] };
  }

  const events = systemRuns
    .flatMap((run) =>
      (run.result.replay?.events || []).map((event) => ({
        ...event,
        symbol: event.symbol || run.symbol,
      }))
    )
    .sort((left, right) => new Date(left.t).getTime() - new Date(right.t).getTime());

  const frames = eqSeries.map((point) => ({
    t: new Date(point.time).toISOString(),
    price: 0,
    equity: point.equity,
    posSide: null,
    posSize: 0,
  }));

  return { frames, events };
}

/**
 * Run multiple symbol/system backtests and aggregate them into a portfolio view.
 *
 * Capital is allocated up front per system using weights. Each system then runs
 * through the normal single-symbol backtest engine and the portfolio result
 * aggregates trades, positions, equity, replay events, and metrics.
 */
export function backtestPortfolio({
  systems = [],
  equity = 10_000,
  allocation = "equal",
  collectEqSeries = true,
  collectReplay = false,
} = {}) {
  if (!Array.isArray(systems) || systems.length === 0) {
    throw new Error("backtestPortfolio() requires a non-empty systems array");
  }

  const weights =
    allocation === "equal"
      ? systems.map(() => 1)
      : systems.map((system) => asWeight(system.weight || 0));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  if (!(totalWeight > 0)) {
    throw new Error("backtestPortfolio() requires positive allocation weights");
  }

  const systemRuns = systems.map((system, index) => {
    const allocationEquity = equity * (weights[index] / totalWeight);
    const result = backtest({
      ...system,
      equity: allocationEquity,
      collectEqSeries,
      collectReplay,
    });

    return {
      symbol: system.symbol ?? result.symbol ?? `system-${index + 1}`,
      weight: weights[index],
      allocationEquity,
      result,
    };
  });

  const trades = systemRuns
    .flatMap((run) =>
      run.result.trades.map((trade) => ({
        ...trade,
        symbol: trade.symbol || run.symbol,
      }))
    )
    .sort((left, right) => left.exit.time - right.exit.time);
  const positions = systemRuns
    .flatMap((run) =>
      run.result.positions.map((trade) => ({
        ...trade,
        symbol: trade.symbol || run.symbol,
      }))
    )
    .sort((left, right) => left.exit.time - right.exit.time);
  const eqSeries = collectEqSeries ? combineEquitySeries(systemRuns, equity) : [];
  const replay = combineReplay(systemRuns, eqSeries, collectReplay);
  const allCandles = systems.flatMap((system) => system.candles || []);
  const orderedCandles = [...allCandles].sort((left, right) => left.time - right.time);
  const metrics = buildMetrics({
    closed: trades,
    equityStart: equity,
    equityFinal: eqSeries.length ? eqSeries[eqSeries.length - 1].equity : equity,
    candles: orderedCandles,
    estBarMs: estimateBarMs(orderedCandles),
    eqSeries,
  });

  return {
    symbol: "PORTFOLIO",
    interval: undefined,
    range: undefined,
    trades,
    positions,
    metrics,
    eqSeries,
    replay,
    systems: systemRuns.map((run) => ({
      symbol: run.symbol,
      weight: run.weight / totalWeight,
      equity: run.allocationEquity,
      result: run.result,
    })),
  };
}
