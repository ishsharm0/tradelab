# Data, reporting, and CLI
<small>[Back to main page](README.md)</small>

This page covers the parts of the package around the core engine:

- historical data loading
- local cache helpers
- export helpers
- command-line usage

## Overview

If you are not bringing your own candles yet, start here.

## Choose the right entry point

| Use case | Function |
| --- | --- |
| Load data without caring about the source-specific helper | `getHistoricalCandles()` |
| Fetch directly from Yahoo | `fetchHistorical()` |
| Load a local CSV file | `loadCandlesFromCSV()` |
| Reuse saved normalized data | `loadCandlesFromCache()` |
| Try the package from a terminal first | `tradelab` CLI |

## Historical data

### `getHistoricalCandles(options)`

This is the main data-loading entry point.

```js
const candles = await getHistoricalCandles({
  source: "yahoo",
  symbol: "SPY",
  interval: "1d",
  period: "2y",
  cache: true,
});
```

### Sources

- `yahoo`
- `csv`
- `auto`

`auto` switches to CSV when `csvPath` or `csv.filePath` is present. Otherwise it uses Yahoo.

If you are writing application code, prefer `getHistoricalCandles()` over calling source-specific helpers directly.

### Yahoo options

| Option | Purpose |
| --- | --- |
| `symbol` | Ticker or Yahoo symbol |
| `interval` | Candle interval such as `1d` or `5m` |
| `period` | Lookback period such as `6mo` or `1y` |
| `includePrePost` | Includes premarket and postmarket data when supported |
| `cache` | Reuses saved normalized data |
| `refresh` | Forces a fresh download even if cache exists |
| `cacheDir` | Overrides the default cache directory |

The Yahoo layer retries transient failures with exponential backoff. If the endpoint still fails, the error message points users toward CSV or cached data.

Use caching for repeatable research runs. It reduces network noise and makes failures easier to diagnose.

### CSV options

```js
const candles = await getHistoricalCandles({
  source: "csv",
  csvPath: "./data/spy.csv",
  csv: {
    timeCol: "timestamp",
    openCol: "open",
    highCol: "high",
    lowCol: "low",
    closeCol: "close",
    volumeCol: "volume",
  },
});
```

CSV parsing can be configured with:

- delimiter
- header presence
- column names or indexes
- start/end date filters
- custom date parsing

If your CSV already uses common OHLCV column names, you often do not need to pass any mapping at all.

## Cache helpers

Available helpers:

- `saveCandlesToCache(candles, meta)`
- `loadCandlesFromCache(symbol, interval, period, outDir)`
- `cachedCandlesPath(symbol, interval, period, outDir)`

The cache is just normalized candle JSON on disk. It is meant for research convenience, not as a durable database layer.

## Common workflows

### Yahoo to backtest

```js
const candles = await getHistoricalCandles({
  source: "yahoo",
  symbol: "SPY",
  interval: "1d",
  period: "1y",
  cache: true,
});
```

### CSV to backtest

```js
const candles = await getHistoricalCandles({
  source: "csv",
  csvPath: "./data/spy.csv",
});
```

### Cached repeat run

```js
const candles = await getHistoricalCandles({
  source: "yahoo",
  symbol: "SPY",
  interval: "1d",
  period: "1y",
  cache: true,
  refresh: false,
});
```

## Reporting and exports

### `exportBacktestArtifacts({ result, outDir })`

The main bundle export. By default it writes:

- HTML report
- trade CSV
- metrics JSON

Return value:

```js
{
  csv,
  html,
  metrics
}
```

If you only need one output type, call the narrower helper directly.

### `exportMetricsJSON({ result, outDir })`

Use this for dashboards, notebooks, or any machine-readable downstream pipeline.

For automation, this is usually the best export format to build on.

### `exportTradesCsv(trades, options)`

Use this when you want a flat trade ledger for spreadsheets or pandas-style workflows.

### `renderHtmlReport(options)` and `exportHtmlReport(options)`

- `renderHtmlReport()` returns an HTML string
- `exportHtmlReport()` writes the file and returns its path

The report system uses the assets under `templates/`. The renderer injects the payload and keeps markup, CSS, and client script separate from the JS entrypoint.

## CLI

The package ships with a `tradelab` binary.

The CLI is best for quick iteration, smoke tests, and trying the package before building a JS workflow around it.

## Commands

| Command | Purpose |
| --- | --- |
| `tradelab backtest` | Run a single backtest from Yahoo or CSV |
| `tradelab portfolio` | Run a simple multi-file portfolio backtest |
| `tradelab walk-forward` | Run rolling or anchored validation with built-in or local strategy search |
| `tradelab prefetch` | Download and cache Yahoo data |
| `tradelab import-csv` | Normalize and cache a CSV file |

### Backtest

```bash
tradelab backtest --source yahoo --symbol SPY --interval 1d --period 1y
tradelab backtest --source csv --csvPath ./data/btc.csv --strategy buy-hold --holdBars 3
```

Built-in strategies:

- `ema-cross`
- `buy-hold`

You can also point `--strategy` at a local module. The module should export one of:

- `default(args)`
- `createSignal(args)`
- `signal`

That makes it easy to prototype a strategy file before wiring it into a larger application.

### Portfolio

```bash
tradelab portfolio \
  --csvPaths ./data/spy.csv,./data/qqq.csv \
  --symbols SPY,QQQ \
  --strategy buy-hold
```

This command is intentionally simple. Use it for quick combined runs, not for custom portfolio logic.

### Walk-forward

```bash
tradelab walk-forward \
  --source yahoo \
  --symbol QQQ \
  --interval 1d \
  --period 2y \
  --trainBars 180 \
  --testBars 60 \
  --mode anchored
```

The CLI walk-forward command defaults to the built-in `ema-cross` search, but `--strategy ./path/to/module.mjs` can now load a local module that exports `signalFactory(params, args)` and either `parameterSets` or `createParameterSets(args)`. Inline JSON grids are also accepted through `--parameterSets`.

### Cache utilities

```bash
tradelab prefetch --symbol SPY --interval 1d --period 1y
tradelab import-csv --csvPath ./data/spy.csv --symbol SPY --interval 1d
```

## Troubleshooting

| Problem | Check first |
| --- | --- |
| Yahoo request errors | enable cache, retry later, or fall back to CSV |
| Unexpected trade count | `warmupBars`, `flattenAtClose`, and signal frequency |
| Empty result | candle order, signal logic, and stop/target validity |
| Confusing CSV import | inspect normalized bars from `loadCandlesFromCSV()` before backtesting |
| Export confusion | use metrics JSON first if you need programmatic output |

<small>[Back to main page](README.md)</small>