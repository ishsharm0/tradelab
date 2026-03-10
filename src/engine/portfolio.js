import { buildMetrics } from "../metrics/buildMetrics.js";
import { estimateBarMs, dayKeyET } from "./execution.js";
import { BarSystemRunner, defaultSystemCap } from "./barSystemRunner.js";

function asWeight(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function buildPortfolioPoint(time, equity, lockedCapital, availableCapital) {
  return {
    time,
    timestamp: time,
    equity,
    lockedCapital,
    availableCapital,
  };
}

function stableSystemOrder(left, right) {
  return left.index - right.index;
}

function combineReplay(systemResults, eqSeries, collectReplay) {
  if (!collectReplay) {
    return { frames: [], events: [] };
  }

  const events = systemResults
    .flatMap((entry) =>
      (entry.result.replay?.events || []).map((event) => ({
        ...event,
        symbol: event.symbol || entry.symbol,
      }))
    )
    .sort((left, right) => new Date(left.t).getTime() - new Date(right.t).getTime());

  const frames = eqSeries.map((point) => ({
    t: new Date(point.time).toISOString(),
    price: 0,
    equity: point.equity,
    posSide: null,
    posSize: 0,
    lockedCapital: point.lockedCapital,
    availableCapital: point.availableCapital,
  }));

  return { frames, events };
}

function portfolioState(runners, initialEquity) {
  let markedEquity = initialEquity;
  let lockedCapital = 0;

  for (const { runner, initialReferenceEquity } of runners) {
    markedEquity += runner.getMarkedEquity() - initialReferenceEquity;
    lockedCapital += runner.getLockedCapital();
  }

  return {
    markedEquity,
    lockedCapital,
    availableCapital: markedEquity - lockedCapital,
  };
}

function findNextTimeAndActive(runners) {
  let nextTime = Infinity;
  const active = [];

  for (const entry of runners) {
    const time = entry.runner.peekTime();
    if (time < nextTime) {
      nextTime = time;
      active.length = 0;
      active.push(entry);
      continue;
    }
    if (time === nextTime) {
      active.push(entry);
    }
  }

  return { nextTime, active };
}

function initialPortfolioTime(runners) {
  let time = Infinity;
  for (const { runner } of runners) {
    const next = runner.candles[0]?.time ?? Infinity;
    if (next < time) time = next;
  }
  return Number.isFinite(time) ? time : 0;
}

function resolveSystemCap(systemEntry, totalEquity) {
  return defaultSystemCap(
    Math.max(0, totalEquity),
    systemEntry.defaultCapPct,
    systemEntry.system.maxAllocation,
    systemEntry.system.maxAllocationPct
  );
}

function forceExitAll(runners, time) {
  for (const { runner } of runners) {
    if (!runner.open) continue;
    const price = runner.getMarkPrice();
    if (!Number.isFinite(price)) continue;
    runner.forceExit("PORTFOLIO_DAILY_LOSS", { time, close: price }, price);
  }
}

/**
 * Run multiple systems against a shared capital pool.
 *
 * Existing allocation weights are preserved as default per-system capital caps,
 * but capital is only locked when a fill actually occurs. Systems therefore
 * compete for the same remaining capital at fill time.
 */
export function backtestPortfolio({
  systems = [],
  equity = 10_000,
  allocation = "equal",
  collectEqSeries = true,
  collectReplay = false,
  maxDailyLossPct = 0,
} = {}) {
  if (!Array.isArray(systems) || systems.length === 0) {
    throw new Error("backtestPortfolio() requires a non-empty systems array");
  }

  const weights =
    allocation === "equal"
      ? systems.map(() => 1)
      : systems.map((system) => asWeight(system.weight || 0));
  const totalWeight = weights.reduce((sumValue, weight) => sumValue + weight, 0);

  if (!(totalWeight > 0)) {
    throw new Error("backtestPortfolio() requires positive allocation weights");
  }

  const runners = systems.map((system, index) => {
    const defaultCapPct = weights[index] / totalWeight;
    const initialReferenceEquity = equity * defaultCapPct;
    return {
      index,
      symbol: system.symbol ?? `system-${index + 1}`,
      system,
      defaultCapPct,
      initialReferenceEquity,
      runner: new BarSystemRunner({
        ...system,
        symbol: system.symbol ?? `system-${index + 1}`,
        equity: initialReferenceEquity,
        collectEqSeries,
        collectReplay,
      }),
    };
  });

  const eqSeries = collectEqSeries ? [] : [];
  let state = portfolioState(runners, equity);
  if (collectEqSeries) {
    eqSeries.push(
      buildPortfolioPoint(
        initialPortfolioTime(runners),
        state.markedEquity,
        state.lockedCapital,
        state.availableCapital
      )
    );
  }

  let currentDay = null;
  let dayStartEquity = equity;
  let portfolioHalted = false;

  while (true) {
    const { nextTime, active } = findNextTimeAndActive(runners);
    if (!Number.isFinite(nextTime)) break;
    active.sort(stableSystemOrder);

    const dayKey = dayKeyET(nextTime);
    if (currentDay === null || dayKey !== currentDay) {
      currentDay = dayKey;
      state = portfolioState(runners, equity);
      dayStartEquity = state.markedEquity;
      portfolioHalted = false;
    }

    for (const systemEntry of active) {
      state = portfolioState(runners, equity);
      const totalEquity = state.markedEquity;
      const availableCapital = Math.max(0, state.availableCapital);
      const systemLocked = systemEntry.runner.getLockedCapital();
      const systemCap = resolveSystemCap(systemEntry, totalEquity);
      const systemRemainingCapital = Math.max(0, systemCap - systemLocked);

      systemEntry.runner.step({
        signalEquity: totalEquity,
        canTrade: !portfolioHalted,
        resolveEntrySize({ desiredSize, entryPrice }) {
          const maxLeverage = Math.max(1, systemEntry.runner.options.maxLeverage || 1);
          const byAvailable = (availableCapital * maxLeverage) / Math.max(1e-12, Math.abs(entryPrice));
          const bySystemCap = (systemRemainingCapital * maxLeverage) / Math.max(1e-12, Math.abs(entryPrice));
          return Math.min(desiredSize, byAvailable, bySystemCap);
        },
      });

      state = portfolioState(runners, equity);
      if (
        !portfolioHalted &&
        maxDailyLossPct > 0 &&
        state.markedEquity <= dayStartEquity * (1 - Math.abs(maxDailyLossPct) / 100)
      ) {
        portfolioHalted = true;
        for (const { runner } of runners) runner.cancelPending();
        forceExitAll(runners, nextTime);
        state = portfolioState(runners, equity);
      }
    }

    if (collectEqSeries) {
      eqSeries.push(
        buildPortfolioPoint(
          nextTime,
          state.markedEquity,
          state.lockedCapital,
          state.availableCapital
        )
      );
    }
  }

  const systemResults = runners.map((entry) => ({
    symbol: entry.symbol,
    weight: entry.defaultCapPct,
    equity: entry.initialReferenceEquity,
    allocationCapPct: entry.defaultCapPct,
    allocationCap: resolveSystemCap(entry, equity),
    result: entry.runner.buildResult(),
  }));

  const trades = systemResults
    .flatMap((run) =>
      run.result.trades.map((trade) => ({
        ...trade,
        symbol: trade.symbol || run.symbol,
      }))
    )
    .sort((left, right) => left.exit.time - right.exit.time);
  const positions = systemResults
    .flatMap((run) =>
      run.result.positions.map((trade) => ({
        ...trade,
        symbol: trade.symbol || run.symbol,
      }))
    )
    .sort((left, right) => left.exit.time - right.exit.time);
  const replay = combineReplay(systemResults, eqSeries, collectReplay);
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
    systems: systemResults,
  };
}
