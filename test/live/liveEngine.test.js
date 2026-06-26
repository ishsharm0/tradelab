import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { backtest } from "../../src/index.js";
import { LiveEngine } from "../../src/live/engine/liveEngine.js";
import { PaperEngine } from "../../src/live/engine/paperEngine.js";
import { JsonFileStorage } from "../../src/live/storage/jsonFileStorage.js";

function tempStateDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tradelab-live-engine-"));
}

function buildBars() {
  const start = Date.UTC(2025, 0, 2, 14, 30);
  return [
    { time: start + 0 * 60_000, open: 100, high: 100.5, low: 99.8, close: 100, volume: 1000 },
    { time: start + 1 * 60_000, open: 100.2, high: 101.2, low: 100.1, close: 101, volume: 1000 },
    { time: start + 2 * 60_000, open: 101.1, high: 103.0, low: 101.2, close: 102.5, volume: 1000 },
    { time: start + 3 * 60_000, open: 102.5, high: 103.0, low: 102.0, close: 102.3, volume: 1000 },
  ];
}

function signal({ index, bar }) {
  if (index !== 1) return null;
  return {
    side: "buy",
    entry: bar.close,
    stop: bar.close - 1,
    rr: 1,
    qty: 1,
  };
}

test("LiveEngine executes end-to-end flow with PaperEngine", async () => {
  const bars = buildBars();
  const broker = new PaperEngine({ equity: 10_000 });
  broker.setHistoricalBars("AAPL", "1m", bars.slice(0, 1));
  const engine = new LiveEngine({
    id: "live-e2e",
    symbol: "AAPL",
    interval: "1m",
    signal,
    broker,
    storage: new JsonFileStorage({ baseDir: tempStateDir() }),
    warmupBars: 1,
    mode: "streaming",
    flattenAtClose: false,
    oco: { mode: "intrabar", tieBreak: "pessimistic" },
  });

  await engine.start();
  for (const bar of bars.slice(1)) {
    await broker.simulateBar("AAPL", "1m", bar);
  }
  const status = engine.getStatus();
  assert.equal(status.trades, 1);
  assert.equal(status.openPosition, null);
  await engine.stop();
});

test("LiveEngine paper playback stays in parity with backtest for simple strategy", async () => {
  const bars = buildBars();
  const bt = backtest({
    candles: bars,
    warmupBars: 1,
    flattenAtClose: false,
    collectEqSeries: false,
    collectReplay: false,
    scaleOutAtR: 0,
    slippageBps: 0,
    feeBps: 0,
    signal,
  });

  const broker = new PaperEngine({ equity: 10_000, slippageBps: 0, feeBps: 0 });
  broker.setHistoricalBars("AAPL", "1m", bars.slice(0, 1));
  const engine = new LiveEngine({
    id: "live-parity",
    symbol: "AAPL",
    interval: "1m",
    signal,
    broker,
    storage: new JsonFileStorage({ baseDir: tempStateDir() }),
    warmupBars: 1,
    mode: "streaming",
    flattenAtClose: false,
    oco: { mode: "intrabar", tieBreak: "pessimistic" },
    costs: null,
  });

  await engine.start();
  for (const bar of bars.slice(1)) {
    await broker.simulateBar("AAPL", "1m", bar);
  }

  assert.equal(engine.trades.length, bt.positions.length);
  assert.equal(engine.trades[0].side, bt.positions[0].side);
  assert.ok(Math.abs(engine.trades[0].exit.pnl - bt.positions[0].exit.pnl) < 1e-6);
  await engine.stop();
});

test("LiveEngine handles immediate market fills from paper broker", async () => {
  const bars = buildBars();
  const broker = new PaperEngine({ equity: 10_000, slippageBps: 0, feeBps: 0 });
  broker.setHistoricalBars("AAPL", "1m", bars.slice(0, 1));
  const engine = new LiveEngine({
    id: "live-market-fill",
    symbol: "AAPL",
    interval: "1m",
    broker,
    storage: new JsonFileStorage({ baseDir: tempStateDir() }),
    warmupBars: 1,
    mode: "streaming",
    flattenAtClose: false,
    oco: { mode: "intrabar", tieBreak: "pessimistic" },
    signal({ index, bar }) {
      if (index !== 1) return null;
      return {
        side: "buy",
        stop: bar.close - 1,
        rr: 1,
        qty: 1,
        _maxBarsInTrade: 1,
      };
    },
  });

  await engine.start();
  for (const bar of bars.slice(1)) {
    await broker.simulateBar("AAPL", "1m", bar);
  }

  assert.equal(engine.trades.length, 1);
  assert.equal(engine.trades[0].exit.reason, "TIME");
  assert.equal(engine.openPosition, null);
  await engine.stop();
});

test("LiveEngine awaits an async signal", async () => {
  const bars = buildBars();
  const broker = new PaperEngine({ equity: 10_000, slippageBps: 0, feeBps: 0 });
  broker.setHistoricalBars("AAPL", "1m", bars.slice(0, 1));
  const engine = new LiveEngine({
    id: "live-async-signal",
    symbol: "AAPL",
    interval: "1m",
    broker,
    storage: new JsonFileStorage({ baseDir: tempStateDir() }),
    warmupBars: 1,
    mode: "streaming",
    flattenAtClose: false,
    oco: { mode: "intrabar", tieBreak: "pessimistic" },
    async signal({ index, bar }) {
      await Promise.resolve();
      if (index !== 1) return null;
      return {
        side: "buy",
        stop: bar.close - 1,
        rr: 1,
        qty: 1,
      };
    },
  });

  await engine.start();
  await broker.simulateBar("AAPL", "1m", bars[1]);

  assert.notEqual(engine.getStatus().openPosition, null);
  await engine.stop();
});
