#!/usr/bin/env node
import fs from "node:fs";
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
import {
  AlpacaBroker,
  BinanceBroker,
  CoinbaseBroker,
  InteractiveBrokersBroker,
  JsonFileStorage,
  LiveEngine,
  LiveOrchestrator,
  PaperEngine,
} from "../src/live/index.js";

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }

    const key = token.slice(2);
    const camelKey = key.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[index + 1];
    const value = next && !next.startsWith("--") ? next : true;
    args[key] = value;
    if (camelKey !== key && args[camelKey] === undefined) {
      args[camelKey] = value;
    }
    if (next && !next.startsWith("--")) {
      index += 1;
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
  try {
    return JSON.parse(String(value));
  } catch {
    throw new Error(`Invalid JSON value: ${String(value).slice(0, 120)}`);
  }
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (value === true || value === false) return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function loadJsonFile(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(resolved, "utf8");
  return JSON.parse(raw);
}

function resolveBrokerName(name, paperMode = false) {
  if (paperMode) return "paper";
  return String(name || "paper").toLowerCase();
}

function createBrokerAdapter(args, overrides = {}) {
  const brokerName = resolveBrokerName(
    overrides.broker || args.broker,
    toBoolean(overrides.paper ?? args.paper, false)
  );

  if (brokerName === "paper") {
    return new PaperEngine({
      equity: toNumber(overrides.equity ?? args.equity, 10_000),
      slippageBps: toNumber(overrides.slippageBps ?? args.slippageBps, 0),
      feeBps: toNumber(overrides.feeBps ?? args.feeBps, 0),
      costs: parseJsonValue(overrides.costs ?? args.costs, null),
    });
  }

  if (brokerName === "alpaca") return new AlpacaBroker();
  if (brokerName === "binance") return new BinanceBroker();
  if (brokerName === "coinbase") return new CoinbaseBroker();
  if (brokerName === "ib" || brokerName === "interactivebrokers") {
    return new InteractiveBrokersBroker();
  }

  throw new Error(`Unsupported broker "${brokerName}"`);
}

function brokerConfigFromArgs(args, overrides = {}) {
  return {
    apiKey: overrides.apiKey ?? args.apiKey,
    apiSecret: overrides.apiSecret ?? args.apiSecret,
    passphrase: overrides.passphrase ?? args.passphrase,
    paper: toBoolean(overrides.paper ?? args.paper, false),
    baseUrl: overrides.baseUrl ?? args.baseUrl,
    wsUrl: overrides.wsUrl ?? args.wsUrl,
    futures: toBoolean(overrides.futures ?? args.futures, false),
  };
}

function createEmaCrossSignal({ fast = 10, slow = 30, rr = 2, stopLookback = 15 } = {}) {
  return ({ candles }) => {
    if (candles.length < Math.max(fast, slow) + 2) return null;

    const closes = candles.map((bar) => bar.close);
    const fastLine = ema(closes, fast);
    const slowLine = ema(closes, slow);
    const last = closes.length - 1;

    if (fastLine[last - 1] <= slowLine[last - 1] && fastLine[last] > slowLine[last]) {
      const entry = candles[last].close;
      const stop = Math.min(...candles.slice(-stopLookback).map((bar) => bar.low));
      if (entry > stop) {
        return { side: "long", entry, stop, rr };
      }
    }

    if (fastLine[last - 1] >= slowLine[last - 1] && fastLine[last] < slowLine[last]) {
      const entry = candles[last].close;
      const stop = Math.max(...candles.slice(-stopLookback).map((bar) => bar.high));
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
    throw new Error(`Walk-forward strategy module "${strategyArg}" must export signalFactory`);
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
  console.log(`tradelab — backtesting toolkit for Node.js

Usage: tradelab <command> [options]

Commands:
  backtest      Run a one-off backtest from Yahoo or CSV data
  portfolio     Run multiple CSV datasets as an equal-weight portfolio
  walk-forward  Run rolling or anchored train/test optimization
  live          Run live trading engine (streaming or polling)
  paper         Run live engine in paper broker mode
  status        Read persisted live state
  prefetch      Download Yahoo candles into the local cache
  import-csv    Normalize a CSV and save it into the local cache

Examples:
  tradelab backtest --source yahoo --symbol SPY --interval 1d --period 1y
  tradelab backtest --source csv --csvPath ./data/btc.csv --strategy buy-hold --holdBars 3
  tradelab walk-forward --source csv --csvPath ./data/spy.csv --trainBars 120 --testBars 40
  tradelab live --strategy ./mySignal.js --symbol AAPL --interval 5m --broker alpaca --paper

Options:
  --help       Show this help message
  --version    Print version number
`);
}

async function commandBacktest(args) {
  const source = args.source || (args.csvPath ? "csv" : "yahoo");
  if (source === "yahoo" && !args.symbol) {
    throw new Error("backtest with Yahoo source requires --symbol (e.g. --symbol SPY)");
  }
  const candles = await getHistoricalCandles({
    source,
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
  const wfSource = args.source || (args.csvPath ? "csv" : "yahoo");
  if (wfSource === "yahoo" && !args.symbol) {
    throw new Error("walk-forward with Yahoo source requires --symbol (e.g. --symbol QQQ)");
  }
  const candles = await getHistoricalCandles({
    source: wfSource,
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

async function createLiveSystemFromConfig(system, args) {
  const signal = await loadStrategy(system.strategy || args.strategy, {
    ...args,
    ...system,
  });
  return {
    ...system,
    signal,
    interval: system.interval || args.interval || "1m",
    symbol: system.symbol || args.symbol,
  };
}

async function commandLive(args, overrides = {}) {
  const configPath = overrides.config || args.config;
  const mode = overrides.mode || args.mode || "streaming";
  const stateDir = overrides.stateDir || args.stateDir || "output/live-state";
  const once = toBoolean(overrides.once ?? args.once, mode === "polling");
  const watch = toBoolean(overrides.watch ?? args.watch, false);
  const storage = new JsonFileStorage({ baseDir: stateDir });

  if (configPath) {
    const fileConfig = loadJsonFile(configPath);
    const broker = createBrokerAdapter(args, {
      ...overrides,
      equity: fileConfig.equity ?? overrides.equity,
    });
    const brokerConfig = brokerConfigFromArgs(args, overrides);
    const systems = await Promise.all(
      (fileConfig.systems || []).map((system) => createLiveSystemFromConfig(system, args))
    );
    const orchestrator = new LiveOrchestrator({
      systems,
      broker,
      storage,
      brokerConfig,
      allocation: fileConfig.allocation || args.allocation || "equal",
      maxDailyLossPct: toNumber(fileConfig.maxDailyLossPct ?? args.maxDailyLossPct, 0),
      equity: toNumber(fileConfig.equity ?? args.equity, 10_000),
    });
    await broker.connect(brokerConfig);
    await orchestrator.start();

    if (once && orchestrator.engines?.length) {
      await Promise.all(orchestrator.engines.map((engine) => engine.pollOnce()));
    }

    const status = orchestrator.getStatus();
    console.log(JSON.stringify(status, null, 2));

    if (!watch) {
      await orchestrator.stop();
    }
    return;
  }

  const broker = createBrokerAdapter(args, overrides);
  const brokerConfig = brokerConfigFromArgs(args, overrides);
  const signal = await loadStrategy(overrides.strategy || args.strategy, args);
  const engine = new LiveEngine({
    id: overrides.id || args.id,
    signal,
    symbol: overrides.symbol || args.symbol,
    interval: overrides.interval || args.interval || "1m",
    mode,
    pollIntervalMs: toNumber(overrides.pollIntervalMs ?? args.pollIntervalMs, 60_000),
    warmupBars: toNumber(overrides.warmupBars ?? args.warmupBars, 200),
    equity: toNumber(overrides.equity ?? args.equity, 10_000),
    riskPct: toNumber(overrides.riskPct ?? args.riskPct, 1),
    costs: parseJsonValue(overrides.costs ?? args.costs, null),
    flattenAtClose: toBoolean(overrides.flattenAtClose ?? args.flattenAtClose, false),
    maxDailyLossPct: toNumber(overrides.maxDailyLossPct ?? args.maxDailyLossPct, 0),
    dailyMaxTrades: toNumber(overrides.dailyMaxTrades ?? args.dailyMaxTrades, 0),
    broker,
    storage,
    brokerConfig,
  });

  await engine.start();

  if (once) {
    await engine.pollOnce();
  }

  const status = engine.getStatus();
  console.log(JSON.stringify(status, null, 2));

  if (!watch) {
    await engine.stop();
    return;
  }

  const shutdown = async () => {
    await engine.stop();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

async function commandPaper(args) {
  return commandLive(args, { paper: true, broker: "paper" });
}

async function commandStatus(args) {
  const stateDir = args.dir || args.stateDir || "output/live-state";
  const storage = new JsonFileStorage({ baseDir: stateDir });
  const namespace = args.namespace || args.id;

  if (namespace) {
    const state = await storage.load(namespace);
    const trades = await storage.loadTrades(namespace);
    const equity = await storage.loadEquityCurve(namespace);
    console.log(
      JSON.stringify(
        {
          namespace,
          state,
          trades: trades.length,
          equityPoints: equity.length,
        },
        null,
        2
      )
    );
    return;
  }

  if (!fs.existsSync(stateDir)) {
    console.log(JSON.stringify({ dir: stateDir, namespaces: [] }, null, 2));
    return;
  }

  const namespaces = fs
    .readdirSync(stateDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const summaries = [];
  for (const name of namespaces) {
    const state = await storage.load(name);
    const trades = await storage.loadTrades(name);
    summaries.push({
      namespace: name,
      savedAt: state?.savedAt ?? null,
      equity: state?.equity ?? null,
      openPosition: Boolean(state?.openPosition),
      trades: trades.length,
    });
  }
  console.log(
    JSON.stringify(
      {
        dir: stateDir,
        namespaces: summaries,
      },
      null,
      2
    )
  );
}

const commands = {
  backtest: commandBacktest,
  portfolio: commandPortfolio,
  "walk-forward": commandWalkForward,
  live: commandLive,
  paper: commandPaper,
  status: commandStatus,
  prefetch: commandPrefetch,
  "import-csv": commandImportCsv,
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (args.version || args.v) {
    const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    console.log(pkg.version);
    return;
  }

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
