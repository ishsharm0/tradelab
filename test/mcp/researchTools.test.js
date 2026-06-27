import test from "node:test";
import assert from "node:assert/strict";
import { mcpTools } from "../../src/mcp/tools.js";

function candles(n = 120) {
  const start = Date.UTC(2025, 0, 2, 14, 30, 0);
  return Array.from({ length: n }, (_, i) => ({
    time: start + i * 86_400_000,
    open: 100 + Math.sin(i / 5) * 6,
    high: 103 + Math.sin(i / 5) * 6,
    low: 97 + Math.sin(i / 5) * 6,
    close: 100 + Math.sin(i / 5) * 6 + (i % 4 ? 0.5 : -0.8),
    volume: 1000,
  }));
}

test("analyze_robustness returns monte carlo bands and a deflated sharpe probability", async () => {
  const out = await mcpTools.analyze_robustness.handler({
    candles: candles(),
    interval: "1d",
    strategy: "ema-cross",
    params: { fast: 5, slow: 15 },
    iterations: 300,
    numTrials: 10,
    seed: 7,
  });
  assert.equal(typeof out.metrics.trades, "number");
  assert.ok("p5" in out.monteCarlo.finalEquity);
  assert.ok(out.monteCarlo.finalEquity.p5 <= out.monteCarlo.finalEquity.p50);
  assert.ok(out.deflatedSharpe >= 0 && out.deflatedSharpe <= 1);
});

test("optimize_strategy sweeps a grid and returns a ranked leaderboard", async () => {
  const out = await mcpTools.optimize_strategy.handler({
    candles: candles(),
    interval: "1d",
    strategy: "ema-cross",
    grid: { fast: [3, 5, 8], slow: [13, 21] },
    scoreBy: "sharpeAnnualized",
  });
  assert.equal(out.leaderboard.length, 6);
  for (let i = 1; i < out.leaderboard.length; i++)
    assert.ok(out.leaderboard[i - 1].score >= out.leaderboard[i].score);
  assert.deepEqual(out.best, out.leaderboard[0]);
});

test("compare_strategies runs several strategies on one dataset", async () => {
  const out = await mcpTools.compare_strategies.handler({
    candles: candles(),
    interval: "1d",
    strategies: [
      { strategy: "ema-cross", params: { fast: 5, slow: 15 } },
      { strategy: "rsi-reversion" },
    ],
  });
  assert.equal(out.results.length, 2);
  assert.ok(out.results.every((r) => typeof r.metrics.profitFactor === "number"));
  assert.ok("rankedBy" in out);
});

test("candle_stats returns shape statistics for an inline candle array", async () => {
  const cs = candles(80);
  const out = await mcpTools.candle_stats.handler({ candles: cs });
  assert.equal(out.stats.count, 80);
  assert.equal(typeof out.stats.firstTime, "string");
  assert.equal(typeof out.stats.lastTime, "string");
  assert.ok("priceRange" in out.stats);
});
