# Backtest engine

This page covers the simulation layer:

- `backtest(options)`
- `backtestPortfolio(options)`
- `walkForwardOptimize(options)`
- `buildMetrics(input)`

## Overview

Use the engine layer when you already have candles and want to simulate strategy behavior, inspect the result, and export or post-process it.

## Choose the right function

| Use case | Function |
| --- | --- |
| One strategy on one candle series | `backtest()` |
| Multiple symbols with one combined result | `backtestPortfolio()` |
| Rolling train/test validation | `walkForwardOptimize()` |
| Recompute metrics from realized trades | `buildMetrics()` |

## Candle input

Candles should be sorted in ascending time order.

```js
{
  time: 1735828200000,
  open: 100,
  high: 102,
  low: 99,
  close: 101,
  volume: 1000
}
```

The package also normalizes common aliases such as `timestamp`, `date`, `o`, `h`, `l`, and `c`.

## `backtest(options)`

`backtest()` is the main single-symbol entry point.

### Minimal example

```js
import { backtest } from "tradelab";

const result = backtest({
  candles,
  signal({ bar, index }) {
    if (index !== 20) return null;
    return {
      side: "long",
      entry: bar.close,
      stop: bar.close - 2,
      rr: 2,
    };
  },
});
```

### Required fields

```js
{
  candles: Candle[],
  signal: ({ candles, index, bar, equity, openPosition, pendingOrder }) => Signal | null
}
```

### Core options

| Option | Purpose |
| --- | --- |
| `symbol`, `interval`, `range` | Labels carried into results and exports |
| `equity` | Starting equity, default `10000` |
| `riskPct` or `riskFraction` | Default risk per trade when `qty` is not provided |
| `warmupBars` | Bars skipped before signal evaluation starts |
| `flattenAtClose` | Forces end-of-day exit when enabled |
| `collectEqSeries`, `collectReplay` | Builds extra output for charts and exports |
| `strict` | Throws on direct lookahead access such as `candles[index + 1]` |
| `costs` | Slippage, spread, and commission model |

If you are starting from scratch, the most useful options to set explicitly are:

- `equity`
- `riskPct`
- `warmupBars`
- `flattenAtClose`
- `costs`

### Signal contract

The signal function receives:

```js
{
  candles,
  index,
  bar,
  equity,
  openPosition,
  pendingOrder
}
```

Return `null` for no trade, or a signal object:

```js
{
  side: "long" | "short",
  entry: 101.25,
  stop: 99.75,
  takeProfit: 104.25
}
```

### Signal conveniences

| Field | Behavior |
| --- | --- |
| `side` | Accepts `long`, `short`, `buy`, or `sell` |
| `entry` | Defaults to the current close if omitted |
| `takeProfit` | Can be derived from `rr` or `_rr` |
| `qty` or `size` | Overrides risk-based sizing |
| `riskPct` or `riskFraction` | Overrides the global risk setting for that trade |

Practical rule: return the smallest signal object that expresses the trade clearly. In many strategies that is just `side`, `stop`, and `rr`.

### Optional per-trade hints

These values are read from the signal object when present:

- `_entryExpiryBars`
- `_cooldownBars`
- `_breakevenAtR`
- `_trailAfterR`
- `_maxBarsInTrade`
- `_maxHoldMin`
- `_rr`
- `_initRisk`
- `_imb`

### Execution and cost model

Legacy options still work:

- `slippageBps`
- `feeBps`

For more control, use `costs`:

```js
{
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
}
```

### Cost model behavior

- slippage is applied in trade direction
- spread is modeled as half-spread paid on entry and exit
- commission can be percentage-based, per-unit, per-order, or mixed
- `minCommission` floors the fee for that fill

This is still a bar-based simulation. It does not model queue position, exchange microstructure, or realistic intrabar order priority.

### Advanced trade management

These are optional. Ignore them until the strategy actually needs them.

