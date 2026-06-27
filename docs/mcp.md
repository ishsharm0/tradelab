# MCP server

<small>[Back to docs](README.md)</small>

`tradelab-mcp` exposes both a **research API** (backtest/strategy tools) and a **live trading API** (paper and live sessions) over the Model Context Protocol. Use it from MCP clients to research strategies, run paper trading loops, and optionally place real orders through a gated live mode.

## Safety

**Paper is the default and always safe.** Every session is paper unless you explicitly request live mode. Live mode requires all three gates simultaneously — if any is missing the call throws and nothing is created:

1. Environment variable `TRADELAB_ALLOW_LIVE=true` must be set in the server process.
2. The `create_session` call must include `confirmLive: true`.
3. A broker with valid credentials must be resolvable (passed via `brokerFactory` in `SessionManager`).

Every session also enforces:

- `maxDailyLossPct` — if realized day PnL drops below this percentage of starting equity, all new `place_order` calls are rejected for the remainder of the day.
- `halt_all` — an emergency kill-switch tool that flattens all positions and stops all sessions in the server process.

Brackets (stop + target) are true OCO: when one leg fills, the sibling is canceled automatically.

The server runs over stdio. It does not start an HTTP port.

## Install

Use the published package:

```bash
npx -y tradelab tradelab-mcp
```

Or install globally:

```bash
npm install -g tradelab
tradelab-mcp
```

From a local checkout:

```bash
npm install
npm run build
node bin/tradelab-mcp.js
```

## MCP Client Config

Claude Desktop example:

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

Global install example:

```json
{
  "mcpServers": {
    "tradelab": {
      "command": "tradelab-mcp"
    }
  }
}
```

Local checkout example:

```json
{
  "mcpServers": {
    "tradelab": {
      "command": "node",
      "args": ["/absolute/path/to/tradelab/bin/tradelab-mcp.js"]
    }
  }
}
```

## Tools

### Research tools

| Tool                 | Use it to                                                             |
| -------------------- | --------------------------------------------------------------------- |
| `list_strategies`    | See built-in strategy names and tunable parameters                    |
| `fetch_candles`      | Load Yahoo or CSV candles and return first/last bars                  |
| `run_backtest`       | Run one named strategy and return compact metrics                     |
| `walk_forward`       | Run a parameter grid through walk-forward validation                  |
| `analyze_robustness` | Backtest + Monte Carlo + Deflated Sharpe — validate before you trade  |
| `optimize_strategy`  | In-process grid sweep; returns a leaderboard sorted by chosen metric  |
| `compare_strategies` | Run several named strategies on the same dataset, ranked head-to-head |
| `candle_stats`       | Sanity-check candle data: count, date range, price range, interval    |

Tool responses are intentionally compact. They are meant for planning and comparison, not for replacing full HTML/CSV/JSON reports from the CLI.

### Live trading tools

| Tool              | Args (required)                                          | Returns                              |
| ----------------- | -------------------------------------------------------- | ------------------------------------ |
| `create_session`  | `sessionId`, `symbol`                                    | session status snapshot              |
| `list_sessions`   | —                                                        | array of session statuses            |
| `session_status`  | `sessionId`                                              | full refresh (positions/orders/risk) |
| `feed_price`      | `sessionId`, `bar` OR `price`                            | status after fills                   |
| `place_order`     | `sessionId`, `side`, `type?`, `qty?` OR `riskPct`+`stop` | order receipt                        |
| `close_position`  | `sessionId`, `symbol?`                                   | order receipt                        |
| `flatten`         | `sessionId`                                              | `{ ok: true }`                       |
| `cancel_order`    | `sessionId`, `orderId`                                   | `{ ok: true }`                       |
| `account`         | `sessionId`                                              | broker account info                  |
| `positions`       | `sessionId`                                              | open positions                       |
| `recent_events`   | `sessionId`, `limit?`                                    | event log                            |
| `attach_strategy` | `sessionId`, `strategy`, `params?`                       | `{ ok: true }`                       |
| `halt_all`        | —                                                        | `{ ok: true, sessionsHalted: N }`    |

## Agent trading loop

A typical autonomous paper-trading loop:

1. Call `create_session` with `sessionId`, `symbol`, and `equity` (paper by default).
2. Call `feed_price` with each new bar as it arrives — fills resting bracket orders automatically.
3. Call `place_order` with `riskPct` + `stop` to size automatically; add `target` or `rr` for a bracket.
4. Call `session_status` any time for a snapshot of positions, orders, equity, and risk state.
5. Call `flatten` or `halt_all` to emergency-close everything.

