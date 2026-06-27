import { test } from "node:test";
import assert from "node:assert/strict";
import { runPreset } from "../../src/cli/runPreset.js";

// ~60 synthetic candles: gently trending sine so ema-cross (fast=5, slow=15) fires
const candles = Array.from({ length: 60 }, (_, i) => {
  const p = 100 + Math.sin(i / 5) * 5 + i * 0.2;
  return { time: i, open: p, high: p + 1, low: p - 1, close: p, volume: 100 };
});

test("runPreset runs a builtin and returns metrics and a summary string", () => {
  const out = runPreset({ preset: "ema-cross", candles, params: { fast: 5, slow: 15 } });
  assert.ok(out.metrics);
  assert.equal(typeof out.summary, "string");
  assert.match(out.summary, /trades/);
});

test("runPreset summary includes a % figure proving units normalization (not n/a)", () => {
  const out = runPreset({ preset: "ema-cross", candles, params: { fast: 5, slow: 15 } });
  // If the units mapping were wrong (passing fractions as percents), totalReturnPct
  // would be undefined/null and summarize() would emit "n/a". Confirm it has a % sign.
  if (out.metrics.trades > 0) {
    assert.match(out.summary, /%/, "summary should contain a % figure when trades > 0");
  }
});

test("runPreset throws a clear error for an unknown preset", () => {
  assert.throws(() => runPreset({ preset: "nope", candles }), /unknown preset/i);
});
