// test/live/session.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { PaperEngine } from "../../src/live/engine/paperEngine.js";
import { TradingSession } from "../../src/live/session.js";

function bar(time, price, { high = price, low = price } = {}) {
  return { time, open: price, high, low, close: price, volume: 100 };
}

async function freshSession(opts = {}) {
  const broker = new PaperEngine({ equity: 10_000 });
  const session = new TradingSession({ id: "t1", symbol: "AAPL", interval: "1m", broker, equity: 10_000, ...opts });
  await session.start();
  return { broker, session };
}

test("market order opens a position and getStatus reflects it", async () => {
  const { session } = await freshSession();
  await session.pushBar(bar(1, 100));
  const receipt = await session.placeOrder({ side: "long", type: "market", qty: 10 });
  assert.equal(receipt.status, "filled");
  const status = session.getStatus();
  assert.equal(status.positions.length, 1);
  assert.equal(status.positions[0].side, "long");
  assert.equal(status.positions[0].qty, 10);
});

test("risk-based sizing: riskPct + stop derives qty from equity", async () => {
  const { session } = await freshSession();
  await session.pushBar(bar(1, 100));
  // risk 1% of 10k = $100; stop 2 below entry => qty ~= 50
  const receipt = await session.placeOrder({ side: "long", type: "market", riskPct: 1, stop: 98 });
  assert.equal(receipt.status, "filled");
  assert.ok(Math.abs(session.getStatus().positions[0].qty - 50) < 1); // qtyStep rounding
});

test("bracket: protective stop + target are placed after entry and OCO-cancel", async () => {
  const { session } = await freshSession();
  await session.pushBar(bar(1, 100));
  await session.placeOrder({ side: "long", type: "market", qty: 10, stop: 98, target: 104 });
  // two protective orders now open (stop + limit target)
  assert.equal(session.getStatus().openOrders.length, 2);
  // price runs to the target -> target fills, stop is canceled (OCO)
  await session.pushBar(bar(2, 104, { high: 104 }));
  const status = session.getStatus();
  assert.equal(status.positions.length, 0); // flat
  assert.equal(status.openOrders.length, 0); // sibling canceled
  assert.ok(status.equity > 10_000); // booked a winner
});

test("closePosition flattens via opposite market order", async () => {
  const { session } = await freshSession();
  await session.pushBar(bar(1, 100));
  await session.placeOrder({ side: "long", type: "market", qty: 10 });
  await session.pushBar(bar(2, 101));
  await session.closePosition();
  assert.equal(session.getStatus().positions.length, 0);
});

test("daily loss halt blocks new entries after the limit is breached", async () => {
  const { session } = await freshSession({ maxDailyLossPct: 1 });
  await session.pushBar(bar(1, 100));
  await session.placeOrder({ side: "long", type: "market", qty: 100, stop: 90 });
  // tank the price to realize a >1% loss, then flatten
  await session.pushBar(bar(2, 98));
  await session.closePosition();
  assert.equal(session.getStatus().risk.halted, true);
  await assert.rejects(() => session.placeOrder({ side: "long", type: "market", qty: 10 }));
});

test("live mode without gating throws", () => {
  const broker = new PaperEngine({ equity: 1000 });
  assert.throws(
    () => new TradingSession({ id: "x", symbol: "AAPL", broker, mode: "live" }),
    /live trading is gated/i
  );
});

// Task 2 tests
import { SessionManager } from "../../src/live/session.js";

test("SessionManager creates and tracks paper sessions", async () => {
  const mgr = new SessionManager();
  const s = await mgr.create({ id: "s1", symbol: "AAPL", mode: "paper", equity: 5000 });
  assert.equal(mgr.list().length, 1);
  assert.equal(mgr.get("s1"), s);
  await s.pushBar({ time: 1, open: 50, high: 50, low: 50, close: 50, volume: 1 });
  await s.placeOrder({ side: "long", type: "market", qty: 5 });
  assert.equal((await s.getPositions()).length, 1);
});

test("SessionManager refuses live without gating", async () => {
  const mgr = new SessionManager();
  await assert.rejects(() => mgr.create({ id: "x", symbol: "AAPL", mode: "live", confirmLive: true }));
});

test("haltAll flattens and stops every session", async () => {
  const mgr = new SessionManager();
  const s = await mgr.create({ id: "s2", symbol: "AAPL", mode: "paper", equity: 5000 });
  await s.pushBar({ time: 1, open: 50, high: 50, low: 50, close: 50, volume: 1 });
  await s.placeOrder({ side: "long", type: "market", qty: 5 });
  await mgr.haltAll();
  assert.equal(s.getStatus().running, false);
  assert.equal((await s.getPositions()).length, 0);
});
