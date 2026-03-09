<img src="https://i.imgur.com/HGvvQbq.png" width="500" alt="tradelab logo"/>

# tradelab

`tradelab` is a Node.js backtesting toolkit for trading strategy research. It lets you:
- load candles from Yahoo Finance or CSV
- run candle-based backtests with sizing, exits, and risk controls
- export trades, metrics, and HTML reports

The package is modular by design, so you can use just the parts you need: data loading, backtesting, reporting, or the utility layer on its own.

It is built for historical research and testing, not broker connectivity or live trading.

## Features

- Modular structure: use the full workflow or just the engine, data layer, reporting, or helpers
- Backtest engine with pending entries, OCO exits, scale-outs, pyramiding, cooldowns, daily loss limits, optional replay/equity capture, and configurable slippage/commission modeling
- Historical data loading from Yahoo Finance, with local caching to avoid repeated downloads
- CSV import for common OHLCV formats and custom column mappings
- Position-level and leg-level metrics, including drawdown, expectancy, hold-time stats, and side breakdowns
- Multi-symbol portfolio aggregation and rolling walk-forward optimization helpers
- HTML report export, metrics JSON export, and trade CSV export
- Utility indicators and session helpers for strategy development
- CLI entrypoint for fetching data and running quick backtests from the terminal
- TypeScript definitions for the public API

## Installation

```bash
npm install tradelab
```

Node `18+` is required.

## Importing


### ESM (recommended)

```js
import { backtest, getHistoricalCandles, ema } from "tradelab";
import { fetchHistorical } from "tradelab/data";
```

### CommonJS

```js
const { backtest, getHistoricalCandles, ema } = require("tradelab");
const { fetchHistorical } = require("tradelab/data");
```

## Quick Start

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

      return {
        side: "long",
        entry,
        stop,
        rr: 2,
      };
    }

    return null;
  },
});

exportBacktestArtifacts({
  result,
  outDir: "./output",
});
```

## Getting Historical Data

The simplest entry point is `getHistoricalCandles()`. For most users, it is the only data-loading function you need.

### Yahoo Finance

```js
import { getHistoricalCandles, backtest } from "tradelab";

const candles = await getHistoricalCandles({
  source: "yahoo",
  symbol: "SPY",
  interval: "1d",
  period: "2y",
  cache: true,
});

const result = backtest({
  candles,
  symbol: "SPY",
  interval: "1d",
  range: "2y",
  signal,
});
```

Supported period examples: `5d`, `60d`, `6mo`, `1y`.

### CSV

```js
import { getHistoricalCandles } from "tradelab";

const candles = await getHistoricalCandles({
  source: "csv",
  symbol: "BTC-USD",
  interval: "5m",
  csvPath: "./data/btc-5m.csv",
  csv: {
    timeCol: "time",
    openCol: "open",
    highCol: "high",
    lowCol: "low",
    closeCol: "close",
    volumeCol: "volume",
  },
});
```

If you pass `csvPath` and omit `source`, the loader will auto-detect CSV mode.

## Signal Contract

Your strategy function receives:

```js
{
  candles,      // history through the current bar
  index,        // current index in the original candle array
  bar,          // current candle
  equity,       // realized equity
  openPosition, // null or current position
  pendingOrder  // null or current pending entry
}
```

Return `null` for no trade, or a signal object:

```js
{
  side: "long" | "short",
  entry: Number,
  stop: Number,
  takeProfit: Number
}
```

Quality-of-life behavior:

- `side` also accepts `buy` and `sell`
- `entry` can be omitted and will default to the current bar close
- `takeProfit` can be omitted if `rr` or `_rr` is provided
- `qty` or `size` can override risk-based sizing
- `riskPct` or `riskFraction` can override the global risk setting per signal
- `strict: true` throws if the strategy directly accesses candles beyond the current index

Optional engine hints:

- `_entryExpiryBars`
- `_cooldownBars`
- `_breakevenAtR`
- `_trailAfterR`
- `_maxBarsInTrade`
- `_maxHoldMin`
- `_rr`
- `_initRisk`
- `_imb`

## Result Shape

`backtest()` returns:

- `trades`: every realized leg, including scale-outs
- `positions`: completed positions only
- `metrics`: aggregate stats including `winRate`, `expectancy`, `profitFactor`, `maxDrawdown`, `sharpe`, `avgHold`, and `sideBreakdown`
- `eqSeries`: realized equity history as `{ time, timestamp, equity }`
- `replay`: chart-friendly frame and event data

## Main Exports

- `backtest(options)`
- `backtestPortfolio({ systems, equity })`
- `walkForwardOptimize({ candles, signalFactory, parameterSets, trainBars, testBars })`
- `backtestHistorical({ data, backtestOptions })`
- `getHistoricalCandles(options)`
- `fetchHistorical(symbol, interval, period)`
- `loadCandlesFromCSV(filePath, options)`
- `saveCandlesToCache(candles, meta)`
- `loadCandlesFromCache(symbol, interval, period, outDir)`
- `exportMetricsJSON({ result, outDir })`
- `exportBacktestArtifacts({ result, outDir })`

## Reports

The HTML report is self-contained apart from the Plotly CDN script. Report markup, CSS, and client-side chart code live under `templates/`.

Export helpers default CSV output to completed positions. Use `csvSource: "trades"` if you want every realized leg in the CSV.

## Examples

```bash
node examples/emaCross.js
node examples/yahooEmaCross.js SPY 1d 1y
```

## CLI

```bash
npx tradelab backtest --source yahoo --symbol SPY --interval 1d --period 1y
npx tradelab backtest --source csv --csvPath ./data/btc.csv --strategy buy-hold --holdBars 3
npx tradelab walk-forward --source yahoo --symbol QQQ --interval 1d --period 2y --trainBars 180 --testBars 60
```

## Notes

- Yahoo downloads can be cached under `output/data` by default.
- The engine is intended for historical research, not brokerage execution.
- File output only happens through the reporting and cache helpers.
- CommonJS and ESM are both supported.
