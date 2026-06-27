# API reference

<small>[Back to docs](README.md)</small>

This is the import index for the public package surface. For explanations and longer examples, start with the guides linked from [docs/README.md](README.md).

## Entry Points

| Import path     | Use it for                                     |
| --------------- | ---------------------------------------------- |
| `tradelab`      | Backtests, data, reports, research, indicators |
| `tradelab/data` | Data helpers only                              |
| `tradelab/live` | Paper/live engines, broker adapters, dashboard |
| `tradelab/ta`   | Technical indicators                           |
| `tradelab/mcp`  | Programmatic MCP server creation               |

CLI binaries:

| Binary         | Use it for                      |
| -------------- | ------------------------------- |
| `tradelab`     | Backtests, reports, live, paper |
| `tradelab-mcp` | stdio MCP server                |

## Main Module: `tradelab`

```js
import { backtest, getHistoricalCandles, ema } from "tradelab";
```

### Backtesting

| Export                         | Summary                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `backtest(options)`            | Run one synchronous signal over one candle series                               |
| `backtestAsync(options)`       | Run one async signal over one candle series                                     |
| `backtestTicks(options)`       | Run one signal on tick-like data with tick-level fill handling                  |
| `backtestPortfolio(options)`   | Run multiple systems through shared capital                                     |
| `walkForwardOptimize(options)` | Run rolling or anchored train/test validation                                   |
| `grid(spec)`                   | Expand scalar/array parameter specs into parameter sets                         |
| `optimize(options)`            | Run parameter sets in worker threads with a strategy module                     |
| `LlmSignal`                    | Async signal wrapper with timeout, one-decision-per-bar cache, and decision log |

`backtest()` returns:

| Field           | Meaning                                        |
| --------------- | ---------------------------------------------- |
| `trades`        | Realized legs, including partial exits         |
| `positions`     | Completed positions                            |
| `openPositions` | Positions still open at the end of the data    |
| `metrics`       | Aggregate performance statistics               |
| `eqSeries`      | Realized equity points for charts and exports  |
| `replay`        | Lightweight chart frames and entry/exit events |

### Metrics

| Export                  | Summary                                               |
| ----------------------- | ----------------------------------------------------- |
| `buildMetrics(input)`   | Compute aggregate metrics from trades/equity          |
| `benchmarkStats(input)` | Compute benchmark comparison stats                    |
| `periodsPerYear(value)` | Convert interval/bar spacing to annualization periods |
| `clampFinite(value)`    | Clamp non-finite numbers for report output            |
| `BIG_NUMBER`            | Large finite sentinel used by metrics                 |

### Strategy Registry

| Export                        | Summary                                     |
| ----------------------------- | ------------------------------------------- |
| `listStrategies()`            | List built-in and registered strategy names |
| `getStrategy(name)`           | Get a registered strategy factory           |
| `registerStrategy(name, def)` | Register a named strategy at runtime        |

Strategy definitions use:

```js
registerStrategy("my-strategy", {
  description: "Readable description",
  params: {
    lookback: { type: "number", default: 20 },
  },
  factory(params) {
    return (context) => null;
  },
});
```

### Data

| Export                                                   | Summary                                    |
| -------------------------------------------------------- | ------------------------------------------ |
| `getHistoricalCandles(options)`                          | Load candles from Yahoo or CSV             |
| `backtestHistorical({ data, backtestOptions })`          | Load data and immediately run `backtest()` |
| `fetchHistorical(symbol, interval, period, options)`     | Fetch Yahoo candles directly               |
| `fetchLatestCandle(symbol, interval, options)`           | Fetch the latest Yahoo candle              |
| `loadCandlesFromCSV(filePath, options)`                  | Parse and normalize a CSV file             |
| `normalizeCandles(candles)`                              | Normalize field names, sort, and dedupe    |
| `mergeCandles(...arrays)`                                | Merge candle arrays, sort, and dedupe      |
| `candleStats(candles)`                                   | Summarize count, range, duration, interval |
| `saveCandlesToCache(candles, meta)`                      | Write candles to the local cache           |
| `loadCandlesFromCache(symbol, interval, period, outDir)` | Read candles from the local cache          |
| `cachedCandlesPath(symbol, interval, period, outDir)`    | Return the expected cache path             |

### Reporting

| Export                             | Summary                                      |
| ---------------------------------- | -------------------------------------------- |
| `renderHtmlReport(options)`        | Return the HTML report as a string           |
| `exportHtmlReport(options)`        | Write an HTML report                         |
| `exportTradesCsv(trades, options)` | Write a trade or position CSV ledger         |
| `exportMetricsJSON(options)`       | Write machine-readable metrics JSON          |
| `exportBacktestArtifacts(options)` | Write HTML, CSV, and JSON artifacts together |

