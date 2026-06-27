# Backtesting

This guide covers the research engine: `backtest`, `backtestAsync`, `backtestTicks`, `backtestPortfolio`, `walkForwardOptimize`, `optimize`, and `buildMetrics`.

[Back to docs](README.md)

## Choose an Entry Point

| Use this when...                        | Call                           |
| --------------------------------------- | ------------------------------ |
| You have candles for one symbol         | `backtest(options)`            |
| Your signal returns a promise           | `backtestAsync(options)`       |
| You have tick or quote data             | `backtestTicks(options)`       |
| You want one result across many systems | `backtestPortfolio(options)`   |
| You want rolling train/test validation  | `walkForwardOptimize(options)` |
| You want a worker-pool parameter sweep  | `optimize(options)`            |
| You already have trades and equity data | `buildMetrics(input)`          |

## Candle Shape

Candles should be sorted oldest to newest.

```js
{
  time: 1735828200000, // Unix milliseconds
  open: 100,
  high: 102,
  low: 99,
  close: 101,
  volume: 1000
}
```

The data loaders normalize common aliases such as `timestamp`, `date`, `o`, `h`, `l`, and `c`.

## First Backtest

```js
import { backtest } from "tradelab";

const result = backtest({
  candles,
  symbol: "SPY",
  interval: "1d",
  equity: 10_000,
  riskPct: 1,
  warmupBars: 50,
  signal({ bar, index, openPosition }) {
    if (openPosition || index < 50) return null;
    return {
      side: "long",
      stop: bar.close * 0.97,
      rr: 2,
    };
  },
});

console.log(result.metrics);
```

Set these options first:

| Option       | Why it matters                                |
| ------------ | --------------------------------------------- |
| `symbol`     | Labels results and exports                    |
| `interval`   | Annualizes metrics correctly                  |
| `equity`     | Starting account value                        |
| `riskPct`    | Default risk per trade when `qty` is absent   |
| `warmupBars` | Prevents indicators from trading before ready |
| `costs`      | Keeps edge estimates from ignoring friction   |

## Signal Contract

Every engine calls your strategy with the same shape:

```js
signal({ candles, index, bar, equity, openPosition, pendingOrder });
```

Return `null` to skip the bar. Return a signal object to enter.

```js
{
  side: "long",
  entry: 101.25,
  stop: 99.75,
  takeProfit: 104.25
}
```

You can omit `entry`; the engine uses the current close. You can also omit `takeProfit` when you provide `rr`.

```js
{ side: "short", stop: 105, rr: 2 }
```

Useful signal fields:

| Field                        | Meaning                           |
| ---------------------------- | --------------------------------- |
| `side`                       | `long`, `short`, `buy`, or `sell` |
| `entry`, `limit`, `price`    | Entry price aliases               |
| `stop`, `stopLoss`, `sl`     | Stop price aliases                |
| `takeProfit`, `target`, `tp` | Target price aliases              |
| `rr` or `_rr`                | Target in R multiples             |
| `qty` or `size`              | Fixed position size               |
| `riskPct` or `riskFraction`  | Per-trade risk override           |

## Async Signals

Use `backtestAsync()` when your signal waits on a model, service, file read, or other async work.

```js
import { backtestAsync, LlmSignal } from "tradelab";

const modelSignal = new LlmSignal({
  budgetMs: 2000,
  onError: "skip",
  async resolve({ candles, bar }) {
    const recent = candles.slice(-10);
    return recent.at(-1).close > recent[0].close
      ? { side: "long", stop: bar.close * 0.98, rr: 2 }
      : null;
  },
});

const result = await backtestAsync({
  candles,
  signal: modelSignal.signal,
  signalBudgetMs: 3000,
});
```

`LlmSignal` caches one decision per bar, blocks lookahead access, records decisions in `log`, and can either skip or throw on errors.

## Costs

