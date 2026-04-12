import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { PaperEngine } from "../../src/live/engine/paperEngine.js";
import { LiveOrchestrator } from "../../src/live/orchestrator.js";
import { JsonFileStorage } from "../../src/live/storage/jsonFileStorage.js";

function tempStateDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tradelab-live-orch-"));
}

function bars(baseTime, priceBase) {
  return [
    {
      time: baseTime + 0 * 60_000,
      open: priceBase,
      high: priceBase + 0.5,
      low: priceBase - 0.5,
      close: priceBase,
      volume: 1000,
    },
    {
      time: baseTime + 1 * 60_000,
      open: priceBase + 0.5,
      high: priceBase + 1.5,
      low: priceBase + 0.2,
      close: priceBase + 1,
      volume: 1000,
    },
    {
      time: baseTime + 2 * 60_000,
      open: priceBase + 1.1,
      high: priceBase + 2.2,
      low: priceBase + 1.0,
      close: priceBase + 2,
      volume: 1000,
    },
  ];
}

function makeSignal() {
  return ({ index, bar }) => {
    if (index !== 1) return null;
    return {
      side: "buy",
      entry: bar.close,
      stop: bar.close - 1,
      rr: 1,
      qty: 1,
    };
  };
}

test("LiveOrchestrator starts multiple systems and aggregates status", async () => {
  const start = Date.UTC(2025, 0, 2, 14, 30);
  const barsA = bars(start, 100);
  const barsB = bars(start, 200);
  const broker = new PaperEngine({ equity: 20_000 });
  broker.setHistoricalBars("AAA", "1m", barsA.slice(0, 1));
  broker.setHistoricalBars("BBB", "1m", barsB.slice(0, 1));

  const orchestrator = new LiveOrchestrator({
    broker,
    storage: new JsonFileStorage({ baseDir: tempStateDir() }),
    systems: [
      { id: "sysA", symbol: "AAA", interval: "1m", signal: makeSignal(), warmupBars: 1 },
      { id: "sysB", symbol: "BBB", interval: "1m", signal: makeSignal(), warmupBars: 1 },
    ],
    maxDailyLossPct: 0,
  });

  await orchestrator.start();
  for (const bar of barsA.slice(1)) {
    await broker.simulateBar("AAA", "1m", bar);
  }
  for (const bar of barsB.slice(1)) {
    await broker.simulateBar("BBB", "1m", bar);
  }

  const status = orchestrator.getStatus();
  assert.equal(status.systems.length, 2);
  assert.ok(Number.isFinite(status.aggregateEquity));
  await orchestrator.stop();
});

test("LiveOrchestrator isolates shared broker fill events by symbol", async () => {
  const start = Date.UTC(2025, 0, 2, 14, 30);
  const barsA = bars(start, 100);
  const barsB = bars(start, 200);
  const broker = new PaperEngine({ equity: 20_000 });
  broker.setHistoricalBars("AAA", "1m", barsA.slice(0, 1));
  broker.setHistoricalBars("BBB", "1m", barsB.slice(0, 1));

  const orchestrator = new LiveOrchestrator({
    broker,
    storage: new JsonFileStorage({ baseDir: tempStateDir() }),
    systems: [
      {
        id: "sysA",
        symbol: "AAA",
        interval: "1m",
        warmupBars: 1,
        signal({ index, bar }) {
          if (index !== 1) return null;
          return {
            side: "buy",
            stop: bar.close - 1,
            rr: 2,
            qty: 1,
            _maxBarsInTrade: 1,
          };
        },
      },
      {
        id: "sysB",
        symbol: "BBB",
        interval: "1m",
        warmupBars: 1,
        signal({ index, bar }) {
          if (index !== 1) return null;
          return {
            side: "buy",
            stop: bar.close - 1,
            rr: 2,
            qty: 1,
            _maxBarsInTrade: 10,
          };
        },
      },
    ],
    maxDailyLossPct: 0,
  });

  await orchestrator.start();
  await broker.simulateBar("BBB", "1m", barsB[1]);
  await broker.simulateBar("AAA", "1m", barsA[1]);
  await broker.simulateBar("AAA", "1m", barsA[2]);

  const status = orchestrator.getStatus();
  const systemA = status.systems.find((system) => system.id === "sysA");
  const systemB = status.systems.find((system) => system.id === "sysB");

  assert.equal(systemA.openPosition, null);
  assert.equal(systemA.trades, 1);
  assert.ok(systemB.openPosition);
  assert.equal(systemB.trades, 0);
  await orchestrator.stop();
});
