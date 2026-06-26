# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-06-26

### Added

- **Metrics correctness and annualization**
  - `sharpeAnnualized` and `sortinoAnnualized` fields in `buildMetrics` output, scaled by `sqrt(periodsPerYear)`.
  - `annualizationPeriods` field exposing the computed periods-per-year used for scaling.
  - All ratio metrics (`profitFactor`, `sharpe`, `calmar`, etc.) now clamped to a finite sentinel via `clampFinite`; metrics JSON never emits `Infinity` or `NaN`.
  - Benchmark statistics (`alpha`, `beta`, `correlation`, `informationRatio`, `trackingError`) available in `metrics.benchmark` when `benchmarkReturns` is passed to `buildMetrics`.
  - New top-level exports: `clampFinite`, `BIG_NUMBER`, `periodsPerYear`, `benchmarkStats`.

- **`tradelab/ta` indicator namespace** (new subpath export)
  - Oscillators: `rsi`, `macd`, `stochastic`.
  - Channels: `bollinger`, `donchian`, `keltner`.
  - Trend: `supertrend`, `vwap`.
  - Re-exports from core: `ema`, `atr`, `swingHigh`, `swingLow`, `detectFVG`, `lastSwing`, `structureState`.
  - All indicators return full-length arrays aligned to input (warmup positions are `undefined`).

- **Async and agent signals**
  - `backtestAsync(options)` — async sibling of `backtest()` where `signal()` may return a `Promise`; accepts `signalBudgetMs` to race each bar's signal against a timeout.
  - `LlmSignal` class — wraps an async `resolve(context)` function with per-bar caching, a configurable `budgetMs` timeout, a no-lookahead candle proxy, and a `log` array of every bar decision.
  - `backtestTicks()` now accepts a `seed` option for reproducible probabilistic limit fills.
  - `LiveEngine` awaits async signals, so `LlmSignal` can be used directly in live/paper execution.

- **`tradelab/mcp` MCP server** (new subpath export)
  - `tradelab-mcp` binary — starts an MCP stdio server exposing tradelab tools to any MCP-capable agent (Claude Desktop, Cursor, etc.).
  - Server exposes tools: `list_strategies`, `fetch_candles`, `run_backtest`, `walk_forward`.
  - Name-addressable strategy registry: `listStrategies()`, `getStrategy(name)`, `registerStrategy(name, def)` (exported from `tradelab`).

- **Research and overfitting toolkit** (`research` namespace, re-exported from `tradelab`)
  - `research.monteCarlo(returns, options)` — equity curve Monte Carlo simulation.
  - `research.deflatedSharpe(sharpe, options)` — deflated Sharpe ratio (DSR) adjustment.
  - `research.sweepHaircut(results, options)` — apply DSR haircut across a parameter sweep.
  - `research.probabilityOfBacktestOverfitting(folds, options)` — CSCV/PBO overfitting probability.
  - `research.combinatorialPurgedSplits(candles, options)` — combinatorial purged cross-validation (CPCV) split generator.

- **Parallel parameter optimization**
  - `optimize(options)` — worker-thread pool that runs a parameter sweep in parallel; accepts `candles`, `signalModulePath`, `parameterSets`, `concurrency`, and `scoreBy`; returns `{ results, leaderboard, best }`.
  - `grid(spec)` — helper that expands a `{ param: [v1, v2] }` spec into an array of parameter-set objects.

- **Carry and funding cost model**
  - `costs.carry` — annualized borrow/margin cost (`longAnnualBps`, `shortAnnualBps`); deducted proportionally over hold time.
  - `costs.funding` — perpetual futures funding (`rateBps`, `intervalMs`, `anchorMs`); positive rates charge longs and credit shorts.
  - Closed positions include `exit.financing` (total financing cost already deducted from `exit.pnl`).

- **Live dashboard**
  - `createDashboardServer(options)` exported from `tradelab/live` — zero-dependency SSE server using Node `node:http`.
  - `--dashboard` and `--dashboardPort` CLI flags for `tradelab paper` and `tradelab live`.

- **Dependencies**: `@modelcontextprotocol/sdk` and `zod` added as runtime dependencies.

### Fixed

- Metrics JSON no longer emits `Infinity` or `NaN`; all ratio metrics are clamped to `BIG_NUMBER` (1e9) or zero.
- Non-annualized Sharpe was not directly comparable across different timeframes; `sharpeAnnualized` provides a consistent cross-timeframe measure.

## [1.0.1]

Prior release. See git history for details.
