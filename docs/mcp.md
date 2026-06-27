# MCP server

<small>[Back to docs](README.md)</small>

`tradelab-mcp` exposes a small research API over the Model Context Protocol. Use it from MCP clients when you want to list built-in strategies, fetch candles, run compact backtests, or run walk-forward checks without writing glue code.

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

| Tool              | Use it to                                            |
| ----------------- | ---------------------------------------------------- |
| `list_strategies` | See built-in strategy names and tunable parameters   |
| `fetch_candles`   | Load Yahoo or CSV candles and return first/last bars |
| `run_backtest`    | Run one named strategy and return compact metrics    |
| `walk_forward`    | Run a parameter grid through walk-forward validation |

Tool responses are intentionally compact. They are meant for planning and comparison, not for replacing full HTML/CSV/JSON reports from the CLI.

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
