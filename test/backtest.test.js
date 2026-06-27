import test from "node:test";
import assert from "node:assert/strict";

import {
  backtest,
  backtestTicks,
  backtestPortfolio,
  buildMetrics,
  calculatePositionSize,
  walkForwardOptimize,
} from "../src/index.js";
import { BIG_NUMBER } from "../src/metrics/finite.js";

function buildCandles(count = 20) {
  const start = Date.UTC(2025, 0, 2, 14, 30, 0);
  return Array.from({ length: count }, (_, index) => ({
    time: start + index * 5 * 60 * 1000,
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100.5 + index,
    volume: 1000 + index,
  }));
}

test("backtest normalizes easy-mode signals and returns completed positions", () => {
  const candles = buildCandles();

  const result = backtest({
    candles,
    warmupBars: 1,
    flattenAtClose: false,
    collectEqSeries: false,
    collectReplay: false,
    signal({ index, bar }) {
      if (index !== 1) return null;
      return {
        side: "buy",
        stop: bar.close - 1,
        rr: 2,
      };
    },
  });

  assert.equal(result.positions.length, 1);
  assert.equal(result.positions[0].side, "long");
  assert.equal(result.trades.length, 2);
  assert.ok(Number.isFinite(result.positions[0].takeProfit));
});

test("backtest strict mode throws on direct lookahead access", () => {
  const candles = buildCandles();

  assert.throws(() => {
    backtest({
      candles,
      warmupBars: 1,
      strict: true,
      collectEqSeries: false,
      collectReplay: false,
      signal({ candles: history, index, bar }) {
        void history[index + 1];
        return {
          side: "buy",
          stop: bar.close - 1,
          rr: 2,
        };
      },
    });
  }, /strict mode: signal\(\) tried to access candles\[2\]/);
});

test("backtest supports richer execution cost modeling", () => {
  const candles = buildCandles(8);
  const baseOptions = {
    candles,
    warmupBars: 1,
    flattenAtClose: false,
    collectEqSeries: false,
    collectReplay: false,
    signal({ index, bar }) {
      if (index !== 1) return null;
      return {
        side: "buy",
        entry: bar.close,
        stop: bar.close - 1,
        rr: 2,
      };
    },
  };

  const noCosts = backtest(baseOptions);
  const withCosts = backtest({
    ...baseOptions,
    costs: {
      spreadBps: 4,
      slippageBps: 3,
      commissionBps: 2,
      commissionPerOrder: 1,
      minCommission: 1,
    },
  });

  assert.equal(noCosts.positions.length, 1);
  assert.equal(withCosts.positions.length, 1);
  assert.ok(withCosts.metrics.finalEquity < noCosts.metrics.finalEquity);
});

test("backtestPortfolio aggregates multiple systems into one result", () => {
  const candlesA = buildCandles(8);
  const candlesB = buildCandles(8).map((bar, index) => ({
    ...bar,
    time: bar.time + 60_000,
    open: bar.open + 50,
    high: bar.high + 50,
    low: bar.low + 50,
    close: bar.close + 50,
    volume: 2_000 + index,
  }));

  function strategy({ index, bar }) {
    if (index !== 1) return null;
    return {
      side: "buy",
      entry: bar.close,
      stop: bar.close - 1,
      rr: 2,
    };
  }

  const result = backtestPortfolio({
    equity: 10_000,
    systems: [
      {
        symbol: "AAA",
        candles: candlesA,
        signal: strategy,
        warmupBars: 1,
        flattenAtClose: false,
        collectReplay: false,
      },
      {
        symbol: "BBB",
        candles: candlesB,
        signal: strategy,
        warmupBars: 1,
        flattenAtClose: false,
        collectReplay: false,
      },
    ],
  });

  assert.equal(result.systems.length, 2);
  assert.equal(result.positions.length, 2);
  assert.ok(result.metrics.finalEquity > 10_000);
  assert.ok(result.eqSeries.length > 0);
});

test("backtestPortfolio threads interval into aggregate metrics", () => {
  const candles = buildCandles(8);
  const result = backtestPortfolio({
    equity: 10_000,
    interval: "1d",
    systems: [
      {
        symbol: "AAA",
        interval: "1d",
        candles,
        warmupBars: 1,
        flattenAtClose: false,
        signal({ index, bar }) {
          if (index !== 1) return null;
          return { side: "buy", entry: bar.close, stop: bar.close - 1, rr: 2 };
        },
      },
    ],
  });

  assert.equal(result.interval, "1d");
  assert.equal(result.metrics.annualizationPeriods, 252);
});

