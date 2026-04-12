import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { JsonFileStorage } from "../../src/live/storage/jsonFileStorage.js";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tradelab-live-storage-"));
}

test("JsonFileStorage saves and loads state atomically", async () => {
  const dir = tempDir();
  const storage = new JsonFileStorage({ baseDir: dir });
  await storage.save("alpha", {
    openPosition: null,
    pendingOrder: null,
    equity: 1000,
    candleBuffer: [],
    strategyState: {},
    lastBarTime: 123,
    dayPnl: 0,
    dayTrades: 0,
    tradeIdCounter: 1,
    savedAt: Date.now(),
  });

  const state = await storage.load("alpha");
  assert.equal(state.equity, 1000);
  assert.equal(state.lastBarTime, 123);
});

test("JsonFileStorage appends and reads trades/equity jsonl", async () => {
  const dir = tempDir();
  const storage = new JsonFileStorage({ baseDir: dir });

  await storage.appendTrade("alpha", { id: 1, side: "long" });
  await storage.appendTrade("alpha", { id: 2, side: "short" });
  await storage.appendEquityPoint("alpha", { time: 1, timestamp: 1, equity: 1000 });
  await storage.appendEquityPoint("alpha", { time: 2, timestamp: 2, equity: 1010 });

  const trades = await storage.loadTrades("alpha");
  const equity = await storage.loadEquityCurve("alpha");
  assert.equal(trades.length, 2);
  assert.equal(equity.length, 2);
});

test("JsonFileStorage clear removes namespace directory", async () => {
  const dir = tempDir();
  const storage = new JsonFileStorage({ baseDir: dir });
  await storage.save("alpha", {
    openPosition: null,
    pendingOrder: null,
    equity: 1000,
    candleBuffer: [],
    strategyState: {},
    lastBarTime: null,
    dayPnl: 0,
    dayTrades: 0,
    tradeIdCounter: 0,
    savedAt: Date.now(),
  });
  await storage.clear("alpha");
  const state = await storage.load("alpha");
  assert.equal(state, null);
});
