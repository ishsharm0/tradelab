import test from "node:test";
import assert from "node:assert/strict";

import { PaperEngine } from "../../src/live/engine/paperEngine.js";

test("PaperEngine fills market orders immediately and tracks positions", async () => {
  const broker = new PaperEngine({ equity: 10_000 });
  await broker.connect();
  await broker.simulateBar("AAPL", "1m", {
    time: Date.UTC(2025, 0, 2, 14, 30),
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000,
  });

  const receipt = await broker.submitOrder({
    symbol: "AAPL",
    side: "buy",
    type: "market",
    qty: 1,
  });
  assert.equal(receipt.status, "filled");
  const positions = await broker.getPositions();
  assert.equal(positions.length, 1);
  assert.equal(positions[0].side, "long");
});

test("PaperEngine fills limit orders when touched by bar", async () => {
  const broker = new PaperEngine({ equity: 10_000 });
  await broker.connect();

  const order = await broker.submitOrder({
    symbol: "AAPL",
    side: "buy",
    type: "limit",
    qty: 1,
    limitPrice: 99,
  });
  assert.equal(order.status, "new");

  await broker.simulateBar("AAPL", "1m", {
    time: Date.UTC(2025, 0, 2, 14, 30),
    open: 100,
    high: 101,
    low: 98.5,
    close: 100,
    volume: 1000,
  });

  const status = await broker.getOrderStatus(order.orderId);
  assert.equal(status.status, "filled");
});

test("PaperEngine updates cash after round-trip trade", async () => {
  const broker = new PaperEngine({ equity: 1000 });
  await broker.connect();
  await broker.simulateBar("AAPL", "1m", {
    time: 1,
    open: 100,
    high: 100,
    low: 100,
    close: 100,
    volume: 1,
  });
  await broker.submitOrder({
    symbol: "AAPL",
    side: "buy",
    type: "market",
    qty: 1,
  });
  await broker.simulateBar("AAPL", "1m", {
    time: 2,
    open: 110,
    high: 110,
    low: 110,
    close: 110,
    volume: 1,
  });
  await broker.submitOrder({
    symbol: "AAPL",
    side: "sell",
    type: "market",
    qty: 1,
  });
  const account = await broker.getAccount();
  assert.ok(account.equity > 1000);
});
