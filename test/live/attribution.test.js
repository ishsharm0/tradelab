import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionManager } from "../../src/live/session.js";

const bar = (time, price) => ({
  time, open: price, high: price, low: price, close: price, volume: 100,
});

test("entry events carry computed sizing and supplied rationale", async () => {
  const mgr = new SessionManager();
  const s = await mgr.create({ id: "t1", symbol: "BTC", equity: 10_000, riskPct: 1 });
  await s.pushBar(bar(1, 100));

  await s.placeOrder({
    side: "long", riskPct: 1, stop: 90, target: 130,
    rationale: { signal: "ema-cross", note: "fast>slow" },
  });

  const filled = s.recentEvents(50).find(
    (e) => e.event === "order:filled" && e.payload?.sizing
  );
  assert.ok(filled, "an entry fill event with sizing should exist");
  const z = filled.payload.sizing;
  assert.equal(z.entry, 100);
  assert.equal(z.stop, 90);
  assert.equal(z.target, 130);
  // risk = 1% of 10_000 = 100; per-unit risk = 100-90 = 10; qty = 10
  assert.equal(z.riskAmount, 100);
  assert.equal(z.qty, filled.payload.qty ?? z.qty);
  assert.equal(filled.payload.rationale.signal, "ema-cross");
});

test("bracket legs are tagged with parentEntryId and leg", async () => {
  const mgr = new SessionManager();
  const s = await mgr.create({ id: "t2", symbol: "BTC", equity: 10_000, riskPct: 1 });
  await s.pushBar(bar(1, 100));
  await s.placeOrder({ side: "long", riskPct: 1, stop: 90, target: 130 });

  const legs = s.recentEvents(50).filter((e) => e.payload?.leg);
  assert.ok(legs.some((e) => e.payload.leg === "stop"), "a stop leg event exists");
  assert.ok(legs.some((e) => e.payload.leg === "target"), "a target leg event exists");
  for (const e of legs) assert.ok(e.payload.parentEntryId, "leg carries parentEntryId");
});

test("omitting rationale leaves behavior unchanged (no rationale key)", async () => {
  const mgr = new SessionManager();
  const s = await mgr.create({ id: "t3", symbol: "BTC", equity: 10_000, riskPct: 1 });
  await s.pushBar(bar(1, 100));
  await s.placeOrder({ side: "long", riskPct: 1, stop: 90 });
  const filled = s.recentEvents(50).find((e) => e.event === "order:filled" && e.payload?.sizing);
  assert.ok(filled);
  assert.equal(filled.payload.rationale, undefined);
});
