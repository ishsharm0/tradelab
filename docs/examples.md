# Strategy examples
<small>[Back to main page](README.md)</small>

These are research templates. They show how to wire different kinds of data and execution assumptions into the engine without changing the output pipeline.

The five examples cover:

- single-symbol price research
- tick-level fills
- external feature overlays
- model-derived regime filters with walk-forward validation
- portfolio research with shared capital

---

## 1. Mean reversion pullback

Entry when price is stretched below its 20-bar mean. Exit via stop and take-profit.

```js
import { backtest, getHistoricalCandles } from "tradelab";

function sma(values, period) {
  if (values.length < period) return null;
  return values.slice(-period).reduce((sum, v) => sum + v, 0) / period;
}

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
  warmupBars: 25,
  signal({ candles: history, bar }) {
    const closes = history.map((c) => c.close);
    const mean = sma(closes, 20);
    if (!mean) return null;

    const stretch = (bar.close - mean) / mean;
    if (stretch > -0.03) return null;

    return {
      side: "long",
      entry: bar.close,
      stop: bar.low * 0.99,
      rr: 1.5,
      _maxBarsInTrade: 5,
    };
  },
});
```

---

## 2. Opening-range breakout on ticks

Breakout logic where fill order matters. `backtestTicks()` resolves fills at tick resolution instead of bar close. The result shape is identical to `backtest()`.

```js
import { backtestTicks } from "tradelab";

const result = backtestTicks({
  ticks,
  symbol: "NQ",
  equity: 25_000,
  queueFillProbability: 0.4,
  costs: {
    spreadBps: 0.5,
    slippageByKind: {
      market: 2,
      stop: 4,
    },
  },
  signal({ candles: history, bar, index }) {
    if (index < 30) return null;

    const openingRange = history.slice(0, 30);
    const rangeHigh = Math.max(...openingRange.map((t) => t.high));
    const rangeLow = Math.min(...openingRange.map((t) => t.low));

    if (bar.close > rangeHigh) {
      return { side: "long", entry: rangeHigh, stop: rangeLow, rr: 2 };
    }

    if (bar.close < rangeLow) {
      return { side: "short", entry: rangeLow, stop: rangeHigh, rr: 2 };
    }

    return null;
  },
});
```

`queueFillProbability` controls what fraction of limit touches actually fill. Set it to `1` for optimistic fills, `0` to require the price to trade through.

---

## 3. Sentiment overlay on a candle strategy

Enrich candles with a second data source before the backtest starts. The engine does not care where extra fields come from.

```js
import { backtest, getHistoricalCandles, ema } from "tradelab";

const candles = await getHistoricalCandles({
  source: "yahoo",
  symbol: "AAPL",
  interval: "1d",
  period: "2y",
});

const sentimentByDay = new Map([
  ["2025-01-02", 0.75],
  ["2025-01-03", -0.10],
  // ...
]);

const enriched = candles.map((bar) => ({
  ...bar,
  sentiment:
    sentimentByDay.get(new Date(bar.time).toISOString().slice(0, 10)) ?? 0,
}));

const result = backtest({
  candles: enriched,
  symbol: "AAPL",
  warmupBars: 30,
  signal({ candles: history, bar }) {
    const closes = history.map((c) => c.close);
    const fast = ema(closes, 10);
    const slow = ema(closes, 30);
    const last = closes.length - 1;

    if (
      fast[last - 1] <= slow[last - 1] &&
      fast[last] > slow[last] &&
      bar.sentiment > 0.5
    ) {
      return {
        side: "long",
        entry: bar.close,
        stop: Math.min(...history.slice(-10).map((c) => c.low)),
        rr: 2,
      };
    }

    return null;
  },
});
```

The same pattern works for any precomputed field - regime labels, macro scores, alternative data signals. Compute it outside the engine, attach it to the candle, read it in the signal function.

---

