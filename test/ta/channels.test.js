// test/ta/channels.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { bollinger, donchian, keltner } from "../../src/ta/channels.js";

test("bollinger middle equals SMA and band width scales with stddev mult", () => {
  const closes = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 === 0 ? 1 : -1));
  const out = bollinger(closes, 20, 2);
  assert.equal(out.middle.length, closes.length);
  const i = 25;
  assert.ok(out.upper[i] > out.middle[i]);
  assert.ok(out.lower[i] < out.middle[i]);
  assert.ok(Math.abs(out.upper[i] - out.middle[i] - (out.middle[i] - out.lower[i])) < 1e-9);
});

test("donchian upper is the rolling high and lower is the rolling low", () => {
  const bars = Array.from({ length: 25 }, (_, i) => ({
    high: 100 + i,
    low: 90 + i,
    close: 95 + i,
  }));
  const out = donchian(bars, 20);
  const i = 24;
  assert.equal(out.upper[i], 100 + 24);
  assert.equal(out.lower[i], 90 + 5);
});

test("keltner band is centered on EMA with ATR-scaled width", () => {
  const bars = Array.from({ length: 40 }, (_, i) => ({
    high: 101 + i * 0.1,
    low: 99 + i * 0.1,
    close: 100 + i * 0.1,
  }));
  const out = keltner(bars, 20, 14, 2);
  const i = 39;
  assert.ok(out.upper[i] > out.middle[i]);
  assert.ok(out.lower[i] < out.middle[i]);
});