The old top-level `slippageBps` and `feeBps` options still work. Prefer `costs` for new work:

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
    commissionPerOrder: 1,
    minCommission: 1,
    carry: {
      longAnnualBps: 500,
      shortAnnualBps: 800,
    },
    funding: {
      rateBps: 10,
      intervalMs: 8 * 60 * 60 * 1000,
      anchorMs: 0,
    },
  },
});
```

How the cost model works:

- slippage is applied in the trade direction
- spread is paid as half-spread on entry and exit
- commission can be bps-based, per-unit, per-order, or mixed
- `minCommission` applies per fill
- carry is annualized and deducted when a leg closes
- funding applies at boundaries in `(openTime, closeTime]`
- positive funding charges longs and credits shorts

Closed trades include `exit.financing` when carry or funding applies. It is already included in `exit.pnl`.

## Result Shape

```js
{
  (symbol,
    interval,
    range,
    trades, // every realized leg
    positions, // completed positions
    openPositions, // still open at the end
    metrics,
    eqSeries,
    replay);
}
```

Use `positions` for normal trade analysis. Use `trades` when you need partial exits or scale-out legs.

Important metrics:

| Metric                 | Meaning                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `trades`               | Number of completed positions                                                       |
| `winRate`              | Winning completed positions / all positions                                         |
| `profitFactor`         | Gross profit / gross loss                                                           |
| `totalPnL`             | Realized PnL                                                                        |
| `returnPct`            | Return on starting equity                                                           |
| `maxDrawdown`          | Max drawdown as a decimal                                                           |
| `sharpeDaily`          | Daily-bucketed Sharpe                                                               |
| `sharpeAnnualized`     | Annualized Sharpe                                                                   |
| `annualizationPeriods` | Periods used for annualization                                                      |
| `sideBreakdown`        | Long and short side summaries                                                       |
| `benchmark`            | Alpha, beta, correlation, and information ratio when benchmark returns are supplied |

Ratios are clamped to finite numbers before returning, so exported JSON does not contain `Infinity` or `NaN`.

## Tick Backtests

`backtestTicks()` uses event-style tick or quote rows:

```js
const result = backtestTicks({
  ticks,
  symbol: "BTC-USD",
  signal,
  queueFillProbability: 0.4,
  seed: "btc-run-1",
});
```

Supported tick fields include `time`, `price`, `last`, `bid`, `ask`, `high`, `low`, `size`, and `volume`. Market entries fill on the next tick. Limit orders can fill at touch based on `queueFillProbability`. Stops use the stop-specific slippage model when provided.

Use `seed` to make probabilistic queue fills reproducible.

## Portfolio Backtests

`backtestPortfolio()` runs multiple systems against one shared account.

```js
const result = backtestPortfolio({
  equity: 100_000,
  interval: "1d",
  maxDailyLossPct: 3,
  systems: [
    { symbol: "SPY", candles: spy, signal: spySignal, weight: 2 },
    { symbol: "QQQ", candles: qqq, signal: qqqSignal, weight: 1 },
  ],
});
```

Weights are default allocation caps, not pre-funded sleeves. Capital is locked when a fill happens, and later fills size against what remains available.

Portfolio result extras:

- `systems`: per-system backtest results
- `eqSeries[].lockedCapital`
- `eqSeries[].availableCapital`
- portfolio-level `metrics`

## Walk-Forward Validation

Use `walkForwardOptimize()` to reduce the risk of choosing parameters that only worked in-sample.

```js
const wf = walkForwardOptimize({
  candles,
  trainBars: 180,
  testBars: 60,
  stepBars: 60,
  mode: "anchored",
  scoreBy: "profitFactor",
  parameterSets,
  signalFactory(params) {
    return createSignal(params);
  },
});
```

For each window, tradelab:

1. scores every parameter set on the training slice
2. chooses the winner
3. runs that winner on the test slice
4. reports aggregate metrics and winner stability

Read `wf.windows` before trusting `wf.metrics`. A strategy that changes winners every window is less convincing than one with stable winners.

## Parallel Parameter Sweeps

`optimize()` runs independent parameter sets in worker threads.

```js
import { optimize, grid } from "tradelab";

const out = await optimize({
  candles,
  interval: "1d",
  signalModulePath: new URL("../strategies/ema.js", import.meta.url).pathname,
  parameterSets: grid({
    fast: [8, 10, 12],
    slow: [30, 50],
  }),
  concurrency: 4,
  scoreBy: "sharpeAnnualized",
});
```

The strategy module should export `createSignal(params)`.

```js
export function createSignal(params) {
  return function signal(context) {
    // return null or a trade signal
  };
}
```

Functions cannot cross worker boundaries, so the worker receives a module path plus JSON-like parameter objects.

## Recomputing Metrics

Use `buildMetrics()` if you have realized trades and an equity curve from another process.

```js
const metrics = buildMetrics({
  closed: trades,
  equityStart: 10_000,
  equityFinal: 11_250,
  candles,
  estBarMs: 86_400_000,
  eqSeries,
  interval: "1d",
});
```

[Back to docs](README.md)
