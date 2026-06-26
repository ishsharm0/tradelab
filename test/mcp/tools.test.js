import test from "node:test";
import assert from "node:assert/strict";
import { mcpTools } from "../../src/mcp/tools.js";

function buildCandles(n = 60) {
  const start = Date.UTC(2025, 0, 2, 14, 30, 0);
  return Array.from({ length: n }, (_, i) => ({
    time: start + i * 86_400_000,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i + (i % 3 === 0 ? -0.5 : 0.5),
    volume: 1000 + i,
  }));
}

test("list_strategies returns the registry", async () => {
  const out = await mcpTools.list_strategies.handler({});
  assert.ok(Array.isArray(out.strategies));
  assert.ok(out.strategies.some((s) => s.name === "ema-cross"));
});

test("run_backtest with inline candles returns an LLM-sized metrics summary", async () => {
  const candles = buildCandles();
  const out = await mcpTools.run_backtest.handler({
    candles,
    symbol: "TEST",
    interval: "1d",
    strategy: "ema-cross",
    params: { fast: 3, slow: 5, rr: 2 },
  });
  assert.equal(typeof out.metrics.trades, "number");
  assert.equal(typeof out.metrics.profitFactor, "number");
  assert.equal("sharpeAnnualized" in out.metrics, true);
  assert.equal("replay" in out, false);
  assert.ok(out.tradesPreview.length <= 10);
});

test("run_backtest rejects an unknown strategy", async () => {
  await assert.rejects(() =>
    mcpTools.run_backtest.handler({ candles: buildCandles(), strategy: "ghost" })
  );
});

test("walk_forward runs a parameter grid and returns window stability", async () => {
  const candles = buildCandles(200);
  const out = await mcpTools.walk_forward.handler({
    candles,
    interval: "1d",
    strategy: "ema-cross",
    trainBars: 60,
    testBars: 20,
    mode: "anchored",
    grid: { fast: [3, 5], slow: [8, 13] },
  });
  assert.ok(out.windows >= 1);
  assert.equal(typeof out.metrics.totalPnL, "number");
  assert.equal(typeof out.stability.uniqueWinnerCount, "number");
});
