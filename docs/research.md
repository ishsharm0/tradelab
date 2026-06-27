# Research checks

<small>[Back to docs](README.md)</small>

The `research` namespace contains statistical checks for the part of trading research that usually fails quietly: too many trials, too few trades, unstable winners, and lucky trade order.

```js
import { backtest, research } from "tradelab";

const result = backtest({ candles, interval: "1d", signal });
const tradePnls = result.positions.map((position) => position.exit.pnl);

const mc = research.monteCarlo({
  tradePnls,
  equityStart: 10_000,
  seed: "spy-ema-v1",
});

console.log(mc.finalEquity.p5);
```

Use these helpers after a backtest or parameter sweep. They do not fetch data or run the strategy for you.

## Monte Carlo

`research.monteCarlo(options)` bootstraps completed trade PnLs into many alternate equity paths.

```js
const simulation = research.monteCarlo({
  tradePnls,
  equityStart: 10_000,
  iterations: 1000,
  blockSize: 1,
  seed: "run-1",
});
```

Returns:

| Field         | Meaning                                                       |
| ------------- | ------------------------------------------------------------- |
| `finalEquity` | Percentiles of final equity: `p5`, `p25`, `p50`, `p75`, `p95` |
| `maxDrawdown` | Percentiles of maximum drawdown across simulations            |
| `pathBands`   | Per-trade-step equity bands for charting                      |
| `probProfit`  | Fraction of simulations ending above starting equity          |

Use `blockSize > 1` when you want to preserve short streaks in the realized trade sequence.

## Deflated Sharpe

`research.deflatedSharpe(options)` estimates how convincing an observed Sharpe is after accounting for finite sample size, non-normal returns, and multiple trials.

```js
const probability = research.deflatedSharpe({
  sharpe: result.metrics.sharpeDaily,
  sampleSize: result.metrics.trades,
  numTrials: 20,
  sharpeStd: 0.5,
  skew: 0,
  kurtosis: 3,
});
```

Interpretation:

| Value           | Practical read                                   |
| --------------- | ------------------------------------------------ |
| `< 0.8`         | Weak evidence. Treat the result as exploratory   |
| `0.8` to `0.95` | Interesting, but not enough on its own           |
| `> 0.95`        | Stronger evidence, assuming inputs are realistic |

This is not a guarantee that a strategy will work live. It is a way to penalize easy-to-overfit research.

## Sweep Haircut

`research.sweepHaircut(options)` estimates the Sharpe hurdle created by trying many variants.

```js
const haircut = research.sweepHaircut({
  numTrials: 50,
  sharpeStd: 0.4,
});

console.log(haircut.expectedMaxSharpe);
```

Use `expectedMaxSharpe` as a rough threshold: if your selected strategy barely clears what random searching could have produced, keep testing before trusting it.

## Probability Of Backtest Overfitting

`research.probabilityOfBacktestOverfitting(matrix, options)` estimates PBO with combinatorially symmetric cross-validation.

```js
const matrix = parameterSets.map((params) => returnsForParams(params));

const pbo = research.probabilityOfBacktestOverfitting(matrix, {
  groups: 8,
});
```

Input shape:

| Dimension | Meaning                             |
| --------- | ----------------------------------- |
| Rows      | Strategy variants or parameter sets |
| Columns   | Comparable per-period returns       |

`pbo > 0.5` means the selection process is likely overfit. Lower is better.

## Purged Splits

`research.combinatorialPurgedSplits(options)` creates train/test index splits with optional embargo.

```js
const splits = research.combinatorialPurgedSplits({
  nObservations: candles.length,
  nGroups: 6,
  nTestGroups: 2,
  embargo: 3,
});
```

Each split is:

```js
{
  train: [0, 1, 2],
  test: [30, 31, 32],
  testGroups: [2, 3]
}
```

Use an embargo when labels, indicators, or trade outcomes overlap nearby observations. It keeps training rows too close to the test block out of the training set.

## Low-Level Stats

These are exported for advanced research code:

| Export                             | Purpose                        |
| ---------------------------------- | ------------------------------ |
| `research.combinations(values, k)` | Generate k-combinations        |
| `research.normalCdf(x)`            | Standard normal CDF            |
| `research.normalPpf(p)`            | Standard normal inverse CDF    |
| `research.moments(values)`         | Mean, variance, skew, kurtosis |

## A Practical Gate

For a strategy you might run live, combine several checks:

1. Backtest on realistic costs and slippage.
2. Run walk-forward validation with `walkForwardOptimize()`.
3. Check parameter stability in `bestParamsSummary`.
4. Run Monte Carlo on completed trade PnLs.
5. Penalize multiple trials with deflated Sharpe or sweep haircut.
6. Re-run on a later untouched data period before using live credentials.

## Agent Research Loop

`createResearchStore({ dir })` persists a research session so an agent (or you) can iterate across many runs without losing the thread:

```js
import { createResearchStore } from "tradelab";

const store = createResearchStore({ dir: ".tradelab/research" });
await store.open("btc-trend", "find a robust BTC trend strategy");
await store.log("btc-trend", { hypothesis: "ema 20/50", params: { fast: 20, slow: 50 }, metrics, verdict });
const { entries, summary } = await store.recall("btc-trend");
```

`recall` returns a synthesized summary naming the best Sharpe so far and how many runs were flagged as likely overfit. Over MCP, the same store backs the `research_open`, `research_log`, `research_recall`, and `research_close` tools, and `run_backtest` auto-logs an overfitting verdict when called with a `researchId`. See [the MCP guide](mcp.md).

<small>[Back to docs](README.md)</small>
