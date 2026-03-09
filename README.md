<img src="https://i.imgur.com/HGvvQbq.png" width="500" alt="tradelab logo"/>

# tradelab

`tradelab` is a candle-based backtesting toolkit for Node.js. It is built for two use cases:
- you already have candles and want a solid execution/backtest engine
- you want to fetch Yahoo Finance data or import CSVs and backtest with minimal setup

The package stays focused on historical research and testing, and is not trying to be a broker adapter or a live trading framework. 

## Features

- Backtest engine with pending entries, OCO exits, scale-outs, pyramiding, cooldowns, daily risk limits, and optional replay data
- Yahoo Finance historical downloader with local caching
- Flexible CSV import for common OHLCV layouts
- Metrics for positions and realized legs
- CSV trade export
- Self-contained HTML report export
- Utility indicators and session helpers for strategy code

## Installation

```bash
npm install tradelab
```

Node `18+` is required.

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

The simplest entry point is `getHistoricalCandles()`.

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
- `metrics`: aggregate performance stats
- `eqSeries`: realized equity history
- `replay`: chart-friendly frame and event data

## Main Exports

- `backtest(options)`
- `backtestHistorical({ data, backtestOptions })`
- `getHistoricalCandles(options)`
- `fetchHistorical(symbol, interval, period)`
- `loadCandlesFromCSV(filePath, options)`
- `saveCandlesToCache(candles, meta)`
- `loadCandlesFromCache(symbol, interval, period, outDir)`
- `exportBacktestArtifacts({ result, outDir })`

## Reports

The HTML report is self-contained apart from the Plotly CDN script. Report markup, CSS, and client-side chart code live under `templates/`, not inline in the report renderer.

Export helpers default CSV output to completed positions. Use `csvSource: "trades"` if you want every realized leg in the CSV.

## Examples

```bash
node examples/emaCross.js
node examples/yahooEmaCross.js SPY 1d 1y
```

## Notes

- Yahoo downloads can be cached under `output/data` by default.
- The engine is intended for historical research, not brokerage execution.
- File output only happens through the reporting and cache helpers.
