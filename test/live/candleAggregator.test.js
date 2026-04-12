import test from "node:test";
import assert from "node:assert/strict";

import { CandleAggregator } from "../../src/live/engine/candleAggregator.js";

test("CandleAggregator emits completed bars from tick stream", () => {
  const aggregator = new CandleAggregator({ mode: "tick", interval: "1m", graceMs: 0 });
  const bars = [];
  aggregator.on("bar", (bar) => bars.push(bar));

  aggregator.processTick({ time: Date.UTC(2025, 0, 2, 14, 30, 0), price: 100, size: 1 });
  aggregator.processTick({ time: Date.UTC(2025, 0, 2, 14, 30, 30), price: 101, size: 2 });
  aggregator.processTick({ time: Date.UTC(2025, 0, 2, 14, 31, 0), price: 99, size: 1 });

  assert.equal(bars.length, 1);
  assert.equal(bars[0].open, 100);
  assert.equal(bars[0].high, 101);
  assert.equal(bars[0].low, 100);
  assert.equal(bars[0].close, 101);
});

test("CandleAggregator forceClose emits current bar after grace", () => {
  const aggregator = new CandleAggregator({ mode: "tick", interval: "1m", graceMs: 1000 });
  const bars = [];
  aggregator.on("bar", (bar) => bars.push(bar));

  const t0 = Date.UTC(2025, 0, 2, 14, 30, 0);
  aggregator.processTick({ time: t0, price: 100 });
  aggregator.processTick({ time: t0 + 20_000, price: 100.5 });
  aggregator.forceClose(t0 + 70_000);

  assert.equal(bars.length, 1);
  assert.equal(bars[0].time, t0);
});

test("CandleAggregator deduplicates polled bars by timestamp", () => {
  const aggregator = new CandleAggregator({ mode: "poll", interval: "1m" });
  const bars = [];
  aggregator.on("bar", (bar) => bars.push(bar));

  const a = { time: 1, open: 1, high: 2, low: 1, close: 2 };
  const b = { time: 2, open: 2, high: 3, low: 2, close: 3 };
  aggregator.processPolledBars([a, b]);
  aggregator.processPolledBars([a, b]);
  assert.equal(bars.length, 2);
});
