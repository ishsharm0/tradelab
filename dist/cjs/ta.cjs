"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/ta/index.js
var index_exports = {};
__export(index_exports, {
  atr: () => atr,
  bollinger: () => bollinger,
  detectFVG: () => detectFVG,
  donchian: () => donchian,
  ema: () => ema,
  keltner: () => keltner,
  lastSwing: () => lastSwing,
  macd: () => macd,
  rsi: () => rsi,
  stochastic: () => stochastic,
  structureState: () => structureState,
  supertrend: () => supertrend,
  swingHigh: () => swingHigh,
  swingLow: () => swingLow,
  vwap: () => vwap
});
module.exports = __toCommonJS(index_exports);

// src/utils/indicators.js
function ema(values, period = 14) {
  if (!values?.length) return [];
  const lookback = Math.max(1, period | 0);
  const output = new Array(values.length);
  let warmupSum = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!Number.isFinite(value)) {
      output[index] = index === 0 ? 0 : output[index - 1];
      continue;
    }
    if (index < lookback) {
      warmupSum += value;
      output[index] = index === lookback - 1 ? warmupSum / lookback : value;
      continue;
    }
    const smoothing = 2 / (lookback + 1);
    output[index] = value * smoothing + output[index - 1] * (1 - smoothing);
  }
  return output;
}
function swingHigh(bars, index, left = 2, right = 2) {
  if (index < left || index + right >= bars.length) return false;
  const high = bars[index].high;
  for (let cursor = index - left; cursor <= index + right; cursor += 1) {
    if (cursor !== index && bars[cursor].high >= high) return false;
  }
  return true;
}
function swingLow(bars, index, left = 2, right = 2) {
  if (index < left || index + right >= bars.length) return false;
  const low = bars[index].low;
  for (let cursor = index - left; cursor <= index + right; cursor += 1) {
    if (cursor !== index && bars[cursor].low <= low) return false;
  }
  return true;
}
function detectFVG(bars, index) {
  if (index < 2) return null;
  const first = bars[index - 2];
  const third = bars[index];
  if (first.high < third.low) {
    return {
      type: "bull",
      top: first.high,
      bottom: third.low,
      mid: (first.high + third.low) / 2
    };
  }
  if (first.low > third.high) {
    return {
      type: "bear",
      top: third.high,
      bottom: first.low,
      mid: (third.high + first.low) / 2
    };
  }
  return null;
}
function lastSwing(bars, index, direction) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (direction === "up" && swingLow(bars, cursor)) {
      return { idx: cursor, price: bars[cursor].low };
    }
    if (direction === "down" && swingHigh(bars, cursor)) {
      return { idx: cursor, price: bars[cursor].high };
    }
  }
  return null;
}
function structureState(bars, index) {
  return {
    lastLow: lastSwing(bars, index, "up"),
    lastHigh: lastSwing(bars, index, "down")
  };
}
function atr(bars, period = 14) {
  if (!bars?.length || period <= 0) return [];
  const trueRanges = new Array(bars.length);
  for (let index = 0; index < bars.length; index += 1) {
    if (index === 0) {
      trueRanges[index] = bars[index].high - bars[index].low;
      continue;
    }
    const high = bars[index].high;
    const low = bars[index].low;
    const previousClose = bars[index - 1].close;
    trueRanges[index] = Math.max(
      high - low,
      Math.abs(high - previousClose),
      Math.abs(low - previousClose)
    );
  }
  const output = new Array(trueRanges.length);
  let previousAtr;
  for (let index = 0; index < trueRanges.length; index += 1) {
    if (index < period) {
      output[index] = void 0;
      if (index === period - 1) {
        let seed = 0;
        for (let cursor = 0; cursor < period; cursor += 1) {
          seed += trueRanges[cursor];
        }
        previousAtr = seed / period;
        output[index] = previousAtr;
      }
      continue;
    }
    previousAtr = (previousAtr * (period - 1) + trueRanges[index]) / period;
    output[index] = previousAtr;
  }
  return output;
}

// src/ta/oscillators.js
function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(void 0);
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
function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalLine = ema(macdLine, signalPeriod);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macd: macdLine, signal: signalLine, histogram };
}
function stochastic(bars, kPeriod = 14, dPeriod = 3) {
  const k = new Array(bars.length).fill(void 0);
  for (let i = kPeriod - 1; i < bars.length; i += 1) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j += 1) {
      if (bars[j].high > hh) hh = bars[j].high;
      if (bars[j].low < ll) ll = bars[j].low;
    }
    const range = hh - ll;
    k[i] = range === 0 ? 0 : (bars[i].close - ll) / range * 100;
  }
  const d = new Array(bars.length).fill(void 0);
  for (let i = 0; i < bars.length; i += 1) {
    if (i < kPeriod - 1 + dPeriod - 1) continue;
    let sum = 0;
    for (let j = i - dPeriod + 1; j <= i; j += 1) sum += k[j];
    d[i] = sum / dPeriod;
  }
  return { k, d };
}

// src/ta/channels.js
function rollingMean(values, period, i) {
  let sum = 0;
  for (let j = i - period + 1; j <= i; j += 1) sum += values[j];
  return sum / period;
}
function bollinger(closes, period = 20, mult = 2) {
  const middle = new Array(closes.length).fill(void 0);
  const upper = new Array(closes.length).fill(void 0);
  const lower = new Array(closes.length).fill(void 0);
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
function donchian(bars, period = 20) {
  const upper = new Array(bars.length).fill(void 0);
  const lower = new Array(bars.length).fill(void 0);
  const middle = new Array(bars.length).fill(void 0);
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
function keltner(bars, emaPeriod = 20, atrPeriod = 14, mult = 2) {
  const closes = bars.map((b) => b.close);
  const mid = ema(closes, emaPeriod);
  const range = atr(bars, atrPeriod);
  const upper = new Array(bars.length).fill(void 0);
  const lower = new Array(bars.length).fill(void 0);
  const middle = new Array(bars.length).fill(void 0);
  for (let i = 0; i < bars.length; i += 1) {
    if (range[i] === void 0) continue;
    middle[i] = mid[i];
    upper[i] = mid[i] + mult * range[i];
    lower[i] = mid[i] - mult * range[i];
  }
  return { upper, lower, middle };
}

// src/ta/trend.js
function supertrend(bars, period = 10, mult = 3) {
  const range = atr(bars, period);
  const line = new Array(bars.length).fill(void 0);
  const direction = new Array(bars.length).fill(void 0);
  let prevUpper = Infinity;
  let prevLower = -Infinity;
  let prevDir = 1;
  for (let i = 0; i < bars.length; i += 1) {
    if (range[i] === void 0) continue;
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
  return d.getUTCFullYear() * 1e4 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}
function vwap(bars) {
  const out = new Array(bars.length).fill(void 0);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  atr,
  bollinger,
  detectFVG,
  donchian,
  ema,
  keltner,
  lastSwing,
  macd,
  rsi,
  stochastic,
  structureState,
  supertrend,
  swingHigh,
  swingLow,
  vwap
});
