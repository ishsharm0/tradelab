# Documentation

Use this page to choose the right guide. If you are new to tradelab, read the first three links in order.

## Start Here

1. [Backtesting](backtest-engine.md) - the `signal()` contract, result shape, costs, portfolio runs, walk-forward validation, and parameter sweeps.
2. [Data, reporting, and CLI](data-reporting-cli.md) - Yahoo data, CSV files, cache helpers, exported reports, and terminal commands.
3. [Live trading](live-trading.md) - paper mode, broker adapters, persisted state, multi-system orchestration, and the local dashboard.

## Reference

- [API reference](api-reference.md) - public exports by module.
- [Research tools](research.md) - Monte Carlo, deflated Sharpe, PBO, CPCV, and the agent research loop.
- [MCP server](mcp.md) - `tradelab-mcp` setup and the 25-tool reference for AI agents.
- [Strategy examples](examples.md) - complete strategy patterns you can adapt.

## Common Paths

| If you want to...                 | Read                                                      |
| --------------------------------- | --------------------------------------------------------- |
| Run one strategy on OHLCV candles | [Backtesting](backtest-engine.md)                         |
| Load Yahoo or CSV data            | [Data, reporting, and CLI](data-reporting-cli.md)         |
| Export HTML, CSV, or JSON         | [Data, reporting, and CLI](data-reporting-cli.md)         |
| Combine several systems           | [Backtesting](backtest-engine.md#portfolio-backtests)     |
| Test parameter stability          | [Backtesting](backtest-engine.md#walk-forward-validation) |
| Run a local paper session         | [Live trading](live-trading.md)                           |
| Connect an MCP client             | [MCP server](mcp.md)                                      |
| Let an AI agent research and trade | [MCP server](mcp.md)                                     |
| Check exact function names        | [API reference](api-reference.md)                         |

## Package Scope

tradelab is built for strategy research and operational dry-runs, by humans and AI agents alike:

- candle and tick backtests
- shared-capital portfolio simulation
- realistic cost assumptions
- walk-forward validation and overfitting checks
- single and multi-symbol paper and live execution through broker adapters
- a 25-tool MCP server so an agent can research, validate, and trade end to end
- local reports and machine-readable exports

It is not an exchange simulator. It does not try to model full market depth, queue priority, latency, or venue-specific microstructure.

[Back to README](../README.md)