### Research

```js
import { research } from "tradelab";
```

| Export                                                       | Summary                                                    |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| `research.monteCarlo(options)`                               | Bootstrap trade PnLs into alternate equity paths           |
| `research.deflatedSharpe(options)`                           | Penalize Sharpe for sample size, non-normality, and trials |
| `research.sweepHaircut(options)`                             | Estimate the Sharpe hurdle from many trials                |
| `research.probabilityOfBacktestOverfitting(matrix, options)` | Estimate PBO from a performance matrix                     |
| `research.combinatorialPurgedSplits(options)`                | Build purged train/test splits                             |
| `research.combinations(n, k)`                                | Generate combinations                                      |
| `research.normalCdf(x)`                                      | Standard normal CDF                                        |
| `research.normalPpf(p)`                                      | Standard normal inverse CDF                                |
| `research.moments(values)`                                   | Mean, standard deviation, skew, kurtosis                   |

### Indicators And Helpers

| Export                                | Summary                                      |
| ------------------------------------- | -------------------------------------------- |
| `ema(values, period)`                 | Exponential moving average                   |
| `atr(bars, period)`                   | Average True Range                           |
| `swingHigh(bars, index, left, right)` | Detect a swing high at an index              |
| `swingLow(bars, index, left, right)`  | Detect a swing low at an index               |
| `detectFVG(bars, index)`              | Detect a Fair Value Gap                      |
| `lastSwing(bars, index, direction)`   | Find the last swing in a direction           |
| `structureState(bars, index)`         | Return latest swing high/low state           |
| `bpsOf(price, bps)`                   | Convert basis points to price distance       |
| `pct(a, b)`                           | Percent difference helper                    |
| `calculatePositionSize(input)`        | Risk-based quantity calculation              |
| `offsetET(timeMs)`                    | Eastern Time offset helper                   |
| `minutesET(timeMs)`                   | Minutes since midnight Eastern Time          |
| `isSession(timeMs, session)`          | Check known trading sessions                 |
| `parseWindowsCSV(csv)`                | Parse windows like `09:30-11:30,13:00-15:30` |
| `inWindowsET(timeMs, windows)`        | Check whether a timestamp is inside windows  |

## Data Module: `tradelab/data`

```js
import { getHistoricalCandles, loadCandlesFromCSV } from "tradelab/data";
```

This entry point exports the data helpers from the main module:

- `getHistoricalCandles`
- `backtestHistorical`
- `fetchHistorical`
- `fetchLatestCandle`
- `loadCandlesFromCSV`
- `normalizeCandles`
- `mergeCandles`
- `candleStats`
- `saveCandlesToCache`
- `loadCandlesFromCache`
- `cachedCandlesPath`

## Live Module: `tradelab/live`

```js
import { LiveEngine, PaperEngine, createDashboardServer } from "tradelab/live";
```

### Engines

| Export                            | Summary                                      |
| --------------------------------- | -------------------------------------------- |
| `LiveEngine`                      | Single-system live or paper execution engine |
| `createLiveEngine(options)`       | Factory for `LiveEngine`                     |
| `LiveOrchestrator`                | Multi-system engine sharing one broker       |
| `createLiveOrchestrator(options)` | Factory for `LiveOrchestrator`               |
| `PaperEngine`                     | In-process broker simulator                  |
| `createPaperEngine(options)`      | Factory for `PaperEngine`                    |

### Broker Adapters

| Export                                                        | Summary                                 |
| ------------------------------------------------------------- | --------------------------------------- |
| `BrokerAdapter`                                               | Base broker interface                   |
| `AlpacaBroker` / `createAlpacaBroker`                         | Alpaca adapter and factory              |
| `BinanceBroker` / `createBinanceBroker`                       | Binance adapter and factory             |
| `CoinbaseBroker` / `createCoinbaseBroker`                     | Coinbase adapter and factory            |
| `InteractiveBrokersBroker` / `createInteractiveBrokersBroker` | Interactive Brokers adapter and factory |

### Feeds

| Export                            | Summary                                     |
| --------------------------------- | ------------------------------------------- |
| `FeedProvider`                    | Base feed interface                         |
| `BrokerFeed`                      | Feed backed by broker subscriptions         |
| `createBrokerFeed(options)`       | Factory for `BrokerFeed`                    |
| `PollingFeed`                     | Polling feed backed by broker history calls |
| `createPollingFeed(options)`      | Factory for `PollingFeed`                   |
| `CandleAggregator`                | Aggregate ticks/polled bars into candles    |
| `createCandleAggregator(options)` | Factory for `CandleAggregator`              |

