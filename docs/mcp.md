# MCP server

<small>[Back to main page](README.md)</small>

`tradelab-mcp` exposes the research loop to MCP-capable agents such as Claude Desktop, Cursor, and Claude Code.

## Tools

| Tool              | Purpose                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| `list_strategies` | List built-in strategies and their tunable parameters                   |
| `fetch_candles`   | Fetch Yahoo or CSV candles and return a compact first/last bar summary  |
| `run_backtest`    | Run a named strategy with JSON params and return compact metrics        |
| `walk_forward`    | Run a named strategy over a parameter grid and return stability metrics |

Tool outputs are summaries for agent context, not full report payloads. `run_backtest` returns metrics and a small trade preview, but not replay frames.

## Agent research loop

1. Call `list_strategies` to inspect available strategy names and parameters.
2. Call `fetch_candles` or provide inline `candles`.
3. Call `run_backtest` with a strategy name and params.
4. Read `metrics`, especially trade count, profit factor, drawdown, and annualized Sharpe.
5. Call `walk_forward` with a parameter grid to check out-of-sample stability.

## Claude Desktop config

Use this with the published package:

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

After installing globally with `npm install -g tradelab`, you can use:

```json
{
  "mcpServers": {
    "tradelab": {
      "command": "tradelab-mcp"
    }
  }
}
```

## Strategies

Agents cannot pass JavaScript closures over MCP, so strategies are name-addressable. Built-ins currently include:

- `ema-cross`
- `rsi-reversion`
- `donchian-breakout`
- `buy-hold`

Register custom strategies in application code with `registerStrategy(name, def)` from the main package. A strategy definition includes `description`, `params`, and a `factory(params)` function that returns a normal tradelab `signal(context)`.

<small>[Back to main page](README.md)</small>
