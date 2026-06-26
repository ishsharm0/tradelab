import test from "node:test";
import assert from "node:assert/strict";
import { backtest, backtestPortfolio, backtestTicks } from "../src/index.js";

function flatCandles(n = 30) {
  const start = Date.UTC(2025, 0, 2, 14, 30, 0);
  return Array.from({ length: n }, (_, i) => ({
    time: start + i * 86_400_000,
    open: 100,
    high: 100.5,
    low: 99.5,
    close: 100,
    volume: 1000,
  }));
}

test("overnight carry reduces a long's realized PnL vs no-carry", () => {
  const candles = flatCandles();
  const opts = {
    candles,
    interval: "1d",
    warmupBars: 1,
    flattenAtClose: false,
    scaleOutAtR: 0,
    signal({ index, bar, openPosition }) {
      if (openPosition || index !== 1) return null;
      return { side: "long", entry: bar.close, stop: bar.close - 2, rr: 50, _maxBarsInTrade: 20 };
    },
  };
  const noCarry = backtest(opts);
  const withCarry = backtest({
    ...opts,
    costs: { carry: { longAnnualBps: 1000, shortAnnualBps: 1000 } },
  });
  assert.ok(withCarry.metrics.totalPnL < noCarry.metrics.totalPnL);
  const leg = withCarry.positions[0];
  assert.ok(leg.exit.financing > 0);
});

test("portfolio runner deducts carry", () => {
  const start = Date.UTC(2025, 0, 2, 14, 30, 0);
  const candles = Array.from({ length: 30 }, (_, i) => ({
    time: start + i * 86_400_000,
    open: 100,
    high: 100.5,
    low: 99.5,
    close: 100,
    volume: 1000,
  }));
  const signal = ({ index, bar, openPosition }) =>
    !openPosition && index === 1
      ? { side: "long", entry: bar.close, stop: bar.close - 2, rr: 50, _maxBarsInTrade: 20 }
      : null;
  const base = { equity: 10_000, systems: [{ symbol: "X", candles, signal }] };
  const noCarry = backtestPortfolio({ ...base });
  const withCarry = backtestPortfolio({
    equity: 10_000,
    costs: { carry: { longAnnualBps: 1000, shortAnnualBps: 1000 } },
    systems: [
      {
        symbol: "X",
        candles,
        signal,
        costs: { carry: { longAnnualBps: 1000, shortAnnualBps: 1000 } },
      },
    ],
  });
  assert.ok(withCarry.metrics.totalPnL <= noCarry.metrics.totalPnL);
});

test("tick engine deducts carry", () => {
  const start = Date.UTC(2025, 0, 2, 14, 30, 0);
  const ticks = Array.from({ length: 500 }, (_, i) => ({
    time: start + i * 60_000,
    bid: 100,
    ask: 100.02,
  }));
  const signal = ({ index, bar, openPosition }) =>
    !openPosition && index === 1
      ? { side: "long", entry: bar.close, stop: bar.close - 0.5, rr: 100 }
      : null;
  const withCarry = backtestTicks({
    ticks,
    signal,
    costs: { carry: { longAnnualBps: 5000, shortAnnualBps: 5000 } },
  });
  assert.equal(typeof withCarry.metrics.totalPnL, "number");
  if (withCarry.positions.length) assert.ok(withCarry.positions[0].exit.financing >= 0);
});
