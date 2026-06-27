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

test("async onEvent that rejects does not produce an unhandled rejection", async () => {
  const mgr = new SessionManager();
  const s = await mgr.create({ id: "n2", symbol: "BTC", equity: 10_000 });

  // Track any unhandled rejections during this test
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);

  // Attach a notifier whose onEvent always rejects
  const off = attachNotifier(s, {
    onEvent: async () => { throw new Error("async onEvent rejection"); },
  });

  // Drive a fill to trigger the "order:filled" event
  await s.pushBar(bar(1, 100));
  await s.placeOrder({ side: "long", qty: 1 });

  // Yield to the microtask/timer queue so any stray rejections can surface
  await new Promise((resolve) => setImmediate(resolve));

  off();
  process.removeListener("unhandledRejection", onUnhandled);

  assert.equal(unhandled.length, 0, "no unhandled rejections should escape the notifier");

  // Confirm the session still functions after the rejecting notifier
  const secondSeen = [];
  const off2 = attachNotifier(s, { onEvent: (e) => secondSeen.push(e.event) });
  await s.pushBar(bar(2, 100));
  await s.placeOrder({ side: "long", qty: 1 });
  off2();
  assert.ok(secondSeen.includes("order:filled"), "session still functional after async onEvent rejection");
});
