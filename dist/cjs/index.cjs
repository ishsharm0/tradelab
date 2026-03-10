var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.js
var index_exports = {};
__export(index_exports, {
  atr: () => atr,
  backtest: () => backtest,
  backtestHistorical: () => backtestHistorical,
  backtestPortfolio: () => backtestPortfolio,
  backtestTicks: () => backtestTicks,
  bpsOf: () => bpsOf,
  buildMetrics: () => buildMetrics,
  cachedCandlesPath: () => cachedCandlesPath,
  calculatePositionSize: () => calculatePositionSize,
  candleStats: () => candleStats,
  detectFVG: () => detectFVG,
  ema: () => ema,
  exportBacktestArtifacts: () => exportBacktestArtifacts,
  exportHtmlReport: () => exportHtmlReport,
  exportMetricsJSON: () => exportMetricsJSON,
  exportTradesCsv: () => exportTradesCsv,
  fetchHistorical: () => fetchHistorical,
  fetchLatestCandle: () => fetchLatestCandle,
  getHistoricalCandles: () => getHistoricalCandles,
  inWindowsET: () => inWindowsET,
  isSession: () => isSession,
  lastSwing: () => lastSwing,
  loadCandlesFromCSV: () => loadCandlesFromCSV,
  loadCandlesFromCache: () => loadCandlesFromCache,
  mergeCandles: () => mergeCandles,
  minutesET: () => minutesET,
  normalizeCandles: () => normalizeCandles,
  offsetET: () => offsetET,
  parseWindowsCSV: () => parseWindowsCSV,
  pct: () => pct,
  renderHtmlReport: () => renderHtmlReport,
  saveCandlesToCache: () => saveCandlesToCache,
  structureState: () => structureState,
  swingHigh: () => swingHigh,
  swingLow: () => swingLow,
  walkForwardOptimize: () => walkForwardOptimize
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
var bpsOf = (price, bps) => price * (bps / 1e4);
var pct = (a, b) => (a - b) / b;

// src/utils/positionSizing.js
function roundStep(value, step) {
  return Math.floor(value / step) * step;
}
function calculatePositionSize({
  equity,
  entry,
  stop,
  riskFraction = 0.01,
  qtyStep = 1e-3,
  minQty = 1e-3,
  maxLeverage = 2
}) {
  const riskPerUnit = Math.abs(entry - stop);
  if (!Number.isFinite(riskPerUnit) || riskPerUnit <= 0) return 0;
  const maxRiskDollars = Math.max(0, equity * riskFraction);
  let quantity = maxRiskDollars / riskPerUnit;
  const leverageCapQty = equity * maxLeverage / Math.max(1e-12, Math.abs(entry));
  quantity = Math.min(quantity, leverageCapQty);
  quantity = roundStep(quantity, qtyStep);
  return quantity >= minQty ? quantity : 0;
}

// src/metrics/buildMetrics.js
function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}
function mean(values) {
  return values.length ? sum(values) / values.length : 0;
}
function stddev(values) {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}
function sortino(values) {
  const losses = values.filter((value) => value < 0);
  const downsideDeviation = stddev(losses.length ? losses : [0]);
  const avg = mean(values);
  return downsideDeviation === 0 ? avg > 0 ? Infinity : 0 : avg / downsideDeviation;
}
function dayKeyUTC(timeMs) {
  const date = new Date(timeMs);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}
function tradeRMultiple(trade) {
  const initialRisk = trade._initRisk || 0;
  if (initialRisk <= 0) return 0;
  const entry = trade.entryFill ?? trade.entry;
  const perUnit = trade.side === "long" ? trade.exit.price - entry : entry - trade.exit.price;
  return perUnit / initialRisk;
}
function streaks(labels) {
  let wins = 0;
  let losses = 0;
  let maxWins = 0;
  let maxLosses = 0;
  for (const label of labels) {
    if (label === "win") {
      wins += 1;
      losses = 0;
      if (wins > maxWins) maxWins = wins;
      continue;
    }
    if (label === "loss") {
      losses += 1;
      wins = 0;
      if (losses > maxLosses) maxLosses = losses;
      continue;
    }
    wins = 0;
    losses = 0;
  }
  return { maxWin: maxWins, maxLoss: maxLosses };
}
function buildEquitySeriesFromLegs({ legs, equityStart }) {
  const firstTime = legs.length ? legs[0].exit.time : Date.now();
  const series = [{ time: firstTime, equity: equityStart }];
  let equity = equityStart;
  for (const leg of legs) {
    equity += leg.exit.pnl;
    series.push({ time: leg.exit.time, equity });
  }
  return series;
}
function dailyReturns(eqSeries) {
  if (!eqSeries?.length) return [];
  const byDay = /* @__PURE__ */ new Map();
  for (const point of eqSeries) {
    const day = dayKeyUTC(point.time);
    const record = byDay.get(day) || {
      open: point.equity,
      close: point.equity,
      first: point.time,
      last: point.time
    };
    if (point.time < record.first) {
      record.first = point.time;
      record.open = point.equity;
    }
    if (point.time >= record.last) {
      record.last = point.time;
      record.close = point.equity;
    }
    byDay.set(day, record);
  }
  const returns = [];
  for (const { open, close } of byDay.values()) {
    if (open > 0 && Number.isFinite(open) && Number.isFinite(close)) {
      returns.push((close - open) / open);
    }
  }
  return returns;
}
function percentile(values, percentileRank) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((sorted.length - 1) * percentileRank);
  return sorted[index];
}
function buildMetrics({
  closed,
  equityStart,
  equityFinal,
  candles,
  estBarMs,
  eqSeries
}) {
  const legs = [...closed].sort((left, right) => left.exit.time - right.exit.time);
  const completedTrades = [];
  const tradeRs = [];
  const tradePnls = [];
  const tradeReturns = [];
  const holdDurationsMinutes = [];
  const labels = [];
  const longRs = [];
  const shortRs = [];
  let totalR = 0;
  let realizedPnL = 0;
  let winningTradeCount = 0;
  let grossProfitPositions = 0;
  let grossLossPositions = 0;
  let grossProfitLegs = 0;
  let grossLossLegs = 0;
  let winningLegCount = 0;
  let openBars = 0;
  let longTradesCount = 0;
  let longTradeWins = 0;
  let longPnLSum = 0;
  let shortTradesCount = 0;
  let shortTradeWins = 0;
  let shortPnLSum = 0;
  let peakEquity = equityStart;
  let currentEquity = equityStart;
  let maxDrawdown = 0;
  for (const trade of legs) {
    const pnl = trade.exit.pnl;
    realizedPnL += pnl;
    if (pnl > 0) {
      grossProfitLegs += pnl;
      winningLegCount += 1;
    } else if (pnl < 0) {
      grossLossLegs += Math.abs(pnl);
    }
    currentEquity += pnl;
    if (currentEquity > peakEquity) peakEquity = currentEquity;
    const drawdown = (peakEquity - currentEquity) / Math.max(1e-12, peakEquity);
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    if (trade.exit.reason === "SCALE") continue;
    completedTrades.push(trade);
    tradePnls.push(pnl);
    tradeReturns.push(pnl / Math.max(1e-12, equityStart));
    const tradeR = tradeRMultiple(trade);
    tradeRs.push(tradeR);
    totalR += tradeR;
    labels.push(pnl > 0 ? "win" : pnl < 0 ? "loss" : "flat");
    const holdMinutes = (trade.exit.time - trade.openTime) / (1e3 * 60);
    holdDurationsMinutes.push(holdMinutes);
    openBars += Math.max(1, Math.round((trade.exit.time - trade.openTime) / estBarMs));
    if (pnl > 0) {
      winningTradeCount += 1;
      grossProfitPositions += pnl;
    } else if (pnl < 0) {
      grossLossPositions += Math.abs(pnl);
    }
    if (trade.side === "long") {
      longTradesCount += 1;
      longPnLSum += pnl;
      longRs.push(tradeR);
      if (pnl > 0) longTradeWins += 1;
    } else if (trade.side === "short") {
      shortTradesCount += 1;
      shortPnLSum += pnl;
      shortRs.push(tradeR);
      if (pnl > 0) shortTradeWins += 1;
    }
  }
  const avgR = mean(tradeRs);
  const { maxWin, maxLoss } = streaks(labels);
  const expectancy = mean(tradePnls);
  const tradeReturnStd = stddev(tradeReturns);
  const sharpePerTrade = tradeReturnStd === 0 ? tradeReturns.length ? Infinity : 0 : mean(tradeReturns) / tradeReturnStd;
  const sortinoPerTrade = sortino(tradeReturns);
  const profitFactorPositions = grossLossPositions === 0 ? grossProfitPositions > 0 ? Infinity : 0 : grossProfitPositions / grossLossPositions;
  const profitFactorLegs = grossLossLegs === 0 ? grossProfitLegs > 0 ? Infinity : 0 : grossProfitLegs / grossLossLegs;
  const returnPct = (equityFinal - equityStart) / Math.max(1e-12, equityStart);
  const calmar = maxDrawdown === 0 ? returnPct > 0 ? Infinity : 0 : returnPct / maxDrawdown;
  const totalBars = Math.max(1, candles.length);
  const exposurePct = openBars / totalBars;
  const avgHoldMin = mean(holdDurationsMinutes);
  const equitySeries = eqSeries && eqSeries.length ? eqSeries : buildEquitySeriesFromLegs({ legs, equityStart });
  const dailyReturnsSeries = dailyReturns(equitySeries);
  const dailyStd = stddev(dailyReturnsSeries);
  const sharpeDaily = dailyStd === 0 ? dailyReturnsSeries.length ? Infinity : 0 : mean(dailyReturnsSeries) / dailyStd;
  const sortinoDaily = sortino(dailyReturnsSeries);
  const dailyWinRate = dailyReturnsSeries.length ? dailyReturnsSeries.filter((value) => value > 0).length / dailyReturnsSeries.length : 0;
  const rDistribution = {
    p10: percentile(tradeRs, 0.1),
    p25: percentile(tradeRs, 0.25),
    p50: percentile(tradeRs, 0.5),
    p75: percentile(tradeRs, 0.75),
    p90: percentile(tradeRs, 0.9)
  };
  const holdDistribution = {
    p10: percentile(holdDurationsMinutes, 0.1),
    p25: percentile(holdDurationsMinutes, 0.25),
    p50: percentile(holdDurationsMinutes, 0.5),
    p75: percentile(holdDurationsMinutes, 0.75),
    p90: percentile(holdDurationsMinutes, 0.9)
  };
  const sideBreakdown = {
    long: {
      trades: longTradesCount,
      winRate: longTradesCount ? longTradeWins / longTradesCount : 0,
      avgPnL: longTradesCount ? longPnLSum / longTradesCount : 0,
      avgR: mean(longRs)
    },
    short: {
      trades: shortTradesCount,
      winRate: shortTradesCount ? shortTradeWins / shortTradesCount : 0,
      avgPnL: shortTradesCount ? shortPnLSum / shortTradesCount : 0,
      avgR: mean(shortRs)
    }
  };
  return {
    trades: completedTrades.length,
    winRate: completedTrades.length ? winningTradeCount / completedTrades.length : 0,
    profitFactor: profitFactorPositions,
    expectancy,
    totalR,
    avgR,
    sharpe: sharpeDaily,
    sharpePerTrade,
    sortinoPerTrade,
    maxDrawdown,
    maxDrawdownPct: maxDrawdown,
    calmar,
    maxConsecWins: maxWin,
    maxConsecLosses: maxLoss,
    avgHold: avgHoldMin,
    avgHoldMin,
    exposurePct,
    totalPnL: realizedPnL,
    returnPct,
    finalEquity: equityFinal,
    startEquity: equityStart,
    profitFactor_pos: profitFactorPositions,
    profitFactor_leg: profitFactorLegs,
    winRate_pos: completedTrades.length ? winningTradeCount / completedTrades.length : 0,
    winRate_leg: legs.length ? winningLegCount / legs.length : 0,
    sharpeDaily,
    sortinoDaily,
    sideBreakdown,
    long: sideBreakdown.long,
    short: sideBreakdown.short,
    rDist: rDistribution,
    holdDistMin: holdDistribution,
    daily: {
      count: dailyReturnsSeries.length,
      winRate: dailyWinRate,
      avgReturn: mean(dailyReturnsSeries)
    }
  };
}

// src/data/csv.js
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
function safeSegment(value) {
  return String(value).replace(/[^-_.A-Za-z0-9]/g, "_");
}
function resolveDate(value, customDateParser) {
  if (value === void 0 || value === null || value === "") {
    throw new Error("Missing date value");
  }
  if (typeof customDateParser === "function") {
    const parsed2 = customDateParser(value);
    const time = parsed2 instanceof Date ? parsed2.getTime() : Number(parsed2);
    if (Number.isFinite(time)) return time;
  }
  if (value instanceof Date) {
    const time = value.getTime();
    if (Number.isFinite(time)) return time;
  }
  const raw = String(value).trim().replace(/^['"]|['"]$/g, "");
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return numeric < 1e11 ? numeric * 1e3 : numeric;
  }
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return parsed;
  const mt = raw.match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (mt) {
    const [, year, month, day, hour, minute, second = "0"] = mt;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    ).getTime();
  }
  throw new Error(`Cannot parse date: ${raw}`);
}
function parseCsvLine(line, delimiter) {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current.trim());
  return out.map((value) => value.replace(/^['"]|['"]$/g, ""));
}
function buildHeaderIndex(headers) {
  const map = /* @__PURE__ */ new Map();
  headers.forEach((header, index) => {
    map.set(header.trim().toLowerCase(), index);
  });
  return map;
}
function resolveColumn(column, headerIndex, aliases = []) {
  if (typeof column === "number" && column >= 0) return column;
  const candidates = [column, ...aliases].filter((value) => value !== void 0 && value !== null).map((value) => String(value).trim().toLowerCase());
  for (const candidate of candidates) {
    if (headerIndex.has(candidate)) return headerIndex.get(candidate);
  }
  return -1;
}
function normalizeDateBoundary(value, fallback) {
  if (!value) return fallback;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}
function normalizeCandles(candles) {
  if (!Array.isArray(candles)) return [];
  const normalized = candles.map((bar) => {
    try {
      const time = resolveDate(bar?.time ?? bar?.timestamp ?? bar?.date);
      const open = Number(bar?.open ?? bar?.o);
      const high = Number(bar?.high ?? bar?.h);
      const low = Number(bar?.low ?? bar?.l);
      const close = Number(bar?.close ?? bar?.c);
      const volume = Number(bar?.volume ?? bar?.v ?? 0);
      if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
        return null;
      }
      return {
        time,
        open,
        high: Math.max(high, open, close),
        low: Math.min(low, open, close),
        close,
        volume: Number.isFinite(volume) ? volume : 0
      };
    } catch {
      return null;
    }
  }).filter(Boolean).sort((left, right) => left.time - right.time);
  const deduped = [];
  let lastTime = null;
  for (const candle of normalized) {
    if (candle.time === lastTime) continue;
    deduped.push(candle);
    lastTime = candle.time;
  }
  return deduped;
}
function loadCandlesFromCSV(filePath, options = {}) {
  const {
    delimiter = ",",
    skipRows = 0,
    hasHeader = true,
    timeCol = "time",
    openCol = "open",
    highCol = "high",
    lowCol = "low",
    closeCol = "close",
    volumeCol = "volume",
    startDate,
    endDate,
    customDateParser
  } = options;
  if (!import_fs.default.existsSync(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }
  const content = import_fs.default.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= skipRows) {
    throw new Error(`CSV file is empty: ${filePath}`);
  }
  const headerRow = hasHeader ? parseCsvLine(lines[skipRows], delimiter) : [];
  const headerIndex = buildHeaderIndex(headerRow);
  const startRow = hasHeader ? skipRows + 1 : skipRows;
  const timeIdx = resolveColumn(timeCol, headerIndex, [
    "date",
    "datetime",
    "timestamp",
    "ts",
    "open time",
    "opentime"
  ]);
  const openIdx = resolveColumn(openCol, headerIndex, ["o"]);
  const highIdx = resolveColumn(highCol, headerIndex, ["h"]);
  const lowIdx = resolveColumn(lowCol, headerIndex, ["l"]);
  const closeIdx = resolveColumn(closeCol, headerIndex, ["c", "adj close"]);
  const volumeIdx = resolveColumn(volumeCol, headerIndex, ["v", "vol", "quantity"]);
  if (timeIdx < 0 || openIdx < 0 || highIdx < 0 || lowIdx < 0 || closeIdx < 0) {
    throw new Error(
      `Could not resolve required CSV columns in ${import_path.default.basename(filePath)}`
    );
  }
  const minTime = normalizeDateBoundary(startDate, -Infinity);
  const maxTime = normalizeDateBoundary(endDate, Infinity);
  const candles = [];
  for (let row = startRow; row < lines.length; row += 1) {
    const cols = parseCsvLine(lines[row], delimiter);
    try {
      const time = resolveDate(cols[timeIdx], customDateParser);
      if (time < minTime || time > maxTime) continue;
      const open = Number(cols[openIdx]);
      const high = Number(cols[highIdx]);
      const low = Number(cols[lowIdx]);
      const close = Number(cols[closeIdx]);
      const volume = volumeIdx >= 0 ? Number(cols[volumeIdx]) : 0;
      if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
        continue;
      }
      candles.push({
        time,
        open,
        high: Math.max(high, open, close),
        low: Math.min(low, open, close),
        close,
        volume: Number.isFinite(volume) ? volume : 0
      });
    } catch {
      continue;
    }
  }
  return normalizeCandles(candles);
}
function mergeCandles(...arrays) {
  return normalizeCandles(arrays.flat());
}
function candleStats(candles) {
  if (!candles?.length) return null;
  const normalized = normalizeCandles(candles);
  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  const gaps = [];
  let minLow = Infinity;
  let maxHigh = -Infinity;
  for (const candle of normalized) {
    if (candle.low < minLow) minLow = candle.low;
    if (candle.high > maxHigh) maxHigh = candle.high;
  }
  for (let index = 1; index < Math.min(normalized.length, 500); index += 1) {
    const delta = normalized[index].time - normalized[index - 1].time;
    if (delta > 0) gaps.push(delta);
  }
  gaps.sort((left, right) => left - right);
  const medianGapMs = gaps[Math.floor(gaps.length / 2)] || 0;
  return {
    count: normalized.length,
    firstTime: new Date(first.time).toISOString(),
    lastTime: new Date(last.time).toISOString(),
    durationDays: (last.time - first.time) / (1e3 * 60 * 60 * 24),
    estimatedIntervalMin: Math.round(medianGapMs / 6e4),
    priceRange: {
      low: minLow,
      high: maxHigh
    }
  };
}
function saveCandlesToCache(candles, { symbol = "UNKNOWN", interval = "tf", period = "range", outDir = "output/data", source } = {}) {
  const outputPath = import_path.default.join(
    outDir,
    `candles-${safeSegment(symbol)}-${safeSegment(interval)}-${safeSegment(period)}.json`
  );
  const normalized = normalizeCandles(candles);
  import_fs.default.mkdirSync(outDir, { recursive: true });
  import_fs.default.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        symbol,
        interval,
        period,
        source: source ?? null,
        count: normalized.length,
        asOf: (/* @__PURE__ */ new Date()).toISOString(),
        candles: normalized
      },
      null,
      2
    ),
    "utf8"
  );
  return outputPath;
}
function cachedCandlesPath(symbol, interval, period, outDir = "output/data") {
  const fileName = `candles-${safeSegment(symbol)}-${safeSegment(interval)}-${safeSegment(period)}.json`;
  return import_path.default.join(outDir, fileName);
}
function loadCandlesFromCache(symbol, interval, period, outDir = "output/data") {
  const filePath = cachedCandlesPath(symbol, interval, period, outDir);
  if (!import_fs.default.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(import_fs.default.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed?.candles) ? normalizeCandles(parsed.candles) : null;
  } catch {
    return null;
  }
}

