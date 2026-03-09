import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { exportHtmlReport, renderHtmlReport } from "../src/index.js";

function sampleMetrics() {
  return {
    trades: 3,
    winRate: 2 / 3,
    profitFactor: 1.8,
    expectancy: 42.5,
    totalR: 3.4,
    avgR: 1.13,
    maxDrawdownPct: 0.08,
    exposurePct: 0.25,
    avgHoldMin: 35,
    sharpeDaily: 1.2,
    returnPct: 0.12,
    totalPnL: 120,
    calmar: 1.5,
    startEquity: 1000,
    finalEquity: 1120,
    long: { trades: 2, winRate: 0.5, avgR: 0.8 },
    short: { trades: 1, winRate: 1, avgR: 1.8 },
    rDist: { p50: 1, p90: 2.1 },
    holdDistMin: { p50: 20, p90: 60 },
  };
}

test("renderHtmlReport uses external template assets and embeds report data safely", () => {
  const html = renderHtmlReport({
    symbol: "DEMO",
    interval: "1d",
    range: "1y",
    metrics: sampleMetrics(),
    eqSeries: [
      { time: Date.UTC(2025, 0, 1), equity: 1000 },
      { time: Date.UTC(2025, 0, 2), equity: 1050 },
    ],
    replay: { frames: [], events: [] },
    positions: [],
  });

  assert.match(html, /Trading Engine Report/);
  assert.match(html, /metric-card__value/);
  assert.match(html, /report-data/);
  assert.match(html, /is-hidden/);
});

test("exportHtmlReport writes a self-contained report file", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "trading-engine-report-"));
  const outputPath = exportHtmlReport({
    symbol: "DEMO",
    interval: "1d",
    range: "1y",
    metrics: sampleMetrics(),
    eqSeries: [
      { time: Date.UTC(2025, 0, 1), equity: 1000 },
      { time: Date.UTC(2025, 0, 2), equity: 1050 },
    ],
    replay: { frames: [], events: [] },
    positions: [],
    outDir,
  });

  assert.equal(fs.existsSync(outputPath), true);
  const html = fs.readFileSync(outputPath, "utf8");
  assert.match(html, /DEMO 1d \(1y\) backtest/);
});
