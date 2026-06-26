// test/ta/trend.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { supertrend, vwap } from "../../src/ta/trend.js";

test("supertrend marks an uptrend (dir=1) on a rising series", () => {
  const bars = Array.from({ length: 40 }, (_, i) => ({
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
  }));
  const out = supertrend(bars, 10, 3);
  assert.equal(out.direction.length, bars.length);
  assert.equal(out.direction[39], 1);
  assert.ok(out.line[39] < bars[39].close); // support trails below price
});

test("vwap resets each UTC day and lies within the day's range", () => {
  const day1 = Date.UTC(2025, 0, 2, 14, 30);
  const day2 = Date.UTC(2025, 0, 3, 14, 30);
  const bars = [
    { time: day1, high: 102, low: 98, close: 100, volume: 10 },
    { time: day1 + 60000, high: 104, low: 100, close: 103, volume: 30 },
    { time: day2, high: 50, low: 48, close: 49, volume: 5 },
  ];
  const out = vwap(bars);
  assert.equal(out.length, 3);
  assert.ok(out[1] >= 98 && out[1] <= 104);
  // day2 resets: vwap equals the typical price of the single day-2 bar
  assert.ok(Math.abs(out[2] - (50 + 48 + 49) / 3) < 1e-9);
});
