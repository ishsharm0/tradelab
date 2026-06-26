// test/metrics/annualize.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { periodsPerYear } from "../../src/metrics/annualize.js";

test("periodsPerYear maps common intervals to trading-period counts", () => {
  assert.equal(periodsPerYear("1d"), 252);
  assert.equal(periodsPerYear("1h"), 252 * 6.5);
  assert.equal(periodsPerYear("5m"), 252 * 6.5 * 12);
  assert.equal(periodsPerYear("1wk"), 52);
});

test("periodsPerYear falls back to estBarMs when interval is unknown", () => {
  // 1-hour bars in ms, 24/7 market assumption => 24*365 periods
  const oneHourMs = 60 * 60 * 1000;
  assert.equal(
    periodsPerYear("weird", oneHourMs),
    Math.round((365 * 24 * 60 * 60 * 1000) / oneHourMs)
  );
});

test("periodsPerYear returns 252 when nothing is resolvable", () => {
  assert.equal(periodsPerYear(undefined, undefined), 252);
});
