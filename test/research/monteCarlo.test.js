import test from "node:test";
import assert from "node:assert/strict";
import { monteCarlo } from "../../src/research/monteCarlo.js";

test("monteCarlo returns ordered percentile bands and is seed-deterministic", () => {
  const pnls = [10, -5, 8, -3, 12, -7, 6, -2, 9, -4];
  const a = monteCarlo({ tradePnls: pnls, equityStart: 1000, iterations: 500, seed: 42 });
  const b = monteCarlo({ tradePnls: pnls, equityStart: 1000, iterations: 500, seed: 42 });

  assert.deepEqual(a.finalEquity, b.finalEquity);
  assert.ok(a.finalEquity.p5 <= a.finalEquity.p50);
  assert.ok(a.finalEquity.p50 <= a.finalEquity.p95);
  assert.ok(a.maxDrawdown.p95 >= a.maxDrawdown.p50);
  assert.equal(a.iterations, 500);
});

test("monteCarlo with block bootstrap preserves autocorrelation length option", () => {
  const pnls = Array.from({ length: 50 }, (_, i) => (i % 5 === 0 ? -8 : 3));
  const out = monteCarlo({
    tradePnls: pnls,
    equityStart: 1000,
    iterations: 200,
    blockSize: 5,
    seed: 1,
  });
  assert.equal(out.blockSize, 5);
  assert.ok(Number.isFinite(out.finalEquity.p50));
});

test("monteCarlo throws on empty pnls", () => {
  assert.throws(() => monteCarlo({ tradePnls: [], equityStart: 1000 }));
});

test("monteCarlo throws when iterations is not positive", () => {
  assert.throws(() => monteCarlo({ tradePnls: [1, -1], iterations: 0 }), /positive iterations/);
  assert.throws(() => monteCarlo({ tradePnls: [1, -1], iterations: -5 }), /positive iterations/);
});
