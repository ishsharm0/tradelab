# API reference

<small>[Back to main page](README.md)</small>

This page is the compact index of public exports.

If you are learning the package, start with [backtest-engine.md](backtest-engine.md) or [data-reporting-cli.md](data-reporting-cli.md). This page is for quick lookup.

## Backtesting

| Export                         | Summary                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| `backtest(options)`            | Run one strategy on one candle series                          |
| `backtestTicks(options)`       | Run one strategy on tick or quote data                         |
| `backtestPortfolio(options)`   | Run multiple systems through a shared-capital portfolio engine |
| `walkForwardOptimize(options)` | Run rolling or anchored train/test validation                  |
| `buildMetrics(input)`          | Compute metrics from realized trades and equity data           |

## Data

| Export                                                   | Summary                                       |
| -------------------------------------------------------- | --------------------------------------------- |
| `getHistoricalCandles(options)`                          | Load candles from Yahoo or CSV                |
| `backtestHistorical({ data, backtestOptions })`          | Load candles and immediately run `backtest()` |
| `fetchHistorical(symbol, interval, period, options)`     | Call the Yahoo layer directly                 |
| `fetchLatestCandle(symbol, interval, options)`           | Fetch the latest Yahoo candle                 |
| `loadCandlesFromCSV(filePath, options)`                  | Parse and normalize a CSV file                |
| `normalizeCandles(candles)`                              | Normalize candle field names and sort/dedupe  |
| `mergeCandles(...arrays)`                                | Merge multiple candle arrays                  |
| `candleStats(candles)`                                   | Return summary stats for a candle array       |
| `saveCandlesToCache(candles, meta)`                      | Write normalized candles to the local cache   |
| `loadCandlesFromCache(symbol, interval, period, outDir)` | Read normalized candles from the local cache  |
| `cachedCandlesPath(symbol, interval, period, outDir)`    | Return the expected cache path                |

## Reporting

| Export                             | Summary                                    |
| ---------------------------------- | ------------------------------------------ |
| `renderHtmlReport(options)`        | Return the HTML report as a string         |
| `exportHtmlReport(options)`        | Write the HTML report to disk              |
| `exportTradesCsv(trades, options)` | Write a CSV ledger of trades or positions  |
| `exportMetricsJSON(options)`       | Write machine-readable metrics JSON        |
| `exportBacktestArtifacts(options)` | Write HTML, CSV, and metrics JSON together |

## Live module (`tradelab/live`)

Live exports are under a separate entrypoint:

```js
import { LiveEngine, PaperEngine } from "tradelab/live";
```

### Engine and orchestration

- `LiveEngine`
- `LiveOrchestrator`
- `PaperEngine`
- `CandleAggregator`
- `RiskManager`
- `StateManager`

### Broker and feed adapters

- `BrokerAdapter`
- `AlpacaBroker`
- `BinanceBroker`
- `CoinbaseBroker`
- `InteractiveBrokersBroker`
- `FeedProvider`
- `BrokerFeed`
- `PollingFeed`

### Storage and runtime utilities

- `StorageProvider`
- `JsonFileStorage`
- `EventBus`
- `LiveLogger`
- `BrokerClock`

### Factories

- `createLiveEngine(options)`
- `createLiveOrchestrator(options)`
- `createPaperEngine(options)`
- `createAlpacaBroker(options)`
- `createBinanceBroker(options)`
- `createCoinbaseBroker(options)`
- `createInteractiveBrokersBroker(options)`
- `createBrokerFeed(options)`
- `createPollingFeed(options)`
- `createJsonFileStorage(options)`
- `createCandleAggregator(options)`
- `createRiskManager(options)`
- `createStateManager(options)`
- `createEventBus()`
- `createLogger(options)`
- `createClock(options)`

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

## Technical analysis (`tradelab/ta`)

TA exports are under a separate entrypoint:

```js
import { rsi, macd, bollinger, vwap, supertrend } from "tradelab/ta";
```

Every indicator returns a **full-length array aligned to the input** — warmup positions are `undefined` so values index 1:1 with candles. Oscillators accept a `number[]` of closes; range-based indicators accept `{ high, low, close }` candle arrays.

### Oscillators

| Export                                      | Input        | Returns                       | Description                                              |
| ------------------------------------------- | ------------ | ----------------------------- | -------------------------------------------------------- |
| `rsi(closes, period?)`                      | `number[]`   | `(number \| undefined)[]`     | Wilder's RSI; warmup positions are `undefined`           |
| `macd(closes, fast?, slow?, signalPeriod?)` | `number[]`   | `{ macd, signal, histogram }` | MACD line, signal line, and histogram; all full-length   |
| `stochastic(bars, kPeriod?, dPeriod?)`      | candle array | `{ k, d }`                    | Stochastic %K and %D; `k` and `d` are full-length arrays |

### Bands & channels

| Export                                         | Input        | Returns                    | Description                                                   |
| ---------------------------------------------- | ------------ | -------------------------- | ------------------------------------------------------------- |
| `bollinger(closes, period?, mult?)`            | `number[]`   | `{ middle, upper, lower }` | Bollinger Bands with SMA middle and stddev-scaled outer bands |
| `donchian(bars, period?)`                      | candle array | `{ upper, lower, middle }` | Donchian channel: rolling highest-high / lowest-low           |
| `keltner(bars, emaPeriod?, atrPeriod?, mult?)` | candle array | `{ upper, lower, middle }` | Keltner channel: EMA middle with ATR-scaled width             |

### Trend & volume

| Export                             | Input                                 | Returns                   | Description                                                                |
| ---------------------------------- | ------------------------------------- | ------------------------- | -------------------------------------------------------------------------- |
| `supertrend(bars, period?, mult?)` | candle array                          | `{ line, direction }`     | Supertrend support/resistance line; `direction` is `1` (up) or `-1` (down) |
| `vwap(bars)`                       | candle array with `time` and `volume` | `(number \| undefined)[]` | Session VWAP, resets on each UTC calendar day                              |

### Re-exported from main module

| Export                                  | Description                        |
| --------------------------------------- | ---------------------------------- |
| `ema(values, period?)`                  | Exponential moving average         |
| `atr(bars, period?)`                    | Average True Range                 |
| `swingHigh(bars, index, left?, right?)` | Detect swing high at index         |
| `swingLow(bars, index, left?, right?)`  | Detect swing low at index          |
| `detectFVG(bars, index)`                | Detect Fair Value Gap at index     |
| `lastSwing(bars, index, direction)`     | Find the last swing in a direction |
| `structureState(bars, index)`           | Assess market structure state      |

## Types

The package ships declarations in:

- [../types/index.d.ts](../types/index.d.ts) for the main module
- [../types/live.d.ts](../types/live.d.ts) for `tradelab/live`
- [../types/ta.d.ts](../types/ta.d.ts) for `tradelab/ta`

<small>[Back to main page](README.md)</small>