- `scaleOutAtR`, `scaleOutFrac`, `finalTP_R`
- `maxDailyLossPct`, `dailyMaxTrades`, `postLossCooldownBars`
- `atrTrailMult`, `atrTrailPeriod`
- `mfeTrail`
- `pyramiding`
- `volScale`
- `entryChase`
- `qtyStep`, `minQty`, `maxLeverage`
- `reanchorStopOnFill`, `maxSlipROnFill`
- `oco`
- `triggerMode`

Recommended order of adoption:

1. Start with `entry`, `stop`, and `rr`
2. Add `costs`
3. Add trailing, scale-outs, or pyramiding only if the real strategy uses them

## Result shape

`backtest()` returns:

```js
{
  symbol,
  interval,
  range,
  trades,
  positions,
  metrics,
  eqSeries,
  replay
}
```

### `trades`

Every realized leg, including partial exits and scale-outs.

### `positions`

Completed positions only. This is the collection most users want for top-line analysis.

If you are unsure whether to use `trades` or `positions`, start with `positions`.

### `metrics`

Most users start with:

- `trades`
- `winRate`
- `expectancy`
- `profitFactor`
- `maxDrawdown`
- `sharpe`
- `avgHold`
- `returnPct`
- `totalPnL`
- `finalEquity`
- `sideBreakdown`

Also included:

- position-vs-leg variants such as `profitFactor_pos` and `profitFactor_leg`
- `rDist` percentiles
- `holdDistMin` percentiles
- daily stats under `daily`

Useful first checks after any run:

- `metrics.trades`: enough sample size to care
- `metrics.profitFactor`: whether winners beat losers gross of the chosen fill model
- `metrics.maxDrawdown`: whether the path is survivable
- `metrics.sideBreakdown`: whether one side carries the result

### `eqSeries`

Realized equity points:

```js
[
  { time, timestamp, equity }
]
```

`time` and `timestamp` contain the same Unix-millisecond value.

### `replay`

Visualization payload:

```js
{
  frames: [{ t, price, equity, posSide, posSize }],
  events: [{ t, price, type, side, size, tradeId, reason, pnl }]
}
```

This is meant for charts and reports, not as a full audit log.

## `backtestPortfolio(options)`

Use portfolio mode when you already have one candle array per symbol and want one combined result.

```js
const result = backtestPortfolio({
  equity: 100_000,
  systems: [
    { symbol: "SPY", candles: spy, signal: signalA, weight: 2 },
    { symbol: "QQQ", candles: qqq, signal: signalB, weight: 1 },
  ],
});
```

### How it works

- capital is allocated up front by weight
- each system runs through the normal single-symbol engine
- the portfolio result merges trades, positions, replay events, and equity series

### What it is not

- a cross-margin broker simulator
- a portfolio-level fill arbiter
- a shared capital-locking engine

If you need shared real-time portfolio constraints, this is not that tool yet.

## `walkForwardOptimize(options)`

Use walk-forward mode when one in-sample backtest is not enough and you want rolling train/test validation.

```js
const wf = walkForwardOptimize({
  candles,
  trainBars: 180,
  testBars: 60,
  stepBars: 60,
  scoreBy: "profitFactor",
  parameterSets: [
    { fast: 8, slow: 21, rr: 2 },
    { fast: 10, slow: 30, rr: 2 },
  ],
  signalFactory(params) {
    return createSignalFromParams(params);
  },
});
```

### How it works

1. Evaluate every parameter set on the training slice
2. Pick the best one by `scoreBy`
3. Run that parameter set on the next test slice
4. Repeat for each window

### Return value

- `windows`: per-window summaries and chosen parameters
- `trades`, `positions`, `metrics`, `eqSeries`
- `bestParams`: chosen parameters for each window

In practice, the per-window output matters more than the aggregate headline. If the winning parameters swing wildly from one window to the next, treat that as a real signal.

## `buildMetrics(input)`

Most users do not need this directly. Use it when:

- you generate realized trades outside `backtest()`
- you filter a result and want fresh metrics
- you combine results manually

## Common mistakes

- using unsorted candles or mixed intervals in one series
- reading `trades` as if they were always full positions
- leaving costs at zero and overestimating edge
- trusting one backtest without out-of-sample validation
- debugging a strategy with `strict: false` when lookahead is possible
