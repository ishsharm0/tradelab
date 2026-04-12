# tradelab docs

## Guides

- [Backtest engine](backtest-engine.md)
- [Data, reporting, and CLI](data-reporting-cli.md)
- [Live trading](live-trading.md)
- [Strategy examples](examples.md)
- [API reference](api-reference.md)

## Choose a path

| Goal                                       | Start here                                        |
| ------------------------------------------ | ------------------------------------------------- |
| Run one strategy on one dataset            | [Backtest engine](backtest-engine.md)             |
| Load Yahoo or CSV data                     | [Data, reporting, and CLI](data-reporting-cli.md) |
| Export reports or machine-readable results | [Data, reporting, and CLI](data-reporting-cli.md) |
| Run multiple symbols together              | [Backtest engine](backtest-engine.md)             |
| Run walk-forward validation                | [Backtest engine](backtest-engine.md)             |
| Run one strategy live or in paper mode     | [Live trading](live-trading.md)                   |
| Run multiple live systems together         | [Live trading](live-trading.md)                   |
| See complete strategy patterns             | [Strategy examples](examples.md)                  |
| Check the exact public exports             | [API reference](api-reference.md)                 |

## Package scope

tradelab is built for:

- candle-based strategy research
- optional tick or quote replay with event-driven fills
- historical backtests with configurable fills and costs
- live and paper execution using broker adapters
- CSV and Yahoo-based data workflows
- exportable outputs for review or automation

tradelab is not built for:

- exchange microstructure modeling

## Common workflows

### Single strategy workflow

1. Load candles with `getHistoricalCandles()` or your own dataset
2. Run `backtest()`
3. Inspect `result.metrics` and `result.positions`
4. Export HTML, CSV, or JSON if needed

### Multi-symbol workflow

1. Prepare one candle array per symbol
2. Run `backtestPortfolio()`
3. Review combined `metrics`, `positions`, and `eqSeries`

### Validation workflow

1. Build a `signalFactory(params)`
2. Create parameter sets
3. Run `walkForwardOptimize()`
4. Review per-window winners before trusting the aggregate result

### Live execution workflow

1. Build a `signal()` used in backtest first
2. Wire it into `LiveEngine` with a broker or `PaperEngine`
3. Persist state with `JsonFileStorage`
4. Start with `tradelab paper` or `tradelab live --paper`
5. Inspect persisted state with `tradelab status`

## Documentation map

- [Backtest engine](backtest-engine.md): strategy inputs, engine options, result shape, portfolio mode, walk-forward mode
- [Data, reporting, and CLI](data-reporting-cli.md): data loading, cache behavior, exports, terminal usage
- [Live trading](live-trading.md): live engine, broker adapters, paper mode, orchestration, lifecycle, and state
- [Strategy examples](examples.md): mean reversion, breakout, sentiment, LLM, and portfolio research patterns
- [API reference](api-reference.md): compact export index

<small>[Back to README.md](../README.md)</small>
