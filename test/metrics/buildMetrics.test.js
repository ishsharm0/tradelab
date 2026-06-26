// test/metrics/buildMetrics.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { buildMetrics } from "../../src/metrics/buildMetrics.js";
import { BIG_NUMBER } from "../../src/metrics/finite.js";

function leg({ time, pnl, side = "long" }) {
  return {
    side,
    entry: 100,
    entryFill: 100,
    _initRisk: 1,
    openTime: time - 60_000,
    exit: { price: 100 + pnl, time, reason: pnl >= 0 ? "TP" : "SL", pnl },
  };
}

test("profitFactor with zero losses is clamped to BIG_NUMBER, not Infinity", () => {
  const closed = [leg({ time: 2_000, pnl: 5 }), leg({ time: 3_000, pnl: 7 })];
  const m = buildMetrics({
    closed,
    equityStart: 1000,
    equityFinal: 1012,
    candles: [{ time: 1_000, close: 100 }, { time: 2_000, close: 100 }],
    estBarMs: 1000,
    eqSeries: [],
    interval: "1d",
  });
  assert.equal(Number.isFinite(m.profitFactor), true);
  assert.equal(m.profitFactor, BIG_NUMBER);
  // every numeric field survives a JSON round-trip with no Infinity/NaN
  const round = JSON.parse(JSON.stringify(m));
  for (const v of Object.values(round)) {
    if (typeof v === "number") assert.equal(Number.isFinite(v), true);
  }
});

test("sharpeAnnualized scales the per-period daily sharpe by sqrt(periodsPerYear)", () => {
  const closed = [
    leg({ time: 2 * 86_400_000, pnl: 5 }),
    leg({ time: 3 * 86_400_000, pnl: -3 }),
    leg({ time: 4 * 86_400_000, pnl: 6 }),
  ];
  const m = buildMetrics({
    closed,
    equityStart: 1000,
    equityFinal: 1008,
    candles: [{ time: 0, close: 100 }],
    estBarMs: 86_400_000,
    eqSeries: [],
    interval: "1d",
  });
  assert.equal("sharpeAnnualized" in m, true);
  if (Number.isFinite(m.sharpe) && m.sharpe !== 0) {
    assert.ok(Math.abs(m.sharpeAnnualized - m.sharpe * Math.sqrt(252)) < 1e-6);
  }
});

test("benchmarkReturns produce a benchmark block with beta", () => {
  const closed = [leg({ time: 2_000, pnl: 5 }), leg({ time: 3_000, pnl: -2 })];
  const m = buildMetrics({
    closed,
    equityStart: 1000,
    equityFinal: 1003,
    candles: [{ time: 1_000, close: 100 }],
    estBarMs: 1000,
    eqSeries: [],
    interval: "1d",
    benchmarkReturns: [0.01, -0.005],
  });
  assert.equal(typeof m.benchmark, "object");
  assert.equal("beta" in m.benchmark, true);
});
