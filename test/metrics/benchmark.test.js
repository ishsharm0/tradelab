// test/metrics/benchmark.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { benchmarkStats } from "../../src/metrics/benchmark.js";

test("perfectly correlated 2x strategy has beta 2 and ~zero alpha", () => {
  const bench = [0.01, -0.02, 0.03, -0.01, 0.02];
  const strat = bench.map((r) => r * 2);
  const stats = benchmarkStats(strat, bench);
  assert.ok(Math.abs(stats.beta - 2) < 1e-9);
  assert.ok(Math.abs(stats.alpha) < 1e-9);
  assert.ok(Math.abs(stats.correlation - 1) < 1e-9);
});

test("mismatched lengths return null stats", () => {
  assert.equal(benchmarkStats([0.01], [0.01, 0.02]).beta, null);
});

test("empty inputs return null stats", () => {
  assert.equal(benchmarkStats([], []).beta, null);
});
