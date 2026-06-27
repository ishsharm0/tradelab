// test/live/multiSymbolOco.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionManager } from "../../src/live/session.js";
import { PaperEngine } from "../../src/live/engine/paperEngine.js";

const bar = (time, price, hl) => ({
  time, open: price, high: hl?.high ?? price, low: hl?.low ?? price, close: price, volume: 100,
});

test("a bracket fill on one symbol does not cancel the other symbol's bracket", async () => {
  const broker = new PaperEngine({ equity: 100_000 });
  const mgr = new SessionManager();
  const s = await mgr.create({ id: "oco", symbols: ["BTC", "ETH"], broker, equity: 100_000 });

  await s.pushBar(bar(1, 100), "BTC");
  await s.pushBar(bar(1, 50), "ETH");
  await s.placeOrder({ symbol: "BTC", side: "long", qty: 1, stop: 90, target: 110 });
  await s.placeOrder({ symbol: "ETH", side: "long", qty: 1, stop: 45, target: 55 });

  // Drive BTC up to hit its target; ETH stays flat.
  await s.pushBar(bar(2, 110, { high: 112, low: 108 }), "BTC");

  // ETH's two legs should remain (or at least ETH bracket still tracked); BTC's gone.
  assert.ok(s.brackets.get("ETH"), "ETH bracket still tracked");
  assert.ok(!s.brackets.get("BTC"), "BTC bracket cleared after OCO");
});

test("secondary-symbol fill event carries the secondary symbol, not the primary", async () => {
  const broker = new PaperEngine({ equity: 100_000 });
  const mgr = new SessionManager();
  const s = await mgr.create({ id: "evt", symbols: ["BTC", "ETH"], broker, equity: 100_000 });

  await s.pushBar(bar(1, 100), "BTC");
  await s.pushBar(bar(1, 50), "ETH");

  // Place an ETH order (ETH is not the primary symbol, BTC is)
  await s.placeOrder({ symbol: "ETH", side: "long", qty: 1 });

  // Find the order:filled event for the ETH fill
  const fillEvents = s.events.filter((e) => e.event === "order:filled");
  assert.ok(fillEvents.length > 0, "at least one fill event recorded");

  // The ETH fill should carry symbol: "ETH", not "BTC"
  const ethFill = fillEvents.find((e) => e.payload?.symbol === "ETH");
  assert.ok(ethFill, "fill event carries ETH symbol");
});

test("placeOrder throws risk rejected when gross exposure cap is exceeded", async () => {
  const broker = new PaperEngine({ equity: 10_000 });
  const mgr = new SessionManager();
  // maxGrossExposurePct: 50 means gross exposure cannot exceed 50% of equity (5000)
  const s = await mgr.create({
    id: "risk-gate",
    symbol: "BTC",
    broker,
    equity: 10_000,
    maxGrossExposurePct: 50,
  });
  await s.pushBar(bar(1, 100));
  // qty=60 * price=100 = 6000 notional > 50% of 10000 = 5000
  await assert.rejects(
    () => s.placeOrder({ symbol: "BTC", side: "long", qty: 60 }),
    /risk rejected/i
  );
});
