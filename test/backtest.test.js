import test from "node:test";
import assert from "node:assert/strict";

import { backtest } from "../src/index.js";

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