## 4. Precomputed regime filter with anchored walk-forward

LLM or model outputs work best as precomputed fields, not as live callers inside the signal function. Call the model once per bar outside the engine, store the result on the candle, then run a normal walk-forward on top of it.

```js
import { walkForwardOptimize, getHistoricalCandles, ema } from "tradelab";

const candles = await getHistoricalCandles({
  source: "yahoo",
  symbol: "QQQ",
  interval: "1d",
  period: "3y",
});

// call model outside the engine - keep signal() synchronous
const labeled = await Promise.all(
  candles.map(async (bar, index) => ({
    ...bar,
    regime:
      index < 20
        ? "neutral"
        : await classifyRegime(
            candles.slice(index - 20, index).map((c) => c.close)
          ),
  }))
);

const wf = walkForwardOptimize({
  candles: labeled,
  mode: "anchored",
  trainBars: 180,
  testBars: 60,
  stepBars: 60,
  scoreBy: "profitFactor",
  parameterSets: [
    { fast: 10, slow: 30, regime: "trend" },
    { fast: 20, slow: 50, regime: "trend" },
    { fast: 10, slow: 30, regime: "mean-revert" },
  ],
  backtestOptions: {
    warmupBars: 60,
    flattenAtClose: false,
  },
  signalFactory(params) {
    return ({ candles: history, bar }) => {
      if (bar.regime !== params.regime) return null;

      const closes = history.map((c) => c.close);
      const fast = ema(closes, params.fast);
      const slow = ema(closes, params.slow);
      const last = closes.length - 1;

      if (fast[last - 1] <= slow[last - 1] && fast[last] > slow[last]) {
        return {
          side: "long",
          entry: bar.close,
          stop: Math.min(...history.slice(-15).map((c) => c.low)),
          rr: 2,
        };
      }

      return null;
    };
  },
});
```

Check `wf.bestParamsSummary` for parameter stability across windows. If the winning regime or EMA pair changes every window, the model output probably is not adding signal.

---

## 5. Cross-sectional momentum portfolio

One signal factory across three symbols. Fills compete for the same capital pool at fill time - a position on SPY reduces what QQQ and IWM can size into on the same bar.

```js
import { backtestPortfolio, ema, getHistoricalCandles } from "tradelab";

function momentumSignal() {
  return ({ candles: history }) => {
    if (history.length < 60) return null;

    const closes = history.map((c) => c.close);
    const fast = ema(closes, 20);
    const slow = ema(closes, 50);
    const last = closes.length - 1;

    if (fast[last - 1] <= slow[last - 1] && fast[last] > slow[last]) {
      return {
        side: "long",
        entry: closes[last],
        stop: Math.min(...history.slice(-20).map((c) => c.low)),
        rr: 2,
      };
    }

    return null;
  };
}

const [spy, qqq, iwm] = await Promise.all([
  getHistoricalCandles({ source: "yahoo", symbol: "SPY", interval: "1d", period: "2y" }),
  getHistoricalCandles({ source: "yahoo", symbol: "QQQ", interval: "1d", period: "2y" }),
  getHistoricalCandles({ source: "yahoo", symbol: "IWM", interval: "1d", period: "2y" }),
]);

const result = backtestPortfolio({
  equity: 100_000,
  maxDailyLossPct: 3,
  systems: [
    { symbol: "SPY", candles: spy, signal: momentumSignal(), weight: 2, maxAllocationPct: 0.5 },
    { symbol: "QQQ", candles: qqq, signal: momentumSignal(), weight: 2, maxAllocationPct: 0.5 },
    { symbol: "IWM", candles: iwm, signal: momentumSignal(), weight: 1, maxAllocationPct: 0.3 },
  ],
});
```

`result.eqSeries` includes `lockedCapital` and `availableCapital` at each realized equity point. Use those to see how often the portfolio was fully deployed versus sitting partially idle.

<small>[Back to main page](README.md)</small>