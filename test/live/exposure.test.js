// test/live/exposure.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { RiskManager } from "../../src/live/engine/riskManager.js";
import { TradingSession } from "../../src/live/session.js";
import { PaperEngine } from "../../src/live/engine/paperEngine.js";

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

// MUST-FIX 1: Open positions must be valued at their own entry price (avgEntry),
// not at the new order's price. This test would pass under the bug if both
// symbols had the same price (so the mis-valuation doesn't matter), but here
// the existing position entered at 200 while the new order is at 50. With the
// bug, the existing position would be valued at 50 (the new order's price),
// making the combined notional appear much smaller than it actually is.
//
// Setup: equity 10,000, maxGrossExposurePct 150% => cap at 15,000.
// Existing position: 50 qty @ avgEntry 200 => market value 10,000.
// New order: 50 qty @ 50 => new notional 2,500.
// Combined gross: 10,000 + 2,500 = 12,500 (within cap) ... wait, that's fine.
// We need combined to exceed cap. Let's use a tighter cap.
//
// Revised: equity 10,000, maxGrossExposurePct 100% => cap at 10,000.
// Existing position: 50 qty @ avgEntry 200 => market value 10,000.
// New order: 1 qty @ 50 => new notional 50.
// Combined gross: 10,000 + 50 = 10,050 -> EXCEEDS cap (10,000) => should reject.
// With the bug: existing position valued at 50 * 50 = 2,500 instead of 10,000
// Combined gross: 2,500 + 50 = 2,550 -> under cap => would wrongly allow.
test("placeOrder uses position avgEntry (not new-order price) when computing gross exposure", async () => {
  // equity 10,000; cap at 100% => 10,000 total gross exposure allowed
  const broker = new PaperEngine({ equity: 10_000 });
  await broker.connect();
  const session = new TradingSession({
    id: "exp-avgentry",
    symbols: ["AAPL", "MSFT"],
    broker,
    equity: 10_000,
    maxGrossExposurePct: 100, // cap = 10,000
    qtyStep: 1,
    minQty: 1,
  });
  await session.start();

  // Feed a high price for AAPL and open a position there
  // AAPL @ 200: buy 50 shares => notional 10,000 (fills entire cap)
  await session.pushBar({ time: 1, open: 200, high: 200, low: 200, close: 200, volume: 0 }, "AAPL");
  await session.placeOrder({ side: "long", qty: 50, symbol: "AAPL" });

  // Now feed a low price for MSFT
  // MSFT @ 50: new notional = 1 * 50 = 50
  // Existing AAPL position at avgEntry=200, qty=50 => pv=10,000 (from marketValue)
  // Combined gross = 10,000 + 50 = 10,050 > 10,000 cap => should reject
  //
  // With the bug: AAPL position mis-valued at 50 (new-order price) * 50 = 2,500
  // Combined gross = 2,500 + 50 = 2,550 => would NOT reject (bug lets it through)
  await session.pushBar({ time: 2, open: 50, high: 50, low: 50, close: 50, volume: 0 }, "MSFT");
  await assert.rejects(
    () => session.placeOrder({ side: "long", qty: 1, symbol: "MSFT" }),
    /risk rejected/,
    "placeOrder should reject when combined gross exposure (using correct avgEntry) exceeds cap"
  );
});
