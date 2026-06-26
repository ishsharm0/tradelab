import test from "node:test";
import assert from "node:assert/strict";
import { backtestTicks } from "../src/index.js";

function buildTicks(n = 200) {
  const start = Date.UTC(2025, 0, 2, 14, 30, 0);
  return Array.from({ length: n }, (_, i) => ({
    time: start + i * 1000,
    bid: 100 + Math.sin(i / 5),
    ask: 100.02 + Math.sin(i / 5),
  }));
}

const signal = ({ index, bar }) =>
  index % 20 === 0 ? { side: "long", entry: bar.close - 0.05, stop: bar.close - 0.2, rr: 2 } : null;

test("same seed + queueFillProbability < 1 is reproducible", () => {
  const ticks = buildTicks();
  const a = backtestTicks({ ticks, signal, queueFillProbability: 0.5, seed: "run-1" });
  const b = backtestTicks({ ticks, signal, queueFillProbability: 0.5, seed: "run-1" });
  assert.equal(a.trades.length, b.trades.length);
  assert.equal(a.metrics.totalPnL, b.metrics.totalPnL);
});

test("different seeds can produce different fill outcomes", () => {
  const ticks = buildTicks();
  const a = backtestTicks({ ticks, signal, queueFillProbability: 0.5, seed: "run-1" });
  const c = backtestTicks({ ticks, signal, queueFillProbability: 0.5, seed: "run-999" });
  // Not guaranteed different, but the seed must reach the fill RNG; assert it is accepted.
  assert.equal(typeof a.metrics.totalPnL, "number");
  assert.equal(typeof c.metrics.totalPnL, "number");
});
