import { z } from "zod";

const candle = z.object({
  time: z.number(),
  open: z.number().optional(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().optional(),
});

const dataSpec = z
  .object({
    source: z.enum(["yahoo", "csv", "auto"]).optional(),
    symbol: z.string().optional(),
    interval: z.string().optional(),
    period: z.string().optional(),
    csvPath: z.string().optional(),
    cache: z.boolean().optional(),
  })
  .passthrough();

const barShape = z.object({
  time: z.number(),
  open: z.number().optional(),
  high: z.number().optional(),
  low: z.number().optional(),
  close: z.number(),
  volume: z.number().optional(),
});

const sessionMode = z.enum(["paper", "live"]).optional();
const orderSide = z.enum(["long", "short", "buy", "sell"]);
const orderType = z.enum(["market", "limit", "stop", "stop_limit"]).optional();

export const schemas = {
  list_strategies: {},
  fetch_candles: dataSpec.shape,
  run_backtest: {
    candles: z.array(candle).optional(),
    data: dataSpec.optional(),
    symbol: z.string().optional(),
    interval: z.string().optional(),
    strategy: z.string(),
    params: z.record(z.string(), z.any()).optional(),
    backtestOptions: z.record(z.string(), z.any()).optional(),
  },
  walk_forward: {
    candles: z.array(candle).optional(),
    data: dataSpec.optional(),
    interval: z.string().optional(),
    strategy: z.string(),
    trainBars: z.number(),
    testBars: z.number(),
    stepBars: z.number().optional(),
    mode: z.enum(["rolling", "anchored"]).optional(),
    scoreBy: z.string().optional(),
    grid: z.record(z.string(), z.array(z.any())).optional(),
    backtestOptions: z.record(z.string(), z.any()).optional(),
  },

  // Live trading tools
  create_session: {
    sessionId: z.string(),
    symbol: z.string(),
    mode: sessionMode,
    interval: z.string().optional(),
    equity: z.number().optional(),
    riskPct: z.number().optional(),
    maxDailyLossPct: z.number().optional(),
    confirmLive: z.boolean().optional(),
  },
  list_sessions: {},
  session_status: {
    sessionId: z.string(),
  },
  feed_price: {
    sessionId: z.string(),
    bar: barShape.optional(),
    price: z.number().optional(),
  },
  place_order: {
    sessionId: z.string(),
    side: orderSide,
    type: orderType,
    qty: z.number().optional(),
    riskPct: z.number().optional(),
    stop: z.number().optional(),
    target: z.number().optional(),
    rr: z.number().optional(),
    limitPrice: z.number().optional(),
  },
  close_position: {
    sessionId: z.string(),
    symbol: z.string().optional(),
  },
  flatten: {
    sessionId: z.string(),
  },
  cancel_order: {
    sessionId: z.string(),
    orderId: z.string(),
  },
  account: {
    sessionId: z.string(),
  },
  positions: {
    sessionId: z.string(),
  },
  recent_events: {
    sessionId: z.string(),
    limit: z.number().optional(),
  },
  attach_strategy: {
    sessionId: z.string(),
    strategy: z.string(),
    params: z.record(z.string(), z.any()).optional(),
  },
  halt_all: {},
};
