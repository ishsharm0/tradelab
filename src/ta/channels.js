// src/ta/channels.js
import { ema, atr } from "../utils/indicators.js";

function rollingMean(values, period, i) {
  let sum = 0;
  for (let j = i - period + 1; j <= i; j += 1) sum += values[j];
  return sum / period;
}

/**
 * Bollinger Bands. `mult` standard deviations around the SMA middle band.
 */
export function bollinger(closes, period = 20, mult = 2) {
  const middle = new Array(closes.length).fill(undefined);
  const upper = new Array(closes.length).fill(undefined);
  const lower = new Array(closes.length).fill(undefined);
  for (let i = period - 1; i < closes.length; i += 1) {
    const avg = rollingMean(closes, period, i);
    let variance = 0;
    for (let j = i - period + 1; j <= i; j += 1) variance += (closes[j] - avg) ** 2;
    const sd = Math.sqrt(variance / period);
    middle[i] = avg;
    upper[i] = avg + mult * sd;
    lower[i] = avg - mult * sd;
  }
  return { middle, upper, lower };
}

/**
 * Donchian channel: rolling highest-high / lowest-low over `period` bars.
 */
export function donchian(bars, period = 20) {
  const upper = new Array(bars.length).fill(undefined);
  const lower = new Array(bars.length).fill(undefined);
  const middle = new Array(bars.length).fill(undefined);
  for (let i = period - 1; i < bars.length; i += 1) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j += 1) {
      if (bars[j].high > hh) hh = bars[j].high;
      if (bars[j].low < ll) ll = bars[j].low;
    }
    upper[i] = hh;
    lower[i] = ll;
    middle[i] = (hh + ll) / 2;
  }
  return { upper, lower, middle };
}

/**
 * Keltner channel: EMA middle, +/- mult * ATR width.
 */
export function keltner(bars, emaPeriod = 20, atrPeriod = 14, mult = 2) {
  const closes = bars.map((b) => b.close);
  const mid = ema(closes, emaPeriod);
  const range = atr(bars, atrPeriod);
  const upper = new Array(bars.length).fill(undefined);
  const lower = new Array(bars.length).fill(undefined);
  const middle = new Array(bars.length).fill(undefined);
  for (let i = 0; i < bars.length; i += 1) {
    if (range[i] === undefined) continue;
    middle[i] = mid[i];
    upper[i] = mid[i] + mult * range[i];
    lower[i] = mid[i] - mult * range[i];
  }
  return { upper, lower, middle };
}
