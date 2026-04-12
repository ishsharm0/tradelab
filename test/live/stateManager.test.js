import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { JsonFileStorage } from "../../src/live/storage/jsonFileStorage.js";
import { StateManager } from "../../src/live/engine/stateManager.js";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tradelab-live-state-"));
}

test("StateManager persists and loads live state", async () => {
  const storage = new JsonFileStorage({ baseDir: tempDir() });
  const manager = new StateManager({ storage });
  await manager.save("sys", {
    openPosition: null,
    pendingOrder: null,
    equity: 5000,
    candleBuffer: [],
    strategyState: {},
    lastBarTime: 11,
    dayPnl: 3,
    dayTrades: 2,
    tradeIdCounter: 9,
    savedAt: Date.now(),
  });

  const state = await manager.load("sys");
  assert.equal(state.equity, 5000);
  assert.equal(state.dayTrades, 2);
});

test("StateManager reconciliation adopts matching broker position", () => {
  const manager = new StateManager({
    storage: new JsonFileStorage({ baseDir: tempDir() }),
  });
  const report = manager.reconcile({
    symbol: "AAPL",
    persistedState: {
      openPosition: {
        symbol: "AAPL",
        side: "long",
        size: 10,
        entry: 100,
        entryFill: 100,
        stop: 98,
        takeProfit: 105,
        openTime: 1,
        markPrice: 101,
        unrealizedPnl: 10,
      },
    },
    brokerPositions: [
      {
        symbol: "AAPL",
        side: "long",
        qty: 10.2,
        avgEntry: 100.1,
        marketValue: 1000,
        unrealizedPnl: 10,
      },
    ],
  });
  assert.equal(report.action, "adopt-broker");
  assert.equal(report.status, "ok");
});

test("StateManager reconciliation flags mismatch", () => {
  const manager = new StateManager({
    storage: new JsonFileStorage({ baseDir: tempDir() }),
  });
  const report = manager.reconcile({
    symbol: "AAPL",
    persistedState: {
      openPosition: {
        symbol: "AAPL",
        side: "long",
        size: 10,
        entry: 100,
        entryFill: 100,
        stop: 98,
        takeProfit: 105,
        openTime: 1,
        markPrice: 101,
        unrealizedPnl: 10,
      },
    },
    brokerPositions: [
      {
        symbol: "AAPL",
        side: "short",
        qty: 2,
        avgEntry: 100.1,
        marketValue: 1000,
        unrealizedPnl: -10,
      },
    ],
  });
  assert.equal(report.action, "mismatch");
  assert.equal(report.status, "error");
});
