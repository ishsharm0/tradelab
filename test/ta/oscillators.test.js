// test/ta/oscillators.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { rsi, stochastic, macd } from "../../src/ta/oscillators.js";

test("rsi of a strictly rising series approaches 100", () => {
  const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
  const out = rsi(closes, 14);
  assert.equal(out.length, closes.length);
  assert.equal(out[5], undefined); // warmup
  assert.ok(out[29] > 99);
});

test("rsi of a strictly falling series approaches 0", () => {
  const closes = Array.from({ length: 30 }, (_, i) => 100 - i);
  const out = rsi(closes, 14);
  assert.ok(out[29] < 1);
});

test("macd returns aligned macd/signal/histogram arrays", () => {
  const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5);
  const out = macd(closes, 12, 26, 9);
  assert.equal(out.macd.length, closes.length);
  assert.equal(out.signal.length, closes.length);
  assert.equal(out.histogram.length, closes.length);
  assert.ok(Number.isFinite(out.macd[59]));
});

test("stochastic %K stays within [0,100]", () => {
  const bars = Array.from({ length: 40 }, (_, i) => ({
    high: 101 + Math.sin(i),
    low: 99 + Math.sin(i),
    close: 100 + Math.sin(i) * 0.5,
  }));
  const out = stochastic(bars, 14, 3);
  const k = out.k[39];
  assert.ok(k >= 0 && k <= 100);
  assert.equal(out.d.length, bars.length);
});
