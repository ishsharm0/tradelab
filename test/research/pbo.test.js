import test from "node:test";
import assert from "node:assert/strict";
import { combinations } from "../../src/research/combinations.js";
import { probabilityOfBacktestOverfitting } from "../../src/research/pbo.js";

test("combinations(4,2) yields 6 unique index pairs", () => {
  const combos = combinations(4, 2);
  assert.equal(combos.length, 6);
  assert.deepEqual(combos[0], [0, 1]);
});

test("a single dominant strategy gives low PBO", () => {
  const obs = 8;
  const winner = Array.from({ length: obs }, () => 5);
  const loser1 = Array.from({ length: obs }, (_, i) => (i % 2 ? 1 : -1));
  const loser2 = Array.from({ length: obs }, (_, i) => (i % 3 ? 0.5 : -0.5));
  const out = probabilityOfBacktestOverfitting([winner, loser1, loser2], { groups: 4 });
  assert.ok(out.pbo <= 0.25);
  assert.equal(out.combos > 0, true);
});

test("noise strategies give PBO near 0.5", () => {
  const obs = 12;
  const mk = (seed) => Array.from({ length: obs }, (_, i) => Math.sin(seed * 7.1 + i * 1.3));
  const matrix = [mk(1), mk(2), mk(3), mk(4), mk(5)];
  const out = probabilityOfBacktestOverfitting(matrix, { groups: 6 });
  assert.ok(out.pbo >= 0.2 && out.pbo <= 0.8);
});
