import { ema } from "../../src/utils/indicators.js";

export function createSignal({ fast = 10, slow = 30, rr = 2 } = {}) {
  return ({ candles, bar }) => {
    if (candles.length < slow + 2) return null;
    const closes = candles.map((c) => c.close);
    const f = ema(closes, fast);
    const s = ema(closes, slow);
    const i = closes.length - 1;
    if (f[i - 1] <= s[i - 1] && f[i] > s[i]) {
      const stop = Math.min(...candles.slice(-15).map((c) => c.low));
      if (stop >= bar.close) return null;
      return { side: "long", entry: bar.close, stop, rr };
    }
    return null;
  };
}