test("backtestPortfolio sizes later systems against live shared equity and capital caps", () => {
  const candles = [
    { time: Date.UTC(2025, 0, 2, 14, 30), open: 100, high: 100, low: 100, close: 100 },
    { time: Date.UTC(2025, 0, 2, 14, 35), open: 100, high: 100, low: 100, close: 100 },
    { time: Date.UTC(2025, 0, 2, 14, 40), open: 100, high: 100, low: 89, close: 90 },
    { time: Date.UTC(2025, 0, 2, 14, 45), open: 100, high: 100, low: 100, close: 100 },
    { time: Date.UTC(2025, 0, 2, 14, 50), open: 100, high: 111, low: 100, close: 110 },
  ];

  const result = backtestPortfolio({
    equity: 1_000,
    collectReplay: false,
    maxDailyLossPct: 0,
    systems: [
      {
        symbol: "AAA",
        candles,
        warmupBars: 1,
        flattenAtClose: false,
        scaleOutAtR: 0,
        maxLeverage: 1,
        qtyStep: 0.01,
        signal({ index }) {
          if (index !== 1) return null;
          return { side: "buy", entry: 100, stop: 90, rr: 1, qty: 5 };
        },
      },
      {
        symbol: "BBB",
        candles,
        warmupBars: 1,
        flattenAtClose: false,
        scaleOutAtR: 0,
        maxLeverage: 1,
        qtyStep: 0.01,
        signal({ index }) {
          if (index !== 3) return null;
          return { side: "buy", entry: 100, stop: 90, rr: 1, qty: 5 };
        },
      },
    ],
  });

  assert.equal(result.positions.length, 2);
  assert.equal(result.positions[0].size, 5);
  assert.ok(Math.abs(result.positions[1].size - 4.74) < 0.01);
  assert.ok(result.eqSeries.some((point) => point.lockedCapital > 0));
  assert.ok(result.eqSeries.every((point) => "availableCapital" in point));
});

test("backtestPortfolio halts all systems after a portfolio daily loss breach", () => {
  const candles = [
    { time: Date.UTC(2025, 0, 2, 14, 30), open: 100, high: 100, low: 100, close: 100 },
    { time: Date.UTC(2025, 0, 2, 14, 35), open: 100, high: 100, low: 100, close: 100 },
    { time: Date.UTC(2025, 0, 2, 14, 40), open: 100, high: 100, low: 89, close: 89 },
    { time: Date.UTC(2025, 0, 2, 14, 45), open: 100, high: 100, low: 100, close: 100 },
    { time: Date.UTC(2025, 0, 2, 14, 50), open: 100, high: 110, low: 100, close: 110 },
  ];

  const result = backtestPortfolio({
    equity: 1_000,
    maxDailyLossPct: 5,
    collectReplay: false,
    systems: [
      {
        symbol: "AAA",
        candles,
        warmupBars: 1,
        flattenAtClose: false,
        scaleOutAtR: 0,
        maxLeverage: 1,
        qtyStep: 0.01,
        signal({ index }) {
          if (index !== 1) return null;
          return { side: "buy", entry: 100, stop: 90, rr: 1, qty: 5 };
        },
      },
      {
        symbol: "BBB",
        candles,
        warmupBars: 1,
        flattenAtClose: false,
        scaleOutAtR: 0,
        maxLeverage: 1,
        qtyStep: 0.01,
        signal({ index }) {
          if (index !== 3) return null;
          return { side: "buy", entry: 100, stop: 90, rr: 1, qty: 5 };
        },
      },
    ],
  });

  assert.equal(result.positions.length, 1);
  assert.equal(result.positions[0].symbol, "AAA");
});

test("walkForwardOptimize picks the best parameter set per window", () => {
  const candles = buildCandles(24);
  const result = walkForwardOptimize({
    candles,
    trainBars: 10,
    testBars: 4,
    stepBars: 4,
    scoreBy: "expectancy",
    backtestOptions: {
      warmupBars: 1,
      flattenAtClose: false,
      collectReplay: false,
      scaleOutAtR: 0,
    },
    parameterSets: [{ holdBars: 1 }, { holdBars: 2 }],
    signalFactory(params) {
      let entered = false;
      return ({ bar }) => {
        if (entered) return null;
        entered = true;
        return {
          side: "buy",
          entry: bar.close,
          stop: bar.close - 1,
          rr: 100,
          _maxBarsInTrade: params.holdBars,
        };
      };
    },
  });

  assert.ok(result.windows.length >= 2);
  assert.deepEqual(result.windows[0].bestParams, { holdBars: 2 });
  assert.ok(result.metrics.finalEquity > 10_000);
});

