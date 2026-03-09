import fs from "fs";
import path from "path";

function safeSegment(value) {
  return String(value).replace(/[^-_.A-Za-z0-9]/g, "_");
}

function resolveDate(value, customDateParser) {
  if (value === undefined || value === null || value === "") {
    throw new Error("Missing date value");
  }

  if (typeof customDateParser === "function") {
    const parsed = customDateParser(value);
    const time = parsed instanceof Date ? parsed.getTime() : Number(parsed);
    if (Number.isFinite(time)) return time;
  }

  if (value instanceof Date) {
    const time = value.getTime();
    if (Number.isFinite(time)) return time;
  }

  const raw = String(value).trim().replace(/^['"]|['"]$/g, "");
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return numeric < 1e11 ? numeric * 1000 : numeric;
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
  const map = new Map();
  headers.forEach((header, index) => {
    map.set(header.trim().toLowerCase(), index);
  });
  return map;
}

function resolveColumn(column, headerIndex, aliases = []) {
  if (typeof column === "number" && column >= 0) return column;

  const candidates = [column, ...aliases]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).trim().toLowerCase());

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

export function normalizeCandles(candles) {
  if (!Array.isArray(candles)) return [];

  const normalized = candles
    .map((bar) => {
      try {
        const time = resolveDate(bar?.time ?? bar?.timestamp ?? bar?.date);
        const open = Number(bar?.open ?? bar?.o);
        const high = Number(bar?.high ?? bar?.h);
        const low = Number(bar?.low ?? bar?.l);
        const close = Number(bar?.close ?? bar?.c);
        const volume = Number(bar?.volume ?? bar?.v ?? 0);

        if (
          !Number.isFinite(time) ||
          !Number.isFinite(open) ||
          !Number.isFinite(high) ||
          !Number.isFinite(low) ||
          !Number.isFinite(close)
        ) {
          return null;
        }

        return {
          time,
          open,
          high: Math.max(high, open, close),
          low: Math.min(low, open, close),
          close,
          volume: Number.isFinite(volume) ? volume : 0,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.time - right.time);

  const deduped = [];
  let lastTime = null;
  for (const candle of normalized) {
    if (candle.time === lastTime) continue;
    deduped.push(candle);
    lastTime = candle.time;
  }
  return deduped;
}

export function loadCandlesFromCSV(filePath, options = {}) {
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
    customDateParser,
  } = options;

  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf8");
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
    "opentime",
  ]);
  const openIdx = resolveColumn(openCol, headerIndex, ["o"]);
  const highIdx = resolveColumn(highCol, headerIndex, ["h"]);
  const lowIdx = resolveColumn(lowCol, headerIndex, ["l"]);
  const closeIdx = resolveColumn(closeCol, headerIndex, ["c", "adj close"]);
  const volumeIdx = resolveColumn(volumeCol, headerIndex, ["v", "vol", "quantity"]);

  if (
    timeIdx < 0 ||
    openIdx < 0 ||
    highIdx < 0 ||
    lowIdx < 0 ||
    closeIdx < 0
  ) {
    throw new Error(
      `Could not resolve required CSV columns in ${path.basename(filePath)}`
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

      if (
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
      ) {
        continue;
      }

      candles.push({
        time,
        open,
        high: Math.max(high, open, close),
        low: Math.min(low, open, close),
        close,
        volume: Number.isFinite(volume) ? volume : 0,
      });
    } catch {
      continue;
    }
  }

  return normalizeCandles(candles);
}

export function mergeCandles(...arrays) {
  return normalizeCandles(arrays.flat());
}

export function candleStats(candles) {
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
    durationDays: (last.time - first.time) / (1000 * 60 * 60 * 24),
    estimatedIntervalMin: Math.round(medianGapMs / 60000),
    priceRange: {
      low: minLow,
      high: maxHigh,
    },
  };
}

export function saveCandlesToCache(
  candles,
  { symbol = "UNKNOWN", interval = "tf", period = "range", outDir = "output/data", source } = {}
) {
  const outputPath = path.join(
    outDir,
    `candles-${safeSegment(symbol)}-${safeSegment(interval)}-${safeSegment(period)}.json`
  );
  const normalized = normalizeCandles(candles);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        symbol,
        interval,
        period,
        source: source ?? null,
        count: normalized.length,
        asOf: new Date().toISOString(),
        candles: normalized,
      },
      null,
      2
    ),
    "utf8"
  );

  return outputPath;
}

export function cachedCandlesPath(symbol, interval, period, outDir = "output/data") {
  const fileName = `candles-${safeSegment(symbol)}-${safeSegment(interval)}-${safeSegment(period)}.json`;
  return path.join(outDir, fileName);
}

export function loadCandlesFromCache(symbol, interval, period, outDir = "output/data") {
  const filePath = cachedCandlesPath(symbol, interval, period, outDir);
  if (!fs.existsSync(filePath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed?.candles) ? normalizeCandles(parsed.candles) : null;
  } catch {
    return null;
  }
}
