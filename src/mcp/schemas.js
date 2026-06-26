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
};
