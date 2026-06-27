# Data, Reporting, and CLI

This guide covers data loading, local caches, report exports, and the `tradelab` command.

[Back to docs](README.md)

## Data Loading

Most workflows should start with `getHistoricalCandles()`.

```js
import { getHistoricalCandles } from "tradelab";

const candles = await getHistoricalCandles({
  source: "yahoo",
  symbol: "SPY",
  interval: "1d",
  period: "2y",
  cache: true,
});
```

It returns normalized candles:

```js
{
  (time, open, high, low, close, volume);
}
```

## Sources

| Source  | Use it when...                                      |
| ------- | --------------------------------------------------- |
| `yahoo` | You want quick market data by symbol                |
| `csv`   | You already have a file on disk                     |
| `auto`  | You want CSV when `csvPath` exists, otherwise Yahoo |

### Yahoo

```js
const candles = await getHistoricalCandles({
  source: "yahoo",
  symbol: "QQQ",
  interval: "1d",
  period: "1y",
  cache: true,
  refresh: false,
});
```

Common options:

| Option           | Meaning                                                         |
| ---------------- | --------------------------------------------------------------- |
| `symbol`         | Yahoo symbol                                                    |
| `interval`       | `1m`, `5m`, `1d`, `1wk`, and other Yahoo intervals              |
| `period`         | `5d`, `60d`, `6mo`, `1y`, `2y`, and similar                     |
| `includePrePost` | Include premarket and postmarket candles if Yahoo provides them |
| `cache`          | Reuse a saved normalized file                                   |
| `refresh`        | Download again even if a cache file exists                      |
| `cacheDir`       | Change where cache files are stored                             |

The Yahoo helper retries transient failures. If Yahoo is unavailable, use a cached run or switch to CSV for repeatable tests.

### CSV

```js
const candles = await getHistoricalCandles({
  source: "csv",
  csvPath: "./data/spy.csv",
});
```

If your headers use common OHLCV names, no mapping is needed. For custom files, pass column names or indexes:

```js
const candles = await getHistoricalCandles({
  source: "csv",
  csvPath: "./data/spy.csv",
  csv: {
    timeCol: "timestamp",
    openCol: "open_price",
    highCol: "high_price",
    lowCol: "low_price",
    closeCol: "close_price",
    volumeCol: "volume",
    delimiter: ",",
  },
});
```

## Cache Helpers

The cache is normalized candle JSON on disk. It is useful for repeatable research runs and CI fixtures. It is not a database.

```js
import { saveCandlesToCache, loadCandlesFromCache, cachedCandlesPath } from "tradelab";

const path = saveCandlesToCache(candles, {
  symbol: "SPY",
  interval: "1d",
  period: "1y",
});

const cached = loadCandlesFromCache("SPY", "1d", "1y");
```

## Reporting

### Write All Artifacts

```js
import { exportBacktestArtifacts } from "tradelab";

const files = exportBacktestArtifacts({
  result,
  outDir: "./output",
});

console.log(files);
```

Return shape:

```js
{
  (html, csv, metrics);
}
```

### Export Only What You Need

| Helper                             | Output            |
| ---------------------------------- | ----------------- |
| `exportMetricsJSON(options)`       | Metrics JSON      |
| `exportTradesCsv(trades, options)` | Flat trade ledger |
| `renderHtmlReport(options)`        | HTML string       |
| `exportHtmlReport(options)`        | HTML file path    |

Use metrics JSON for notebooks, dashboards, or downstream jobs. Use trade CSV for spreadsheet review. Use HTML when a human needs to inspect the run.

## CLI

The package installs two binaries:

- `tradelab`
- `tradelab-mcp`

Use `tradelab` when you want a quick command-line run before writing application code.

```bash
tradelab --version
tradelab help
```

### Backtest

```bash
tradelab backtest --source yahoo --symbol SPY --interval 1d --period 1y
tradelab backtest --source csv --csvPath ./data/btc.csv --strategy buy-hold --holdBars 3
```

Built-in CLI strategies:

- `ema-cross`
- `buy-hold`

Local strategy modules can export one of:

- `default(args)`
- `createSignal(args)`
- `signal`

### Portfolio

```bash
tradelab portfolio \
  --csvPaths ./data/spy.csv,./data/qqq.csv \
  --symbols SPY,QQQ \
  --strategy buy-hold
```

The CLI portfolio command is intentionally compact. Use the JavaScript API when you need per-system options or custom signal wiring.

### Walk-Forward

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

You can pass `--strategy ./strategy.mjs` for local modules that export `signalFactory(params, args)` and either `parameterSets` or `createParameterSets(args)`.

### Run a Preset

```bash
tradelab run ema-cross --source yahoo --symbol SPY --period 1y
tradelab run rsi-reversion --source csv --csvPath ./btc.csv --params '{"period":14,"oversold":25}'
```

`tradelab run <preset>` backtests a named built-in strategy and prints a plain-English summary of the result. Use `--params` to override the preset defaults. Run `tradelab run` with an unknown name to see the available presets.

### Live and Paper

```bash
tradelab paper --symbol AAPL --interval 1m --mode polling --once true

tradelab live \
  --strategy ./mySignal.js \
  --symbol AAPL \
  --interval 1m \
  --broker alpaca \
  --apiKey "$APCA_KEY" \
  --apiSecret "$APCA_SECRET"
```

Use a config file for multi-system live runs:

```bash
tradelab live --config ./live-portfolio.json --paper --mode polling
```

Add a dashboard:

```bash
tradelab paper --symbol AAPL --interval 1m --dashboard --dashboardPort 4317
```

### State

```bash
tradelab status --dir ./output/live-state
tradelab status --dir ./output/live-state --namespace aapl-1m
```

State commands read persisted JSON from `JsonFileStorage`; they do not connect to a broker.

## MCP Binary

`tradelab-mcp` starts the stdio MCP server. Most users run it through an MCP client config rather than typing it directly.

See [MCP server](mcp.md).

[Back to docs](README.md)
