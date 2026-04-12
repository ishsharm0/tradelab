import type * as Tradelab from "../../types/index.d.ts";
import type * as Live from "../../types/live.d.ts";

declare const api: typeof Tradelab;

const candles: Tradelab.Candle[] = [
  { time: Date.UTC(2025, 0, 2, 14, 30), open: 100, high: 101, low: 99, close: 100, volume: 1000 },
  { time: Date.UTC(2025, 0, 2, 14, 35), open: 100, high: 102, low: 99, close: 101, volume: 1100 },
];

const ticks: Tradelab.Tick[] = [
  { time: Date.UTC(2025, 0, 2, 14, 30), price: 100 },
  { time: Date.UTC(2025, 0, 2, 14, 30, 1), price: 101 },
];

const candleResult = api.backtest({
  candles,
  signal: ({ bar }) => ({
    side: "buy",
    entry: bar.close,
    stop: bar.close - 1,
    rr: 2,
  }),
});
const _candleResultType: Tradelab.BacktestResult = candleResult;

const tickResult = api.backtestTicks({
  ticks,
  signal: ({ bar }) => ({
    side: "buy",
    stop: bar.close - 1,
    rr: 2,
  }),
});
const _tickResultType: Tradelab.BacktestResult = tickResult;

const portfolioResult = api.backtestPortfolio({
  systems: [
    {
      symbol: "AAA",
      candles,
      signal: ({ bar }) => ({
        side: "buy",
        entry: bar.close,
        stop: bar.close - 1,
        rr: 2,
      }),
    },
  ],
  processingOrder: "shuffle",
  shuffleSeed: 42,
});
const _portfolioType: Tradelab.PortfolioBacktestResult = portfolioResult;

const walkForward = api.walkForwardOptimize({
  candles,
  trainBars: 1,
  testBars: 1,
  parameterSets: [{ holdBars: 1 }],
  signalFactory:
    () =>
    ({ bar }) => ({
      side: "buy",
      entry: bar.close,
      stop: bar.close - 1,
      rr: 2,
    }),
});
const _wfType: Tradelab.BacktestResult = walkForward;

const metrics = api.buildMetrics({
  closed: [],
  equityStart: 10_000,
  equityFinal: 10_000,
  candles,
  estBarMs: 60_000,
});
const _metricsType: Tradelab.BacktestMetrics = metrics;

void _candleResultType;
void _tickResultType;
void _portfolioType;
void _wfType;
void _metricsType;

declare const liveApi: typeof Live;

const broker = liveApi.createPaperEngine({ equity: 1000 });
const liveEngine = liveApi.createLiveEngine({
  symbol: "AAPL",
  interval: "1m",
  signal: () => null,
  broker,
});
const liveStatus = liveEngine.getStatus();
void liveStatus;
