# tradelab

A Node.js toolkit for testing, validating, and operating trading strategies.

tradelab gives you one `signal()` contract across research and execution:

- run candle or tick backtests
- model slippage, commissions, borrow, carry, and funding
- validate parameters with walk-forward tests and research statistics
- combine multiple systems into a shared-capital portfolio
- move the same strategy into paper or live execution
- export reports, metrics, and trade ledgers
- expose research tools through an MCP server

```bash
npm install tradelab
```

Requires Node.js 18 or newer.

## Quick Start

```js
import { backtest, getHistoricalCandles, ema, exportBacktestArtifacts } from "tradelab";

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
  equity: 10_000,
  riskPct: 1,
  warmupBars: 50,
  costs: {
    slippageBps: 1,
    commissionBps: 0.5,
  },
  signal({ candles: history, bar }) {
    const closes = history.map((c) => c.close);
    const fast = ema(closes, 10);
    const slow = ema(closes, 30);
    const i = closes.length - 1;

    if (fast[i - 1] <= slow[i - 1] && fast[i] > slow[i]) {
      return { side: "long", stop: bar.close * 0.97, rr: 2 };
    }

    return null;
  },
});

console.log(result.metrics);
exportBacktestArtifacts({ result, outDir: "./output" });
```

Start with `result.metrics` for the summary and `result.positions` for completed trades. Use `trades` when you need every realized leg, including partial exits.

## What You Can Build

| Goal                               | API or command                                     |
| ---------------------------------- | -------------------------------------------------- |
| Backtest one strategy              | `backtest({ candles, signal })`                    |
| Backtest an async strategy         | `backtestAsync({ candles, signal })`               |
| Replay tick or quote data          | `backtestTicks({ ticks, signal })`                 |
| Run several systems together       | `backtestPortfolio({ systems })`                   |
| Test parameter stability           | `walkForwardOptimize(options)`                     |
| Run a parallel parameter sweep     | `optimize({ signalModulePath, parameterSets })`    |
| Use indicators                     | `import { rsi, macd, vwap } from "tradelab/ta"`    |
| Check overfitting risk             | `research.monteCarlo`, `research.deflatedSharpe`   |
| Run in paper or live mode          | `LiveEngine`, `LiveOrchestrator`, `tradelab paper` |
| Watch a live run locally           | `createDashboardServer({ source })`                |
| Let MCP clients run research tools | `tradelab-mcp`                                     |
| Export reports and machine data    | `exportBacktestArtifacts`, `exportMetricsJSON`     |

## The Signal Contract

Your strategy is a function. Return `null` to do nothing, or return a trade signal.

```js
function signal({ candles, index, bar, equity, openPosition, pendingOrder }) {
  if (openPosition || index < 50) return null;

  return {
    side: "long",
    entry: bar.close, // optional; defaults to current close
    stop: bar.close - 2,
    rr: 2, // take profit at 2R
  };
}
```

Common signal fields:

| Field                       | Meaning                                             |
| --------------------------- | --------------------------------------------------- |
| `side`                      | `long`, `short`, `buy`, or `sell`                   |
| `entry`                     | Entry price. Defaults to the current close          |
| `stop`                      | Required stop level for sizing and risk             |
| `takeProfit`                | Explicit target price                               |
| `rr`                        | Builds target from risk when `takeProfit` is absent |
| `qty` or `size`             | Fixed size override                                 |
| `riskPct` or `riskFraction` | Per-trade risk override                             |

## Data

Use `getHistoricalCandles()` for Yahoo Finance, CSV files, and cached datasets.

```js
const yahoo = await getHistoricalCandles({
  source: "yahoo",
  symbol: "QQQ",
  interval: "1d",
  period: "1y",
  cache: true,
});

const csv = await getHistoricalCandles({
  source: "csv",
  csvPath: "./data/btc.csv",
});
```

Candles are normalized to:

```js
{
  (time, open, high, low, close, volume);
}
```

## Costs

Cost assumptions belong in the run, not in post-processing.

