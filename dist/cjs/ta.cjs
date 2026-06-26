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
  detectFVG: () => detectFVG,
  ema: () => ema,
  lastSwing: () => lastSwing,
  structureState: () => structureState,
  swingHigh: () => swingHigh,
  swingLow: () => swingLow
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  atr,
  detectFVG,
  ema,
  lastSwing,
  structureState,
  swingHigh,
  swingLow
});
