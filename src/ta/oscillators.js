// src/ta/oscillators.js
import { ema } from "../utils/indicators.js";

/**
 * Wilder's RSI. Returns a full-length array; warmup positions are `undefined`.
 */
export function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(undefined);
  if (closes.length <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gainSum += change;
    else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/**
 * MACD line, signal line, histogram. All full-length, aligned to input.
 */
export function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalLine = ema(macdLine, signalPeriod);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macd: macdLine, signal: signalLine, histogram };
}

/**
 * Stochastic oscillator %K (smoothed close position in the high-low range) and
 * %D (SMA of %K). `bars` need { high, low, close }.
 */
export function stochastic(bars, kPeriod = 14, dPeriod = 3) {
  const k = new Array(bars.length).fill(undefined);
  for (let i = kPeriod - 1; i < bars.length; i += 1) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j += 1) {
      if (bars[j].high > hh) hh = bars[j].high;
      if (bars[j].low < ll) ll = bars[j].low;
    }
    const range = hh - ll;
    k[i] = range === 0 ? 0 : ((bars[i].close - ll) / range) * 100;
  }

  const d = new Array(bars.length).fill(undefined);
  for (let i = 0; i < bars.length; i += 1) {
    if (i < kPeriod - 1 + dPeriod - 1) continue;
    let sum = 0;
    for (let j = i - dPeriod + 1; j <= i; j += 1) sum += k[j];
    d[i] = sum / dPeriod;
  }
  return { k, d };
}
