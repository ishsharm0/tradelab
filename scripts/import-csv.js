#!/usr/bin/env node

import {
  candleStats,
  loadCandlesFromCSV,
  saveCandlesToCache,
} from "../src/index.js";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      if (!args.file) args.file = token;
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = "true";
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.file || !args.symbol) {
  console.log(
    "Usage: node scripts/import-csv.js <file.csv> --symbol BTC-USD [--interval 5m] [--period 90d]"
  );
  process.exit(1);
}

try {
  const candles = loadCandlesFromCSV(args.file, {
    delimiter: args.delimiter || ",",
    timeCol: args.timeCol || "time",
    openCol: args.openCol || "open",
    highCol: args.highCol || "high",
    lowCol: args.lowCol || "low",
    closeCol: args.closeCol || "close",
    volumeCol: args.volumeCol || "volume",
    startDate: args.startDate,
    endDate: args.endDate,
  });

  const stats = candleStats(candles);
  const interval = args.interval || "1d";
  const period = args.period || `${Math.max(1, Math.ceil(stats?.durationDays || 1))}d`;
  const outputPath = saveCandlesToCache(candles, {
    symbol: args.symbol,
    interval,
    period,
    outDir: args.outDir || "output/data",
    source: "csv",
  });

  console.log(`Loaded ${stats?.count ?? 0} candles`);
  console.log(`Range: ${stats?.firstTime ?? "—"} -> ${stats?.lastTime ?? "—"}`);
  console.log(`Saved cache: ${outputPath}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
