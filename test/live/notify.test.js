// test/live/notify.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionManager } from "../../src/live/session.js";
import { attachNotifier } from "../../src/live/notify.js";

const bar = (t, p) => ({ time: t, open: p, high: p, low: p, close: p, volume: 1 });

test("notifier fires onEvent for fills", async () => {
  const mgr = new SessionManager();
  const s = await mgr.create({ id: "n1", symbol: "BTC", equity: 10_000 });
  const seen = [];
  const off = attachNotifier(s, { onEvent: (e) => seen.push(e.event) });
  await s.pushBar(bar(1, 100));
  await s.placeOrder({ side: "long", qty: 1 });
  off();
  assert.ok(seen.includes("order:filled"), "fill should notify");
});