### State, Risk, Events

| Export                           | Summary                                           |
| -------------------------------- | ------------------------------------------------- |
| `StorageProvider`                | Base persistence interface                        |
| `JsonFileStorage`                | JSON/JSONL file storage                           |
| `createJsonFileStorage(options)` | Factory for `JsonFileStorage`                     |
| `StateManager`                   | Load, save, append, and reconcile state           |
| `createStateManager(options)`    | Factory for `StateManager`                        |
| `RiskManager`                    | Daily loss, drawdown, session, and position gates |
| `createRiskManager(options)`     | Factory for `RiskManager`                         |
| `EventBus`                       | Event emitter with `emitEvent()` and `onAny()`    |
| `LIVE_EVENTS`                    | Named live event constants                        |
| `createEventBus()`               | Factory for `EventBus`                            |
| `LiveLogger`                     | Structured event logger                           |
| `createLogger(options)`          | Factory for `LiveLogger`                          |
| `BrokerClock`                    | Broker/local clock offset helper                  |
| `createClock(options)`           | Factory for `BrokerClock`                         |

### Dashboard

| Export                           | Summary                                                |
| -------------------------------- | ------------------------------------------------------ |
| `createDashboardServer(options)` | Local HTTP dashboard for an engine/orchestrator source |

The dashboard source must expose `eventBus` and may expose `getStatus()`.

## Technical Analysis Module: `tradelab/ta`

```js
import { rsi, macd, bollinger, vwap, supertrend } from "tradelab/ta";
```

TA functions return arrays aligned to the input. Warmup positions are `undefined` where a value cannot be computed yet.

### Re-exported Core Indicators

| Export                                  | Input      | Returns                    |
| --------------------------------------- | ---------- | -------------------------- |
| `ema(values, period?)`                  | `number[]` | `number[]`                 |
| `atr(bars, period?)`                    | candles    | `(number \| undefined)[]`  |
| `swingHigh(bars, index, left?, right?)` | candles    | `boolean`                  |
| `swingLow(bars, index, left?, right?)`  | candles    | `boolean`                  |
| `detectFVG(bars, index)`                | candles    | gap object or `null`       |
| `lastSwing(bars, index, direction)`     | candles    | `{ idx, price }` or `null` |
| `structureState(bars, index)`           | candles    | latest swing state         |

### Oscillators

| Export                                      | Input      | Returns                       |
| ------------------------------------------- | ---------- | ----------------------------- |
| `rsi(closes, period?)`                      | `number[]` | `(number \| undefined)[]`     |
| `macd(closes, fast?, slow?, signalPeriod?)` | `number[]` | `{ macd, signal, histogram }` |
| `stochastic(bars, kPeriod?, dPeriod?)`      | candles    | `{ k, d }`                    |

### Bands And Channels

| Export                                         | Input      | Returns                    |
| ---------------------------------------------- | ---------- | -------------------------- |
| `bollinger(closes, period?, mult?)`            | `number[]` | `{ middle, upper, lower }` |
| `donchian(bars, period?)`                      | candles    | `{ upper, lower, middle }` |
| `keltner(bars, emaPeriod?, atrPeriod?, mult?)` | candles    | `{ upper, lower, middle }` |

### Trend And Volume

| Export                             | Input   | Returns                   |
| ---------------------------------- | ------- | ------------------------- |
| `supertrend(bars, period?, mult?)` | candles | `{ line, direction }`     |
| `vwap(bars)`                       | candles | `(number \| undefined)[]` |

## MCP Module: `tradelab/mcp`

```js
import { createServer, startStdioServer } from "tradelab/mcp";
```

| Export               | Summary                                 |
| -------------------- | --------------------------------------- |
| `createServer()`     | Build an MCP server with tradelab tools |
| `startStdioServer()` | Start the MCP server on stdio           |

See [mcp.md](mcp.md) for client configuration and tool payload examples.

## Types

The package ships TypeScript declarations:

| File               | Covers          |
| ------------------ | --------------- |
| `types/index.d.ts` | `tradelab`      |
| `types/data.d.ts`  | `tradelab/data` |
| `types/live.d.ts`  | `tradelab/live` |
| `types/ta.d.ts`    | `tradelab/ta`   |
| `types/mcp.d.ts`   | `tradelab/mcp`  |

<small>[Back to docs](README.md)</small>
