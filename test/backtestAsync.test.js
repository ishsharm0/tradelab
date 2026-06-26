import test from "node:test";
import assert from "node:assert/strict";
import { backtest, backtestAsync } from "../src/index.js";

function buildCandles(count = 30) {
  const start = Date.UTC(2025, 0, 2, 14, 30, 0);
  return Array.from({ length: count }, (_, i) => ({
    time: start + i * 5 * 60 * 1000,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100.5 + i,
    volume: 1000 + i,
  }));
}

const entryAt =
  (idx) =>
  ({ index, bar }) =>
    index === idx ? { side: "buy", stop: bar.close - 1, rr: 2 } : null;

test("backtestAsync with a sync signal matches backtest exactly", async () => {
  const candles = buildCandles();
  const opts = { candles, interval: "5m", warmupBars: 1, flattenAtClose: false };
  const sync = backtest({ ...opts, signal: entryAt(1) });
  const asyncResult = await backtestAsync({ ...opts, signal: entryAt(1) });
  assert.equal(asyncResult.positions.length, sync.positions.length);
  assert.equal(asyncResult.metrics.totalPnL, sync.metrics.totalPnL);
});

test("backtestAsync awaits a promise-returning signal", async () => {
  const candles = buildCandles();
  const result = await backtestAsync({
    candles,
    interval: "5m",
    warmupBars: 1,
    flattenAtClose: false,
    async signal({ index, bar }) {
      await Promise.resolve();
      return index === 2 ? { side: "long", stop: bar.close - 1, rr: 2 } : null;
    },
  });
  assert.equal(result.positions.length, 1);
});

test("backtestAsync enforces a per-bar signalBudgetMs", async () => {
  const candles = buildCandles();
  await assert.rejects(() =>
    backtestAsync({
      candles,
      interval: "5m",
      warmupBars: 1,
      signalBudgetMs: 5,
      async signal() {
        await new Promise((r) => setTimeout(r, 50));
        return null;
      },
    })
  );
});
