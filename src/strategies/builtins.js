import { ema } from "../utils/indicators.js";
import { rsi } from "../ta/oscillators.js";
import { donchian } from "../ta/channels.js";

export const BUILTINS = {
  "ema-cross": {
    description: "Long when fast EMA crosses above slow EMA; stop at recent swing low.",
    params: {
      fast: { type: "number", default: 10, description: "fast EMA period" },
      slow: { type: "number", default: 30, description: "slow EMA period" },
      rr: { type: "number", default: 2, description: "reward:risk target" },
      lookback: { type: "number", default: 15, description: "swing-low lookback for stop" },
    },
    factory({ fast = 10, slow = 30, rr = 2, lookback = 15 } = {}) {
      return ({ candles, bar }) => {
        if (candles.length < slow + 2) return null;
        const closes = candles.map((c) => c.close);
        const f = ema(closes, fast);
        const s = ema(closes, slow);
        const last = closes.length - 1;
        if (f[last - 1] <= s[last - 1] && f[last] > s[last]) {
          const stop = Math.min(...candles.slice(-lookback).map((c) => c.low));
          if (stop >= bar.close) return null;
          return { side: "long", entry: bar.close, stop, rr };
        }
        return null;
      };
    },
  },

  "rsi-reversion": {
    description: "Long when RSI dips below `oversold`; stop a fixed pct below entry.",
    params: {
      period: { type: "number", default: 14, description: "RSI period" },
      oversold: { type: "number", default: 30, description: "RSI entry threshold" },
      stopPct: { type: "number", default: 2, description: "stop distance in percent" },
      rr: { type: "number", default: 1.5, description: "reward:risk target" },
    },
    factory({ period = 14, oversold = 30, stopPct = 2, rr = 1.5 } = {}) {
      return ({ candles, bar }) => {
        if (candles.length < period + 2) return null;
        const values = rsi(
          candles.map((c) => c.close),
          period
        );
        const r = values[values.length - 1];
        if (r === undefined || r > oversold) return null;
        return { side: "long", entry: bar.close, stop: bar.close * (1 - stopPct / 100), rr };
      };
    },
  },

  "donchian-breakout": {
    description: "Long on a close above the prior Donchian upper channel.",
    params: {
      period: { type: "number", default: 20, description: "channel lookback" },
      rr: { type: "number", default: 2, description: "reward:risk target" },
    },
    factory({ period = 20, rr = 2 } = {}) {
      return ({ candles, bar }) => {
        if (candles.length < period + 2) return null;
        const ch = donchian(candles, period);
        const i = candles.length - 1;
        const priorUpper = ch.upper[i - 1];
        const priorLower = ch.lower[i - 1];
        if (priorUpper === undefined) return null;
        if (bar.close > priorUpper) {
          return { side: "long", entry: bar.close, stop: priorLower, rr };
        }
        return null;
      };
    },
  },

  "buy-hold": {
    description: "Enter once at the first eligible bar and hold for `holdBars`.",
    params: {
      holdBars: { type: "number", default: 5, description: "bars to hold before exit" },
      stopPct: { type: "number", default: 10, description: "protective stop distance in percent" },
    },
    factory({ holdBars = 5, stopPct = 10 } = {}) {
      let entered = false;
      return ({ bar }) => {
        if (entered) return null;
        entered = true;
        return {
          side: "long",
          entry: bar.close,
          stop: bar.close * (1 - stopPct / 100),
          rr: 5,
          _maxBarsInTrade: holdBars,
        };
      };
    },
  },
};
