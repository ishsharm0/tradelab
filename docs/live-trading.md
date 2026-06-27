# Live and paper trading

<small>[Back to docs](README.md)</small>

Use `tradelab/live` when you want the same strategy contract from `backtest()` to run against a paper broker or a broker adapter.

The live module is intentionally small:

- a signal receives finalized candles and returns the same order intent used in backtests
- a broker adapter handles account, order, fill, and position operations
- a feed provides bars or ticks
- storage persists state so a process restart can recover cleanly
- risk controls can block new orders or halt a system

```js
import { LiveEngine, PaperEngine, JsonFileStorage } from "tradelab/live";
```

## Start With Paper Mode

```js
import { LiveEngine, PaperEngine, JsonFileStorage } from "tradelab/live";

const broker = new PaperEngine({ equity: 25_000 });

const engine = new LiveEngine({
  id: "aapl-paper",
  symbol: "AAPL",
  interval: "1m",
  broker,
  storage: new JsonFileStorage({ baseDir: "./output/live-state" }),
  mode: "polling",
  riskPct: 1,
  signal({ bar, openPosition }) {
    if (openPosition) return null;

    return {
      side: "long",
      entry: bar.close,
      stop: bar.close - 1,
      rr: 2,
    };
  },
});

await engine.start();
await engine.pollOnce();
console.log(engine.getStatus());
await engine.stop();
```

`PaperEngine` implements the broker interface in memory. Use it first for CLI runs, dashboard checks, and strategy wiring.

## Signal Contract

The signal function receives:

| Field          | Meaning                                        |
| -------------- | ---------------------------------------------- |
| `candles`      | Finalized candle history available at this bar |
| `index`        | Current candle index                           |
| `bar`          | Current candle                                 |
| `equity`       | Current engine equity                          |
| `openPosition` | Current open position, or `null`               |
| `pendingOrder` | Current pending entry order, or `null`         |

Return `null` to do nothing. Return an order intent to open a trade:

```js
return {
  side: "long",
  entry: bar.close,
  stop: bar.close * 0.98,
  rr: 2,
  riskPct: 0.5,
};
```

Useful fields:

| Field                | Meaning                                      |
| -------------------- | -------------------------------------------- |
| `side`               | `"long"`, `"short"`, `"buy"`, or `"sell"`    |
| `entry`              | Planned entry price                          |
| `stop`               | Stop loss price                              |
| `takeProfit` or `rr` | Explicit target, or reward/risk multiple     |
| `qty`                | Fixed quantity. If omitted, sizing uses risk |
| `riskPct`            | Percent of equity to risk on this trade      |
| `_maxBarsInTrade`    | Force an exit after this many completed bars |
| `_maxHoldMin`        | Force an exit after this many minutes        |

Use `backtest()` or `backtestAsync()` with the same signal before connecting a real broker.

## Run From The CLI

The CLI has two entry points:

```bash
tradelab paper --symbol AAPL --interval 1m --mode polling --once true
tradelab live --symbol AAPL --interval 1m --broker alpaca --paper
```

Common options:

| Option            | Meaning                                       |
| ----------------- | --------------------------------------------- |
| `--strategy`      | Built-in strategy name or local strategy file |
| `--symbol`        | Symbol passed to broker and feed              |
| `--interval`      | Candle interval, such as `1m`, `5m`, or `1d`  |
| `--mode`          | `streaming` or `polling`                      |
| `--once true`     | Run one polling cycle and exit                |
| `--stateDir`      | Directory for persisted live state            |
| `--dashboard`     | Start the local dashboard                     |
| `--dashboardPort` | Dashboard port. Defaults to `4317`            |

Strategy modules can export `default`, `createSignal(args)`, or `signal`:

```js
// ./strategies/ema-signal.js
import { ema } from "tradelab";

export function createSignal({ fast = 10, slow = 30, rr = 2 } = {}) {
  return ({ candles, bar }) => {
    if (candles.length < slow + 2) return null;

    const closes = candles.map((candle) => candle.close);
    const fastLine = ema(closes, Number(fast));
    const slowLine = ema(closes, Number(slow));
    const last = closes.length - 1;

    if (fastLine[last - 1] <= slowLine[last - 1] && fastLine[last] > slowLine[last]) {
      return {
        side: "long",
        entry: bar.close,
        stop: Math.min(...candles.slice(-15).map((candle) => candle.low)),
        rr: Number(rr),
      };
    }

    return null;
  };
}
```

```bash
tradelab paper \
  --strategy ./strategies/ema-signal.js \
  --symbol AAPL \
  --interval 1m \
  --mode polling \
  --once true
```

## Run Multiple Systems

Use `LiveOrchestrator` when several systems share one account and broker.

```js
import { LiveOrchestrator, PaperEngine, JsonFileStorage } from "tradelab/live";

const orchestrator = new LiveOrchestrator({
  broker: new PaperEngine({ equity: 100_000 }),
  storage: new JsonFileStorage({ baseDir: "./output/live-state" }),
  allocation: "weight",
  systems: [
    { id: "spy", symbol: "SPY", interval: "1m", weight: 2, signal: spySignal },
    { id: "qqq", symbol: "QQQ", interval: "1m", weight: 1, signal: qqqSignal },
  ],
});

await orchestrator.start();
console.log(orchestrator.getStatus());
await orchestrator.stop();
```

CLI config:

