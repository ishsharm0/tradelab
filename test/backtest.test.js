import test from "node:test";
import assert from "node:assert/strict";

import {
  backtest,
  backtestPortfolio,
  walkForwardOptimize,
} from "../src/index.js";

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
      { symbol: "AAA", candles: candlesA, signal: strategy, warmupBars: 1, flattenAtClose: false, collectReplay: false },
      { symbol: "BBB", candles: candlesB, signal: strategy, warmupBars: 1, flattenAtClose: false, collectReplay: false },
    ],
  });

  assert.equal(result.systems.length, 2);
  assert.equal(result.positions.length, 2);
  assert.ok(result.metrics.finalEquity > 10_000);
  assert.ok(result.eqSeries.length > 0);
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
    },
    parameterSets: [{ holdBars: 1 }, { holdBars: 3 }],
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
  assert.deepEqual(result.windows[0].bestParams, { holdBars: 3 });
  assert.ok(result.metrics.finalEquity > 10_000);
});
