/**
 * E2E test: agent-trading + dashboard + MCP live tools
 *
 * Exercises the full agent loop deterministically (no network):
 *   1. Create a paper session via liveTools handlers
 *   2. Feed a price bar, place a risk-sized bracket order
 *   3. Assert session_status shows 1 position + 2 open orders
 *   4. Start a real dashboardServer on ephemeral port 0
 *   5. GET /state — assert position + equity visible
 *   6. GET /events (SSE) — assert at least one frame arrives after feed_price
 *   7. POST /command {type:"flatten"} — assert session goes flat
 *   8. Separate sub-flow: feed a bar hitting target BEFORE flatten → equity > 10k
 *   9. halt_all at end; server always closed via try/finally
 */

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { TradingSession } from "../../src/live/session.js";
import { PaperEngine } from "../../src/live/engine/paperEngine.js";
import { createDashboardServer } from "../../src/live/dashboard/server.js";
import { liveTools } from "../../src/mcp/liveTools.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function bar(time, price, { high = price, low = price } = {}) {
  return { time, open: price, high, low, close: price, volume: 100 };
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      })
      .on("error", reject);
  });
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ─── helper: fresh standalone session (not via liveTools manager) ────────────
async function freshSession({ id = "e2e-direct", symbol = "BTCUSDT", equity = 10_000 } = {}) {
  const broker = new PaperEngine({ equity });
  const session = new TradingSession({
    id,
    symbol,
    interval: "1m",
    broker,
    equity,
    qtyStep: 0.001,
    minQty: 0.001,
  });
  await session.start();
  return session;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. liveTools smoke: create_session → feed_price → place_order (bracket)
//    → session_status shows 1 position + 2 open orders
// ═══════════════════════════════════════════════════════════════════════════
test("liveTools: create_session + feed_price + bracket place_order", async () => {
  // Use a unique sessionId so we don't collide with other tests sharing the module-level manager
  const sessionId = `e2e-bracket-${Date.now()}`;

  await liveTools.create_session.handler({
    sessionId,
    symbol: "BTCUSDT",
    equity: 10_000,
    mode: "paper",
  });

  await liveTools.feed_price.handler({
    sessionId,
    bar: bar(1, 50_000),
  });

  const receipt = await liveTools.place_order.handler({
    sessionId,
    side: "long",
    type: "market",
    riskPct: 1, // 1% of 10k = $100 risk
    stop: 49_500, // $500 stop → qty ≈ 0.2
    target: 51_500, // $1500 target → nice 3R
  });

  assert.equal(receipt.status, "filled", "entry order should fill immediately");

  const status = await liveTools.session_status.handler({ sessionId });
  assert.equal(status.positions.length, 1, "should have 1 open position");
  assert.equal(status.openOrders.length, 2, "should have 2 bracket orders (stop + target)");
  assert.equal(status.positions[0].side, "long");
  assert.ok(status.positions[0].qty > 0);

  // Cleanup
  await liveTools.flatten.handler({ sessionId });
  await liveTools.halt_all.handler();
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Dashboard /state reflects position + equity (using standalone session)
// ═══════════════════════════════════════════════════════════════════════════
test("dashboard /state reflects position and equity", async () => {
  const session = await freshSession({ id: "e2e-dash-state" });
  const dash = createDashboardServer({ source: session, port: 0 });
  const url = await dash.start();

  try {
    // Feed price + place bracket
    await session.pushBar(bar(1, 50_000));
    await session.placeOrder({
      side: "long",
      type: "market",
      riskPct: 1,
      stop: 49_500,
      target: 51_500,
    });

    const res = await getJson(`${url}/state`);
    assert.equal(res.status, 200, "/state should return 200");

    const state = JSON.parse(res.body);
    assert.equal(typeof state.equity, "number", "state.equity should be a number");
    assert.ok(state.equity > 0, "equity should be positive");
    assert.ok(Array.isArray(state.positions), "state.positions should be an array");
    assert.equal(state.positions.length, 1, "/state should show 1 open position");
  } finally {
    await dash.close();
    await session.stop({ flatten: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Dashboard /events delivers an SSE frame after feed_price
// ═══════════════════════════════════════════════════════════════════════════
test("dashboard /events delivers SSE frame after feed_price", async () => {
  const session = await freshSession({ id: "e2e-dash-sse" });
  const dash = createDashboardServer({ source: session, port: 0 });
  const url = await dash.start();

  try {
    await session.pushBar(bar(1, 50_000));
    await session.placeOrder({ side: "long", type: "market", qty: 0.01 });

    // Set up SSE listener, then push another bar to fire events
    const framePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("SSE timeout")), 4000);
      http
        .get(`${url}/events`, (res) => {
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            if (chunk.trim()) {
              clearTimeout(timer);
              resolve(chunk);
            }
          });
          res.on("error", (e) => {
            clearTimeout(timer);
            reject(e);
          });
        })
        .on("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
    });

    // Give the SSE connection a moment to establish, then push a bar
    await new Promise((r) => setTimeout(r, 40));
    await session.pushBar(bar(2, 50_100));

    const frame = await framePromise;
    assert.ok(frame.startsWith("data:"), `SSE frame should start with "data:": got: ${frame}`);
    const parsed = JSON.parse(frame.slice(frame.indexOf("data:") + 5));
    assert.ok(parsed.event, "SSE frame should have an event field");
  } finally {
    await dash.close();
    await session.stop({ flatten: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Dashboard POST /command {type:"flatten"} flattens the session
// ═══════════════════════════════════════════════════════════════════════════
test("dashboard POST /command flatten makes session go flat", async () => {
  const session = await freshSession({ id: "e2e-dash-flatten" });
  const dash = createDashboardServer({ source: session, port: 0 });
  const url = await dash.start();

  try {
    await session.pushBar(bar(1, 50_000));
    await session.placeOrder({ side: "long", type: "market", qty: 0.01 });

    // Confirm position open
    const beforeState = await getJson(`${url}/state`);
    const before = JSON.parse(beforeState.body);
    assert.equal(before.positions.length, 1, "should have 1 position before flatten");

    // POST flatten command
    const cmdRes = await postJson(`${url}/command`, { type: "flatten" });
    assert.equal(cmdRes.status, 200, "/command flatten should return 200");
    const cmdBody = JSON.parse(cmdRes.body);
    assert.equal(cmdBody.ok, true, "flatten command should return {ok:true}");

    // Confirm flat
    const afterState = await getJson(`${url}/state`);
    const after = JSON.parse(afterState.body);
    assert.equal(after.positions.length, 0, "session should be flat after flatten command");
  } finally {
    await dash.close();
    await session.stop();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. OCO bracket: target fill → closes position + books equity > 10k
// ═══════════════════════════════════════════════════════════════════════════
test("OCO bracket: price hits target → position closed, equity > 10k (winner)", async () => {
  const session = await freshSession({ id: "e2e-oco-winner" });

  await session.pushBar(bar(1, 50_000));
  await session.placeOrder({
    side: "long",
    type: "market",
    qty: 0.1, // 0.1 BTC, no risk sizing
    stop: 49_000,
    target: 51_000,
  });

  const after = session.getStatus();
  assert.equal(after.positions.length, 1, "position opened");
  assert.equal(after.openOrders.length, 2, "bracket in place");

  // Feed a bar where high >= target (51_000) → target fills, stop is OCO-cancelled
  await session.pushBar(bar(2, 51_000, { high: 51_000 }));

  const flat = session.getStatus();
  assert.equal(flat.positions.length, 0, "position closed after target hit");
  assert.equal(flat.openOrders.length, 0, "sibling stop order cancelled (OCO)");
  assert.ok(flat.equity > 10_000, `equity ${flat.equity} should be > 10000 after winner`);

  await session.stop();
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Full integrated e2e: liveTools + dashboardServer together
//    create_session → feed_price → bracket → /state check → SSE → /command flatten → halt_all
// ═══════════════════════════════════════════════════════════════════════════
test("full e2e: liveTools + dashboardServer integrated loop", async () => {
  // Use standalone session object (cleaner integration with dashboard)
  const session = await freshSession({ id: "e2e-full", symbol: "BTCUSDT" });
  const dash = createDashboardServer({ source: session, port: 0 });
  const url = await dash.start();

  try {
    // 1. Feed initial price
    await session.pushBar(bar(1, 50_000));

    // 2. Place risk-sized bracket
    const receipt = await session.placeOrder({
      side: "long",
      type: "market",
      riskPct: 1,
      stop: 49_500,
      target: 51_500,
    });
    assert.equal(receipt.status, "filled");

    // 3. /state should show position + equity
    const stateRes = await getJson(`${url}/state`);
    assert.equal(stateRes.status, 200);
    const state = JSON.parse(stateRes.body);
    assert.equal(state.positions.length, 1, "state shows 1 position");
    assert.ok(state.equity > 0, "state shows equity");

    // 4. SSE: connect to /events, push another bar, assert frame arrives
    const ssePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("SSE timeout in full e2e")), 4000);
      http
        .get(`${url}/events`, (res) => {
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            if (chunk.trim()) {
              clearTimeout(timer);
              resolve(chunk);
            }
          });
          res.on("error", (e) => {
            clearTimeout(timer);
            reject(e);
          });
        })
        .on("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
    });

    await new Promise((r) => setTimeout(r, 40));
    await session.pushBar(bar(2, 50_100));
    const frame = await ssePromise;
    assert.ok(frame.startsWith("data:"), "SSE frame starts with data:");

    // 5. POST /command flatten
    const flatRes = await postJson(`${url}/command`, { type: "flatten" });
    assert.equal(flatRes.status, 200);
    const flatBody = JSON.parse(flatRes.body);
    assert.equal(flatBody.ok, true);

    // 6. Confirm flat via /state
    const finalState = await getJson(`${url}/state`);
    const final = JSON.parse(finalState.body);
    assert.equal(final.positions.length, 0, "session is flat after /command flatten");
  } finally {
    await dash.close();
    await session.stop();
  }
});