// src/utils/time.js
function usDstBoundsUTC(year) {
  let marchCursor = new Date(Date.UTC(year, 2, 1, 7, 0, 0));
  let sundaysSeen = 0;
  while (marchCursor.getUTCMonth() === 2) {
    if (marchCursor.getUTCDay() === 0) sundaysSeen += 1;
    if (sundaysSeen === 2) break;
    marchCursor = new Date(marchCursor.getTime() + 24 * 60 * 60 * 1e3);
  }
  const dstStart = new Date(
    Date.UTC(year, 2, marchCursor.getUTCDate(), 7, 0, 0)
  );
  let novemberCursor = new Date(Date.UTC(year, 10, 1, 6, 0, 0));
  while (novemberCursor.getUTCDay() !== 0) {
    novemberCursor = new Date(
      novemberCursor.getTime() + 24 * 60 * 60 * 1e3
    );
  }
  const dstEnd = new Date(
    Date.UTC(year, 10, novemberCursor.getUTCDate(), 6, 0, 0)
  );
  return { dstStart, dstEnd };
}
function isUsEasternDST(timeMs) {
  const date = new Date(timeMs);
  const { dstStart, dstEnd } = usDstBoundsUTC(date.getUTCFullYear());
  return date >= dstStart && date < dstEnd;
}
function offsetET(timeMs) {
  return isUsEasternDST(timeMs) ? 4 : 5;
}
function minutesET(timeMs) {
  const date = new Date(timeMs);
  const offset = offsetET(timeMs);
  return (date.getUTCHours() - offset + 24) % 24 * 60 + date.getUTCMinutes();
}
function isSession(timeMs, session = "NYSE") {
  const day = new Date(timeMs).getUTCDay();
  if (day === 0 || day === 6) {
    if (session === "FUT") {
      const minutes2 = minutesET(timeMs);
      return minutes2 >= 18 * 60 || minutes2 < 17 * 60;
    }
    return false;
  }
  const minutes = minutesET(timeMs);
  if (session === "AUTO") return true;
  if (session === "FUT") {
    const maintenanceStart = 17 * 60;
    const maintenanceEnd = 18 * 60;
    return !(minutes >= maintenanceStart && minutes < maintenanceEnd);
  }
  const open = 9 * 60 + 30;
  const close = 16 * 60;
  return minutes >= open && minutes <= close;
}
function parseWindowsCSV(csv) {
  if (!csv) return null;
  return csv.split(",").map((token) => token.trim()).filter(Boolean).map((windowText) => {
    const [start, end] = windowText.split("-").map((value) => value.trim());
    const [startHour, startMinute] = start.split(":").map(Number);
    const [endHour, endMinute] = end.split(":").map(Number);
    return {
      aMin: startHour * 60 + startMinute,
      bMin: endHour * 60 + endMinute
    };
  });
}
function inWindowsET(timeMs, windows) {
  if (!windows?.length) return true;
  const minutes = minutesET(timeMs);
  return windows.some((window) => minutes >= window.aMin && minutes <= window.bMin);
}

// src/engine/execution.js
function resolveSlippageBps(kind, slippageBps, slippageByKind) {
  if (Number.isFinite(slippageByKind?.[kind])) {
    return slippageByKind[kind];
  }
  let effectiveSlippageBps = slippageBps;
  if (kind === "limit") effectiveSlippageBps *= 0.25;
  if (kind === "stop") effectiveSlippageBps *= 1.25;
  return effectiveSlippageBps;
}
function applyFill(price, side, { slippageBps = 0, feeBps = 0, kind = "market", qty = 0, costs = {} } = {}) {
  const model = costs || {};
  const modelSlippageBps = Number.isFinite(model.slippageBps) ? model.slippageBps : slippageBps;
  const modelFeeBps = Number.isFinite(model.commissionBps) ? model.commissionBps : feeBps;
  const effectiveSlippageBps = resolveSlippageBps(
    kind,
    modelSlippageBps,
    model.slippageByKind
  );
  const halfSpreadBps = Number.isFinite(model.spreadBps) ? model.spreadBps / 2 : 0;
  const slippage = (effectiveSlippageBps + halfSpreadBps) / 1e4 * price;
  const filledPrice = side === "long" ? price + slippage : price - slippage;
  const variableFeePerUnit = (modelFeeBps || 0) / 1e4 * Math.abs(filledPrice) + (Number.isFinite(model.commissionPerUnit) ? model.commissionPerUnit : 0);
  const variableFeeTotal = variableFeePerUnit * Math.max(0, qty);
  const fixedFeeTotal = Number.isFinite(model.commissionPerOrder) ? model.commissionPerOrder : 0;
  const grossFeeTotal = variableFeeTotal + fixedFeeTotal;
  const feeTotal = Math.max(
    Number.isFinite(model.minCommission) ? model.minCommission : 0,
    grossFeeTotal
  );
  const feePerUnit = qty > 0 ? feeTotal / qty : variableFeePerUnit;
  return { price: filledPrice, fee: feePerUnit, feeTotal };
}
function clampStop(marketPrice, proposedStop, side, oco) {
  const epsilon = (oco?.clampEpsBps ?? 0.25) / 1e4;
  const epsilonAbs = marketPrice * epsilon;
  return side === "long" ? Math.min(proposedStop, marketPrice - epsilonAbs) : Math.max(proposedStop, marketPrice + epsilonAbs);
}
function touchedLimit(side, limitPrice, bar, mode = "intrabar") {
  if (!bar || limitPrice === void 0 || limitPrice === null) return false;
  if (mode === "close") {
    return side === "long" ? bar.close <= limitPrice : bar.close >= limitPrice;
  }
  return side === "long" ? bar.low <= limitPrice : bar.high >= limitPrice;
}
function ocoExitCheck({
  side,
  stop,
  tp,
  bar,
  mode = "intrabar",
  tieBreak = "pessimistic"
}) {
  if (mode === "close") {
    const close = bar.close;
    if (side === "long") {
      if (close <= stop) return { hit: "SL", px: stop };
      if (close >= tp) return { hit: "TP", px: tp };
    } else {
      if (close >= stop) return { hit: "SL", px: stop };
      if (close <= tp) return { hit: "TP", px: tp };
    }
    return { hit: null, px: null };
  }
  const hitStop = side === "long" ? bar.low <= stop : bar.high >= stop;
  const hitTarget = side === "long" ? bar.high >= tp : bar.low <= tp;
  if (hitStop && hitTarget) {
    return tieBreak === "optimistic" ? { hit: "TP", px: tp } : { hit: "SL", px: stop };
  }
  if (hitStop) return { hit: "SL", px: stop };
  if (hitTarget) return { hit: "TP", px: tp };
  return { hit: null, px: null };
}
function isEODBar(timeMs) {
  return minutesET(timeMs) >= 16 * 60;
}
function roundStep2(value, step = 1e-3) {
  return Math.floor(value / step) * step;
}
function estimateBarMs(candles) {
  if (candles.length >= 2) {
    const deltas = [];
    for (let index = 1; index < Math.min(candles.length, 500); index += 1) {
      const delta = candles[index].time - candles[index - 1].time;
      if (Number.isFinite(delta) && delta > 0) deltas.push(delta);
    }
    if (deltas.length) {
      deltas.sort((a, b) => a - b);
      const middle = Math.floor(deltas.length / 2);
      const median = deltas.length % 2 ? deltas[middle] : (deltas[middle - 1] + deltas[middle]) / 2;
      return Math.max(6e4, Math.min(median, 60 * 6e4));
    }
  }
  return 5 * 60 * 1e3;
}
function dayKeyUTC2(timeMs) {
  const date = new Date(timeMs);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}
function dayKeyET(timeMs) {
  const date = new Date(timeMs);
  const minutes = minutesET(timeMs);
  const hoursET = Math.floor(minutes / 60);
  const minutesETDay = minutes % 60;
  const anchor = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0)
  );
  const pseudoEtTime = anchor.getTime() + hoursET * 60 * 60 * 1e3 + minutesETDay * 60 * 1e3;
  return dayKeyUTC2(pseudoEtTime);
}

