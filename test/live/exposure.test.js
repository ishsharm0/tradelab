// test/live/exposure.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { RiskManager } from "../../src/live/engine/riskManager.js";

// A timestamp that falls within the US regular market session (14:30 UTC = 09:30 ET)
const MARKET_OPEN = Date.UTC(2025, 0, 2, 14, 30);

test("canOpenPosition rejects when gross exposure cap is exceeded", () => {
  const rm = new RiskManager({ maxGrossExposurePct: 100 });
  rm.initialize(10_000, MARKET_OPEN);
  const res = rm.canOpenPosition({ timeMs: MARKET_OPEN, grossExposure: 12_000, equity: 10_000 });
  assert.equal(res.ok, false);
  assert.match(res.reason, /exposure/i);
});

test("canOpenPosition allows within the exposure cap", () => {
  const rm = new RiskManager({ maxGrossExposurePct: 200 });
  rm.initialize(10_000, MARKET_OPEN);
  const res = rm.canOpenPosition({ timeMs: MARKET_OPEN, grossExposure: 12_000, equity: 10_000 });
  assert.equal(res.ok, true);
});

test("canOpenPosition rejects when net exposure cap is exceeded", () => {
  const rm = new RiskManager({ maxNetExposurePct: 100 });
  rm.initialize(10_000, MARKET_OPEN);
  const res = rm.canOpenPosition({ timeMs: MARKET_OPEN, netExposure: 12_000, equity: 10_000 });
  assert.equal(res.ok, false);
  assert.match(res.reason, /exposure/i);
});

test("exposure caps default to 0 (disabled), allowing all positions", () => {
  const rm = new RiskManager({});
  rm.initialize(10_000, MARKET_OPEN);
  // With defaults, massive exposure should still pass
  const res = rm.canOpenPosition({ timeMs: MARKET_OPEN, grossExposure: 999_999, netExposure: 999_999, equity: 10_000 });
  assert.equal(res.ok, true);
});
