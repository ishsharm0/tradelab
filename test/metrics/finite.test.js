// test/metrics/finite.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { clampFinite, BIG_NUMBER } from "../../src/metrics/finite.js";

test("clampFinite passes finite numbers through", () => {
  assert.equal(clampFinite(1.5), 1.5);
  assert.equal(clampFinite(0), 0);
  assert.equal(clampFinite(-3), -3);
});

test("clampFinite maps +Infinity to +BIG_NUMBER and -Infinity to -BIG_NUMBER", () => {
  assert.equal(clampFinite(Infinity), BIG_NUMBER);
  assert.equal(clampFinite(-Infinity), -BIG_NUMBER);
});

test("clampFinite maps NaN/undefined/null to the fallback (default 0)", () => {
  assert.equal(clampFinite(NaN), 0);
  assert.equal(clampFinite(undefined), 0);
  assert.equal(clampFinite(null), 0);
  assert.equal(clampFinite(NaN, -1), -1);
});