// src/engine/backtest.js
function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
function equityPoint(time, equity) {
  return { time, timestamp: time, equity };
}
function isArrayIndexKey(property) {
  if (typeof property !== "string") return false;
  const numeric = Number(property);
  return Number.isInteger(numeric) && numeric >= 0;
}
function strictHistoryView(candles, currentIndex) {
  return new Proxy(candles, {
    get(target, property, receiver) {
      if (isArrayIndexKey(property) && Number(property) >= target.length) {
        throw new Error(
          `strict mode: signal() tried to access candles[${property}] beyond current index ${currentIndex}`
        );
      }
      return Reflect.get(target, property, receiver);
    }
  });
}
function mergeOptions(options) {
  const normalizedRiskPct = Number.isFinite(options.riskFraction) ? options.riskFraction * 100 : options.riskPct;
  return {
    candles: normalizeCandles(options.candles ?? []),
    symbol: options.symbol ?? "UNKNOWN",
    equity: options.equity ?? 1e4,
    riskPct: normalizedRiskPct ?? 1,
    signal: options.signal,
    interval: options.interval,
    range: options.range,
    warmupBars: options.warmupBars ?? 200,
    slippageBps: options.slippageBps ?? 1,
    feeBps: options.feeBps ?? 0,
    costs: options.costs ?? null,
    scaleOutAtR: options.scaleOutAtR ?? 1,
    scaleOutFrac: options.scaleOutFrac ?? 0.5,
    finalTP_R: options.finalTP_R ?? 3,
    maxDailyLossPct: options.maxDailyLossPct ?? 2,
    atrTrailMult: options.atrTrailMult ?? 0,
    atrTrailPeriod: options.atrTrailPeriod ?? 14,
    oco: {
      mode: "intrabar",
      tieBreak: "pessimistic",
      clampStops: true,
      clampEpsBps: 0.25,
      ...options.oco || {}
    },
    triggerMode: options.triggerMode,
    flattenAtClose: options.flattenAtClose ?? true,
    dailyMaxTrades: options.dailyMaxTrades ?? 0,
    postLossCooldownBars: options.postLossCooldownBars ?? 0,
    mfeTrail: {
      enabled: false,
      armR: 1,
      givebackR: 0.5,
      ...options.mfeTrail || {}
    },
    pyramiding: {
      enabled: false,
      addAtR: 1,
      addFrac: 0.25,
      maxAdds: 1,
      onlyAfterBreakEven: true,
      ...options.pyramiding || {}
    },
    volScale: {
      enabled: false,
      atrPeriod: options.atrTrailPeriod ?? 14,
      cutIfAtrX: 1.3,
      cutFrac: 0.33,
      noCutAboveR: 1.5,
      ...options.volScale || {}
    },
    qtyStep: options.qtyStep ?? 1e-3,
    minQty: options.minQty ?? 1e-3,
    maxLeverage: options.maxLeverage ?? 2,
    entryChase: {
      enabled: true,
      afterBars: 2,
      maxSlipR: 0.2,
      convertOnExpiry: false,
      ...options.entryChase || {}
    },
    reanchorStopOnFill: options.reanchorStopOnFill ?? true,
    maxSlipROnFill: options.maxSlipROnFill ?? 0.4,
    collectEqSeries: options.collectEqSeries ?? true,
    collectReplay: options.collectReplay ?? true,
    strict: options.strict ?? false
  };
}
function normalizeSide(value) {
  if (value === "long" || value === "buy") return "long";
  if (value === "short" || value === "sell") return "short";
  return null;
}
function normalizeSignal(signal, bar, fallbackR) {
  if (!signal) return null;
  const side = normalizeSide(signal.side ?? signal.direction ?? signal.action);
  if (!side) return null;
  const entry = asNumber(signal.entry ?? signal.limit ?? signal.price) ?? asNumber(bar?.close);
  const stop = asNumber(signal.stop ?? signal.stopLoss ?? signal.sl);
  if (entry === null || stop === null) return null;
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return null;
  let takeProfit = asNumber(signal.takeProfit ?? signal.target ?? signal.tp);
  const rrHint = asNumber(signal._rr ?? signal.rr);
  const targetR = rrHint ?? fallbackR;
  if (takeProfit === null && Number.isFinite(targetR) && targetR > 0) {
    takeProfit = side === "long" ? entry + risk * targetR : entry - risk * targetR;
  }
  if (takeProfit === null) return null;
  return {
    ...signal,
    side,
    entry,
    stop,
    takeProfit,
    qty: asNumber(signal.qty ?? signal.size),
    riskPct: asNumber(signal.riskPct),
    riskFraction: asNumber(signal.riskFraction),
    _rr: rrHint ?? signal._rr,
    _initRisk: asNumber(signal._initRisk) ?? signal._initRisk
  };
}
function backtest(rawOptions) {
  const options = mergeOptions(rawOptions || {});
  const {
    candles,
    symbol,
    equity,
    riskPct,
    signal,
    slippageBps,
    feeBps,
    costs,
    scaleOutAtR,
    scaleOutFrac,
    finalTP_R,
    maxDailyLossPct,
    atrTrailMult,
    atrTrailPeriod,
    oco,
    triggerMode,
    flattenAtClose,
    dailyMaxTrades,
    postLossCooldownBars,
    mfeTrail,
    pyramiding,
    volScale,
    qtyStep,
    minQty,
    maxLeverage,
    entryChase,
    reanchorStopOnFill,
    maxSlipROnFill,
    collectEqSeries,
    collectReplay,
    warmupBars,
    strict
  } = options;
  if (!Array.isArray(candles) || candles.length === 0) {
    throw new Error("backtest() requires a non-empty candles array");
  }
  if (typeof signal !== "function") {
    throw new Error("backtest() requires a signal function");
  }
  const closed = [];
  let currentEquity = equity;
  let open = null;
  let cooldown = 0;
  let pending = null;
  let currentDay = null;
  let dayPnl = 0;
  let dayTrades = 0;
  let dayEquityStart = equity;
  const wantReplay = Boolean(collectReplay);
  const wantEqSeries = Boolean(collectEqSeries);
  const estimatedBarMs = estimateBarMs(candles);
  const atrSourcePeriod = volScale.enabled ? volScale.atrPeriod : atrTrailPeriod;
  const needAtr = atrTrailMult > 0 || volScale.enabled;
  const atrValues = needAtr ? atr(candles, atrSourcePeriod) : null;
  const eqSeries = wantEqSeries ? [equityPoint(candles[0].time, currentEquity)] : [];
  const replayFrames = wantReplay ? [] : [];
  const replayEvents = wantReplay ? [] : [];
  let tradeIdCounter = 0;
  const useVolScale = Boolean(volScale.enabled);
  const useAtrTrail = atrTrailMult > 0;
  const useMfeTrail = Boolean(mfeTrail.enabled);
  const usePyramiding = Boolean(pyramiding.enabled);
  const trigger = triggerMode || oco.mode || "intrabar";
  function recordFrame(bar) {
    if (wantEqSeries) {
      eqSeries.push(equityPoint(bar.time, currentEquity));
    }
    if (wantReplay) {
      replayFrames.push({
        t: new Date(bar.time).toISOString(),
        price: bar.close,
        equity: currentEquity,
        posSide: open ? open.side : null,
        posSize: open ? open.size : 0
      });
    }
  }
  function closeLeg({ openPos, qty, exitPx, exitFeeTotal = 0, time, reason }) {
    const direction = openPos.side === "long" ? 1 : -1;
    const entryFill = openPos.entryFill;
    const grossPnl = (exitPx - entryFill) * direction * qty;
    const entryFeePortion = (openPos.entryFeeTotal || 0) * (qty / openPos.initSize);
    const pnl = grossPnl - entryFeePortion - exitFeeTotal;
    currentEquity += pnl;
    dayPnl += pnl;
    if (wantEqSeries) {
      eqSeries.push(equityPoint(time, currentEquity));
    }
    const remaining = openPos.size - qty;
    const eventType = reason === "SCALE" ? "scale-out" : reason === "TP" ? "tp" : reason === "SL" ? "sl" : reason === "EOD" ? "eod" : remaining <= 0 ? "exit" : "scale-out";
    if (wantReplay) {
      replayEvents.push({
        t: new Date(time).toISOString(),
        price: exitPx,
        type: eventType,
        side: openPos.side,
        size: qty,
        tradeId: openPos.id,
        reason,
        pnl
      });
    }
    const record = {
      ...openPos,
      size: qty,
      exit: {
        price: exitPx,
        time,
        reason,
        pnl,
        exitATR: openPos._lastATR ?? void 0
      },
      mfeR: openPos._mfeR ?? 0,
      maeR: openPos._maeR ?? 0,
      adds: openPos._adds ?? 0
    };
    closed.push(record);
    openPos.size -= qty;
    openPos._realized = (openPos._realized || 0) + pnl;
    return record;
  }
  function tightenStopToNetBreakeven(openPos, lastClose) {
    if (!openPos || openPos.size <= 0) return;
    const realized = openPos._realized || 0;
    if (realized <= 0) return;
    const direction = openPos.side === "long" ? 1 : -1;
    const breakevenDelta = Math.abs(realized / openPos.size);
    const breakevenPrice = direction === 1 ? openPos.entryFill - breakevenDelta : openPos.entryFill + breakevenDelta;
    const tightened = direction === 1 ? Math.max(openPos.stop, breakevenPrice) : Math.min(openPos.stop, breakevenPrice);
    openPos.stop = oco.clampStops ? clampStop(lastClose, tightened, openPos.side, oco) : tightened;
  }
  function forceExit(reason, bar) {
    if (!open) return;
    const exitSide = open.side === "long" ? "short" : "long";
    const { price: filled, feeTotal: exitFeeTotal } = applyFill(bar.close, exitSide, {
      slippageBps,
      feeBps,
      kind: "market",
      qty: open.size,
      costs
    });
    closeLeg({
      openPos: open,
      qty: open.size,
      exitPx: filled,
      exitFeeTotal,
      time: bar.time,
      reason
    });
    cooldown = open._cooldownBars || 0;
    open = null;
  }
  function openFromPending(bar, index, entryPrice, fillKind = "limit") {
    if (!pending) return false;
    const plannedRisk = Math.max(
      1e-8,
      pending.plannedRiskAbs ?? Math.abs(pending.entry - pending.stop)
    );
    const slipR = Math.abs(entryPrice - pending.entry) / plannedRisk;
    if (slipR > maxSlipROnFill) return false;
    let stopPrice = pending.stop;
    if (reanchorStopOnFill) {
      const direction = pending.side === "long" ? 1 : -1;
      stopPrice = direction === 1 ? entryPrice - plannedRisk : entryPrice + plannedRisk;
    }
    let takeProfit = pending.tp;
    const immediateRisk = Math.abs(entryPrice - stopPrice) || 1e-8;
    const rrHint = pending.meta?._rr;
    if (reanchorStopOnFill && Number.isFinite(rrHint)) {
      const plannedTarget = pending.side === "long" ? pending.entry + rrHint * plannedRisk : pending.entry - rrHint * plannedRisk;
      const closeEnough = Math.abs((pending.tp ?? plannedTarget) - plannedTarget) <= Math.max(1e-8, plannedRisk * 1e-6);
      if (closeEnough) {
        takeProfit = pending.side === "long" ? entryPrice + rrHint * immediateRisk : entryPrice - rrHint * immediateRisk;
      }
    }
    const rawSize = pending.fixedQty ?? calculatePositionSize({
      equity: currentEquity,
      entry: entryPrice,
      stop: stopPrice,
      riskFraction: pending.riskFrac,
      qtyStep,
      minQty,
      maxLeverage
    });
    const size = roundStep2(rawSize, qtyStep);
    if (size < minQty) return false;
    const { price: entryFill, feeTotal: entryFeeTotal } = applyFill(
      entryPrice,
      pending.side,
      {
        slippageBps,
        feeBps,
        kind: fillKind,
        qty: size,
        costs
      }
    );
    open = {
      symbol,
      ...pending.meta,
      id: ++tradeIdCounter,
      side: pending.side,
      entry: entryPrice,
      stop: stopPrice,
      takeProfit,
      size,
      openTime: bar.time,
      entryFill,
      entryFeeTotal,
      initSize: size,
      baseSize: size,
      _mfeR: 0,
      _maeR: 0,
      _adds: 0,
      _initRisk: Math.abs(entryPrice - stopPrice) || 1e-8
    };
    if (atrValues && atrValues[index] !== void 0) {
      open.entryATR = atrValues[index];
      open._lastATR = atrValues[index];
    }
    dayTrades += 1;
    pending = null;
    if (wantReplay) {
      replayEvents.push({
        t: new Date(bar.time).toISOString(),
        price: entryFill,
        type: "entry",
        side: open.side,
        size,
        tradeId: open.id
      });
    }
    return true;
  }
  const startIndex = Math.min(Math.max(1, warmupBars), candles.length);
  const history = candles.slice(0, startIndex);
  for (let index = startIndex; index < candles.length; index += 1) {
    const bar = candles[index];
    history.push(bar);
    const dayKey = flattenAtClose || trigger === "close" ? dayKeyET(bar.time) : dayKeyUTC2(bar.time);
    if (currentDay === null || dayKey !== currentDay) {
      currentDay = dayKey;
      dayPnl = 0;
      dayTrades = 0;
      dayEquityStart = currentEquity;
    }
    if (open && open._maxBarsInTrade > 0) {
      const barsHeld = Math.max(
        1,
        Math.round((bar.time - open.openTime) / estimatedBarMs)
      );
      if (barsHeld >= open._maxBarsInTrade) {
        forceExit("TIME", bar);
      }
    }
    if (open && Number.isFinite(open._maxHoldMin) && open._maxHoldMin > 0) {
      const heldMinutes = (bar.time - open.openTime) / 6e4;
      if (heldMinutes >= open._maxHoldMin) {
        forceExit("TIME", bar);
      }
    }
    if (flattenAtClose && open && isEODBar(bar.time)) {
      forceExit("EOD", bar);
    }
    if (open) {
      const direction = open.side === "long" ? 1 : -1;
      const risk = open._initRisk || 1e-8;
      const highR = open.side === "long" ? (bar.high - open.entry) / risk : (open.entry - bar.low) / risk;
      const lowR = open.side === "long" ? (bar.low - open.entry) / risk : (open.entry - bar.high) / risk;
      const markR = direction === 1 ? (bar.close - open.entry) / risk : (open.entry - bar.close) / risk;
      if (atrValues && atrValues[index] !== void 0) {
        open._lastATR = atrValues[index];
      }
      open._mfeR = Math.max(open._mfeR ?? -Infinity, highR);
      open._maeR = Math.min(open._maeR ?? Infinity, lowR);
      if (open._breakevenAtR > 0 && highR >= open._breakevenAtR && !open._beArmed) {
        const tightened = open.side === "long" ? Math.max(open.stop, open.entry) : Math.min(open.stop, open.entry);
        open.stop = oco.clampStops ? clampStop(bar.close, tightened, open.side, oco) : tightened;
        open._beArmed = true;
      }
      if (open._trailAfterR > 0 && highR >= open._trailAfterR) {
        const candidate = open.side === "long" ? bar.close - risk : bar.close + risk;
        const tightened = open.side === "long" ? Math.max(open.stop, candidate) : Math.min(open.stop, candidate);
        open.stop = oco.clampStops ? clampStop(bar.close, tightened, open.side, oco) : tightened;
      }
      if (useMfeTrail && open._mfeR >= mfeTrail.armR) {
        const targetR = Math.max(0, open._mfeR - Math.max(0, mfeTrail.givebackR));
        const candidate = open.side === "long" ? open.entry + targetR * risk : open.entry - targetR * risk;
        const tightened = open.side === "long" ? Math.max(open.stop, candidate) : Math.min(open.stop, candidate);
        open.stop = oco.clampStops ? clampStop(bar.close, tightened, open.side, oco) : tightened;
      }
      if (useAtrTrail && atrValues && atrValues[index] !== void 0) {
        const trailDistance = atrValues[index] * atrTrailMult;
        const candidate = open.side === "long" ? bar.close - trailDistance : bar.close + trailDistance;
        const tightened = open.side === "long" ? Math.max(open.stop, candidate) : Math.min(open.stop, candidate);
        open.stop = oco.clampStops ? clampStop(bar.close, tightened, open.side, oco) : tightened;
      }
      if (useVolScale && open.entryATR && open.size > minQty && atrValues && atrValues[index] !== void 0) {
        const ratio = atrValues[index] / Math.max(1e-12, open.entryATR);
        const shouldCut = ratio >= volScale.cutIfAtrX && markR < volScale.noCutAboveR && !open._volCutDone;
        if (shouldCut) {
          const cutQty = roundStep2(open.size * volScale.cutFrac, qtyStep);
          if (cutQty >= minQty && cutQty < open.size) {
            const exitSide2 = open.side === "long" ? "short" : "long";
            const { price: filled, feeTotal: exitFeeTotal } = applyFill(
              bar.close,
              exitSide2,
              { slippageBps, feeBps, kind: "market", qty: cutQty, costs }
            );
            closeLeg({
              openPos: open,
              qty: cutQty,
              exitPx: filled,
              exitFeeTotal,
              time: bar.time,
              reason: "SCALE"
            });
            tightenStopToNetBreakeven(open, bar.close);
            open._volCutDone = true;
          }
        }
      }
      let addedThisBar = false;
      if (usePyramiding && (open._adds ?? 0) < pyramiding.maxAdds) {
        const addNumber = (open._adds || 0) + 1;
        const triggerR = pyramiding.addAtR * addNumber;
        const triggerPrice = open.side === "long" ? open.entry + triggerR * risk : open.entry - triggerR * risk;
        const breakEvenSatisfied = !pyramiding.onlyAfterBreakEven || open.side === "long" && open.stop >= open.entry || open.side === "short" && open.stop <= open.entry;
        const touched = open.side === "long" ? trigger === "intrabar" ? bar.high >= triggerPrice : bar.close >= triggerPrice : trigger === "intrabar" ? bar.low <= triggerPrice : bar.close <= triggerPrice;
        if (breakEvenSatisfied && touched) {
          const baseSize = open.baseSize || open.initSize;
          const addQty = roundStep2(baseSize * pyramiding.addFrac, qtyStep);
          if (addQty >= minQty) {
            const { price: addFill, feeTotal: addFeeTotal } = applyFill(
              triggerPrice,
              open.side,
              { slippageBps, feeBps, kind: "limit", qty: addQty, costs }
            );
            const newSize = open.size + addQty;
            open.entryFeeTotal += addFeeTotal;
            open.entryFill = (open.entryFill * open.size + addFill * addQty) / newSize;
            open.size = newSize;
            open.initSize += addQty;
            if (!open.baseSize) open.baseSize = baseSize;
            open._adds = addNumber;
            addedThisBar = true;
          }
        }
      }
      if (!addedThisBar && !open._scaled && scaleOutAtR > 0) {
        const triggerPrice = open.side === "long" ? open.entry + scaleOutAtR * risk : open.entry - scaleOutAtR * risk;
        const touched = open.side === "long" ? trigger === "intrabar" ? bar.high >= triggerPrice : bar.close >= triggerPrice : trigger === "intrabar" ? bar.low <= triggerPrice : bar.close <= triggerPrice;
        if (touched) {
          const exitSide2 = open.side === "long" ? "short" : "long";
          const qty = roundStep2(open.size * scaleOutFrac, qtyStep);
          if (qty >= minQty && qty < open.size) {
            const { price: filled, feeTotal: exitFeeTotal } = applyFill(triggerPrice, exitSide2, {
              slippageBps,
              feeBps,
              kind: "limit",
              qty,
              costs
            });
            closeLeg({
              openPos: open,
              qty,
              exitPx: filled,
              exitFeeTotal,
              time: bar.time,
              reason: "SCALE"
            });
            open._scaled = true;
            open.takeProfit = open.side === "long" ? open.entry + finalTP_R * risk : open.entry - finalTP_R * risk;
            tightenStopToNetBreakeven(open, bar.close);
            open._beArmed = true;
          }
        }
      }
      const exitSide = open.side === "long" ? "short" : "long";
      const { hit, px } = ocoExitCheck({
        side: open.side,
        stop: open.stop,
        tp: open.takeProfit,
        bar,
        mode: oco.mode,
        tieBreak: oco.tieBreak
      });
      if (hit) {
        const exitKind = hit === "TP" ? "limit" : "stop";
        const { price: filled, feeTotal: exitFeeTotal } = applyFill(px, exitSide, {
          slippageBps,
          feeBps,
          kind: exitKind,
          qty: open.size,
          costs
        });
        const localCooldown = open._cooldownBars || 0;
        closeLeg({
          openPos: open,
          qty: open.size,
          exitPx: filled,
          exitFeeTotal,
          time: bar.time,
          reason: hit
        });
        cooldown = (hit === "SL" ? Math.max(cooldown, postLossCooldownBars) : cooldown) || localCooldown;
        open = null;
      }
    }
    const maxLossDollars = maxDailyLossPct / 100 * dayEquityStart;
    const dailyLossHit = dayPnl <= -Math.abs(maxLossDollars);
    const dailyTradeCapHit = dailyMaxTrades > 0 && dayTrades >= dailyMaxTrades;
    if (!open && pending) {
      if (index > pending.expiresAt || dailyLossHit || dailyTradeCapHit) {
        if (entryChase.enabled && entryChase.convertOnExpiry) {
          const riskAtEdge = Math.abs(
            pending.meta._initRisk ?? pending.entry - pending.stop
          );
          const priceNow = bar.close;
          const direction = pending.side === "long" ? 1 : -1;
          const slippedR = Math.max(
            0,
            direction === 1 ? priceNow - pending.entry : pending.entry - priceNow
          ) / Math.max(1e-8, riskAtEdge);
          if (slippedR > maxSlipROnFill) {
            pending = null;
          } else if (!openFromPending(bar, index, priceNow, "market")) {
            pending = null;
          }
        } else {
          pending = null;
        }
      } else if (touchedLimit(pending.side, pending.entry, bar, trigger)) {
        if (!openFromPending(bar, index, pending.entry, "limit")) {
          pending = null;
        }
      } else if (entryChase.enabled) {
        const elapsedBars = index - (pending.startedAtIndex ?? index);
        const midpoint = pending.meta?._imb?.mid;
        if (!pending._chasedCE && midpoint !== void 0 && elapsedBars >= Math.max(1, entryChase.afterBars)) {
          pending.entry = midpoint;
          pending._chasedCE = true;
        }
        if (pending._chasedCE) {
          const riskRef = Math.abs(
            pending.meta?._initRisk ?? pending.entry - pending.stop
          );
          const priceNow = bar.close;
          const direction = pending.side === "long" ? 1 : -1;
          const slippedR = Math.max(
            0,
            direction === 1 ? priceNow - pending.entry : pending.entry - priceNow
          ) / Math.max(1e-8, riskRef);
          if (slippedR > maxSlipROnFill) {
            pending = null;
          } else if (slippedR > 0 && slippedR <= entryChase.maxSlipR) {
            if (!openFromPending(bar, index, priceNow, "market")) {
              pending = null;
            }
          }
        }
      }
    }
    if (open || cooldown > 0) {
      if (cooldown > 0) cooldown -= 1;
      recordFrame(bar);
      continue;
    }
    if (dailyLossHit || dailyTradeCapHit) {
      pending = null;
      recordFrame(bar);
      continue;
    }
    if (!pending) {
      if (strict && history.length !== index + 1) {
        throw new Error(
          `strict mode: signal() received ${history.length} candles at index ${index}`
        );
      }
      const signalCandles = strict ? strictHistoryView(history, index) : history;
      const rawSignal = signal({
        candles: signalCandles,
        index,
        bar,
        equity: currentEquity,
        openPosition: open,
        pendingOrder: pending
      });
      const nextSignal = normalizeSignal(rawSignal, bar, finalTP_R);
      if (nextSignal) {
        const signalRiskFraction = Number.isFinite(nextSignal.riskFraction) ? nextSignal.riskFraction : Number.isFinite(nextSignal.riskPct) ? nextSignal.riskPct / 100 : riskPct / 100;
        const expiryBars = nextSignal._entryExpiryBars ?? 5;
        pending = {
          side: nextSignal.side,
          entry: nextSignal.entry,
          stop: nextSignal.stop,
          tp: nextSignal.takeProfit,
          riskFrac: signalRiskFraction,
          fixedQty: nextSignal.qty,
          expiresAt: index + Math.max(1, expiryBars),
          startedAtIndex: index,
          meta: nextSignal,
          plannedRiskAbs: Math.abs(
            nextSignal._initRisk ?? nextSignal.entry - nextSignal.stop
          )
        };
        if (touchedLimit(pending.side, pending.entry, bar, trigger)) {
          if (!openFromPending(bar, index, pending.entry, "limit")) {
            pending = null;
          }
        }
      }
    }
    recordFrame(bar);
  }
  const metrics = buildMetrics({
    closed,
    equityStart: equity,
    equityFinal: currentEquity,
    candles,
    estBarMs: estimatedBarMs,
    eqSeries
  });
  const positions = closed.filter((trade) => trade.exit.reason !== "SCALE");
  return {
    symbol: options.symbol,
    interval: options.interval,
    range: options.range,
    trades: closed,
    positions,
    metrics,
    eqSeries,
    replay: {
      frames: replayFrames,
      events: replayEvents
    }
  };
}

