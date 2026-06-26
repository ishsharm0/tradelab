# Live trading

<small>[Back to main page](README.md)</small>

This guide covers the `tradelab/live` module and the live CLI commands.

## Overview

The live stack is built to reuse the same signal contract as backtesting:

- write and validate `signal()` with `backtest()`
- run the same signal in `LiveEngine` or `LiveOrchestrator`
- choose a real broker adapter or `PaperEngine`
- persist state with `JsonFileStorage` for restart safety

Import path:

```js
import { LiveEngine, LiveOrchestrator, PaperEngine } from "tradelab/live";
```

## Module components

| Component                                                                        | Purpose                                                              |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `LiveEngine`                                                                     | Single-system live or paper execution loop                           |
| `LiveOrchestrator`                                                               | Multi-system live execution with shared broker and aggregated status |
| `PaperEngine`                                                                    | In-process broker simulator implementing the broker adapter contract |
| `AlpacaBroker` / `BinanceBroker` / `CoinbaseBroker` / `InteractiveBrokersBroker` | Real broker adapters                                                 |
| `BrokerFeed` / `PollingFeed`                                                     | Feed adapters for streaming or polling operation                     |
| `RiskManager`                                                                    | Session windows, daily loss gates, drawdown halts, position checks   |
| `StateManager` / `JsonFileStorage`                                               | Persisted state, trades, and equity curve                            |
| `EventBus` / `LiveLogger`                                                        | Event fanout and structured logging                                  |

## `LiveEngine` quick start

```js
import { LiveEngine, PaperEngine, JsonFileStorage } from "tradelab/live";

const engine = new LiveEngine({
  id: "aapl-1m",
  symbol: "AAPL",
  interval: "1m",
  broker: new PaperEngine({ equity: 25_000 }),
  storage: new JsonFileStorage({ baseDir: "./output/live-state" }),
  riskPct: 1,
  mode: "streaming",
  signal({ bar, openPosition }) {
    if (openPosition) return null;
    return {
      side: "long",
      stop: bar.close - 1,
      rr: 2,
    };
  },
});

await engine.start();
// ... run until shutdown condition
await engine.stop();
```

Important behavior:

- `signal()` is called with the same context shape as backtesting
- `signal()` may be async; `LiveEngine` awaits the decision before normalizing it
- market and limit/stop order lifecycles are tracked through broker events
- state is persisted after fills, order updates, and equity updates
- `getStatus()` returns runtime and risk state for health checks

Async/model-backed signals can use `LlmSignal` from the main package:

```js
import { LlmSignal } from "tradelab";

const llm = new LlmSignal({
  budgetMs: 2000,
  onError: "skip",
  async resolve(context) {
    // Call a model or agent here.
    return null;
  },
});

const engine = new LiveEngine({
  symbol: "AAPL",
  interval: "1m",
  broker,
  signal: llm.signal,
});
```

`LlmSignal` caches one decision per bar, passes a no-lookahead candle view to `resolve()`, and records decisions in `llm.log`. Use `backtestAsync()` to test the same signal before running it live.

## `LiveOrchestrator` quick start

```js
import { LiveOrchestrator, PaperEngine, JsonFileStorage } from "tradelab/live";

const orchestrator = new LiveOrchestrator({
  broker: new PaperEngine({ equity: 100_000 }),
  storage: new JsonFileStorage({ baseDir: "./output/live-state" }),
  allocation: "weight",
  systems: [
    { id: "spy", symbol: "SPY", interval: "1m", weight: 2, signal: signalA },
    { id: "qqq", symbol: "QQQ", interval: "1m", weight: 1, signal: signalB },
  ],
});

await orchestrator.start();
const status = orchestrator.getStatus();
await orchestrator.stop();
```

Use orchestrator when multiple systems should share one broker/account context.

## CLI live commands

| Command           | Purpose                                      |
| ----------------- | -------------------------------------------- |
| `tradelab live`   | Run live engine or orchestrator (`--config`) |
| `tradelab paper`  | Shortcut for `live` with paper broker mode   |
| `tradelab status` | Inspect persisted live state                 |

## Live dashboard

Use `createDashboardServer()` to watch a running `LiveEngine` or `LiveOrchestrator` locally. The dashboard serves a static page over `node:http`, streams live events with Server-Sent Events at `/events`, and reads current state from `/state`.

```js
import { createDashboardServer } from "tradelab/live";

const dashboard = createDashboardServer({ source: engine, port: 4317 });
const url = await dashboard.start();
console.log(`dashboard: ${url}`);

// Later, during shutdown:
await dashboard.close();
```

The page shows equity, day PnL, open position, risk state, and a recent event tail for signals, fills, position changes, equity updates, and risk halts. New browser clients receive a bounded replay of recent events so the page is useful immediately after opening.

The CLI can start the same dashboard for both single-engine and config/orchestrator runs:

```bash
tradelab paper --symbol AAPL --interval 1m --mode polling --dashboard --dashboardPort 4317
tradelab live --config ./live-portfolio.json --paper --dashboard --dashboardPort 4317
```

The dashboard implementation is ESM-first. The CommonJS live bundle can be imported, but packaged dashboard usage should prefer `import { createDashboardServer } from "tradelab/live"`.

### Single-system paper run

```bash
tradelab paper \
  --id aapl-1m \
  --symbol AAPL \
  --interval 1m \
  --mode polling \
  --once true \
  --stateDir ./output/live-state
```

### Orchestrator run from config

```bash
tradelab live \
  --config ./live-portfolio.json \
  --paper \
  --mode polling \
  --once true \
  --stateDir ./output/live-state
```

Example config:

```json
{
  "allocation": "weight",
  "equity": 50000,
  "systems": [
    {
      "id": "spy-system",
      "symbol": "SPY",
      "interval": "1m",
      "strategy": "./strategies/spySignal.js",
      "weight": 2
    },
    {
      "id": "qqq-system",
      "symbol": "QQQ",
      "interval": "1m",
      "strategy": "./strategies/qqqSignal.js",
      "weight": 1
    }
  ]
}
```

### State inspection

```bash
tradelab status --dir ./output/live-state
tradelab status --dir ./output/live-state --namespace spy-system
```

## State and recovery

Live state is namespaced and persisted as:

- `state.json` (latest engine state)
- `trades.jsonl` (append-only)
- `equity.jsonl` (append-only)

On restart, the engine loads persisted state and reconciles with broker positions.

## Broker notes

- Alpaca and Binance adapters support native paper modes.
- Coinbase adapter is live API only; use `PaperEngine` for simulated Coinbase workflows.
- Interactive Brokers adapter requires `@stoqey/ib` to be installed.

For runtime compatibility and options, see [types/live.d.ts](../types/live.d.ts).

## Eventing and logs

`EventBus` emits lifecycle and execution events such as:

- `connected`, `shutdown`
- `signal`
- `order:submitted`, `order:filled`, `order:rejected`, `order:canceled`
- `position:opened`, `position:closed`
- `equity:update`
- `risk:warning`, `risk:halt`

Attach `LiveLogger` for structured JSON logs.

<small>[Back to main page](README.md)</small>
