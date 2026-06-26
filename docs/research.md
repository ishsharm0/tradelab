# Research & overfitting

<small>[Back to main page](README.md)</small>

The `research` namespace contains pure statistical helpers for checking whether a backtest is robust enough to take seriously.

```js
import { backtest, research } from "tradelab";

const result = backtest({ candles, interval: "1d", signal });
const pnls = result.positions.map((p) => p.exit.pnl);

const mc = research.monteCarlo({ tradePnls: pnls, equityStart: 10_000, seed: 1 });
console.log("5% worst final equity:", mc.finalEquity.p5);

const dsr = research.deflatedSharpe({
  sharpe: result.metrics.sharpeDaily,
  sampleSize: result.metrics.trades,
  numTrials: 20,
  sharpeStd: 0.5,
  skew: 0,
  kurtosis: 3,
});
console.log("Deflated Sharpe prob:", dsr);
```

## `research.monteCarlo(options)`

Seeded block-bootstrap of trade PnLs.

```js
research.monteCarlo({
  tradePnls,
  equityStart: 10_000,
  iterations: 1000,
  blockSize: 1,
  seed: "run-1",
});
```

Returns:

- `finalEquity`: `{ p5, p25, p50, p75, p95 }`
- `maxDrawdown`: `{ p5, p25, p50, p75, p95 }`
- `pathBands`: per-trade-step `{ p5, p50, p95 }` equity bands
- `probProfit`: fraction of simulations ending above starting equity

Use `blockSize > 1` when you want to preserve short streaks in the resampled trade sequence.

## `research.deflatedSharpe(options)`

Returns a probability in `[0, 1]` that the observed Sharpe is real after accounting for finite sample size, non-normality, and multiple trials.

```js
research.deflatedSharpe({
  sharpe,
  sampleSize,
  numTrials,
  sharpeStd,
  skew,
  kurtosis,
});
```

Below roughly `0.95`, treat the Sharpe as not convincingly significant.

## `research.sweepHaircut(options)`

Estimates the expected maximum Sharpe under the null when trying many strategy variants.

```js
research.sweepHaircut({ numTrials: 50, sharpeStd: 0.4 });
```

Use `expectedMaxSharpe` as the multiple-testing hurdle your selected strategy should clear.

## `research.probabilityOfBacktestOverfitting(matrix, options)`

CSCV estimate of Probability of Backtest Overfitting.

```js
const matrix = parameterSets.map((params) => returnsForParams(params));
const pbo = research.probabilityOfBacktestOverfitting(matrix, { groups: 8 });
```

Rows are strategy variants or parameter sets. Columns are per-period returns. `pbo > 0.5` means the selection process is likely overfit; lower is better.

## `research.combinatorialPurgedSplits(options)`

Creates CPCV train/test index splits with optional embargo.

```js
const splits = research.combinatorialPurgedSplits({
  nObservations: candles.length,
  nGroups: 6,
  nTestGroups: 2,
  embargo: 3,
});
```

Each split is `{ train, test, testGroups }`. Training observations near test blocks are purged by `embargo` observations to reduce leakage from overlapping or serially correlated samples.

<small>[Back to main page](README.md)</small>
