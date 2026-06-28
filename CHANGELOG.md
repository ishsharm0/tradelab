# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] - 2026-06-28

### Changed

- Documentation refresh: the README now leads with the agent-native MCP story, and the reference docs cover `summarize`, `createResearchStore` and the agent research loop, `attachNotifier`, multi-symbol sessions, exposure caps, and `tradelab run`.

## [1.3.0] - 2026-06-27

### Added

- **Multi-symbol portfolio sessions**
  - `SessionManager.create({ symbols: ["BTC", "ETH"] })` creates a single session that tracks multiple instruments against a shared broker.
  - `pushBar(bar, symbol)` and `placeOrder({ symbol })` target a specific instrument; bracket OCO is managed per-symbol.
  - `closePosition(symbol)` cancels the resting bracket for that symbol before submitting the flattening order.
  - Per-symbol read accessors: `lastPriceFor(sym)` and `candleBufferFor(sym)`.
  - `getStatus()` now includes a `symbols` array alongside the primary `symbol`. Single-symbol usage (`symbol: "AAPL"`) is unchanged.

- **Portfolio exposure caps**
  - `maxGrossExposurePct` and `maxNetExposurePct` options on `TradingSession` and `SessionManager.create()`. Both default to `0` (disabled).
  - Enforced in `placeOrder()` before any broker call; throws `risk rejected: <reason>` when the cap is breached.
  - The `RiskManager.checkExposure()` method is the shared gate used by both `canOpenPosition()` and `placeOrder()`.

- **Trade attribution on order events**
  - `order:submitted` and `order:filled` events now include a `sizing` block: `{ entry, stop, target, rr, riskFraction, riskAmount, qty, notional }`.
  - Pass `rationale` to `placeOrder()` to attach a free-text note that propagates to all fill events for that order.
  - Bracket legs carry `parentEntryId` (the entry's client order id) and a `leg` field (`"stop"` or `"target"`).

- **Agent research loop**
  - `createResearchStore({ dir? })` from `tradelab` returns `{ open, log, recall, close }` for file-backed hypothesis tracking.
  - MCP tools `research_open`, `research_log`, `research_recall`, `research_close` expose the store over stdio.
  - `run_backtest` accepts `researchId` and auto-logs the backtest result plus a Deflated Sharpe verdict (`{ deflatedSharpe, overfit, note }`) without a separate `research_log` call.

- **Multi-symbol support in MCP live tools**
  - `create_session` accepts a `symbols` array.
  - `feed_price`, `place_order`, `close_position`, and `attach_strategy` accept an optional `symbol` argument to route operations to a specific instrument.

- **`summarize(metrics)`**
  - Exported from `tradelab`. Renders a `buildMetrics` output object as one plain-English paragraph. Accepts an optional `verdict` object to append an overfit caution sentence.

- **`tradelab run <preset>` CLI subcommand**
  - Runs a named built-in strategy on Yahoo or CSV data and prints the `summarize()` paragraph to stdout.
  - Accepts `--params '{"fast":5}'` to override strategy defaults.

- **`attachNotifier(session, opts)`**
  - Exported from `tradelab/live`. Subscribes a callback and/or webhook URL to a session's event bus.
  - Options: `events` (which events to forward), `onEvent` (async callback), `webhookUrl` (HTTP POST endpoint), `drawdownPct` (fires `drawdown:breach` when equity falls this far from peak).
  - Returns an unsubscribe function.

## [1.2.1] - 2026-06-27

### Fixed

- `backtestPortfolio()` now reports aggregate `metrics.finalEquity` correctly when `collectEqSeries: false`.
- `PaperEngine` now rejects market orders that have no price reference instead of filling them at zero.
- `TradingSession` now clears staged brackets when an async entry is rejected or canceled, and staged brackets are matched by order id/client order id instead of a loose string check.
- MCP `attach_strategy` now evaluates built-in strategies with the normal backtest signal context and auto-places returned order intents from `feed_price`.
- `research.monteCarlo()` now rejects non-positive iteration counts instead of returning empty bands and `NaN` probability fields.
- Public live types now include `TradingSessionOptions.confirmLive` and optional dashboard `source.refresh()`.

## [1.2.0] - 2026-06-26

### Added

- **MCP agent trading (paper and live sessions)**
  - New `TradingSession` class and `SessionManager` class exported from `tradelab/live`, enabling agents to manage real paper or live trading sessions programmatically.
  - `SessionManager.create()` spins up a session backed by `PaperEngine` (default) or a credentialed live broker; `SessionManager.haltAll()` is the process-level kill-switch that flattens all positions and clears every session.
  - `TradingSession.placeOrder()` supports risk-sized **bracket orders**: a single call with `stop` / `target` / `rr` fields submits the entry plus a protective stop and a profit target as OCO legs; a bar that straddles both stop and target no longer double-fills.
  - Day-loss risk halts: `maxDailyLossPct` triggers an automatic halt via `RiskManager`; further `placeOrder()` calls throw until the session is stopped.
  - Live-mode gating: live trading requires `TRADELAB_ALLOW_LIVE=true` (env var) **and** `confirmLive: true` passed to `create()`; paper is the default and needs no credentials or flags.

- **New MCP live-trading tools** (exposed via `tradelab-mcp`)
  - `create_session` — create a paper or live session with equity, risk, and interval settings.
  - `list_sessions` — list all active sessions and their current status.
  - `session_status` — get a full refreshed snapshot (positions, open orders, equity, risk state).
  - `feed_price` — push an OHLCV bar (or a single price) to advance paper simulation and trigger fills.
  - `place_order` — place a market or limit order, optionally risk-sized with a bracket stop/target.
  - `close_position` — close an open position via an opposite market order.
  - `flatten` — flatten all positions and cancel all open orders in a session.
  - `cancel_order` — cancel a specific open order.
  - `account` — fetch broker account details (equity, cash, buying power).
  - `positions` — list all open positions in a session.
  - `recent_events` — retrieve recent session events (fills, risk changes, bars) for monitoring.
  - `attach_strategy` — attach a named built-in strategy that auto-evaluates on each `feed_price` and places orders when flat.
  - `halt_all` — emergency kill-switch: flattens all positions and stops every active session.

- **MCP research-plus tools** (exposed via `tradelab-mcp`)
  - `analyze_robustness` — runs a backtest then Monte Carlo simulation and Deflated Sharpe ratio on the realized trade P&Ls; degrades gracefully with fewer than two trades.
  - `optimize_strategy` — in-process grid sweep returning a leaderboard ranked by a chosen metric (default: `profitFactor`).
  - `compare_strategies` — runs multiple named strategies on the same candle dataset and returns a ranked comparison.
  - `candle_stats` — returns shape statistics (count, date range, price range, estimated interval) for a candle array or data spec; useful for sanity-checking data before backtesting.

- **Dashboard overhaul**
  - Redesigned realtime cockpit with equity curve, KPI strip, positions/orders tables, severity-colored event feed, and a risk-halt banner.
  - Live **Flatten / Stop / Cancel** controls in the dashboard UI via a new `POST /command` endpoint (whitelisted methods: `flatten`, `stop`, `closePosition`, `cancelOrder`).
  - `GET /state` now calls `source.refresh()` before returning, so the state snapshot is always current.

### Changed

- MCP server version is now read dynamically from `package.json` via `createRequire`; no separate version constant to update on release.

### Fixed

- Paper-broker bracket orders: a price bar that straddled both the stop and the target could trigger a double-fill, flipping a position to the opposite side. The OCO cancel now runs before the sibling leg can fill.
- Dashboard equity curve color now reflects actual session P&L rather than a static value.

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
