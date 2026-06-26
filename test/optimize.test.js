import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { optimize, grid } from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const signalModulePath = path.join(here, "fixtures", "emaSignal.js");

function buildCandles(n = 120) {
  const start = Date.UTC(2025, 0, 2, 14, 30, 0);
  return Array.from({ length: n }, (_, i) => ({
    time: start + i * 86_400_000,
    open: 100 + Math.sin(i / 4) * 5,
    high: 102 + Math.sin(i / 4) * 5,
    low: 98 + Math.sin(i / 4) * 5,
    close: 100 + Math.sin(i / 4) * 5,
    volume: 1000,
  }));
}

test("optimize runs every parameter set and returns a ranked leaderboard", async () => {
  const candles = buildCandles();
  const parameterSets = grid({ fast: [3, 5, 8], slow: [13, 21] });
  const out = await optimize({
    candles,
    interval: "1d",
    signalModulePath,
    parameterSets,
    concurrency: 2,
    scoreBy: "profitFactor",
  });
  assert.equal(out.results.length, parameterSets.length);
  assert.ok(out.leaderboard.length >= 1);
  for (let i = 1; i < out.leaderboard.length; i += 1) {
    assert.ok(
      out.leaderboard[i - 1].metrics.profitFactor >= out.leaderboard[i].metrics.profitFactor
    );
  }
  assert.equal(out.best, out.leaderboard[0]);
});

test("optimize matches a serial baseline for the same params", async () => {
  const candles = buildCandles();
  const parameterSets = grid({ fast: [5], slow: [21] });
  const parallel = await optimize({
    candles,
    interval: "1d",
    signalModulePath,
    parameterSets,
    concurrency: 1,
  });
  const { backtest } = await import("../src/index.js");
  const { createSignal } = await import("./fixtures/emaSignal.js");
  const serial = backtest({
    candles,
    interval: "1d",
    signal: createSignal(parameterSets[0]),
    collectReplay: false,
    collectEqSeries: false,
  });
  assert.equal(parallel.results[0].metrics.totalPnL, serial.metrics.totalPnL);
});