If you attach a strategy with `attach_strategy`, `feed_price` will auto-evaluate it each bar and place orders when the session is flat. Attached strategies receive the same `{ candles, index, bar, equity, openPosition, pendingOrder }` context as `backtest()`, and returned order intents default to a market order unless `type` is set.

## Typical Research Flow

1. Call `list_strategies`.
2. Choose a built-in strategy such as `ema-cross`, `rsi-reversion`, `donchian-breakout`, or `buy-hold`.
3. Call `fetch_candles` for a quick data sanity check, or pass a `data` object directly to `run_backtest`.
4. Call `run_backtest` with `strategy`, `params`, and either `candles` or `data`.
5. Inspect trade count, profit factor, drawdown, return, and Sharpe fields.
6. Call `walk_forward` with a grid to see whether parameters hold up out of sample.

## Example Calls

Fetch candles:

```json
{
  "source": "yahoo",
  "symbol": "SPY",
  "interval": "1d",
  "period": "1y",
  "cache": true
}
```

Run a backtest:

```json
{
  "data": {
    "source": "yahoo",
    "symbol": "SPY",
    "interval": "1d",
    "period": "2y",
    "cache": true
  },
  "symbol": "SPY",
  "interval": "1d",
  "strategy": "ema-cross",
  "params": {
    "fast": 10,
    "slow": 30,
    "rr": 2
  },
  "backtestOptions": {
    "warmupBars": 40,
    "riskPct": 1,
    "collectReplay": false
  }
}
```

Run walk-forward validation:

```json
{
  "data": {
    "source": "yahoo",
    "symbol": "QQQ",
    "interval": "1d",
    "period": "3y"
  },
  "interval": "1d",
  "strategy": "ema-cross",
  "trainBars": 180,
  "testBars": 60,
  "mode": "anchored",
  "scoreBy": "profitFactor",
  "grid": {
    "fast": [8, 10, 12],
    "slow": [30, 40, 50],
    "rr": [1.5, 2, 3]
  },
  "backtestOptions": {
    "warmupBars": 60,
    "riskPct": 1
  }
}
```

## Strategy Names

MCP calls cannot pass JavaScript functions, so strategies are selected by name.

Built-ins:

- `ema-cross`
- `rsi-reversion`
- `donchian-breakout`
- `buy-hold`

In application code, register custom strategies with `registerStrategy(name, definition)`:

```js
import { registerStrategy } from "tradelab";

registerStrategy("my-breakout", {
  description: "Simple close-over-high breakout",
  params: {
    lookback: { type: "number", default: 20 },
    rr: { type: "number", default: 2 },
  },
  factory(params) {
    return ({ candles, bar }) => {
      if (candles.length < params.lookback + 1) return null;

      const recent = candles.slice(-params.lookback - 1, -1);
      const high = Math.max(...recent.map((candle) => candle.high));

      if (bar.close <= high) return null;

      return {
        side: "long",
        entry: bar.close,
        stop: Math.min(...recent.map((candle) => candle.low)),
        rr: params.rr,
      };
    };
  },
});
```

The packaged `tradelab-mcp` server only knows strategies registered in the package process. For project-specific strategies, create a small wrapper server that imports your registrations before calling `createServer()` from `tradelab/mcp`.

```js
// mcp-server.js
import "./strategies/register.js";
import { startStdioServer } from "tradelab/mcp";

await startStdioServer();
```

## Public Server API

```js
import { createServer, startStdioServer } from "tradelab/mcp";
```

| Export               | Purpose                                       |
| -------------------- | --------------------------------------------- |
| `createServer()`     | Build an `McpServer` with tradelab tools      |
| `startStdioServer()` | Create the server and connect stdio transport |

## Troubleshooting

| Symptom                         | Check                                                                   |
| ------------------------------- | ----------------------------------------------------------------------- |
| Client says server disconnected | The command must stay running and write protocol messages only to stdio |
| `npx` starts slowly             | Install globally or point the client at a local checkout                |
| Yahoo fetch fails               | Try a shorter `period`, set `cache: false`, or use CSV data             |
| No trades                       | Verify candle count, `warmupBars`, params, and stop placement           |
| Custom strategy not found       | Register it in the same Node process that starts the MCP server         |

<small>[Back to docs](README.md)</small>
