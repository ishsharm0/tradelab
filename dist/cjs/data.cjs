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

// src/data/index.js
var index_exports = {};
__export(index_exports, {
  backtestHistorical: () => backtestHistorical,
  cachedCandlesPath: () => cachedCandlesPath,
  candleStats: () => candleStats,
  fetchHistorical: () => fetchHistorical,
  fetchLatestCandle: () => fetchLatestCandle,
  getHistoricalCandles: () => getHistoricalCandles,
  loadCandlesFromCSV: () => loadCandlesFromCSV,
  loadCandlesFromCache: () => loadCandlesFromCache,
  mergeCandles: () => mergeCandles,
  normalizeCandles: () => normalizeCandles,
  saveCandlesToCache: () => saveCandlesToCache
});
module.exports = __toCommonJS(index_exports);
var import_path2 = __toESM(require("path"), 1);

// src/utils/indicators.js
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
  const completedTrades = closed.filter((trade) => trade.exit.reason !== "SCALE");
  const winningTrades = completedTrades.filter((trade) => trade.exit.pnl > 0);
  const losingTrades = completedTrades.filter((trade) => trade.exit.pnl < 0);
  const tradeRs = completedTrades.map(tradeRMultiple);
  const totalR = sum(tradeRs);
  const avgR = mean(tradeRs);
  const labels = completedTrades.map(
    (trade) => trade.exit.pnl > 0 ? "win" : trade.exit.pnl < 0 ? "loss" : "flat"
  );
  const { maxWin, maxLoss } = streaks(labels);
  const tradePnls = completedTrades.map((trade) => trade.exit.pnl);
  const expectancy = mean(tradePnls);
  const tradeReturns = completedTrades.map(
    (trade) => trade.exit.pnl / Math.max(1e-12, equityStart)
  );
  const tradeReturnStd = stddev(tradeReturns);
  const sharpePerTrade = tradeReturnStd === 0 ? tradeReturns.length ? Infinity : 0 : mean(tradeReturns) / tradeReturnStd;
  const sortinoPerTrade = sortino(tradeReturns);
  const grossProfitPositions = sum(winningTrades.map((trade) => trade.exit.pnl));
  const grossLossPositions = Math.abs(
    sum(losingTrades.map((trade) => trade.exit.pnl))
  );
  const profitFactorPositions = grossLossPositions === 0 ? grossProfitPositions > 0 ? Infinity : 0 : grossProfitPositions / grossLossPositions;
  const legs = [...closed].sort((left, right) => left.exit.time - right.exit.time);
  const winningLegs = legs.filter((trade) => trade.exit.pnl > 0);
  const losingLegs = legs.filter((trade) => trade.exit.pnl < 0);
  const grossProfitLegs = sum(winningLegs.map((trade) => trade.exit.pnl));
  const grossLossLegs = Math.abs(sum(losingLegs.map((trade) => trade.exit.pnl)));
  const profitFactorLegs = grossLossLegs === 0 ? grossProfitLegs > 0 ? Infinity : 0 : grossProfitLegs / grossLossLegs;
  let peakEquity = equityStart;
  let currentEquity = equityStart;
  let maxDrawdown = 0;
  for (const leg of legs) {
    currentEquity += leg.exit.pnl;
    if (currentEquity > peakEquity) peakEquity = currentEquity;
    const drawdown = (peakEquity - currentEquity) / Math.max(1e-12, peakEquity);
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  const realizedPnL = sum(closed.map((trade) => trade.exit.pnl));
  const returnPct = (equityFinal - equityStart) / Math.max(1e-12, equityStart);
  const calmar = maxDrawdown === 0 ? returnPct > 0 ? Infinity : 0 : returnPct / maxDrawdown;
  const totalBars = Math.max(1, candles.length);
  const openBars = completedTrades.reduce((total, trade) => {
    const barsHeld = Math.max(1, Math.round((trade.exit.time - trade.openTime) / estBarMs));
    return total + barsHeld;
  }, 0);
  const exposurePct = openBars / totalBars;
  const holdDurationsMinutes = completedTrades.map(
    (trade) => (trade.exit.time - trade.openTime) / (1e3 * 60)
  );
  const avgHoldMin = mean(holdDurationsMinutes);
  const equitySeries = eqSeries && eqSeries.length ? eqSeries : buildEquitySeriesFromLegs({ legs, equityStart });
  const dailyReturnsSeries = dailyReturns(equitySeries);
  const dailyStd = stddev(dailyReturnsSeries);
  const sharpeDaily = dailyStd === 0 ? dailyReturnsSeries.length ? Infinity : 0 : mean(dailyReturnsSeries) / dailyStd;
  const sortinoDaily = sortino(dailyReturnsSeries);
  const dailyWinRate = dailyReturnsSeries.length ? dailyReturnsSeries.filter((value) => value > 0).length / dailyReturnsSeries.length : 0;
  const longTrades = completedTrades.filter((trade) => trade.side === "long");
  const shortTrades = completedTrades.filter((trade) => trade.side === "short");
  const longRs = longTrades.map(tradeRMultiple);
  const shortRs = shortTrades.map(tradeRMultiple);
  const longPnls = longTrades.map((trade) => trade.exit.pnl);
  const shortPnls = shortTrades.map((trade) => trade.exit.pnl);
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
      trades: longTrades.length,
      winRate: longTrades.length ? longTrades.filter((trade) => trade.exit.pnl > 0).length / longTrades.length : 0,
      avgPnL: mean(longPnls),
      avgR: mean(longRs)
    },
    short: {
      trades: shortTrades.length,
      winRate: shortTrades.length ? shortTrades.filter((trade) => trade.exit.pnl > 0).length / shortTrades.length : 0,
      avgPnL: mean(shortPnls),
      avgR: mean(shortRs)
    }
  };
  return {
    trades: completedTrades.length,
    winRate: completedTrades.length ? winningTrades.length / completedTrades.length : 0,
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
    winRate_pos: completedTrades.length ? winningTrades.length / completedTrades.length : 0,
    winRate_leg: legs.length ? winningLegs.length / legs.length : 0,
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  backtestHistorical,
  cachedCandlesPath,
  candleStats,
  fetchHistorical,
  fetchLatestCandle,
  getHistoricalCandles,
  loadCandlesFromCSV,
  loadCandlesFromCache,
  mergeCandles,
  normalizeCandles,
  saveCandlesToCache
});
