import test from "node:test";
import assert from "node:assert/strict";
import { liveTools } from "../../src/mcp/liveTools.js";

test("agent can create a paper session, feed price, place a bracket, and flatten", async () => {
  await liveTools.create_session.handler({ sessionId: "demo", symbol: "AAPL", equity: 10_000 });
  await liveTools.feed_price.handler({
    sessionId: "demo",
    bar: { time: 1, open: 100, high: 100, low: 100, close: 100, volume: 1 },
  });
  const order = await liveTools.place_order.handler({
    sessionId: "demo",
    side: "long",
    type: "market",
    riskPct: 1,
    stop: 98,
    target: 104,
  });
  assert.equal(order.status, "filled");
  const status = await liveTools.session_status.handler({ sessionId: "demo" });
  assert.equal(status.positions.length, 1);
  assert.equal(status.openOrders.length, 2); // bracket
  await liveTools.feed_price.handler({
    sessionId: "demo",
    bar: { time: 2, open: 104, high: 104, low: 104, close: 104, volume: 1 },
  });
  const flat = await liveTools.session_status.handler({ sessionId: "demo" });
  assert.equal(flat.positions.length, 0);
  await liveTools.halt_all.handler({});
});

test("attached built-in strategy auto-evaluates on feed_price", async () => {
  await liveTools.create_session.handler({
    sessionId: "auto-buy-hold",
    symbol: "AAPL",
    equity: 10_000,
  });
  await liveTools.attach_strategy.handler({
    sessionId: "auto-buy-hold",
    strategy: "buy-hold",
    params: { holdBars: 5, stopPct: 10 },
  });

  const status = await liveTools.feed_price.handler({
    sessionId: "auto-buy-hold",
    bar: { time: 1, open: 100, high: 100, low: 100, close: 100, volume: 1 },
  });

  assert.equal(status.positions.length, 1);
  assert.equal(status.positions[0].side, "long");
  await liveTools.halt_all.handler({});
});

test("place_order on an unknown session errors clearly", async () => {
  await assert.rejects(() =>
    liveTools.place_order.handler({ sessionId: "ghost", side: "long", type: "market", qty: 1 })
  );
});

test("live mode is refused without gating", async () => {
  await assert.rejects(() =>
    liveTools.create_session.handler({
      sessionId: "l1",
      symbol: "AAPL",
      mode: "live",
      confirmLive: true,
    })
  );
});

test("create_session accepts a symbols array and routes orders by symbol", async () => {
  const created = await liveTools.create_session.handler({
    sessionId: "mcp-pf", symbols: ["BTC", "ETH"], equity: 50_000,
  });
  assert.deepEqual(created.symbols, ["BTC", "ETH"]);
  await liveTools.feed_price.handler({ sessionId: "mcp-pf", symbol: "BTC", price: 100 });
  const r = await liveTools.place_order.handler({ sessionId: "mcp-pf", symbol: "BTC", side: "long", qty: 1 });
  assert.ok(r);
  await liveTools.halt_all.handler({});
});