```json
{
  "allocation": "weight",
  "equity": 50000,
  "systems": [
    {
      "id": "spy-system",
      "symbol": "SPY",
      "interval": "1m",
      "strategy": "./strategies/spy.js",
      "weight": 2
    },
    {
      "id": "qqq-system",
      "symbol": "QQQ",
      "interval": "1m",
      "strategy": "./strategies/qqq.js",
      "weight": 1
    }
  ]
}
```

```bash
tradelab live --config ./live-portfolio.json --paper --mode polling --once true
```

## Dashboard

Start a local dashboard for an engine or orchestrator:

```js
import { createDashboardServer } from "tradelab/live";

const dashboard = createDashboardServer({ source: engine, port: 4317 });
const url = await dashboard.start();

console.log(url);

// On shutdown:
await dashboard.close();
```

The dashboard is a zero-dependency dark trading cockpit served from a single HTML file. It includes:

- **KPI strip** - equity, day P&L (with percent), open position, last price, all in monospace tabular numerals
- **Equity curve** - canvas chart that grows in real time; green when above session start, red when below
- **Positions table** - symbol, side badge, qty, entry, mark, unrealized P&L
- **Open orders table** - type, side, qty, price, with inline cancel
- **Event feed** - color-coded by severity (fill, exit/warning, reject) with animated entry; capped at 120 rows
- **Risk-halt banner** - shown when `source.getStatus().risk.halted` is true
- **Controls** - Stop and Flatten All buttons in the header; cancel links in the orders table

The dashboard exposes:

| Route      | Method | Purpose                                                       |
| ---------- | ------ | ------------------------------------------------------------- |
| `/`        | GET    | Static dashboard page                                         |
| `/state`   | GET    | Calls optional `source.refresh()`, then returns `getStatus()` |
| `/events`  | GET    | Server-Sent Events stream from `eventBus`                     |
| `/command` | POST   | Dispatch a command to the source (whitelist enforced)         |

### `/command` endpoint

Send a JSON body with a `type` field. Only the following types are accepted; anything else returns `400`:

| type            | Source method called               |
| --------------- | ---------------------------------- |
| `flatten`       | `source.flatten()`                 |
| `stop`          | `source.stop()`                    |
| `closePosition` | `source.closePosition(cmd.symbol)` |
| `cancelOrder`   | `source.cancelOrder(cmd.orderId)`  |

```js
// Example: flatten all positions from a browser
await fetch("/command", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ type: "flatten" }),
});
```

### `source.refresh()`

If the source object exposes a `refresh()` method, the dashboard awaits it before each `/state` response. Use this to pull fresh data from a broker before painting the UI - for example, a `TradingSession` from the MCP live tools can expose `refresh()` to sync account state before every poll.

CLI:

```bash
tradelab paper --symbol AAPL --interval 1m --mode polling --dashboard --dashboardPort 4317
tradelab live --config ./live-portfolio.json --paper --dashboard --dashboardPort 4317
```

New browser clients receive a bounded replay of recent events. The equity curve grows from the first data point seen in the session; the chart updates on every `equity:update` SSE event and on each `/state` poll.

## State And Recovery

`JsonFileStorage` stores one namespace per engine id:

| File           | Contents                                  |
| -------------- | ----------------------------------------- |
| `state.json`   | Latest open position, pending order, risk |
| `trades.jsonl` | Append-only completed trade records       |
| `equity.jsonl` | Append-only equity snapshots              |

Inspect persisted state:

```bash
tradelab status --dir ./output/live-state
tradelab status --dir ./output/live-state --namespace spy-system
```

On restart, `StateManager` compares persisted state with broker positions and reports whether the state is clean, externally closed, adopted from broker state, or mismatched.

## Risk Controls

Pass top-level risk options to `LiveEngine`, or group them under `risk`.

```js
const engine = new LiveEngine({
  symbol: "AAPL",
  interval: "1m",
  broker,
  signal,
  riskPct: 0.5,
  risk: {
    maxDailyLossPct: 2,
    maxDrawdownPct: 10,
    maxPositions: 1,
    maxDailyTrades: 4,
    allowedWindows: "09:30-11:30,13:00-15:45",
  },
});
```

The risk manager can block new positions and emit warning or halt events. It does not silently change your signal logic.

## Broker Notes

| Broker                     | Notes                                                    |
| -------------------------- | -------------------------------------------------------- |
| `PaperEngine`              | Local simulation. Best first step for any new strategy   |
| `AlpacaBroker`             | Supports native paper mode through broker config         |
| `BinanceBroker`            | Supports exchange-style crypto workflows                 |
| `CoinbaseBroker`           | Live API adapter. Use `PaperEngine` for local simulation |
| `InteractiveBrokersBroker` | Requires `@stoqey/ib` in the consuming application       |

Real broker adapters require credentials and broker-specific account permissions. Start with paper mode, then use the smallest possible order sizes when switching to live credentials.

## Events

`EventBus` emits lifecycle, order, position, equity, and risk events:

- `connected`
- `shutdown`
- `signal`
- `order:submitted`
- `order:filled`
- `order:rejected`
- `order:canceled`
- `position:opened`
- `position:closed`
- `equity:update`
- `risk:warning`
- `risk:halt`

Attach `LiveLogger` to write structured JSON event logs.

```js
import { createEventBus, createLogger } from "tradelab/live";

const eventBus = createEventBus();
const logger = createLogger({ level: "info" });

logger.attach(eventBus);
```

See [api-reference.md](api-reference.md#live-module-tradelablive) for the full live export list.

<small>[Back to docs](README.md)</small>
