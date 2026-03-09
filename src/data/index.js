import path from "path";
import { backtest as runBacktest } from "../engine/backtest.js";

import {
  cachedCandlesPath,
  candleStats,
  loadCandlesFromCache,
  loadCandlesFromCSV,
  mergeCandles,
  normalizeCandles,
  saveCandlesToCache,
} from "./csv.js";
import { fetchHistorical, fetchLatestCandle } from "./yahoo.js";

function normalizeCacheDir(cacheDir) {
  return cacheDir || path.join(process.cwd(), "output", "data");
}

function derivePeriodFromRange(startDate, endDate) {
  if (!startDate || !endDate) return "custom";
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "custom";

  const days = Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)));
  return `${days}d`;
}

export async function getHistoricalCandles(options = {}) {
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
  const source =
    requestedSource === "auto"
      ? csvPath || csv?.filePath || csv?.path
        ? "csv"
        : "yahoo"
      : requestedSource;

  if (source === "csv") {
    const filePath = csvPath || csv?.filePath || csv?.path;
    if (!filePath) {
      throw new Error('CSV source requires "csvPath" or "csv.filePath"');
    }

    const candles = loadCandlesFromCSV(filePath, csv || rest);
    if (cache && symbol) {
      saveCandlesToCache(candles, {
        symbol,
        interval,
        period:
          period ??
          derivePeriodFromRange(csv?.startDate ?? rest.startDate, csv?.endDate ?? rest.endDate),
        outDir: effectiveCacheDir,
        source: "csv",
      });
    }
    return candles;
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
      source: "yahoo",
    });
  }
  return candles;
}

export async function backtestHistorical({
  backtestOptions = {},
  data,
  ...legacy
} = {}) {
  const candles = await getHistoricalCandles(data || legacy);
  return runBacktest({
    candles,
    symbol: data?.symbol ?? legacy.symbol,
    interval: data?.interval ?? legacy.interval,
    range: data?.period ?? legacy.period ?? "custom",
    ...backtestOptions,
  });
}

export {
  cachedCandlesPath,
  candleStats,
  fetchHistorical,
  fetchLatestCandle,
  loadCandlesFromCache,
  loadCandlesFromCSV,
  mergeCandles,
  normalizeCandles,
  saveCandlesToCache,
};
