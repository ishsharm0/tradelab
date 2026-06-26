import test from "node:test";
import assert from "node:assert/strict";
import { backtest } from "../src/index.js";

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
