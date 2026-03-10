#!/usr/bin/env node
import path from "path";
import { pathToFileURL } from "url";

import {
  backtest,
  backtestPortfolio,
  ema,
  exportBacktestArtifacts,
  exportMetricsJSON,
  getHistoricalCandles,
  loadCandlesFromCSV,
  saveCandlesToCache,
  walkForwardOptimize,
} from "../src/index.js";

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function toNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toList(value, fallback) {
  if (!value) return fallback;
  return String(value)
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
}

function parseJsonValue(value, fallback = null) {
  if (!value) return fallback;
  return JSON.parse(String(value));
}

function createEmaCrossSignal({
  fast = 10,
  slow = 30,
  rr = 2,
  stopLookback = 15,
} = {}) {
  return ({ candles }) => {
    if (candles.length < Math.max(fast, slow) + 2) return null;

    const closes = candles.map((bar) => bar.close);
    const fastLine = ema(closes, fast);
    const slowLine = ema(closes, slow);
    const last = closes.length - 1;

    if (
      fastLine[last - 1] <= slowLine[last - 1] &&
      fastLine[last] > slowLine[last]
    ) {
      const entry = candles[last].close;
      const stop = Math.min(
        ...candles.slice(-stopLookback).map((bar) => bar.low)
      );
      if (entry > stop) {
        return { side: "long", entry, stop, rr };
      }
    }

    if (
      fastLine[last - 1] >= slowLine[last - 1] &&
      fastLine[last] < slowLine[last]
    ) {
      const entry = candles[last].close;
      const stop = Math.max(
        ...candles.slice(-stopLookback).map((bar) => bar.high)
      );
      if (entry < stop) {
        return { side: "short", entry, stop, rr };
      }
    }

    return null;
  };
}

function createBuyHoldSignal({ holdBars = 5, stopPct = 0.05 } = {}) {
  let entered = false;

  return ({ bar }) => {
    if (entered) return null;
    entered = true;
    return {
      side: "long",
      entry: bar.close,
      stop: bar.close * (1 - stopPct),
      rr: 100,
      _maxBarsInTrade: holdBars,
    };
  };
}

async function loadStrategy(strategyArg, args) {
  if (!strategyArg || strategyArg === "ema-cross") {
    return createEmaCrossSignal({
      fast: toNumber(args.fast, 10),
      slow: toNumber(args.slow, 30),
      rr: toNumber(args.rr, 2),
      stopLookback: toNumber(args.stopLookback, 15),
    });
  }

  if (strategyArg === "buy-hold") {
    return createBuyHoldSignal({
      holdBars: toNumber(args.holdBars, 5),
      stopPct: toNumber(args.stopPct, 0.05),
    });
  }

  const resolved = path.resolve(process.cwd(), strategyArg);
  const module = await import(pathToFileURL(resolved).href);
  if (typeof module.default === "function") return module.default(args);
  if (typeof module.createSignal === "function") return module.createSignal(args);
  if (typeof module.signal === "function") return module.signal;
  throw new Error(`Strategy module "${strategyArg}" must export default, createSignal, or signal`);
}

async function loadWalkForwardStrategy(strategyArg, args) {
  if (!strategyArg || strategyArg === "ema-cross") {
    const fasts = toList(args.fasts, [8, 10, 12]);
    const slows = toList(args.slows, [20, 30, 40]);
    const rrs = toList(args.rrs, [1.5, 2, 3]);
    const parameterSets = [];

    for (const fast of fasts) {
      for (const slow of slows) {
        if (fast >= slow) continue;
        for (const rr of rrs) {
          parameterSets.push({ fast, slow, rr });
        }
      }
    }

    return {
      parameterSets,
      signalFactory(params) {
        return createEmaCrossSignal({
          fast: params.fast,
          slow: params.slow,
          rr: params.rr,
          stopLookback: toNumber(args.stopLookback, 15),
        });
      },
    };
  }

  const resolved = path.resolve(process.cwd(), strategyArg);
  const module = await import(pathToFileURL(resolved).href);
  if (typeof module.signalFactory !== "function") {
    throw new Error(
      `Walk-forward strategy module "${strategyArg}" must export signalFactory`
    );
  }

  const parameterSets =
    parseJsonValue(args.parameterSets) ??
    (typeof module.createParameterSets === "function"
      ? await module.createParameterSets(args)
      : module.parameterSets);

  if (!Array.isArray(parameterSets) || parameterSets.length === 0) {
    throw new Error(
      `Walk-forward strategy module "${strategyArg}" must provide parameterSets, createParameterSets(args), or --parameterSets`
    );
  }

  return {
    parameterSets,
    signalFactory(params) {
      return module.signalFactory(params, args);
    },
  };
}

function printHelp() {
  console.log(`tradelab

Commands:
  backtest      Run a one-off backtest from Yahoo or CSV data
  portfolio     Run multiple CSV datasets as an equal-weight portfolio
  walk-forward  Run rolling or anchored train/test optimization
  prefetch      Download Yahoo candles into the local cache
  import-csv    Normalize a CSV and save it into the local cache

Examples:
  tradelab backtest --source yahoo --symbol SPY --interval 1d --period 1y
  tradelab backtest --source csv --csvPath ./data/btc.csv --strategy buy-hold --holdBars 3
  tradelab walk-forward --source csv --csvPath ./data/spy.csv --trainBars 120 --testBars 40
`);
}

