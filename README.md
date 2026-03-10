<div align="center">
  <img src="https://i.imgur.com/HGvvQbq.png" width="420" alt="tradelab logo" />

  <p><strong>A Node.js backtesting toolkit for serious trading strategy research.</strong></p>

  [![npm version](https://img.shields.io/npm/v/tradelab?color=0f172a&label=npm&logo=npm)](https://www.npmjs.com/package/tradelab)
  [![GitHub](https://img.shields.io/badge/github-ishsharm0/tradelab-0f172a?logo=github)](https://github.com/ishsharm0/tradelab)
  [![License: MIT](https://img.shields.io/badge/license-MIT-0f172a)](https://github.com/ishsharm0/tradelab/blob/main/LICENSE)
  [![Node.js](https://img.shields.io/badge/node-%3E%3D18-0f172a?logo=node.js)](https://nodejs.org)
  [![TypeScript](https://img.shields.io/badge/TypeScript-ready-0f172a?logo=typescript)](https://github.com/ishsharm0/tradelab/blob/main/types/index.d.ts)

</div>

---

**tradelab** handles the simulation, sizing, exits, costs, and result exports; you bring the data and signal logic.

It works cleanly for a single-strategy backtest and scales up to portfolio runs, walk-forward testing, and detailed execution modeling. It is not a broker connector or a live trading tool.

```bash
npm install tradelab
```

---

## Table of contents

- [What it includes](#what-it-includes)
- [Quick start](#quick-start)
- [Loading historical data](#loading-historical-data)
- [Core concepts](#core-concepts)
- [Portfolio mode](#portfolio-mode)
- [Walk-forward optimization](#walk-forward-optimization)
- [Tick backtests](#tick-backtests)
- [Execution and cost modeling](#execution-and-cost-modeling)
- [Exports and reporting](#exports-and-reporting)
- [CLI](#cli)
- [Examples](#examples)
- [Documentation](#documentation)

---

## What it includes

| Area | What you get |
|---|---|
| **Engine** | Candle and tick backtests with position sizing, exits, replay capture, and cost models |
| **Portfolio** | Multi-system shared-capital simulation with live capital locking and daily loss halts |
| **Walk-forward** | Rolling and anchored train/test validation with parameter search and stability summaries |
| **Data** | Yahoo Finance downloads, CSV import, and local cache helpers |
| **Costs** | Slippage, spread, and commission modeling |
| **Exports** | HTML reports, metrics JSON, and trade CSV |
| **Dev experience** | TypeScript definitions, ESM/CJS support, CLI for quick runs |

---

## Quick start

If you already have candles, `backtest()` is the main entry point.

```js
import { backtest, ema, exportBacktestArtifacts } from "tradelab";

const result = backtest({
  candles,
  symbol: "BTC-USD",
  interval: "5m",
  range: "60d",
  equity: 10_000,
  riskPct: 1,
  signal({ candles: history }) {
    if (history.length < 50) return null;

    const closes = history.map((bar) => bar.close);
    const fast = ema(closes, 10);
    const slow = ema(closes, 30);
    const last = closes.length - 1;

    if (fast[last - 1] <= slow[last - 1] && fast[last] > slow[last]) {
      const entry = history[last].close;
      const stop = Math.min(...history.slice(-15).map((bar) => bar.low));
      const risk = entry - stop;
      if (risk <= 0) return null;

      return { side: "long", entry, stop, rr: 2 };
    }

    return null;
  },
});

exportBacktestArtifacts({ result, outDir: "./output" });
```

After the run, check `result.metrics` for the headline numbers and `result.positions` for the trade log.

---

## Loading historical data

Most users can start with `getHistoricalCandles()`. It abstracts over Yahoo Finance and CSV, handles caching, and normalizes the output so it feeds straight into `backtest()`.

```js
import { getHistoricalCandles, backtest } from "tradelab";

const candles = await getHistoricalCandles({
  source: "yahoo",
  symbol: "SPY",
  interval: "1d",
  period: "2y",
  cache: true,       // reuses local copy on repeated runs
});

const result = backtest({ candles, symbol: "SPY", interval: "1d", range: "2y", signal });
```

**Supported sources:** `yahoo` · `csv` · `auto`

**Supported periods:** `5d` · `60d` · `6mo` · `1y` · `2y` · and more

Use `cache: true` for repeatable research runs. It eliminates network noise and makes failures easier to diagnose.

### CSV import

```js
const candles = await getHistoricalCandles({
  source: "csv",
  csvPath: "./data/spy.csv",
  csv: {
    timeCol: "timestamp",
    openCol: "open",
    // ... optional column mapping
  },
});
```

If your CSV already uses standard OHLCV column names, no mapping is needed at all.

---

## Core concepts

### The signal function

Your signal function is called on every bar. Return `null` to skip, or a signal object to open a trade.

```js
signal({ candles, index, bar, equity, openPosition, pendingOrder }) {
  // return null to skip
  // return a signal to enter
  return {
    side: "long",      // "long" | "short" | "buy" | "sell"
    entry: bar.close,  // defaults to current close if omitted
    stop: bar.close - 2,
    rr: 2,             // target = entry + (entry - stop) * rr
  };
}
```

The minimum viable signal is just `side`, `stop`, and `rr`. Start there and add fields only when the strategy actually needs them.

### Key backtest options

| Option | Purpose |
|---|---|
| `equity` | Starting equity (default `10000`) |
| `riskPct` | Percent of equity risked per trade |
| `warmupBars` | Bars skipped before signal evaluation starts |
| `flattenAtClose` | Forces end-of-day exit when enabled |
| `costs` | Slippage, spread, and commission model |
| `strict` | Throws on lookahead access |
| `collectEqSeries` | Enables equity curve output |
| `collectReplay` | Enables visualization payload |

### Result shape

```js
{
  symbol, interval, range,
  trades,     // every realized leg, including partial exits
  positions,  // completed positions - start here for analysis
  metrics,    // winRate, profitFactor, maxDrawdown, sharpe, ...
  eqSeries,   // [{ time, timestamp, equity }] - equity curve
  replay,     // visualization frames and events
}
```

**First checks after any run:**

- `metrics.trades` - enough sample size to trust the numbers?
- `metrics.profitFactor` - do winners beat losers gross of costs?
- `metrics.maxDrawdown` - is the equity path survivable?
- `metrics.sideBreakdown` - does one side carry the whole result?

---

## Portfolio mode

Use `backtestPortfolio()` when you have one candle array per symbol and want a single combined result.

```js
import { backtestPortfolio } from "tradelab";

const result = backtestPortfolio({
  equity: 100_000,
  systems: [
    { symbol: "SPY", candles: spy, signal: signalA, weight: 2 },
    { symbol: "QQQ", candles: qqq, signal: signalB, weight: 1 },
  ],
});
```

Weights now act as default per-system allocation caps rather than pre-funded sleeves. Capital is locked only when a fill happens, `eqSeries` includes `lockedCapital` and `availableCapital`, later systems size against remaining live capital, and `maxDailyLossPct` on `backtestPortfolio()` can halt the whole book for the rest of the day.

---

## Walk-forward optimization

Use `walkForwardOptimize()` when one in-sample backtest is not enough. It supports rolling and anchored train/test windows across the full candle history.

```js
import { walkForwardOptimize } from "tradelab";

const wf = walkForwardOptimize({
  candles,
  mode: "anchored",
  trainBars: 180,
  testBars: 60,
  stepBars: 60,
  scoreBy: "profitFactor",
  parameterSets: [
    { fast: 8,  slow: 21, rr: 2 },
    { fast: 10, slow: 30, rr: 2 },
  ],
  signalFactory(params) {
    return createSignalFromParams(params);
  },
});
```

Each window picks the best parameter set in training, then runs it blind on the test slice. The `windows` array now includes out-of-sample trade count, profitability, and a per-window stability score. `bestParamsSummary` reports how stable the winners were across the full run.

---

## Tick backtests

Use `backtestTicks()` when you want event-driven fills on tick or quote data without changing the result shape used by metrics, exports, or replay.

```js
import { backtestTicks } from "tradelab";

const result = backtestTicks({
  ticks,
  queueFillProbability: 0.35,
  signal,
});
```

Market entries fill on the next tick, limit orders can fill at the touch with configurable queue probability, and stop exits use the existing cost model with stop-specific slippage if you provide it in `costs.slippageByKind.stop`.

---

## Execution and cost modeling

```js
const result = backtest({
  candles,
  signal,
  costs: {
    slippageBps: 2,
    spreadBps: 1,
    slippageByKind: {
      market: 3,
      limit: 0.5,
      stop: 4,
    },
    commissionBps: 1,
    commissionPerUnit: 0,
    commissionPerOrder: 1,
    minCommission: 1,
  },
});
```

- Slippage is applied in the trade direction
- Spread is modeled as half-spread paid on entry and exit
- Commission can be percentage-based, per-unit, per-order, or mixed
- `minCommission` floors the fee per fill

> Leaving costs at zero is the most common cause of inflated backtests. Set them from the start.

---

## Exports and reporting

```js
import { exportBacktestArtifacts } from "tradelab";

// Writes HTML report + trade CSV + metrics JSON in one call
exportBacktestArtifacts({ result, outDir: "./output" });
```

Or use the narrower helpers:

| Helper | Output |
|---|---|
| `exportHtmlReport(options)` | Interactive HTML report written to disk |
| `renderHtmlReport(options)` | HTML report returned as a string |
| `exportTradesCsv(trades, options)` | Flat trade ledger for spreadsheets or pandas |
| `exportMetricsJSON(options)` | Machine-readable metrics for dashboards or automation |

For programmatic pipelines, `exportMetricsJSON` is usually the most useful format to build on.

---

## CLI

The package ships a `tradelab` binary. Best for quick iteration, smoke tests, and trying the package before wiring it into application code.

```bash
# Backtest from Yahoo
npx tradelab backtest --source yahoo --symbol SPY --interval 1d --period 1y

# Backtest from CSV with a built-in strategy
npx tradelab backtest --source csv --csvPath ./data/btc.csv --strategy buy-hold --holdBars 3

# Multi-symbol portfolio
npx tradelab portfolio \
  --csvPaths ./data/spy.csv,./data/qqq.csv \
  --symbols SPY,QQQ \
  --strategy buy-hold

# Walk-forward validation
npx tradelab walk-forward \
  --source yahoo --symbol QQQ --interval 1d --period 2y \
  --trainBars 180 --testBars 60 --mode anchored

# Prefetch and cache data
npx tradelab prefetch --symbol SPY --interval 1d --period 1y
npx tradelab import-csv --csvPath ./data/spy.csv --symbol SPY --interval 1d
```

**Built-in strategies:** `ema-cross` · `buy-hold`

You can also point `--strategy` at a local module that exports `default(args)`, `createSignal(args)`, or `signal` for `backtest`, or `signalFactory(params, args)` plus `parameterSets`/`createParameterSets(args)` for `walk-forward`.

---

## Examples

```bash
node examples/emaCross.js
node examples/yahooEmaCross.js SPY 1d 1y
```

The examples are a good place to start if you want something runnable before wiring the package into your own strategy code.

---

## Importing

### ESM

```js
import { backtest, getHistoricalCandles, ema } from "tradelab";
import { fetchHistorical } from "tradelab/data";
```

### CommonJS

```js
const { backtest, getHistoricalCandles, ema } = require("tradelab");
const { fetchHistorical } = require("tradelab/data");
```

---

## Documentation

| Guide | What it covers |
|---|---|
| [Backtest engine](docs/backtest-engine.md) | Signal contract, all options, result shape, portfolio mode, walk-forward |
| [Data, reporting, and CLI](docs/data-reporting-cli.md) | Data loading, cache behavior, exports, CLI reference |
| [Strategy examples](docs/examples.md) | Mean reversion, breakout, sentiment, LLM, and portfolio strategy patterns |
| [API reference](docs/api-reference.md) | Compact index of every public export |

---

## Common mistakes

- Using unsorted candles or mixed intervals in a single series
- Reading `trades` as if they were always full positions - use `positions` for top-line analysis
- Leaving costs at zero and overestimating edge
- Trusting one backtest without out-of-sample validation
- Debugging a strategy with `strict: false` when lookahead is possible

---

## Notes

- Node `18+` is required
- Yahoo downloads are cached under `output/data` by default
- CommonJS and ESM are both supported
- The engine is built for historical research - not brokerage execution or full exchange microstructure simulation