test("walkForwardOptimize supports anchored mode and surfaces stability summaries", () => {
  const candles = buildCandles(28);
  const result = walkForwardOptimize({
    candles,
    trainBars: 8,
    testBars: 4,
    stepBars: 4,
    mode: "anchored",
    scoreBy: "expectancy",
    backtestOptions: {
      warmupBars: 1,
      flattenAtClose: false,
      collectReplay: false,
      scaleOutAtR: 0,
    },
    parameterSets: [{ holdBars: 1 }, { holdBars: 2 }],
    signalFactory(params) {
      let entered = false;
      return ({ bar }) => {
        if (entered) return null;
        entered = true;
        return {
          side: "buy",
          entry: bar.close,
          stop: bar.close - 1,
          rr: 100,
          _maxBarsInTrade: params.holdBars,
        };
      };
    },
  });

  assert.ok(result.windows.length >= 2);
  assert.equal(result.windows[0].train.start, candles[0].time);
  assert.equal(result.windows[1].train.start, candles[0].time);
  assert.equal(result.windows[0].oosTrades > 0, true);
  assert.equal(result.windows[0].profitable, true);
  assert.equal(result.windows[0].stabilityScore, 1);
  assert.equal(result.bestParamsSummary.adjacentRepeatRate, 1);
  assert.deepEqual(result.bestParams.winners[0], { holdBars: 2 });
});

test("backtestTicks fills market orders on the next tick and stop orders with stop slippage", () => {
  const ticks = [
    { time: Date.UTC(2025, 0, 2, 14, 30), price: 100 },
    { time: Date.UTC(2025, 0, 2, 14, 30, 1), price: 101 },
    { time: Date.UTC(2025, 0, 2, 14, 30, 2), bid: 98.5, ask: 99.5, low: 98.5, high: 99.5 },
  ];

  const result = backtestTicks({
    ticks,
    equity: 10_000,
    collectReplay: false,
    costs: {
      slippageByKind: { stop: 50 },
    },
    signal({ index, bar }) {
      if (index !== 0) return null;
      return {
        side: "buy",
        stop: bar.close - 1,
        rr: 10,
        qty: 1,
      };
    },
  });

  assert.equal(result.positions.length, 1);
  assert.equal(result.positions[0].entry, 101);
  assert.equal(result.positions[0].openTime, ticks[1].time);
  assert.equal(result.positions[0].exit.reason, "SL");
  assert.ok(result.positions[0].exit.price < 100);
});

test("backtestTicks models queue-position fill probability for limit orders", () => {
  const ticks = [
    { time: Date.UTC(2025, 0, 2, 14, 30), price: 100 },
    { time: Date.UTC(2025, 0, 2, 14, 30, 1), low: 99, high: 100, bid: 99, ask: 100 },
    { time: Date.UTC(2025, 0, 2, 14, 30, 2), price: 101 },
  ];

  const sharedOptions = {
    ticks,
    equity: 10_000,
    collectReplay: false,
    signal({ index }) {
      if (index !== 0) return null;
      return {
        side: "buy",
        entry: 99,
        stop: 98,
        rr: 2,
        qty: 1,
      };
    },
  };

  const filled = backtestTicks({
    ...sharedOptions,
    queueFillProbability: 1,
  });
  const skipped = backtestTicks({
    ...sharedOptions,
    queueFillProbability: 0,
  });

  assert.equal(filled.positions.length, 1);
  assert.equal(skipped.positions.length, 0);
});

test("backtest surfaces signal callback errors with bar context", () => {
  const candles = buildCandles(6);
  assert.throws(() => {
    backtest({
      candles,
      warmupBars: 1,
      collectEqSeries: false,
      collectReplay: false,
      signal() {
        throw new Error("boom");
      },
    });
  }, /signal\(\) threw at index=1, time=.*symbol=UNKNOWN: boom/);
});

test("backtest returns openPositions when data ends with an active trade", () => {
  const candles = buildCandles(5);
  const result = backtest({
    candles,
    warmupBars: 1,
    flattenAtClose: false,
    collectEqSeries: false,
    collectReplay: false,
    signal({ index, bar }) {
      if (index !== 1) return null;
      return {
        side: "buy",
        entry: bar.close,
        stop: bar.close - 100,
        takeProfit: bar.close + 1_000,
        qty: 1,
      };
    },
  });

  assert.equal(result.positions.length, 0);
  assert.equal(result.openPositions.length, 1);
  assert.equal(result.openPositions[0].side, "long");
  assert.ok(Number.isFinite(result.openPositions[0].unrealizedPnl));
});

test("backtestTicks surfaces signal callback errors with tick context", () => {
  const ticks = [
    { time: Date.UTC(2025, 0, 2, 14, 30), price: 100 },
    { time: Date.UTC(2025, 0, 2, 14, 31), price: 101 },
  ];

  assert.throws(() => {
    backtestTicks({
      ticks,
      collectReplay: false,
      signal() {
        throw new Error("tick-boom");
      },
    });
  }, /signal\(\) threw at index=0, time=.*symbol=UNKNOWN: tick-boom/);
});

