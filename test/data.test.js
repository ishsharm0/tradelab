import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import {
  cachedCandlesPath,
  getHistoricalCandles,
  loadCandlesFromCache,
  normalizeCandles,
} from "../src/index.js";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "trading-engine-test-"));
}

test("getHistoricalCandles auto-detects CSV source and caches normalized candles", async () => {
  const tmpDir = makeTempDir();
  const csvPath = path.join(tmpDir, "candles.csv");

  fs.writeFileSync(
    csvPath,
    [
      "time,open,high,low,close,volume",
      "2025-01-02T14:30:00Z,100,101,99,100.5,1000",
      "2025-01-03T14:30:00Z,100.5,102,100,101.5,1100",
      "2025-01-03T14:30:00Z,100.5,102,100,101.5,1100",
      "2025-01-06T14:30:00Z,101.5,103,101,102.5,1200",
    ].join("\n"),
    "utf8"
  );

  const candles = await getHistoricalCandles({
    csvPath,
    symbol: "TEST",
    interval: "1d",
    cacheDir: tmpDir,
  });

  assert.equal(candles.length, 3);

  const cachePath = cachedCandlesPath("TEST", "1d", "custom", tmpDir);
  assert.equal(fs.existsSync(cachePath), true);

  const cached = loadCandlesFromCache("TEST", "1d", "custom", tmpDir);
  assert.equal(cached.length, 3);
});

test("normalizeCandles warns when input requires reordering or dedupe", () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (message) => {
    warnings.push(String(message));
  };

  try {
    const t1 = Date.UTC(2025, 0, 2, 14, 30);
    const t2 = Date.UTC(2025, 0, 2, 14, 35);
    const normalized = normalizeCandles([
      { time: t2, open: 2, high: 2, low: 2, close: 2 },
      { time: t1, open: 1, high: 1, low: 1, close: 1 },
      { time: t1, open: 1, high: 1, low: 1, close: 1 },
    ]);

    assert.deepEqual(
      normalized.map((bar) => bar.time),
      [t1, t2]
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /normalizeCandles\(\) reordered or deduplicated candles/);
  } finally {
    console.warn = originalWarn;
  }
});
