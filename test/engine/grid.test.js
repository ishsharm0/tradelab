import test from "node:test";
import assert from "node:assert/strict";
import { grid } from "../../src/engine/grid.js";

test("grid expands a cartesian product in stable order", () => {
  const sets = grid({ fast: [3, 5], slow: [8, 13] });
  assert.equal(sets.length, 4);
  assert.deepEqual(sets[0], { fast: 3, slow: 8 });
  assert.deepEqual(sets[3], { fast: 5, slow: 13 });
});

test("grid of an empty spec yields a single empty set", () => {
  assert.deepEqual(grid({}), [{}]);
});

test("grid passes scalar (non-array) values through as fixed", () => {
  const sets = grid({ fast: [3, 5], rr: 2 });
  assert.equal(sets.length, 2);
  assert.equal(sets[0].rr, 2);
  assert.equal(sets[1].rr, 2);
});
