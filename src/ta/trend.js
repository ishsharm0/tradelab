// src/ta/trend.js
import { atr } from "../utils/indicators.js";

/**
 * Supertrend. Returns { line, direction } full-length.
 * direction: 1 = uptrend (line is support below price), -1 = downtrend.
 */
export function supertrend(bars, period = 10, mult = 3) {
  const range = atr(bars, period);
  const line = new Array(bars.length).fill(undefined);
  const direction = new Array(bars.length).fill(undefined);

  let prevUpper = Infinity;
  let prevLower = -Infinity;
  let prevDir = 1;

  for (let i = 0; i < bars.length; i += 1) {
    if (range[i] === undefined) continue;
    const mid = (bars[i].high + bars[i].low) / 2;
    const basicUpper = mid + mult * range[i];
    const basicLower = mid - mult * range[i];
    const close = bars[i].close;
    const prevClose = i > 0 ? bars[i - 1].close : close;

    const upper = basicUpper < prevUpper || prevClose > prevUpper ? basicUpper : prevUpper;
    const lower = basicLower > prevLower || prevClose < prevLower ? basicLower : prevLower;

    let dir = prevDir;
    if (prevDir === 1 && close < lower) dir = -1;
    else if (prevDir === -1 && close > upper) dir = 1;

    line[i] = dir === 1 ? lower : upper;
    direction[i] = dir;

    prevUpper = upper;
    prevLower = lower;
    prevDir = dir;
  }
  return { line, direction };
}

function dayKeyUTC(timeMs) {
  const d = new Date(timeMs);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/**
 * Session VWAP, reset on each UTC calendar day. `bars` need
 * { time, high, low, close, volume }. When volume is missing/zero, falls back
 * to an unweighted cumulative typical-price average for that day.
 */
export function vwap(bars) {
  const out = new Array(bars.length).fill(undefined);
  let currentDay = null;
  let cumPV = 0;
  let cumV = 0;
  let cumTP = 0;
  let count = 0;

  for (let i = 0; i < bars.length; i += 1) {
    const day = dayKeyUTC(bars[i].time);
    if (day !== currentDay) {
      currentDay = day;
      cumPV = 0;
      cumV = 0;
      cumTP = 0;
      count = 0;
    }
    const tp = (bars[i].high + bars[i].low + bars[i].close) / 3;
    const vol = Number.isFinite(bars[i].volume) ? bars[i].volume : 0;
    cumPV += tp * vol;
    cumV += vol;
    cumTP += tp;
    count += 1;
    out[i] = cumV > 0 ? cumPV / cumV : cumTP / count;
  }
  return out;
}
