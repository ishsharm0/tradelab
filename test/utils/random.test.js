import test from "node:test";
import assert from "node:assert/strict";
import { makeRng, randInt } from "../../src/utils/random.js";

test("makeRng is deterministic for a given seed", () => {
  const a = makeRng("abc");
  const b = makeRng("abc");
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test("different seeds diverge", () => {
  const a = makeRng("abc");
  const b = makeRng("xyz");
  assert.notEqual(a(), b());
});

test("rng output is in [0,1) and randInt in [0,max)", () => {
  const rng = makeRng(7);
  for (let i = 0; i < 100; i += 1) {
    const v = rng();
    assert.ok(v >= 0 && v < 1);
    const n = randInt(rng, 5);
    assert.ok(Number.isInteger(n) && n >= 0 && n < 5);
  }
});
