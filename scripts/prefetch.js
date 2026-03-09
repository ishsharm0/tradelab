#!/usr/bin/env node

import { getHistoricalCandles, saveCandlesToCache } from "../src/index.js";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;

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
const symbol = args.symbol || "SPY";
const interval = args.interval || "1d";
const period = args.period || "1y";
const outDir = args.outDir || "output/data";

async function main() {
  const candles = await getHistoricalCandles({
    source: "yahoo",
    symbol,
    interval,
    period,
    cache: false,
  });

  const outputPath = saveCandlesToCache(candles, {
    symbol,
    interval,
    period,
    outDir,
    source: "yahoo",
  });

  console.log(`Saved ${candles.length} candles to ${outputPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