```js
const result = backtest({
  candles,
  signal,
  costs: {
    slippageBps: 2,
    spreadBps: 1,
    commissionBps: 1,
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

`exit.financing` is included on closed trades when carry or funding applies. It is already deducted from `exit.pnl` and aggregate metrics.

## Validation

Use a normal backtest to build the strategy. Use validation tools before trusting it.

```js
import { walkForwardOptimize, grid } from "tradelab";

const wf = walkForwardOptimize({
  candles,
  trainBars: 180,
  testBars: 60,
  mode: "anchored",
  scoreBy: "profitFactor",
  parameterSets: grid({
    fast: [8, 10, 12],
    slow: [21, 30, 50],
    rr: [1.5, 2, 3],
  }),
  signalFactory(params) {
    return createEmaSignal(params);
  },
});

console.log(wf.metrics);
console.log(wf.bestParamsSummary);
```

For larger sweeps, use `optimize()` with a strategy module:

```js
const out = await optimize({
  candles,
  interval: "1d",
  signalModulePath: new URL("./strategy.js", import.meta.url).pathname,
  parameterSets: grid({ fast: [8, 10], slow: [30, 50] }),
  scoreBy: "sharpeAnnualized",
});
```

## Portfolio Backtests

`backtestPortfolio()` runs multiple systems against shared capital. Capital is locked only when an order fills, so later systems size against what is still available.

```js
const portfolio = backtestPortfolio({
  equity: 100_000,
  interval: "1d",
  maxDailyLossPct: 3,
  systems: [
    { symbol: "SPY", candles: spy, signal: spySignal, weight: 2 },
    { symbol: "QQQ", candles: qqq, signal: qqqSignal, weight: 1 },
  ],
});
```

Portfolio equity points include `lockedCapital` and `availableCapital`.

## Live and Paper Runs

The live package uses the same signal shape as backtests.

```js
import { LiveEngine, PaperEngine, JsonFileStorage } from "tradelab/live";

const engine = new LiveEngine({
  id: "aapl-1m",
  symbol: "AAPL",
  interval: "1m",
  mode: "polling",
  broker: new PaperEngine({ equity: 25_000 }),
  storage: new JsonFileStorage({ baseDir: "./output/live-state" }),
  signal,
});

await engine.start();
```

Run the same flow from the terminal:

```bash
tradelab paper --symbol AAPL --interval 1m --mode polling --once true
tradelab live --config ./live-portfolio.json --paper
```

Add `--dashboard --dashboardPort 4317` to open a local Server-Sent Events dashboard.

## MCP Server

`tradelab-mcp` exposes four tools over stdio:

- `list_strategies`
- `fetch_candles`
- `run_backtest`
- `walk_forward`

Use it from any MCP client that can launch a stdio server:

```json
{
  "mcpServers": {
    "tradelab": {
      "command": "npx",
      "args": ["-y", "tradelab", "tradelab-mcp"]
    }
  }
}
```

## CLI

```bash
tradelab backtest --source yahoo --symbol SPY --interval 1d --period 1y
tradelab portfolio --csvPaths ./spy.csv,./qqq.csv --symbols SPY,QQQ
tradelab walk-forward --source yahoo --symbol QQQ --interval 1d --period 2y
tradelab status --dir ./output/live-state
```

## Documentation

- [Docs home](docs/README.md)
- [Backtesting](docs/backtest-engine.md)
- [Data, reporting, and CLI](docs/data-reporting-cli.md)
- [Live trading](docs/live-trading.md)
- [MCP server](docs/mcp.md)
- [Research tools](docs/research.md)
- [Strategy examples](docs/examples.md)
- [API reference](docs/api-reference.md)

## Module Entry Points

```js
import { backtest, getHistoricalCandles } from "tradelab";
import { rsi, macd, vwap } from "tradelab/ta";
import { LiveEngine, PaperEngine } from "tradelab/live";
```

CommonJS is supported for the main, data, live, and TA entry points:

```js
const { backtest } = require("tradelab");
```

## License

MIT
