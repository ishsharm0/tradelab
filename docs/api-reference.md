
# API reference
<small>[Back to main page](README.md)</small>

This page is the compact index of public exports.

If you are learning the package, start with [backtest-engine.md](backtest-engine.md) or [data-reporting-cli.md](data-reporting-cli.md). This page is for quick lookup.

## Backtesting

| Export | Summary |
| --- | --- |
| `backtest(options)` | Run one strategy on one candle series |
| `backtestTicks(options)` | Run one strategy on tick or quote data |
| `backtestPortfolio(options)` | Run multiple systems through a shared-capital portfolio engine |
| `walkForwardOptimize(options)` | Run rolling or anchored train/test validation |
| `buildMetrics(input)` | Compute metrics from realized trades and equity data |

## Data

| Export | Summary |
| --- | --- |
| `getHistoricalCandles(options)` | Load candles from Yahoo or CSV |
| `backtestHistorical({ data, backtestOptions })` | Load candles and immediately run `backtest()` |
| `fetchHistorical(symbol, interval, period, options)` | Call the Yahoo layer directly |
| `fetchLatestCandle(symbol, interval, options)` | Fetch the latest Yahoo candle |
| `loadCandlesFromCSV(filePath, options)` | Parse and normalize a CSV file |
| `normalizeCandles(candles)` | Normalize candle field names and sort/dedupe |
| `mergeCandles(...arrays)` | Merge multiple candle arrays |
| `candleStats(candles)` | Return summary stats for a candle array |
| `saveCandlesToCache(candles, meta)` | Write normalized candles to the local cache |
| `loadCandlesFromCache(symbol, interval, period, outDir)` | Read normalized candles from the local cache |
| `cachedCandlesPath(symbol, interval, period, outDir)` | Return the expected cache path |

## Reporting

| Export | Summary |
| --- | --- |
| `renderHtmlReport(options)` | Return the HTML report as a string |
| `exportHtmlReport(options)` | Write the HTML report to disk |
| `exportTradesCsv(trades, options)` | Write a CSV ledger of trades or positions |
| `exportMetricsJSON(options)` | Write machine-readable metrics JSON |
| `exportBacktestArtifacts(options)` | Write HTML, CSV, and metrics JSON together |

## Indicators and utilities

### Indicators

- `ema(values, period)`
- `atr(bars, period)`
- `swingHigh(bars, index, left, right)`
- `swingLow(bars, index, left, right)`
- `detectFVG(bars, index)`
- `lastSwing(bars, index, direction)`
- `structureState(bars, index)`
- `bpsOf(price, bps)`
- `pct(a, b)`

### Position sizing

- `calculatePositionSize(input)`

### Time helpers

- `offsetET(timeMs)`
- `minutesET(timeMs)`
- `isSession(timeMs, session)`
- `parseWindowsCSV(csv)`
- `inWindowsET(timeMs, windows)`

## Types

The package ships declarations in [../types/index.d.ts](../types/index.d.ts). Use that file when you need the exact option and result contracts in TypeScript or editor IntelliSense.

<small>[Back to main page](README.md)</small>