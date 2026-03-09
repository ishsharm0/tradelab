import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

const cliPath = path.resolve("bin/tradelab.js");

function writeCsvFixture(dir) {
  const csvPath = path.join(dir, "candles.csv");
  fs.writeFileSync(
    csvPath,
    [
      "time,open,high,low,close,volume",
      "2025-01-02T14:30:00Z,100,101,99,100.5,1000",
      "2025-01-03T14:30:00Z,101,103,100,102.5,1001",
      "2025-01-06T14:30:00Z,102,104,101,103.5,1002",
      "2025-01-07T14:30:00Z,103,105,102,104.5,1003",
      "2025-01-08T14:30:00Z,104,106,103,105.5,1004",
    ].join("\n"),
    "utf8"
  );
  return csvPath;
}

test("cli help prints available commands", () => {
  const output = execFileSync(process.execPath, [cliPath, "help"], {
    cwd: path.resolve("."),
    encoding: "utf8",
  });

  assert.match(output, /backtest/);
  assert.match(output, /walk-forward/);
});

test("cli backtest runs against CSV data and writes artifacts", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tradelab-cli-"));
  const csvPath = writeCsvFixture(tmpDir);
  const outDir = path.join(tmpDir, "output");
  const output = execFileSync(
    process.execPath,
    [
      cliPath,
      "backtest",
      "--source",
      "csv",
      "--csvPath",
      csvPath,
      "--symbol",
      "TEST",
      "--interval",
      "1d",
      "--period",
      "5d",
      "--strategy",
      "buy-hold",
      "--holdBars",
      "2",
      "--warmupBars",
      "1",
      "--outDir",
      outDir,
    ],
    {
      cwd: path.resolve("."),
      encoding: "utf8",
    }
  );

  const parsed = JSON.parse(output);
  assert.equal(parsed.symbol, "TEST");
  assert.equal(fs.existsSync(parsed.outputs.html), true);
  assert.equal(fs.existsSync(parsed.outputs.metrics), true);
});
