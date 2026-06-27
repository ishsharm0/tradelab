import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionManager } from "../../src/live/session.js";
import { PaperEngine } from "../../src/live/engine/paperEngine.js";

const bar = (time, price) => ({
  time, open: price, high: price, low: price, close: price, volume: 100,
});

test("a session can hold two symbols with independent prices", async () => {
  const broker = new PaperEngine({ equity: 50_000 });
  const mgr = new SessionManager();
  const s = await mgr.create({ id: "pf", symbols: ["BTC", "ETH"], broker, equity: 50_000 });

  await s.pushBar(bar(1, 100), "BTC");
  await s.pushBar(bar(1, 20), "ETH");

  const st = s.getStatus();
  assert.deepEqual(st.symbols, ["BTC", "ETH"]);
  assert.equal(s.lastPriceFor("BTC"), 100);
  assert.equal(s.lastPriceFor("ETH"), 20);
});

test("placeOrder requires an explicit symbol in a multi-symbol session", async () => {
  const broker = new PaperEngine({ equity: 50_000 });
  const mgr = new SessionManager();
  const s = await mgr.create({ id: "pf2", symbols: ["BTC", "ETH"], broker, equity: 50_000 });
  await s.pushBar(bar(1, 100), "BTC");
  await assert.rejects(
    () => s.placeOrder({ side: "long", qty: 1 }),
    /symbol is required/i
  );
});

test("single-symbol construction is unchanged (back-compat)", async () => {
  const mgr = new SessionManager();
  const s = await mgr.create({ id: "solo", symbol: "BTC", equity: 10_000 });
  await s.pushBar(bar(1, 100));
  assert.equal(s.symbol, "BTC");
  assert.deepEqual(s.getStatus().symbols, ["BTC"]);
  const r = await s.placeOrder({ side: "long", qty: 1 });
  assert.ok(r);
});