// src/engine/backtestTicks.js
function asNumber2(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
function normalizeSide2(value) {
  if (value === "long" || value === "buy") return "long";
  if (value === "short" || value === "sell") return "short";
  return null;
}
function normalizeTick(tick) {
  const time = Number(tick?.time);
  const bid = asNumber2(tick?.bid);
  const ask = asNumber2(tick?.ask);
  const last = asNumber2(tick?.price ?? tick?.last ?? tick?.close);
  const mid = bid !== null && ask !== null ? (bid + ask) / 2 : last ?? bid ?? ask;
  if (!Number.isFinite(time) || !Number.isFinite(mid)) return null;
  const prices = [asNumber2(tick?.low), asNumber2(tick?.high), bid, ask, last, mid].filter(
    Number.isFinite
  );
  const low = prices.length ? Math.min(...prices) : mid;
  const high = prices.length ? Math.max(...prices) : mid;
  return {
    ...tick,
    time,
    open: mid,
    high,
    low,
    close: mid,
    volume: asNumber2(tick?.size ?? tick?.volume) ?? void 0
  };
}
function normalizeSignal2(signal, bar, fallbackR) {
  if (!signal) return null;
  const side = normalizeSide2(signal.side ?? signal.direction ?? signal.action);
  if (!side) return null;
  const hasExplicitEntry = signal.entry !== void 0 || signal.limit !== void 0 || signal.price !== void 0;
  const entry = asNumber2(signal.entry ?? signal.limit ?? signal.price) ?? asNumber2(bar?.close);
  const stop = asNumber2(signal.stop ?? signal.stopLoss ?? signal.sl);
  if (entry === null || stop === null) return null;
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return null;
  let takeProfit = asNumber2(signal.takeProfit ?? signal.target ?? signal.tp);
  const rrHint = asNumber2(signal._rr ?? signal.rr);
  const targetR = rrHint ?? fallbackR;
  if (takeProfit === null && Number.isFinite(targetR) && targetR > 0) {
    takeProfit = side === "long" ? entry + risk * targetR : entry - risk * targetR;
  }
  if (takeProfit === null) return null;
  return {
    ...signal,
    side,
    entry,
    stop,
    takeProfit,
    qty: asNumber2(signal.qty ?? signal.size),
    riskPct: asNumber2(signal.riskPct),
    riskFraction: asNumber2(signal.riskFraction),
    orderType: hasExplicitEntry ? "limit" : "market"
  };
}
function equityPoint2(time, equity) {
  return { time, timestamp: time, equity };
}
function deterministicFill(probability, seedParts) {
  if (probability >= 1) return true;
  if (probability <= 0) return false;
  let hash = 2166136261;
  const seed = seedParts.join("|");
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = (hash >>> 0) / 4294967295;
  return normalized <= probability;
}
function backtestTicks({
  ticks = [],
  symbol = "UNKNOWN",
  equity = 1e4,
  riskPct = 1,
  signal,
  interval,
  range,
  slippageBps = 1,
  feeBps = 0,
  costs = null,
  finalTP_R = 3,
  maxDailyLossPct = 0,
  dailyMaxTrades = 0,
  qtyStep = 1e-3,
  minQty = 1e-3,
  maxLeverage = 2,
  collectEqSeries = true,
  collectReplay = true,
  queueFillProbability = 1,
  oco = {}
} = {}) {
  if (!Array.isArray(ticks) || ticks.length === 0) {
    throw new Error("backtestTicks() requires a non-empty ticks array");
  }
  if (typeof signal !== "function") {
    throw new Error("backtestTicks() requires a signal function");
  }
  const normalizedTicks = ticks.map(normalizeTick).filter(Boolean);
  if (!normalizedTicks.length) {
    throw new Error("backtestTicks() could not normalize any ticks");
  }
  const ocoOptions = {
    mode: "intrabar",
    tieBreak: "pessimistic",
    ...oco
  };
  const trades = [];
  const eqSeries = collectEqSeries ? [equityPoint2(normalizedTicks[0].time, equity)] : [];
  const replayFrames = collectReplay ? [] : [];
  const replayEvents = collectReplay ? [] : [];
  const history = [];
  let open = null;
  let pending = null;
  let currentEquity = equity;
  let dayKey = null;
  let dayStartEquity = equity;
  let dayPnl = 0;
  let dayTrades = 0;
  let tradeIdCounter = 0;
  function markedEquity(tick) {
    if (!open) return currentEquity;
    const direction = open.side === "long" ? 1 : -1;
    return currentEquity + (tick.close - open.entryFill) * direction * open.size;
  }
  function recordFrame(tick) {
    const equityNow = markedEquity(tick);
    if (collectEqSeries) {
      eqSeries.push(equityPoint2(tick.time, equityNow));
    }
    if (collectReplay) {
      replayFrames.push({
        t: new Date(tick.time).toISOString(),
        price: tick.close,
        equity: equityNow,
        posSide: open?.side ?? null,
        posSize: open?.size ?? 0
      });
    }
  }
  function closePosition(tick, reason, rawPrice, fillKind) {
    if (!open) return;
    const exitSide = open.side === "long" ? "short" : "long";
    const { price, feeTotal } = applyFill(rawPrice, exitSide, {
      slippageBps,
      feeBps,
      kind: fillKind,
      qty: open.size,
      costs
    });
    const direction = open.side === "long" ? 1 : -1;
    const grossPnl = (price - open.entryFill) * direction * open.size;
    const pnl = grossPnl - (open.entryFeeTotal || 0) - feeTotal;
    currentEquity += pnl;
    dayPnl += pnl;
    const trade = {
      ...open,
      exit: {
        price,
        time: tick.time,
        reason,
        pnl
      }
    };
    trades.push(trade);
    if (collectReplay) {
      replayEvents.push({
        t: new Date(tick.time).toISOString(),
        price,
        type: reason === "TP" ? "tp" : reason === "SL" ? "sl" : "exit",
        side: open.side,
        size: open.size,
        tradeId: open.id,
        reason,
        pnl
      });
    }
    open = null;
  }
  for (let index = 0; index < normalizedTicks.length; index += 1) {
    const tick = normalizedTicks[index];
    history.push(tick);
    const currentDayKey = dayKeyUTC2(tick.time);
    if (dayKey === null || currentDayKey !== dayKey) {
      dayKey = currentDayKey;
      dayStartEquity = currentEquity;
      dayPnl = 0;
      dayTrades = 0;
    }
    if (open) {
      const { hit, px } = ocoExitCheck({
        side: open.side,
        stop: open.stop,
        tp: open.takeProfit,
        bar: tick,
        mode: "intrabar",
        tieBreak: ocoOptions.tieBreak
      });
      if (hit) {
        closePosition(tick, hit, px, hit === "TP" ? "limit" : "stop");
      }
    }
    if (!open && pending && index > pending.createdAtIndex) {
      if (pending.orderType === "market") {
        const rawSize = pending.fixedQty ?? calculatePositionSize({
          equity: currentEquity,
          entry: tick.close,
          stop: pending.stop,
          riskFraction: pending.riskFrac,
          qtyStep,
          minQty,
          maxLeverage
        });
        const size = roundStep2(rawSize, qtyStep);
        if (size >= minQty) {
          const { price, feeTotal } = applyFill(tick.close, pending.side, {
            slippageBps,
            feeBps,
            kind: "market",
            qty: size,
            costs
          });
          open = {
            symbol,
            id: ++tradeIdCounter,
            side: pending.side,
            entry: tick.close,
            stop: pending.stop,
            takeProfit: pending.takeProfit,
            size,
            openTime: tick.time,
            entryFill: price,
            entryFeeTotal: feeTotal,
            _initRisk: Math.abs(tick.close - pending.stop)
          };
          dayTrades += 1;
          if (collectReplay) {
            replayEvents.push({
              t: new Date(tick.time).toISOString(),
              price,
              type: "entry",
              side: open.side,
              size,
              tradeId: open.id
            });
          }
        }
        pending = null;
      } else {
        const touched = pending.side === "long" ? tick.low <= pending.entry : tick.high >= pending.entry;
        if (touched && deterministicFill(queueFillProbability, [
          symbol,
          tick.time,
          pending.entry,
          pending.stop,
          pending.side
        ])) {
          const rawSize = pending.fixedQty ?? calculatePositionSize({
            equity: currentEquity,
            entry: pending.entry,
            stop: pending.stop,
            riskFraction: pending.riskFrac,
            qtyStep,
            minQty,
            maxLeverage
          });
          const size = roundStep2(rawSize, qtyStep);
          if (size >= minQty) {
            const { price, feeTotal } = applyFill(pending.entry, pending.side, {
              slippageBps,
              feeBps,
              kind: "limit",
              qty: size,
              costs
            });
            open = {
              symbol,
              id: ++tradeIdCounter,
              side: pending.side,
              entry: pending.entry,
              stop: pending.stop,
              takeProfit: pending.takeProfit,
              size,
              openTime: tick.time,
              entryFill: price,
              entryFeeTotal: feeTotal,
              _initRisk: Math.abs(pending.entry - pending.stop)
            };
            dayTrades += 1;
            if (collectReplay) {
              replayEvents.push({
                t: new Date(tick.time).toISOString(),
                price,
                type: "entry",
                side: open.side,
                size,
                tradeId: open.id
              });
            }
          }
          pending = null;
        }
      }
    }
    const maxLossDollars = Math.abs(maxDailyLossPct) / 100 * dayStartEquity;
    const dailyLossHit = maxDailyLossPct > 0 && dayPnl <= -maxLossDollars;
    const dailyTradeCapHit = dailyMaxTrades > 0 && dayTrades >= dailyMaxTrades;
    if (!open && !pending && !dailyLossHit && !dailyTradeCapHit) {
      const nextSignal = normalizeSignal2(
        signal({
          candles: history,
          index,
          bar: tick,
          equity: markedEquity(tick),
          openPosition: open,
          pendingOrder: pending
        }),
        tick,
        finalTP_R
      );
      if (nextSignal) {
        pending = {
          side: nextSignal.side,
          entry: nextSignal.entry,
          stop: nextSignal.stop,
          takeProfit: nextSignal.takeProfit,
          fixedQty: nextSignal.qty,
          riskFrac: Number.isFinite(nextSignal.riskFraction) ? nextSignal.riskFraction : Number.isFinite(nextSignal.riskPct) ? nextSignal.riskPct / 100 : riskPct / 100,
          orderType: nextSignal.orderType,
          createdAtIndex: index
        };
      }
    }
    recordFrame(tick);
  }
  if (open) {
    const lastTick = normalizedTicks[normalizedTicks.length - 1];
    closePosition(lastTick, "EOT", lastTick.close, "market");
    recordFrame(lastTick);
  }
  const positions = trades;
  const metrics = buildMetrics({
    closed: trades,
    equityStart: equity,
    equityFinal: currentEquity,
    candles: normalizedTicks,
    estBarMs: normalizedTicks.length > 1 ? Math.max(1, normalizedTicks[1].time - normalizedTicks[0].time) : 1,
    eqSeries
  });
  return {
    symbol,
    interval,
    range,
    trades,
    positions,
    metrics,
    eqSeries,
    replay: {
      frames: replayFrames,
      events: replayEvents
    }
  };
}

// src/engine/barSystemRunner.js
function asNumber3(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
function equityPoint3(time, equity, extra = {}) {
  return { time, timestamp: time, equity, ...extra };
}
function isArrayIndexKey2(property) {
  if (typeof property !== "string") return false;
  const numeric = Number(property);
  return Number.isInteger(numeric) && numeric >= 0;
}
function strictHistoryView2(candles, currentIndex) {
  return new Proxy(candles, {
    get(target, property, receiver) {
      if (isArrayIndexKey2(property) && Number(property) >= target.length) {
        throw new Error(
          `strict mode: signal() tried to access candles[${property}] beyond current index ${currentIndex}`
        );
      }
      return Reflect.get(target, property, receiver);
    }
  });
}
function normalizeSide3(value) {
  if (value === "long" || value === "buy") return "long";
  if (value === "short" || value === "sell") return "short";
  return null;
}
function normalizeSignal3(signal, bar, fallbackR) {
  if (!signal) return null;
  const side = normalizeSide3(signal.side ?? signal.direction ?? signal.action);
  if (!side) return null;
  const entry = asNumber3(signal.entry ?? signal.limit ?? signal.price) ?? asNumber3(bar?.close);
  const stop = asNumber3(signal.stop ?? signal.stopLoss ?? signal.sl);
  if (entry === null || stop === null) return null;
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return null;
  let takeProfit = asNumber3(signal.takeProfit ?? signal.target ?? signal.tp);
  const rrHint = asNumber3(signal._rr ?? signal.rr);
  const targetR = rrHint ?? fallbackR;
  if (takeProfit === null && Number.isFinite(targetR) && targetR > 0) {
    takeProfit = side === "long" ? entry + risk * targetR : entry - risk * targetR;
  }
  if (takeProfit === null) return null;
  return {
    ...signal,
    side,
    entry,
    stop,
    takeProfit,
    qty: asNumber3(signal.qty ?? signal.size),
    riskPct: asNumber3(signal.riskPct),
    riskFraction: asNumber3(signal.riskFraction),
    _rr: rrHint ?? signal._rr,
    _initRisk: asNumber3(signal._initRisk) ?? signal._initRisk
  };
}
function mergeOptions2(options) {
  const normalizedRiskPct = Number.isFinite(options.riskFraction) ? options.riskFraction * 100 : options.riskPct;
  return {
    candles: normalizeCandles(options.candles ?? []),
    symbol: options.symbol ?? "UNKNOWN",
    equity: options.equity ?? 1e4,
    riskPct: normalizedRiskPct ?? 1,
    signal: options.signal,
    interval: options.interval,
    range: options.range,
    warmupBars: options.warmupBars ?? 200,
    slippageBps: options.slippageBps ?? 1,
    feeBps: options.feeBps ?? 0,
    costs: options.costs ?? null,
    scaleOutAtR: options.scaleOutAtR ?? 1,
    scaleOutFrac: options.scaleOutFrac ?? 0.5,
    finalTP_R: options.finalTP_R ?? 3,
    maxDailyLossPct: options.maxDailyLossPct ?? 2,
    atrTrailMult: options.atrTrailMult ?? 0,
    atrTrailPeriod: options.atrTrailPeriod ?? 14,
    oco: {
      mode: "intrabar",
      tieBreak: "pessimistic",
      clampStops: true,
      clampEpsBps: 0.25,
      ...options.oco || {}
    },
    triggerMode: options.triggerMode,
    flattenAtClose: options.flattenAtClose ?? true,
    dailyMaxTrades: options.dailyMaxTrades ?? 0,
    postLossCooldownBars: options.postLossCooldownBars ?? 0,
    mfeTrail: {
      enabled: false,
      armR: 1,
      givebackR: 0.5,
      ...options.mfeTrail || {}
    },
    pyramiding: {
      enabled: false,
      addAtR: 1,
      addFrac: 0.25,
      maxAdds: 1,
      onlyAfterBreakEven: true,
      ...options.pyramiding || {}
    },
    volScale: {
      enabled: false,
      atrPeriod: options.atrTrailPeriod ?? 14,
      cutIfAtrX: 1.3,
      cutFrac: 0.33,
      noCutAboveR: 1.5,
      ...options.volScale || {}
    },
    qtyStep: options.qtyStep ?? 1e-3,
    minQty: options.minQty ?? 1e-3,
    maxLeverage: options.maxLeverage ?? 2,
    entryChase: {
      enabled: true,
      afterBars: 2,
      maxSlipR: 0.2,
      convertOnExpiry: false,
      ...options.entryChase || {}
    },
    reanchorStopOnFill: options.reanchorStopOnFill ?? true,
    maxSlipROnFill: options.maxSlipROnFill ?? 0.4,
    collectEqSeries: options.collectEqSeries ?? true,
    collectReplay: options.collectReplay ?? true,
    strict: options.strict ?? false
  };
}
function capitalForSize(entryPrice, size, maxLeverage) {
  const leverage = Math.max(1, Number(maxLeverage) || 1);
  return Math.abs(entryPrice) * Math.max(0, size) / leverage;
}
var BarSystemRunner = class {
  constructor(rawOptions = {}) {
    this.options = mergeOptions2(rawOptions);
    const { candles, signal } = this.options;
    if (!Array.isArray(candles) || candles.length === 0) {
      throw new Error("backtestPortfolio() requires each system to include non-empty candles");
    }
    if (typeof signal !== "function") {
      throw new Error("backtestPortfolio() requires each system to include a signal function");
    }
    this.symbol = this.options.symbol;
    this.candles = candles;
    this.closed = [];
    this.currentEquity = this.options.equity;
    this.open = null;
    this.cooldown = 0;
    this.pending = null;
    this.currentDay = null;
    this.dayPnl = 0;
    this.dayTrades = 0;
    this.dayEquityStart = this.options.equity;
    this.tradeIdCounter = 0;
    this.estimatedBarMs = estimateBarMs(candles);
    const atrSourcePeriod = this.options.volScale.enabled ? this.options.volScale.atrPeriod : this.options.atrTrailPeriod;
    const needAtr = this.options.atrTrailMult > 0 || this.options.volScale.enabled;
    this.atrValues = needAtr ? atr(candles, atrSourcePeriod) : null;
    this.wantEqSeries = Boolean(this.options.collectEqSeries);
    this.wantReplay = Boolean(this.options.collectReplay);
    this.eqSeries = this.wantEqSeries ? [equityPoint3(candles[0].time, this.currentEquity)] : [];
    this.replayFrames = this.wantReplay ? [] : [];
    this.replayEvents = this.wantReplay ? [] : [];
    this.startIndex = Math.min(Math.max(1, this.options.warmupBars), candles.length);
    this.history = candles.slice(0, this.startIndex);
    this.index = this.startIndex;
    this.lastBar = this.history.length ? this.history[this.history.length - 1] : null;
  }
  hasNext() {
    return this.index < this.candles.length;
  }
  peekTime() {
    return this.hasNext() ? this.candles[this.index].time : Infinity;
  }
  getLockedCapital() {
    if (!this.open) return 0;
    return capitalForSize(this.open.entryFill ?? this.open.entry, this.open.size, this.options.maxLeverage);
  }
  getMarkPrice() {
    return this.lastBar?.close ?? null;
  }
  getMarkedEquity() {
    if (!this.open || !this.lastBar) return this.currentEquity;
    const direction = this.open.side === "long" ? 1 : -1;
    const markPnl = (this.lastBar.close - (this.open.entryFill ?? this.open.entry)) * direction * this.open.size;
    return this.currentEquity + markPnl;
  }
  recordFrame(bar, extraFrame = {}) {
    if (this.wantEqSeries) {
      this.eqSeries.push(equityPoint3(bar.time, this.currentEquity));
    }
    if (this.wantReplay) {
      this.replayFrames.push({
        t: new Date(bar.time).toISOString(),
        price: bar.close,
        equity: this.currentEquity,
        posSide: this.open ? this.open.side : null,
        posSize: this.open ? this.open.size : 0,
        ...extraFrame
      });
    }
  }
  closeLeg({ openPos, qty, exitPx, exitFeeTotal = 0, time, reason }) {
    const direction = openPos.side === "long" ? 1 : -1;
    const entryFill = openPos.entryFill;
    const grossPnl = (exitPx - entryFill) * direction * qty;
    const entryFeePortion = (openPos.entryFeeTotal || 0) * (qty / openPos.initSize);
    const pnl = grossPnl - entryFeePortion - exitFeeTotal;
    this.currentEquity += pnl;
    this.dayPnl += pnl;
    if (this.wantEqSeries) {
      this.eqSeries.push(equityPoint3(time, this.currentEquity));
    }
    const remaining = openPos.size - qty;
    const eventType = reason === "SCALE" ? "scale-out" : reason === "TP" ? "tp" : reason === "SL" ? "sl" : reason === "EOD" ? "eod" : remaining <= 0 ? "exit" : "scale-out";
    if (this.wantReplay) {
      this.replayEvents.push({
        t: new Date(time).toISOString(),
        price: exitPx,
        type: eventType,
        side: openPos.side,
        size: qty,
        tradeId: openPos.id,
        reason,
        pnl,
        symbol: this.symbol
      });
    }
    const record = {
      ...openPos,
      size: qty,
      exit: {
        price: exitPx,
        time,
        reason,
        pnl,
        exitATR: openPos._lastATR ?? void 0
      },
      mfeR: openPos._mfeR ?? 0,
      maeR: openPos._maeR ?? 0,
      adds: openPos._adds ?? 0
    };
    this.closed.push(record);
    openPos.size -= qty;
    openPos._realized = (openPos._realized || 0) + pnl;
    return record;
  }
  tightenStopToNetBreakeven(openPos, lastClose) {
    if (!openPos || openPos.size <= 0) return;
    const realized = openPos._realized || 0;
    if (realized <= 0) return;
    const direction = openPos.side === "long" ? 1 : -1;
    const breakevenDelta = Math.abs(realized / openPos.size);
    const breakevenPrice = direction === 1 ? openPos.entryFill - breakevenDelta : openPos.entryFill + breakevenDelta;
    const tightened = direction === 1 ? Math.max(openPos.stop, breakevenPrice) : Math.min(openPos.stop, breakevenPrice);
    openPos.stop = this.options.oco.clampStops ? clampStop(lastClose, tightened, openPos.side, this.options.oco) : tightened;
  }
  forceExit(reason, bar, overridePrice = null) {
    if (!this.open || !bar) return;
    const exitSide = this.open.side === "long" ? "short" : "long";
    const exitBasePrice = overridePrice ?? bar.close;
    const { price: filled, feeTotal: exitFeeTotal } = applyFill(exitBasePrice, exitSide, {
      slippageBps: this.options.slippageBps,
      feeBps: this.options.feeBps,
      kind: "market",
      qty: this.open.size,
      costs: this.options.costs
    });
    this.closeLeg({
      openPos: this.open,
      qty: this.open.size,
      exitPx: filled,
      exitFeeTotal,
      time: bar.time,
      reason
    });
    this.cooldown = this.open?._cooldownBars || 0;
    this.open = null;
  }
  cancelPending() {
    this.pending = null;
  }
  openFromPending(bar, signalEquity, entryPrice, fillKind = "limit", resolveEntrySize) {
    if (!this.pending) return false;
    const plannedRisk = Math.max(
      1e-8,
      this.pending.plannedRiskAbs ?? Math.abs(this.pending.entry - this.pending.stop)
    );
    const slipR = Math.abs(entryPrice - this.pending.entry) / plannedRisk;
    if (slipR > this.options.maxSlipROnFill) return false;
    let stopPrice = this.pending.stop;
    if (this.options.reanchorStopOnFill) {
      const direction = this.pending.side === "long" ? 1 : -1;
      stopPrice = direction === 1 ? entryPrice - plannedRisk : entryPrice + plannedRisk;
    }
    let takeProfit = this.pending.tp;
    const immediateRisk = Math.abs(entryPrice - stopPrice) || 1e-8;
    const rrHint = this.pending.meta?._rr;
    if (this.options.reanchorStopOnFill && Number.isFinite(rrHint)) {
      const plannedTarget = this.pending.side === "long" ? this.pending.entry + rrHint * plannedRisk : this.pending.entry - rrHint * plannedRisk;
      const closeEnough = Math.abs((this.pending.tp ?? plannedTarget) - plannedTarget) <= Math.max(1e-8, plannedRisk * 1e-6);
      if (closeEnough) {
        takeProfit = this.pending.side === "long" ? entryPrice + rrHint * immediateRisk : entryPrice - rrHint * immediateRisk;
      }
    }
    const desiredSize = this.pending.fixedQty ?? calculatePositionSize({
      equity: signalEquity,
      entry: entryPrice,
      stop: stopPrice,
      riskFraction: this.pending.riskFrac,
      qtyStep: this.options.qtyStep,
      minQty: this.options.minQty,
      maxLeverage: this.options.maxLeverage
    });
    const approvedSize = typeof resolveEntrySize === "function" ? resolveEntrySize({
      runner: this,
      desiredSize,
      entryPrice,
      stopPrice,
      pending: this.pending,
      fillKind
    }) : desiredSize;
    const size = roundStep2(approvedSize, this.options.qtyStep);
    if (size < this.options.minQty) return false;
    const { price: entryFill, feeTotal: entryFeeTotal } = applyFill(
      entryPrice,
      this.pending.side,
      {
        slippageBps: this.options.slippageBps,
        feeBps: this.options.feeBps,
        kind: fillKind,
        qty: size,
        costs: this.options.costs
      }
    );
    this.open = {
      symbol: this.symbol,
      ...this.pending.meta,
      id: ++this.tradeIdCounter,
      side: this.pending.side,
      entry: entryPrice,
      stop: stopPrice,
      takeProfit,
      size,
      openTime: bar.time,
      entryFill,
      entryFeeTotal,
      initSize: size,
      baseSize: size,
      _mfeR: 0,
      _maeR: 0,
      _adds: 0,
      _initRisk: Math.abs(entryPrice - stopPrice) || 1e-8
    };
    if (this.atrValues && this.atrValues[this.index] !== void 0) {
      this.open.entryATR = this.atrValues[this.index];
      this.open._lastATR = this.atrValues[this.index];
    }
    this.dayTrades += 1;
    this.pending = null;
    if (this.wantReplay) {
      this.replayEvents.push({
        t: new Date(bar.time).toISOString(),
        price: entryFill,
        type: "entry",
        side: this.open.side,
        size,
        tradeId: this.open.id,
        symbol: this.symbol
      });
    }
    return true;
  }
  buildSignalContext(index, bar, signalEquity) {
    if (this.options.strict && this.history.length !== index + 1) {
      throw new Error(
        `strict mode: signal() received ${this.history.length} candles at index ${index}`
      );
    }
    return {
      candles: this.options.strict ? strictHistoryView2(this.history, index) : this.history,
      index,
      bar,
      equity: signalEquity,
      openPosition: this.open,
      pendingOrder: this.pending
    };
  }
  step({ signalEquity, canTrade = true, resolveEntrySize } = {}) {
    if (!this.hasNext()) return null;
    const bar = this.candles[this.index];
    this.history.push(bar);
    this.lastBar = bar;
    const trigger = this.options.triggerMode || this.options.oco.mode || "intrabar";
    const dayKey = this.options.flattenAtClose || trigger === "close" ? dayKeyET(bar.time) : dayKeyUTC2(bar.time);
    if (this.currentDay === null || dayKey !== this.currentDay) {
      this.currentDay = dayKey;
      this.dayPnl = 0;
      this.dayTrades = 0;
      this.dayEquityStart = this.currentEquity;
    }
    if (this.open && this.open._maxBarsInTrade > 0) {
      const barsHeld = Math.max(
        1,
        Math.round((bar.time - this.open.openTime) / this.estimatedBarMs)
      );
      if (barsHeld >= this.open._maxBarsInTrade) {
        this.forceExit("TIME", bar);
      }
    }
    if (this.open && Number.isFinite(this.open._maxHoldMin) && this.open._maxHoldMin > 0) {
      const heldMinutes = (bar.time - this.open.openTime) / 6e4;
      if (heldMinutes >= this.open._maxHoldMin) {
        this.forceExit("TIME", bar);
      }
    }
    if (this.options.flattenAtClose && this.open && isEODBar(bar.time)) {
      this.forceExit("EOD", bar);
    }
    if (this.open) {
      const risk = this.open._initRisk || 1e-8;
      const highR = this.open.side === "long" ? (bar.high - this.open.entry) / risk : (this.open.entry - bar.low) / risk;
      const lowR = this.open.side === "long" ? (bar.low - this.open.entry) / risk : (this.open.entry - bar.high) / risk;
      const markR = this.open.side === "long" ? (bar.close - this.open.entry) / risk : (this.open.entry - bar.close) / risk;
      if (this.atrValues && this.atrValues[this.index] !== void 0) {
        this.open._lastATR = this.atrValues[this.index];
      }
      this.open._mfeR = Math.max(this.open._mfeR ?? -Infinity, highR);
      this.open._maeR = Math.min(this.open._maeR ?? Infinity, lowR);
      if (this.open._breakevenAtR > 0 && highR >= this.open._breakevenAtR && !this.open._beArmed) {
        const tightened = this.open.side === "long" ? Math.max(this.open.stop, this.open.entry) : Math.min(this.open.stop, this.open.entry);
        this.open.stop = this.options.oco.clampStops ? clampStop(bar.close, tightened, this.open.side, this.options.oco) : tightened;
        this.open._beArmed = true;
      }
      if (this.open._trailAfterR > 0 && highR >= this.open._trailAfterR) {
        const candidate = this.open.side === "long" ? bar.close - risk : bar.close + risk;
        const tightened = this.open.side === "long" ? Math.max(this.open.stop, candidate) : Math.min(this.open.stop, candidate);
        this.open.stop = this.options.oco.clampStops ? clampStop(bar.close, tightened, this.open.side, this.options.oco) : tightened;
      }
      if (this.options.mfeTrail.enabled && this.open._mfeR >= this.options.mfeTrail.armR) {
        const targetR = Math.max(
          0,
          this.open._mfeR - Math.max(0, this.options.mfeTrail.givebackR)
        );
        const candidate = this.open.side === "long" ? this.open.entry + targetR * risk : this.open.entry - targetR * risk;
        const tightened = this.open.side === "long" ? Math.max(this.open.stop, candidate) : Math.min(this.open.stop, candidate);
        this.open.stop = this.options.oco.clampStops ? clampStop(bar.close, tightened, this.open.side, this.options.oco) : tightened;
      }
      if (this.options.atrTrailMult > 0 && this.atrValues && this.atrValues[this.index] !== void 0) {
        const trailDistance = this.atrValues[this.index] * this.options.atrTrailMult;
        const candidate = this.open.side === "long" ? bar.close - trailDistance : bar.close + trailDistance;
        const tightened = this.open.side === "long" ? Math.max(this.open.stop, candidate) : Math.min(this.open.stop, candidate);
        this.open.stop = this.options.oco.clampStops ? clampStop(bar.close, tightened, this.open.side, this.options.oco) : tightened;
      }
      if (this.options.volScale.enabled && this.open.entryATR && this.open.size > this.options.minQty && this.atrValues && this.atrValues[this.index] !== void 0) {
        const ratio = this.atrValues[this.index] / Math.max(1e-12, this.open.entryATR);
        const shouldCut = ratio >= this.options.volScale.cutIfAtrX && markR < this.options.volScale.noCutAboveR && !this.open._volCutDone;
        if (shouldCut) {
          const cutQty = roundStep2(this.open.size * this.options.volScale.cutFrac, this.options.qtyStep);
          if (cutQty >= this.options.minQty && cutQty < this.open.size) {
            const exitSide2 = this.open.side === "long" ? "short" : "long";
            const { price: filled, feeTotal: exitFeeTotal } = applyFill(bar.close, exitSide2, {
              slippageBps: this.options.slippageBps,
              feeBps: this.options.feeBps,
              kind: "market",
              qty: cutQty,
              costs: this.options.costs
            });
            this.closeLeg({
              openPos: this.open,
              qty: cutQty,
              exitPx: filled,
              exitFeeTotal,
              time: bar.time,
              reason: "SCALE"
            });
            this.tightenStopToNetBreakeven(this.open, bar.close);
            this.open._volCutDone = true;
          }
        }
      }
      let addedThisBar = false;
      if (this.options.pyramiding.enabled && (this.open._adds ?? 0) < this.options.pyramiding.maxAdds) {
        const addNumber = (this.open._adds || 0) + 1;
        const triggerR = this.options.pyramiding.addAtR * addNumber;
        const triggerPrice = this.open.side === "long" ? this.open.entry + triggerR * risk : this.open.entry - triggerR * risk;
        const breakEvenSatisfied = !this.options.pyramiding.onlyAfterBreakEven || this.open.side === "long" && this.open.stop >= this.open.entry || this.open.side === "short" && this.open.stop <= this.open.entry;
        const touched = this.open.side === "long" ? trigger === "intrabar" ? bar.high >= triggerPrice : bar.close >= triggerPrice : trigger === "intrabar" ? bar.low <= triggerPrice : bar.close <= triggerPrice;
        if (breakEvenSatisfied && touched) {
          const baseSize = this.open.baseSize || this.open.initSize;
          const requestedQty = roundStep2(baseSize * this.options.pyramiding.addFrac, this.options.qtyStep);
          const addQty = typeof resolveEntrySize === "function" ? roundStep2(
            resolveEntrySize({
              runner: this,
              desiredSize: requestedQty,
              entryPrice: triggerPrice,
              stopPrice: this.open.stop,
              pending: {
                side: this.open.side,
                meta: this.open,
                riskFrac: this.options.riskPct / 100
              },
              fillKind: "limit"
            }),
            this.options.qtyStep
          ) : requestedQty;
          if (addQty >= this.options.minQty) {
            const { price: addFill, feeTotal: addFeeTotal } = applyFill(triggerPrice, this.open.side, {
              slippageBps: this.options.slippageBps,
              feeBps: this.options.feeBps,
              kind: "limit",
              qty: addQty,
              costs: this.options.costs
            });
            const newSize = this.open.size + addQty;
            this.open.entryFeeTotal += addFeeTotal;
            this.open.entryFill = (this.open.entryFill * this.open.size + addFill * addQty) / newSize;
            this.open.size = newSize;
            this.open.initSize += addQty;
            if (!this.open.baseSize) this.open.baseSize = baseSize;
            this.open._adds = addNumber;
            addedThisBar = true;
          }
        }
      }
      if (!addedThisBar && !this.open._scaled && this.options.scaleOutAtR > 0) {
        const triggerPrice = this.open.side === "long" ? this.open.entry + this.options.scaleOutAtR * risk : this.open.entry - this.options.scaleOutAtR * risk;
        const touched = this.open.side === "long" ? trigger === "intrabar" ? bar.high >= triggerPrice : bar.close >= triggerPrice : trigger === "intrabar" ? bar.low <= triggerPrice : bar.close <= triggerPrice;
        if (touched) {
          const exitSide2 = this.open.side === "long" ? "short" : "long";
          const qty = roundStep2(this.open.size * this.options.scaleOutFrac, this.options.qtyStep);
          if (qty >= this.options.minQty && qty < this.open.size) {
            const { price: filled, feeTotal: exitFeeTotal } = applyFill(triggerPrice, exitSide2, {
              slippageBps: this.options.slippageBps,
              feeBps: this.options.feeBps,
              kind: "limit",
              qty,
              costs: this.options.costs
            });
            this.closeLeg({
              openPos: this.open,
              qty,
              exitPx: filled,
              exitFeeTotal,
              time: bar.time,
              reason: "SCALE"
            });
            this.open._scaled = true;
            this.open.takeProfit = this.open.side === "long" ? this.open.entry + this.options.finalTP_R * risk : this.open.entry - this.options.finalTP_R * risk;
            this.tightenStopToNetBreakeven(this.open, bar.close);
            this.open._beArmed = true;
          }
        }
      }
      const exitSide = this.open.side === "long" ? "short" : "long";
      const { hit, px } = ocoExitCheck({
        side: this.open.side,
        stop: this.open.stop,
        tp: this.open.takeProfit,
        bar,
        mode: this.options.oco.mode,
        tieBreak: this.options.oco.tieBreak
      });
      if (hit) {
        const exitKind = hit === "TP" ? "limit" : "stop";
        const { price: filled, feeTotal: exitFeeTotal } = applyFill(px, exitSide, {
          slippageBps: this.options.slippageBps,
          feeBps: this.options.feeBps,
          kind: exitKind,
          qty: this.open.size,
          costs: this.options.costs
        });
        const localCooldown = this.open._cooldownBars || 0;
        this.closeLeg({
          openPos: this.open,
          qty: this.open.size,
          exitPx: filled,
          exitFeeTotal,
          time: bar.time,
          reason: hit
        });
        this.cooldown = (hit === "SL" ? Math.max(this.cooldown, this.options.postLossCooldownBars) : this.cooldown) || localCooldown;
        this.open = null;
      }
    }
    const maxLossDollars = this.options.maxDailyLossPct / 100 * this.dayEquityStart;
    const dailyLossHit = this.dayPnl <= -Math.abs(maxLossDollars);
    const dailyTradeCapHit = this.options.dailyMaxTrades > 0 && this.dayTrades >= this.options.dailyMaxTrades;
    if (!this.open && this.pending) {
      if (!canTrade) {
        this.pending = null;
      } else if (this.index > this.pending.expiresAt || dailyLossHit || dailyTradeCapHit) {
        if (this.options.entryChase.enabled && this.options.entryChase.convertOnExpiry) {
          const riskAtEdge = Math.abs(
            this.pending.meta._initRisk ?? this.pending.entry - this.pending.stop
          );
          const priceNow = bar.close;
          const direction = this.pending.side === "long" ? 1 : -1;
          const slippedR = Math.max(
            0,
            direction === 1 ? priceNow - this.pending.entry : this.pending.entry - priceNow
          ) / Math.max(1e-8, riskAtEdge);
          if (slippedR > this.options.maxSlipROnFill) {
            this.pending = null;
          } else if (!this.openFromPending(bar, signalEquity, priceNow, "market", resolveEntrySize)) {
            this.pending = null;
          }
        } else {
          this.pending = null;
        }
      } else if (touchedLimit(this.pending.side, this.pending.entry, bar, trigger)) {
        if (!this.openFromPending(bar, signalEquity, this.pending.entry, "limit", resolveEntrySize)) {
          this.pending = null;
        }
      } else if (this.options.entryChase.enabled) {
        const elapsedBars = this.index - (this.pending.startedAtIndex ?? this.index);
        const midpoint = this.pending.meta?._imb?.mid;
        if (!this.pending._chasedCE && midpoint !== void 0 && elapsedBars >= Math.max(1, this.options.entryChase.afterBars)) {
          this.pending.entry = midpoint;
          this.pending._chasedCE = true;
        }
        if (this.pending._chasedCE) {
          const riskRef = Math.abs(
            this.pending.meta?._initRisk ?? this.pending.entry - this.pending.stop
          );
          const priceNow = bar.close;
          const direction = this.pending.side === "long" ? 1 : -1;
          const slippedR = Math.max(
            0,
            direction === 1 ? priceNow - this.pending.entry : this.pending.entry - priceNow
          ) / Math.max(1e-8, riskRef);
          if (slippedR > this.options.maxSlipROnFill) {
            this.pending = null;
          } else if (slippedR > 0 && slippedR <= this.options.entryChase.maxSlipR) {
            if (!this.openFromPending(bar, signalEquity, priceNow, "market", resolveEntrySize)) {
              this.pending = null;
            }
          }
        }
      }
    }
    if (this.open || this.cooldown > 0) {
      if (this.cooldown > 0) this.cooldown -= 1;
      this.recordFrame(bar);
      this.index += 1;
      return bar;
    }
    if (!canTrade || dailyLossHit || dailyTradeCapHit) {
      this.pending = null;
      this.recordFrame(bar);
      this.index += 1;
      return bar;
    }
    if (!this.pending) {
      const rawSignal = this.options.signal(this.buildSignalContext(this.index, bar, signalEquity));
      const nextSignal = normalizeSignal3(rawSignal, bar, this.options.finalTP_R);
      if (nextSignal) {
        const signalRiskFraction = Number.isFinite(nextSignal.riskFraction) ? nextSignal.riskFraction : Number.isFinite(nextSignal.riskPct) ? nextSignal.riskPct / 100 : this.options.riskPct / 100;
        const expiryBars = nextSignal._entryExpiryBars ?? 5;
        this.pending = {
          side: nextSignal.side,
          entry: nextSignal.entry,
          stop: nextSignal.stop,
          tp: nextSignal.takeProfit,
          riskFrac: signalRiskFraction,
          fixedQty: nextSignal.qty,
          expiresAt: this.index + Math.max(1, expiryBars),
          startedAtIndex: this.index,
          meta: nextSignal,
          plannedRiskAbs: Math.abs(
            nextSignal._initRisk ?? nextSignal.entry - nextSignal.stop
          )
        };
        if (touchedLimit(this.pending.side, this.pending.entry, bar, trigger)) {
          if (!this.openFromPending(bar, signalEquity, this.pending.entry, "limit", resolveEntrySize)) {
            this.pending = null;
          }
        }
      }
    }
    this.recordFrame(bar);
    this.index += 1;
    return bar;
  }
  buildResult() {
    const metrics = buildMetrics({
      closed: this.closed,
      equityStart: this.options.equity,
      equityFinal: this.currentEquity,
      candles: this.candles,
      estBarMs: this.estimatedBarMs,
      eqSeries: this.eqSeries
    });
    const positions = this.closed.filter((trade) => trade.exit.reason !== "SCALE");
    return {
      symbol: this.options.symbol,
      interval: this.options.interval,
      range: this.options.range,
      trades: this.closed,
      positions,
      metrics,
      eqSeries: this.eqSeries,
      replay: {
        frames: this.replayFrames,
        events: this.replayEvents
      }
    };
  }
};
function defaultSystemCap(totalEquity, capPct, maxAllocation, maxAllocationPct) {
  const limits = [];
  if (Number.isFinite(capPct) && capPct > 0) limits.push(totalEquity * capPct);
  if (Number.isFinite(maxAllocation) && maxAllocation > 0) limits.push(maxAllocation);
  if (Number.isFinite(maxAllocationPct) && maxAllocationPct > 0) {
    limits.push(totalEquity * maxAllocationPct);
  }
  return limits.length ? Math.min(...limits) : Math.max(0, totalEquity);
}

// src/engine/portfolio.js
function asWeight(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
function buildPortfolioPoint(time, equity, lockedCapital, availableCapital) {
  return {
    time,
    timestamp: time,
    equity,
    lockedCapital,
    availableCapital
  };
}
function stableSystemOrder(left, right) {
  return left.index - right.index;
}
function combineReplay(systemResults, eqSeries, collectReplay) {
  if (!collectReplay) {
    return { frames: [], events: [] };
  }
  const events = systemResults.flatMap(
    (entry) => (entry.result.replay?.events || []).map((event) => ({
      ...event,
      symbol: event.symbol || entry.symbol
    }))
  ).sort((left, right) => new Date(left.t).getTime() - new Date(right.t).getTime());
  const frames = eqSeries.map((point) => ({
    t: new Date(point.time).toISOString(),
    price: 0,
    equity: point.equity,
    posSide: null,
    posSize: 0,
    lockedCapital: point.lockedCapital,
    availableCapital: point.availableCapital
  }));
  return { frames, events };
}
function portfolioState(runners, initialEquity) {
  let markedEquity = initialEquity;
  let lockedCapital = 0;
  for (const { runner, initialReferenceEquity } of runners) {
    markedEquity += runner.getMarkedEquity() - initialReferenceEquity;
    lockedCapital += runner.getLockedCapital();
  }
  return {
    markedEquity,
    lockedCapital,
    availableCapital: markedEquity - lockedCapital
  };
}
function findNextTimeAndActive(runners) {
  let nextTime = Infinity;
  const active = [];
  for (const entry of runners) {
    const time = entry.runner.peekTime();
    if (time < nextTime) {
      nextTime = time;
      active.length = 0;
      active.push(entry);
      continue;
    }
    if (time === nextTime) {
      active.push(entry);
    }
  }
  return { nextTime, active };
}
function initialPortfolioTime(runners) {
  let time = Infinity;
  for (const { runner } of runners) {
    const next = runner.candles[0]?.time ?? Infinity;
    if (next < time) time = next;
  }
  return Number.isFinite(time) ? time : 0;
}
function resolveSystemCap(systemEntry, totalEquity) {
  return defaultSystemCap(
    Math.max(0, totalEquity),
    systemEntry.defaultCapPct,
    systemEntry.system.maxAllocation,
    systemEntry.system.maxAllocationPct
  );
}
function forceExitAll(runners, time) {
  for (const { runner } of runners) {
    if (!runner.open) continue;
    const price = runner.getMarkPrice();
    if (!Number.isFinite(price)) continue;
    runner.forceExit("PORTFOLIO_DAILY_LOSS", { time, close: price }, price);
  }
}
function backtestPortfolio({
  systems = [],
  equity = 1e4,
  allocation = "equal",
  collectEqSeries = true,
  collectReplay = false,
  maxDailyLossPct = 0
} = {}) {
  if (!Array.isArray(systems) || systems.length === 0) {
    throw new Error("backtestPortfolio() requires a non-empty systems array");
  }
  const weights = allocation === "equal" ? systems.map(() => 1) : systems.map((system) => asWeight(system.weight || 0));
  const totalWeight = weights.reduce((sumValue, weight) => sumValue + weight, 0);
  if (!(totalWeight > 0)) {
    throw new Error("backtestPortfolio() requires positive allocation weights");
  }
  const runners = systems.map((system, index) => {
    const defaultCapPct = weights[index] / totalWeight;
    const initialReferenceEquity = equity * defaultCapPct;
    return {
      index,
      symbol: system.symbol ?? `system-${index + 1}`,
      system,
      defaultCapPct,
      initialReferenceEquity,
      runner: new BarSystemRunner({
        ...system,
        symbol: system.symbol ?? `system-${index + 1}`,
        equity: initialReferenceEquity,
        collectEqSeries,
        collectReplay
      })
    };
  });
  const eqSeries = collectEqSeries ? [] : [];
  let state = portfolioState(runners, equity);
  if (collectEqSeries) {
    eqSeries.push(
      buildPortfolioPoint(
        initialPortfolioTime(runners),
        state.markedEquity,
        state.lockedCapital,
        state.availableCapital
      )
    );
  }
  let currentDay = null;
  let dayStartEquity = equity;
  let portfolioHalted = false;
  while (true) {
    const { nextTime, active } = findNextTimeAndActive(runners);
    if (!Number.isFinite(nextTime)) break;
    active.sort(stableSystemOrder);
    const dayKey = dayKeyET(nextTime);
    if (currentDay === null || dayKey !== currentDay) {
      currentDay = dayKey;
      state = portfolioState(runners, equity);
      dayStartEquity = state.markedEquity;
      portfolioHalted = false;
    }
    for (const systemEntry of active) {
      state = portfolioState(runners, equity);
      const totalEquity = state.markedEquity;
      const availableCapital = Math.max(0, state.availableCapital);
      const systemLocked = systemEntry.runner.getLockedCapital();
      const systemCap = resolveSystemCap(systemEntry, totalEquity);
      const systemRemainingCapital = Math.max(0, systemCap - systemLocked);
      systemEntry.runner.step({
        signalEquity: totalEquity,
        canTrade: !portfolioHalted,
        resolveEntrySize({ desiredSize, entryPrice }) {
          const maxLeverage = Math.max(1, systemEntry.runner.options.maxLeverage || 1);
          const byAvailable = availableCapital * maxLeverage / Math.max(1e-12, Math.abs(entryPrice));
          const bySystemCap = systemRemainingCapital * maxLeverage / Math.max(1e-12, Math.abs(entryPrice));
          return Math.min(desiredSize, byAvailable, bySystemCap);
        }
      });
      state = portfolioState(runners, equity);
      if (!portfolioHalted && maxDailyLossPct > 0 && state.markedEquity <= dayStartEquity * (1 - Math.abs(maxDailyLossPct) / 100)) {
        portfolioHalted = true;
        for (const { runner } of runners) runner.cancelPending();
        forceExitAll(runners, nextTime);
        state = portfolioState(runners, equity);
      }
    }
    if (collectEqSeries) {
      eqSeries.push(
        buildPortfolioPoint(
          nextTime,
          state.markedEquity,
          state.lockedCapital,
          state.availableCapital
        )
      );
    }
  }
  const systemResults = runners.map((entry) => ({
    symbol: entry.symbol,
    weight: entry.defaultCapPct,
    equity: entry.initialReferenceEquity,
    allocationCapPct: entry.defaultCapPct,
    allocationCap: resolveSystemCap(entry, equity),
    result: entry.runner.buildResult()
  }));
  const trades = systemResults.flatMap(
    (run) => run.result.trades.map((trade) => ({
      ...trade,
      symbol: trade.symbol || run.symbol
    }))
  ).sort((left, right) => left.exit.time - right.exit.time);
  const positions = systemResults.flatMap(
    (run) => run.result.positions.map((trade) => ({
      ...trade,
      symbol: trade.symbol || run.symbol
    }))
  ).sort((left, right) => left.exit.time - right.exit.time);
  const replay = combineReplay(systemResults, eqSeries, collectReplay);
  const allCandles = systems.flatMap((system) => system.candles || []);
  const orderedCandles = [...allCandles].sort((left, right) => left.time - right.time);
  const metrics = buildMetrics({
    closed: trades,
    equityStart: equity,
    equityFinal: eqSeries.length ? eqSeries[eqSeries.length - 1].equity : equity,
    candles: orderedCandles,
    estBarMs: estimateBarMs(orderedCandles),
    eqSeries
  });
  return {
    symbol: "PORTFOLIO",
    interval: void 0,
    range: void 0,
    trades,
    positions,
    metrics,
    eqSeries,
    replay,
    systems: systemResults
  };
}

// src/engine/walkForward.js
function scoreOf(metrics, scoreBy) {
  const value = metrics?.[scoreBy];
  return Number.isFinite(value) ? value : -Infinity;
}
function stitchEquitySeries(target, source) {
  if (!source?.length) return;
  if (!target.length) {
    target.push(...source);
    return;
  }
  const lastTime = target[target.length - 1].time;
  const nextPoints = source.filter((point) => point.time > lastTime);
  target.push(...nextPoints);
}
function canonicalParams(params) {
  const entries = Object.entries(params || {}).sort(
    ([left], [right]) => left.localeCompare(right)
  );
  return JSON.stringify(Object.fromEntries(entries));
}
function buildWindowRanges(length, trainBars, testBars, stepBars, mode) {
  const ranges = [];
  for (let start = 0; start + trainBars + testBars <= length; start += stepBars) {
    const trainStart = mode === "anchored" ? 0 : start;
    const trainEnd = mode === "anchored" ? trainBars + start : start + trainBars;
    const testStart = trainEnd;
    const testEnd = testStart + testBars;
    if (testEnd > length) break;
    ranges.push({ trainStart, trainEnd, testStart, testEnd });
  }
  return ranges;
}
function summarizeBestParams(windows) {
  const summaryBySignature = /* @__PURE__ */ new Map();
  let adjacentRepeats = 0;
  windows.forEach((window, index) => {
    const signature = window.bestParamsSignature ?? canonicalParams(window.bestParams);
    const current = summaryBySignature.get(signature) || {
      params: window.bestParams,
      wins: 0,
      profitableWindows: 0,
      oosTrades: 0
    };
    current.wins += 1;
    current.profitableWindows += window.profitable ? 1 : 0;
    current.oosTrades += window.oosTrades;
    summaryBySignature.set(signature, current);
    if (index > 0 && (windows[index - 1].bestParamsSignature ?? canonicalParams(windows[index - 1].bestParams)) === signature) {
      adjacentRepeats += 1;
    }
  });
  const byFrequency = [...summaryBySignature.values()].sort((left, right) => {
    if (right.wins !== left.wins) return right.wins - left.wins;
    return right.profitableWindows - left.profitableWindows;
  });
  const adjacentPairs = Math.max(0, windows.length - 1);
  return {
    winners: windows.map((window) => window.bestParams),
    stability: {
      adjacentRepeatRate: adjacentPairs ? adjacentRepeats / adjacentPairs : 0,
      uniqueWinnerCount: summaryBySignature.size,
      dominant: byFrequency[0] || null,
      leaderboard: byFrequency
    }
  };
}
function walkForwardOptimize({
  candles = [],
  signalFactory,
  parameterSets = [],
  trainBars,
  testBars,
  stepBars = testBars,
  mode = "rolling",
  scoreBy = "profitFactor",
  backtestOptions = {}
} = {}) {
  if (!Array.isArray(candles) || candles.length === 0) {
    throw new Error("walkForwardOptimize() requires a non-empty candles array");
  }
  if (typeof signalFactory !== "function") {
    throw new Error("walkForwardOptimize() requires a signalFactory function");
  }
  if (!Array.isArray(parameterSets) || parameterSets.length === 0) {
    throw new Error("walkForwardOptimize() requires parameterSets");
  }
  if (!(trainBars > 0) || !(testBars > 0) || !(stepBars > 0)) {
    throw new Error("walkForwardOptimize() requires positive trainBars, testBars, and stepBars");
  }
  if (mode !== "rolling" && mode !== "anchored") {
    throw new Error('walkForwardOptimize() mode must be "rolling" or "anchored"');
  }
  const windows = [];
  const allTrades = [];
  const allPositions = [];
  const eqSeries = [];
  let rollingEquity = backtestOptions.equity ?? 1e4;
  const ranges = buildWindowRanges(candles.length, trainBars, testBars, stepBars, mode);
  const trainBacktestOptions = {
    ...backtestOptions,
    collectEqSeries: false,
    collectReplay: false
  };
  const testBacktestOptions = { ...backtestOptions };
  for (const range of ranges) {
    const trainSlice = candles.slice(range.trainStart, range.trainEnd);
    const testSlice = candles.slice(range.testStart, range.testEnd);
    let best = null;
    for (const params of parameterSets) {
      const trainResult = backtest({
        ...trainBacktestOptions,
        candles: trainSlice,
        equity: rollingEquity,
        signal: signalFactory(params)
      });
      const score = scoreOf(trainResult.metrics, scoreBy);
      if (!best || score > best.score) {
        best = { params, score, metrics: trainResult.metrics };
      }
    }
    const testResult = backtest({
      ...testBacktestOptions,
      candles: testSlice,
      equity: rollingEquity,
      signal: signalFactory(best.params)
    });
    const bestParamsSignature = canonicalParams(best.params);
    rollingEquity = testResult.metrics.finalEquity;
    allTrades.push(...testResult.trades);
    allPositions.push(...testResult.positions);
    stitchEquitySeries(eqSeries, testResult.eqSeries);
    windows.push({
      train: {
        start: trainSlice[0]?.time ?? null,
        end: trainSlice[trainSlice.length - 1]?.time ?? null
      },
      test: {
        start: testSlice[0]?.time ?? null,
        end: testSlice[testSlice.length - 1]?.time ?? null
      },
      bestParams: best.params,
      trainScore: best.score,
      trainMetrics: best.metrics,
      testMetrics: testResult.metrics,
      oosTrades: testResult.metrics.trades,
      profitable: testResult.metrics.totalPnL > 0,
      stabilityScore: 0,
      bestParamsSignature,
      result: testResult
    });
  }
  for (let index = 0; index < windows.length; index += 1) {
    const currentSignature = windows[index].bestParamsSignature;
    const adjacent = [];
    if (index > 0) {
      adjacent.push(windows[index - 1].bestParamsSignature === currentSignature ? 1 : 0);
    }
    if (index + 1 < windows.length) {
      adjacent.push(windows[index + 1].bestParamsSignature === currentSignature ? 1 : 0);
    }
    windows[index].stabilityScore = adjacent.length ? adjacent.reduce((total, value) => total + value, 0) / adjacent.length : 1;
    delete windows[index].bestParamsSignature;
  }
  const metrics = buildMetrics({
    closed: allTrades,
    equityStart: backtestOptions.equity ?? 1e4,
    equityFinal: rollingEquity,
    candles,
    estBarMs: estimateBarMs(candles),
    eqSeries
  });
  const bestParamsSummary = summarizeBestParams(windows);
  return {
    windows,
    trades: allTrades,
    positions: allPositions,
    metrics,
    eqSeries,
    replay: { frames: [], events: [] },
    bestParams: Object.assign(windows.map((window) => window.bestParams), bestParamsSummary),
    bestParamsSummary: bestParamsSummary.stability
  };
}

// src/data/index.js
var import_path2 = __toESM(require("path"), 1);

// src/data/yahoo.js
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var DAY_MS = 24 * 60 * 60 * 1e3;
var DAY_SEC = 24 * 60 * 60;
var requestQueue = {
  lastRequestAt: 0,
  minDelayMs: 400
};
function nowSec() {
  return Math.floor(Date.now() / 1e3);
}
function msToSec(value) {
  return Math.floor(value / 1e3);
}
function isIntraday(interval) {
  return /(m|h)$/i.test(String(interval));
}
function normalizeInterval(interval) {
  return String(interval || "1d").trim();
}
function parsePeriodToMs(period) {
  if (typeof period === "number" && Number.isFinite(period)) return period;
  const raw = String(period || "60d").trim().toLowerCase();
  const normalized = raw.replace(/months?$/, "mo").replace(/^(\d+)mon$/, "$1mo").replace(/^(\d+)mos$/, "$1mo");
  const match = normalized.match(/^(\d+)(mo|m|h|d|w|y)$/i);
  if (!match) {
    throw new Error(`Invalid period "${period}". Use values like "5d", "60d", "1y".`);
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case "mo":
      return Math.round(amount * 30.4375 * DAY_MS);
    case "m":
      return amount * 60 * 1e3;
    case "h":
      return amount * 60 * 60 * 1e3;
    case "d":
      return amount * DAY_MS;
    case "w":
      return amount * 7 * DAY_MS;
    case "y":
      return Math.round(amount * 365.25 * DAY_MS);
    default:
      throw new Error(`Unsupported period unit "${unit}"`);
  }
}
function maxDaysForInterval(interval) {
  const value = normalizeInterval(interval);
  if (!isIntraday(value)) return 365 * 10;
  if (/^\d+m$/i.test(value)) {
    const minutes = Number(value.slice(0, -1));
    if (minutes <= 2) return 7;
    if (minutes <= 30) return 60;
    if (minutes <= 60) return 730;
    return 365;
  }
  if (/^\d+h$/i.test(value)) return 730;
  return 60;
}
function sanitizeBars(candles) {
  const deduped = /* @__PURE__ */ new Map();
  for (const candle of candles) {
    if (!Number.isFinite(candle?.time) || !Number.isFinite(candle?.open) || !Number.isFinite(candle?.high) || !Number.isFinite(candle?.low) || !Number.isFinite(candle?.close)) {
      continue;
    }
    deduped.set(candle.time, {
      time: candle.time,
      open: candle.open,
      high: Math.max(candle.high, candle.open, candle.close),
      low: Math.min(candle.low, candle.open, candle.close),
      close: candle.close,
      volume: Number.isFinite(candle.volume) ? candle.volume : 0
    });
  }
  return [...deduped.values()].sort((left, right) => left.time - right.time);
}
async function rateLimitedFetch(url, options = {}) {
  const elapsed = Date.now() - requestQueue.lastRequestAt;
  if (elapsed < requestQueue.minDelayMs) {
    await sleep(requestQueue.minDelayMs - elapsed);
  }
  requestQueue.lastRequestAt = Date.now();
  return fetch(url, {
    ...options,
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      ...options.headers
    }
  });
}
async function fetchYahooChart(symbol, { period1, period2, interval, includePrePost = false }) {
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
  );
  url.searchParams.set("period1", String(Math.floor(period1)));
  url.searchParams.set("period2", String(Math.floor(period2)));
  url.searchParams.set("interval", normalizeInterval(interval));
  url.searchParams.set("includePrePost", includePrePost ? "true" : "false");
  url.searchParams.set("events", "div,splits");
  const response = await rateLimitedFetch(url.toString());
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Yahoo API error ${response.status}: ${text}`);
  }
  const payload = await response.json();
  if (payload.chart?.error) {
    throw new Error(payload.chart.error.description || "Yahoo chart error");
  }
  const result = payload.chart?.result?.[0];
  if (!result) return [];
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const open = quote.open || [];
  const high = quote.high || [];
  const low = quote.low || [];
  const close = quote.close || [];
  const volume = quote.volume || [];
  const candles = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    if (open[index] == null || high[index] == null || low[index] == null || close[index] == null) {
      continue;
    }
    candles.push({
      time: timestamps[index] * 1e3,
      open: open[index],
      high: high[index],
      low: low[index],
      close: close[index],
      volume: volume[index] ?? 0
    });
  }
  return candles;
}
function formatYahooFailureMessage(symbol, interval, period, error, attempts) {
  const detail = String(error?.message || error || "unknown error");
  return [
    `Unable to reach Yahoo Finance for ${symbol} ${interval} ${period} after ${attempts} attempts.`,
    `Last error: ${detail}`,
    'Try again later, or fall back to a local CSV/cache workflow with getHistoricalCandles({ source: "csv", ... }) or loadCandlesFromCache(...).'
  ].join(" ");
}
async function fetchYahooChartWithRetry(symbol, params, period, maxRetries = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      return await fetchYahooChart(symbol, params);
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error);
      const isRateLimited = /too many requests|rate limit|429/i.test(message);
      const isRetryable = isRateLimited || /timeout|fetch failed|network/i.test(message);
      if (!isRetryable || attempt === maxRetries - 1) break;
      const delay = Math.min(12e3, 500 * 2 ** attempt);
      await sleep(delay);
    }
  }
  throw new Error(
    formatYahooFailureMessage(
      symbol,
      params.interval,
      period,
      lastError,
      maxRetries
    )
  );
}
async function fetchHistorical(symbol, interval = "5m", period = "60d", options = {}) {
  const normalizedInterval = normalizeInterval(interval);
  const spanMs = parsePeriodToMs(period);
  const maxSpanMs = maxDaysForInterval(normalizedInterval) * DAY_MS;
  const includePrePost = Boolean(options.includePrePost);
  if (spanMs <= maxSpanMs) {
    const endSec = nowSec();
    const startSec = Math.max(0, endSec - msToSec(spanMs));
    const candles = await fetchYahooChartWithRetry(
      symbol,
      {
        period1: startSec,
        period2: endSec,
        interval: normalizedInterval,
        includePrePost
      },
      period
    );
    return sanitizeBars(candles);
  }
  const chunks = [];
  let remainingMs = spanMs;
  let chunkEndMs = Date.now();
  while (remainingMs > 0) {
    const takeMs = Math.min(remainingMs, maxSpanMs);
    const chunkStartMs = chunkEndMs - takeMs;
    const candles = await fetchYahooChartWithRetry(
      symbol,
      {
        period1: msToSec(chunkStartMs),
        period2: msToSec(chunkEndMs),
        interval: normalizedInterval,
        includePrePost
      },
      period
    );
    chunks.push(...candles);
    chunkEndMs = chunkStartMs - 1e3;
    remainingMs -= takeMs;
    if (chunks.length > 2e6) break;
  }
  return sanitizeBars(chunks);
}
async function fetchLatestCandle(symbol, interval = "1m", options = {}) {
  const bars = await fetchHistorical(symbol, interval, "5d", options);
  return bars[bars.length - 1] ?? null;
}

// src/data/index.js
function normalizeCacheDir(cacheDir) {
  return cacheDir || import_path2.default.join(process.cwd(), "output", "data");
}
function derivePeriodFromRange(startDate, endDate) {
  if (!startDate || !endDate) return "custom";
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "custom";
  const days = Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1e3)));
  return `${days}d`;
}
async function getHistoricalCandles(options = {}) {
  const {
    source: requestedSource = "auto",
    symbol,
    interval = "1d",
    period,
    cache = true,
    refresh = false,
    cacheDir,
    csv,
    csvPath,
    ...rest
  } = options;
  const effectiveCacheDir = normalizeCacheDir(cacheDir);
  const source = requestedSource === "auto" ? csvPath || csv?.filePath || csv?.path ? "csv" : "yahoo" : requestedSource;
  if (source === "csv") {
    const filePath = csvPath || csv?.filePath || csv?.path;
    if (!filePath) {
      throw new Error('CSV source requires "csvPath" or "csv.filePath"');
    }
    const candles2 = loadCandlesFromCSV(filePath, csv || rest);
    if (cache && symbol) {
      saveCandlesToCache(candles2, {
        symbol,
        interval,
        period: period ?? derivePeriodFromRange(csv?.startDate ?? rest.startDate, csv?.endDate ?? rest.endDate),
        outDir: effectiveCacheDir,
        source: "csv"
      });
    }
    return candles2;
  }
  if (source !== "yahoo") {
    throw new Error(`Unsupported data source "${source}"`);
  }
  if (!symbol) {
    throw new Error('Yahoo source requires "symbol"');
  }
  const resolvedPeriod = period ?? "1y";
  if (cache && !refresh) {
    const cached = loadCandlesFromCache(symbol, interval, resolvedPeriod, effectiveCacheDir);
    if (cached?.length) return cached;
  }
  const candles = await fetchHistorical(symbol, interval, resolvedPeriod, rest);
  if (cache) {
    saveCandlesToCache(candles, {
      symbol,
      interval,
      period: resolvedPeriod,
      outDir: effectiveCacheDir,
      source: "yahoo"
    });
  }
  return candles;
}
async function backtestHistorical({
  backtestOptions = {},
  data,
  ...legacy
} = {}) {
  const candles = await getHistoricalCandles(data || legacy);
  return backtest({
    candles,
    symbol: data?.symbol ?? legacy.symbol,
    interval: data?.interval ?? legacy.interval,
    range: data?.period ?? legacy.period ?? "custom",
    ...backtestOptions
  });
}

// src/reporting/renderHtmlReport.js
var import_fs2 = __toESM(require("fs"), 1);
var import_path3 = __toESM(require("path"), 1);
var templateCache = /* @__PURE__ */ new Map();
function candidateRoots() {
  const roots = [];
  let current = process.cwd();
  while (true) {
    roots.push(current);
    roots.push(import_path3.default.join(current, "node_modules", "tradelab"));
    const parent = import_path3.default.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return [...new Set(roots)];
}
function readTemplate(relativePath) {
  for (const root of candidateRoots()) {
    const absolutePath = import_path3.default.join(root, relativePath);
    if (!import_fs2.default.existsSync(absolutePath)) continue;
    if (!templateCache.has(absolutePath)) {
      templateCache.set(absolutePath, import_fs2.default.readFileSync(absolutePath, "utf8"));
    }
    return templateCache.get(absolutePath);
  }
  throw new Error(`Could not locate template asset: ${relativePath}`);
}
function fmt(value, digits = 2) {
  if (value === void 0 || value === null || Number.isNaN(value)) return "\u2014";
  if (!Number.isFinite(value)) return value > 0 ? "Inf" : "0";
  return Number(value).toFixed(digits);
}
function fmtPct(value, digits = 2) {
  if (value === void 0 || value === null || Number.isNaN(value)) return "\u2014";
  if (!Number.isFinite(value)) return value > 0 ? "Inf" : "0";
  return `${(Number(value) * 100).toFixed(digits)}%`;
}
function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function serializeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/<\/script/gi, "<\\\\/script");
}
function renderTemplate(template, replacements) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => replacements[key] ?? "");
}
function metricCards(metrics) {
  const cards = [
    {
      label: "Net Return",
      value: fmtPct(metrics.returnPct ?? 0, 2),
      note: `PnL ${fmt(metrics.totalPnL ?? 0, 2)}`
    },
    {
      label: "Win Rate",
      value: fmtPct(metrics.winRate ?? 0, 1),
      note: `${metrics.trades ?? 0} completed positions`
    },
    {
      label: "Profit Factor",
      value: fmt(metrics.profitFactor ?? 0, 2),
      note: `Avg R ${fmt(metrics.avgR ?? 0, 2)}`
    },
    {
      label: "Drawdown",
      value: fmtPct(metrics.maxDrawdownPct ?? 0, 2),
      note: `Calmar ${fmt(metrics.calmar ?? 0, 2)}`
    }
  ];
  return cards.map(
    (card) => `
        <article class="metric-card">
          <div class="metric-card__label">${escapeHtml(card.label)}</div>
          <div class="metric-card__value">${escapeHtml(card.value)}</div>
          <div class="metric-card__note">${escapeHtml(card.note)}</div>
        </article>
      `
  ).join("");
}
function renderRows(rows, { empty = "No data available", colSpan = 2 } = {}) {
  if (!rows.length) {
    return `<tr><td class="table-empty" colspan="${colSpan}">${escapeHtml(empty)}</td></tr>`;
  }
  return rows.map(
    ([label, value]) => `
        <tr>
          <th>${escapeHtml(label)}</th>
          <td>${escapeHtml(value)}</td>
        </tr>
      `
  ).join("");
}
function renderPositionRows(positions) {
  if (!positions?.length) {
    return '<tr><td class="table-empty" colspan="7">No completed positions</td></tr>';
  }
  return positions.slice(-25).reverse().map((trade) => {
    const exit = trade.exit || {};
    return `
        <tr>
          <td>${escapeHtml(new Date(trade.openTime).toISOString())}</td>
          <td>${escapeHtml(trade.side)}</td>
          <td>${escapeHtml(fmt(trade.entryFill ?? trade.entry, 4))}</td>
          <td>${escapeHtml(fmt(exit.price, 4))}</td>
          <td>${escapeHtml(exit.reason ?? "\u2014")}</td>
          <td>${escapeHtml(fmt(exit.pnl, 2))}</td>
          <td>${escapeHtml(fmt(trade.mfeR ?? 0, 2))} / ${escapeHtml(
      fmt(trade.maeR ?? 0, 2)
    )}</td>
        </tr>
      `;
  }).join("");
}
function buildDailyPnl(eqSeries) {
  if (!eqSeries?.length) return [];
  const byDay = /* @__PURE__ */ new Map();
  for (const point of eqSeries) {
    const date = new Date(point.time).toISOString().slice(0, 10);
    const record = byDay.get(date) || {
      date,
      open: point.equity,
      close: point.equity,
      firstTime: point.time,
      lastTime: point.time
    };
    if (point.time < record.firstTime) {
      record.firstTime = point.time;
      record.open = point.equity;
    }
    if (point.time >= record.lastTime) {
      record.lastTime = point.time;
      record.close = point.equity;
    }
    byDay.set(date, record);
  }
  return [...byDay.values()].sort((left, right) => left.date.localeCompare(right.date)).map((record) => ({
    date: record.date,
    pnl: record.close - record.open
  }));
}
function buildReportPayload({ eqSeries, replay }) {
  const normalizedEqSeries = eqSeries.map((point) => ({
    t: new Date(point.time).toISOString(),
    equity: point.equity
  }));
  let peak = normalizedEqSeries[0]?.equity ?? 0;
  const drawdown = normalizedEqSeries.map((point) => {
    peak = Math.max(peak, point.equity);
    return {
      t: point.t,
      value: peak > 0 ? (point.equity - peak) / peak : 0
    };
  });
  const normalizedReplay = {
    frames: Array.isArray(replay?.frames) ? replay.frames : [],
    events: Array.isArray(replay?.events) ? replay.events : []
  };
  return {
    eqSeries: normalizedEqSeries,
    drawdown,
    dailyPnl: buildDailyPnl(eqSeries),
    replay: normalizedReplay,
    hasReplay: normalizedReplay.frames.length > 0
  };
}
function renderHtmlReport({
  symbol,
  interval,
  range,
  metrics,
  eqSeries,
  replay,
  positions = [],
  plotlyCdnUrl = "https://cdn.plot.ly/plotly-2.35.2.min.js"
}) {
  if (!eqSeries?.length) {
    throw new Error("renderHtmlReport() requires a populated eqSeries array");
  }
  const template = readTemplate("templates/report.html");
  const css = readTemplate("templates/report.css");
  const clientJs = readTemplate("templates/report.js");
  const title = `${symbol} ${interval} (${range})`;
  const payload = buildReportPayload({ eqSeries, replay });
  const summaryRows = renderRows([
    ["Trades", String(metrics.trades ?? 0)],
    ["Win rate", fmtPct(metrics.winRate ?? 0, 1)],
    ["Profit factor", fmt(metrics.profitFactor ?? 0, 2)],
    ["Expectancy / trade", fmt(metrics.expectancy ?? 0, 2)],
    ["Total R", fmt(metrics.totalR ?? 0, 2)],
    ["Avg R / trade", fmt(metrics.avgR ?? 0, 2)],
    ["Max drawdown", fmtPct(metrics.maxDrawdownPct ?? 0, 2)],
    ["Exposure", fmtPct(metrics.exposurePct ?? 0, 1)],
    ["Avg hold (min)", fmt(metrics.avgHoldMin ?? 0, 1)],
    ["Daily Sharpe", fmt(metrics.sharpeDaily ?? 0, 2)]
  ]);
  const breakdownRows = renderRows([
    [
      "Long",
      `${metrics.long?.trades ?? 0} trades, ${fmtPct(
        metrics.long?.winRate ?? 0,
        1
      )} win, avg R ${fmt(metrics.long?.avgR ?? 0, 2)}`
    ],
    [
      "Short",
      `${metrics.short?.trades ?? 0} trades, ${fmtPct(
        metrics.short?.winRate ?? 0,
        1
      )} win, avg R ${fmt(metrics.short?.avgR ?? 0, 2)}`
    ],
    ["R p50 / p90", `${fmt(metrics.rDist?.p50 ?? 0, 2)} / ${fmt(metrics.rDist?.p90 ?? 0, 2)}`],
    [
      "Hold p50 / p90",
      `${fmt(metrics.holdDistMin?.p50 ?? 0, 1)} / ${fmt(
        metrics.holdDistMin?.p90 ?? 0,
        1
      )} min`
    ]
  ]);
  return renderTemplate(template, {
    TITLE: escapeHtml(title),
    CSS: css,
    REPORT_JS: clientJs,
    PLOTLY_CDN_URL: escapeHtml(plotlyCdnUrl),
    HERO_SUBTITLE: escapeHtml(
      `Start ${fmt(metrics.startEquity ?? 0, 2)} \u2022 End ${fmt(metrics.finalEquity ?? 0, 2)}`
    ),
    HERO_PILL: escapeHtml(
      `Return ${fmtPct(metrics.returnPct ?? 0, 2)} \u2022 Max DD ${fmtPct(
        metrics.maxDrawdownPct ?? 0,
        2
      )}`
    ),
    METRIC_CARDS: metricCards(metrics),
    SUMMARY_ROWS: summaryRows,
    BREAKDOWN_ROWS: breakdownRows,
    POSITION_ROWS: renderPositionRows(positions),
    REPLAY_VISIBILITY: payload.hasReplay ? "" : "is-hidden",
    REPORT_DATA_JSON: serializeJson(payload)
  });
}
function exportHtmlReport({
  symbol,
  interval,
  range,
  metrics,
  eqSeries,
  replay,
  positions,
  outDir = "output",
  plotlyCdnUrl
}) {
  if (!eqSeries?.length) return null;
  import_fs2.default.mkdirSync(outDir, { recursive: true });
  const safeSymbol = String(symbol).replace(/[^a-zA-Z0-9_.-]+/g, "_");
  const safeInterval = String(interval).replace(/[^a-zA-Z0-9_.-]+/g, "_");
  const safeRange = String(range).replace(/[^a-zA-Z0-9_.-]+/g, "_");
  const outputPath = import_path3.default.join(
    outDir,
    `report-${safeSymbol}-${safeInterval}-${safeRange}.html`
  );
  const html = renderHtmlReport({
    symbol,
    interval,
    range,
    metrics,
    eqSeries,
    replay,
    positions,
    plotlyCdnUrl
  });
  import_fs2.default.writeFileSync(outputPath, html, "utf8");
  return outputPath;
}

// src/reporting/exportTradesCsv.js
var import_fs3 = __toESM(require("fs"), 1);
var import_path4 = __toESM(require("path"), 1);
function safeSegment2(value) {
  return String(value).replace(/[^-_.A-Za-z0-9]/g, "_");
}
function tradeRMultiple2(trade) {
  const initialRisk = trade._initRisk || 0;
  if (initialRisk <= 0) return 0;
  const entry = trade.entryFill ?? trade.entry;
  const perUnit = trade.side === "long" ? trade.exit.price - entry : entry - trade.exit.price;
  return perUnit / initialRisk;
}
function exportTradesCsv(closedTrades, { symbol = "UNKNOWN", interval = "tf", range = "range", outDir = "output" } = {}) {
  if (!closedTrades?.length) return null;
  const rows = [
    [
      "time_open",
      "time_close",
      "side",
      "entry",
      "stop",
      "takeProfit",
      "exit",
      "reason",
      "size",
      "pnl",
      "R",
      "mfeR",
      "maeR",
      "adds",
      "entryATR",
      "exitATR"
    ].join(","),
    ...closedTrades.map(
      (trade) => [
        new Date(trade.openTime).toISOString(),
        new Date(trade.exit.time).toISOString(),
        trade.side,
        Number(trade.entry).toFixed(6),
        Number(trade.stop).toFixed(6),
        Number(trade.takeProfit).toFixed(6),
        Number(trade.exit.price).toFixed(6),
        trade.exit.reason,
        trade.size,
        trade.exit.pnl.toFixed(2),
        tradeRMultiple2(trade).toFixed(3),
        (trade.mfeR ?? 0).toFixed(3),
        (trade.maeR ?? 0).toFixed(3),
        trade.adds ?? 0,
        trade.entryATR !== void 0 ? Number(trade.entryATR).toFixed(6) : "",
        trade.exit.exitATR !== void 0 ? Number(trade.exit.exitATR).toFixed(6) : ""
      ].join(",")
    )
  ].join("\n");
  import_fs3.default.mkdirSync(outDir, { recursive: true });
  const filename = `trades-${safeSegment2(symbol)}-${safeSegment2(interval)}-${safeSegment2(range)}.csv`;
  const outputPath = import_path4.default.join(outDir, filename);
  import_fs3.default.writeFileSync(outputPath, rows, "utf8");
  return outputPath;
}

// src/reporting/exportMetricsJson.js
var import_fs4 = __toESM(require("fs"), 1);
var import_path5 = __toESM(require("path"), 1);
function safeSegment3(value) {
  return String(value).replace(/[^-_.A-Za-z0-9]/g, "_");
}
function exportMetricsJSON({
  result,
  symbol = result?.symbol,
  interval = result?.interval ?? "tf",
  range = result?.range ?? "range",
  outDir = "output"
} = {}) {
  if (!result?.metrics) {
    throw new Error("exportMetricsJSON() requires a backtest result with metrics");
  }
  import_fs4.default.mkdirSync(outDir, { recursive: true });
  const fileName = `metrics-${safeSegment3(symbol)}-${safeSegment3(interval)}-${safeSegment3(range)}.json`;
  const outputPath = import_path5.default.join(outDir, fileName);
  import_fs4.default.writeFileSync(outputPath, JSON.stringify(result.metrics, null, 2), "utf8");
  return outputPath;
}

// src/reporting/exportBacktestArtifacts.js
function exportBacktestArtifacts({
  result,
  symbol = result?.symbol,
  interval = result?.interval ?? "tf",
  range = result?.range ?? "range",
  outDir = "output",
  exportCsv = true,
  exportHtml = true,
  exportMetrics = true,
  csvSource = "positions",
  plotlyCdnUrl
} = {}) {
  if (!result) {
    throw new Error("exportBacktestArtifacts() requires a backtest result");
  }
  const outputs = {
    csv: null,
    html: null,
    metrics: null
  };
  const csvTrades = csvSource === "trades" ? result.trades : result.positions ?? result.trades;
  if (exportCsv) {
    outputs.csv = exportTradesCsv(csvTrades, {
      symbol,
      interval,
      range,
      outDir
    });
  }
  if (exportHtml) {
    outputs.html = exportHtmlReport({
      symbol,
      interval,
      range,
      metrics: result.metrics,
      eqSeries: result.eqSeries,
      replay: result.replay,
      positions: result.positions ?? [],
      outDir,
      plotlyCdnUrl
    });
  }
  if (exportMetrics) {
    outputs.metrics = exportMetricsJSON({
      result,
      symbol,
      interval,
      range,
      outDir
    });
  }
  return outputs;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  atr,
  backtest,
  backtestHistorical,
  backtestPortfolio,
  backtestTicks,
  bpsOf,
  buildMetrics,
  cachedCandlesPath,
  calculatePositionSize,
  candleStats,
  detectFVG,
  ema,
  exportBacktestArtifacts,
  exportHtmlReport,
  exportMetricsJSON,
  exportTradesCsv,
  fetchHistorical,
  fetchLatestCandle,
  getHistoricalCandles,
  inWindowsET,
  isSession,
  lastSwing,
  loadCandlesFromCSV,
  loadCandlesFromCache,
  mergeCandles,
  minutesET,
  normalizeCandles,
  offsetET,
  parseWindowsCSV,
  pct,
  renderHtmlReport,
  saveCandlesToCache,
  structureState,
  swingHigh,
  swingLow,
  walkForwardOptimize
});
