import test from "node:test";
import assert from "node:assert/strict";

import { RiskManager } from "../../src/live/engine/riskManager.js";

test("RiskManager halts after daily loss threshold", () => {
  const risk = new RiskManager({ maxDailyLossPct: 1 });
  const now = Date.UTC(2025, 0, 2, 14, 30);
  risk.initialize(10_000, now);
  risk.recordTrade({ pnl: -150, timeMs: now + 1000, equity: 9850 });
  const decision = risk.canTrade({ timeMs: now + 2000 });
  assert.equal(decision.ok, false);
});

test("RiskManager blocks trades outside allowed windows", () => {
  const risk = new RiskManager({
    allowedSessions: "AUTO",
    allowedWindows: "10:00-10:30",
  });
  const outside = Date.UTC(2025, 0, 2, 14, 45); // 09:45 ET
  risk.initialize(1000, outside);
  const decision = risk.canTrade({ timeMs: outside });
  assert.equal(decision.ok, false);
});

test("RiskManager enforces max positions and max daily trades", () => {
  const risk = new RiskManager({ maxPositions: 1, maxDailyTrades: 1 });
  const now = Date.UTC(2025, 0, 2, 14, 30);
  risk.initialize(10_000, now);
  const first = risk.canOpenPosition({ timeMs: now, positionCount: 0, positionValue: 1000 });
  assert.equal(first.ok, true);
  risk.recordTrade({ pnl: 10, timeMs: now + 1000, equity: 10_010 });
  const second = risk.canOpenPosition({
    timeMs: now + 2000,
    positionCount: 0,
    positionValue: 1000,
  });
  assert.equal(second.ok, false);
});