async function commandBacktest(args) {
  const candles = await getHistoricalCandles({
    source: args.source || (args.csvPath ? "csv" : "yahoo"),
    symbol: args.symbol,
    interval: args.interval || "1d",
    period: args.period || "1y",
    csvPath: args.csvPath,
    cache: args.cache !== "false",
  });
  const signal = await loadStrategy(args.strategy, args);
  const result = backtest({
    candles,
    symbol: args.symbol || "DATA",
    interval: args.interval || "1d",
    range: args.period || "custom",
    equity: toNumber(args.equity, 10_000),
    riskPct: toNumber(args.riskPct, 1),
    warmupBars: toNumber(args.warmupBars, 20),
    flattenAtClose: args.flattenAtClose === true || args.flattenAtClose === "true",
    signal,
  });

  const outputs = exportBacktestArtifacts({
    result,
    outDir: args.outDir || "output",
  });

  console.log(
    JSON.stringify(
      {
        symbol: result.symbol,
        trades: result.metrics.trades,
        winRate: result.metrics.winRate,
        profitFactor: result.metrics.profitFactor,
        finalEquity: result.metrics.finalEquity,
        outputs,
      },
      null,
      2
    )
  );
}

function parsePortfolioInputs(args) {
  const csvPaths = String(args.csvPaths || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const symbols = String(args.symbols || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return csvPaths.map((csvPath, index) => ({
    symbol: symbols[index] || `asset-${index + 1}`,
    candles: loadCandlesFromCSV(csvPath),
  }));
}

async function commandPortfolio(args) {
  const baseSystems = parsePortfolioInputs(args);
  const systems = await Promise.all(
    baseSystems.map(async (system) => ({
      ...system,
      signal: await loadStrategy(args.strategy || "buy-hold", args),
      warmupBars: toNumber(args.warmupBars, 1),
      flattenAtClose: false,
    }))
  );

  const result = backtestPortfolio({
    systems,
    equity: toNumber(args.equity, 10_000),
    collectReplay: false,
    collectEqSeries: true,
  });
  const metricsPath = exportMetricsJSON({
    result,
    outDir: args.outDir || "output",
    symbol: "PORTFOLIO",
    interval: args.interval || "mixed",
    range: args.period || "custom",
  });

  console.log(
    JSON.stringify(
      {
        systems: result.systems.length,
        positions: result.positions.length,
        finalEquity: result.metrics.finalEquity,
        metricsPath,
      },
      null,
      2
    )
  );
}

async function commandWalkForward(args) {
  const candles = await getHistoricalCandles({
    source: args.source || (args.csvPath ? "csv" : "yahoo"),
    symbol: args.symbol,
    interval: args.interval || "1d",
    period: args.period || "1y",
    csvPath: args.csvPath,
    cache: args.cache !== "false",
  });
  const walkForwardStrategy = await loadWalkForwardStrategy(args.strategy, args);

  const result = walkForwardOptimize({
    candles,
    parameterSets: walkForwardStrategy.parameterSets,
    trainBars: toNumber(args.trainBars, 120),
    testBars: toNumber(args.testBars, 40),
    stepBars: toNumber(args.stepBars, toNumber(args.testBars, 40)),
    mode: args.mode || "rolling",
    scoreBy: args.scoreBy || "profitFactor",
    backtestOptions: {
      symbol: args.symbol || "DATA",
      interval: args.interval || "1d",
      range: args.period || "custom",
      equity: toNumber(args.equity, 10_000),
      riskPct: toNumber(args.riskPct, 1),
      warmupBars: toNumber(args.warmupBars, 20),
    },
    signalFactory: walkForwardStrategy.signalFactory,
  });

  const metricsPath = exportMetricsJSON({
    result,
    outDir: args.outDir || "output",
    symbol: args.symbol || "DATA",
    interval: args.interval || "1d",
    range: `${args.trainBars || 120}-${args.testBars || 40}`,
  });

  console.log(
    JSON.stringify(
      {
        windows: result.windows.length,
        positions: result.positions.length,
        finalEquity: result.metrics.finalEquity,
        bestParamsSummary: result.bestParamsSummary,
        metricsPath,
      },
      null,
      2
    )
  );
}

async function commandPrefetch(args) {
  const candles = await getHistoricalCandles({
    source: "yahoo",
    symbol: args.symbol || "SPY",
    interval: args.interval || "1d",
    period: args.period || "1y",
    cache: false,
  });
  const outputPath = saveCandlesToCache(candles, {
    symbol: args.symbol || "SPY",
    interval: args.interval || "1d",
    period: args.period || "1y",
    outDir: args.outDir || "output/data",
    source: "yahoo",
  });
  console.log(`Saved ${candles.length} candles to ${outputPath}`);
}

async function commandImportCsv(args) {
  const csvPath = args.csvPath || args._[1];
  if (!csvPath) {
    throw new Error("import-csv requires --csvPath or a positional CSV file path");
  }

  const candles = loadCandlesFromCSV(csvPath, {});
  const outputPath = saveCandlesToCache(candles, {
    symbol: args.symbol || "DATA",
    interval: args.interval || "1d",
    period: args.period || "custom",
    outDir: args.outDir || "output/data",
    source: "csv",
  });
  console.log(`Saved ${candles.length} candles to ${outputPath}`);
}

const commands = {
  backtest: commandBacktest,
  portfolio: commandPortfolio,
  "walk-forward": commandWalkForward,
  prefetch: commandPrefetch,
  "import-csv": commandImportCsv,
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command || command === "help" || args.help) {
    printHelp();
    return;
  }

  const handler = commands[command];
  if (!handler) {
    throw new Error(`Unknown command "${command}". Run "tradelab help".`);
  }

  await handler(args);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