test("walkForwardOptimize throws when window config yields no train/test windows", () => {
  const candles = buildCandles(10);
  assert.throws(() => {
    walkForwardOptimize({
      candles,
      trainBars: 8,
      testBars: 4,
      stepBars: 2,
      parameterSets: [{ a: 1 }],
      signalFactory() {
        return () => null;
      },
    });
  }, /produced zero windows/);
});

test("backtestPortfolio supports deterministic shuffled system ordering", () => {
  const candles = buildCandles(8);
  const systems = [
    {
      symbol: "AAA",
      candles,
      warmupBars: 1,
      collectReplay: false,
      flattenAtClose: false,
      signal({ index, bar }) {
        if (index !== 1) return null;
        return { side: "buy", entry: bar.close, stop: bar.close - 1, rr: 1, qty: 1 };
      },
    },
    {
      symbol: "BBB",
      candles,
      warmupBars: 1,
      collectReplay: false,
      flattenAtClose: false,
      signal({ index, bar }) {
        if (index !== 1) return null;
        return { side: "buy", entry: bar.close, stop: bar.close - 1, rr: 1, qty: 1 };
      },
    },
  ];

  const first = backtestPortfolio({
    systems,
    processingOrder: "shuffle",
    shuffleSeed: 7,
  });
  const second = backtestPortfolio({
    systems,
    processingOrder: "shuffle",
    shuffleSeed: 7,
  });

  assert.equal(first.metrics.finalEquity, second.metrics.finalEquity);
});

test("buildMetrics caps profitFactor when there are no losing trades", () => {
  const trade = {
    side: "long",
    entry: 100,
    stop: 99,
    takeProfit: 101,
    size: 1,
    openTime: Date.UTC(2025, 0, 2, 14, 30),
    exit: {
      price: 101,
      time: Date.UTC(2025, 0, 2, 14, 35),
      reason: "TP",
      pnl: 10,
    },
    _initRisk: 1,
  };

  const metrics = buildMetrics({
    closed: [trade],
    equityStart: 1_000,
    equityFinal: 1_010,
    candles: buildCandles(2),
    estBarMs: 60_000,
    eqSeries: [
      { time: trade.openTime, timestamp: trade.openTime, equity: 1_000 },
      { time: trade.exit.time, timestamp: trade.exit.time, equity: 1_010 },
    ],
  });

  assert.equal(Number.isFinite(metrics.profitFactor), true);
  assert.equal(metrics.profitFactor, BIG_NUMBER);
});

test("calculatePositionSize returns zero for non-positive equity", () => {
  const originalWarn = console.warn;
  let warningCount = 0;
  console.warn = () => {
    warningCount += 1;
  };

  try {
    const first = calculatePositionSize({
      equity: 0,
      entry: 100,
      stop: 99,
    });
    const second = calculatePositionSize({
      equity: -100,
      entry: 100,
      stop: 99,
    });
    assert.equal(first, 0);
    assert.equal(second, 0);
    assert.equal(warningCount, 1);
  } finally {
    console.warn = originalWarn;
  }
});

test("backtest result metrics expose sharpeAnnualized", () => {
  const candles = buildCandles();
  const result = backtest({
    candles,
    interval: "5m",
    warmupBars: 1,
    flattenAtClose: false,
    signal({ index, bar }) {
      if (index !== 1) return null;
      return { side: "buy", stop: bar.close - 1, rr: 2 };
    },
  });
  assert.equal("sharpeAnnualized" in result.metrics, true);
  assert.equal(result.metrics.annualizationPeriods, 252 * 6.5 * 12); // 5m
});

test("backtest forwards benchmarkReturns into metrics.benchmark", () => {
  // Build candles spanning multiple days so dailyReturnsSeries is non-trivial.
  // 20 bars at 1d intervals => up to ~20 daily buckets; benchmark must match.
  const dayMs = 24 * 60 * 60 * 1000;
  const start = Date.UTC(2025, 0, 2, 14, 30, 0);
  const dailyCandles = Array.from({ length: 20 }, (_, index) => ({
    time: start + index * dayMs,
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100.5 + index,
    volume: 1000 + index,
  }));
  const result = backtest({
    candles: dailyCandles,
    interval: "1d",
    warmupBars: 1,
    flattenAtClose: false,
    benchmarkReturns: Array.from({ length: 20 }, () => 0.001),
    signal({ index, bar }) {
      if (index !== 1) return null;
      return { side: "buy", stop: bar.close - 1, rr: 2 };
    },
  });
  assert.equal(typeof result.metrics.benchmark, "object");
  assert.equal(result.metrics.benchmark.beta !== null, true);
});
