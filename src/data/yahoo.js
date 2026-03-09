const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_SEC = 24 * 60 * 60;
const requestQueue = {
  lastRequestAt: 0,
  minDelayMs: 400,
};

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function msToSec(value) {
  return Math.floor(value / 1000);
}

function isIntraday(interval) {
  return /(m|h)$/i.test(String(interval));
}

function normalizeInterval(interval) {
  return String(interval || "1d").trim();
}

function parsePeriodToMs(period) {
  if (typeof period === "number" && Number.isFinite(period)) return period;

  const raw = String(period || "60d")
    .trim()
    .toLowerCase();
  const normalized = raw
    .replace(/months?$/, "mo")
    .replace(/^(\d+)mon$/, "$1mo")
    .replace(/^(\d+)mos$/, "$1mo");
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
      return amount * 60 * 1000;
    case "h":
      return amount * 60 * 60 * 1000;
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
  const deduped = new Map();
  for (const candle of candles) {
    if (
      !Number.isFinite(candle?.time) ||
      !Number.isFinite(candle?.open) ||
      !Number.isFinite(candle?.high) ||
      !Number.isFinite(candle?.low) ||
      !Number.isFinite(candle?.close)
    ) {
      continue;
    }

    deduped.set(candle.time, {
      time: candle.time,
      open: candle.open,
      high: Math.max(candle.high, candle.open, candle.close),
      low: Math.min(candle.low, candle.open, candle.close),
      close: candle.close,
      volume: Number.isFinite(candle.volume) ? candle.volume : 0,
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
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      ...options.headers,
    },
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
    if (
      open[index] == null ||
      high[index] == null ||
      low[index] == null ||
      close[index] == null
    ) {
      continue;
    }

    candles.push({
      time: timestamps[index] * 1000,
      open: open[index],
      high: high[index],
      low: low[index],
      close: close[index],
      volume: volume[index] ?? 0,
    });
  }

  return candles;
}

function formatYahooFailureMessage(symbol, interval, period, error, attempts) {
  const detail = String(error?.message || error || "unknown error");
  return [
    `Unable to reach Yahoo Finance for ${symbol} ${interval} ${period} after ${attempts} attempts.`,
    `Last error: ${detail}`,
    "Try again later, or fall back to a local CSV/cache workflow with getHistoricalCandles({ source: \"csv\", ... }) or loadCandlesFromCache(...).",
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

      const delay = Math.min(12_000, 500 * 2 ** attempt);
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

export async function fetchHistorical(symbol, interval = "5m", period = "60d", options = {}) {
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
        includePrePost,
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
        includePrePost,
      },
      period
    );
    chunks.push(...candles);
    chunkEndMs = chunkStartMs - 1000;
    remainingMs -= takeMs;

    if (chunks.length > 2_000_000) break;
  }

  return sanitizeBars(chunks);
}

export async function fetchLatestCandle(symbol, interval = "1m", options = {}) {
  const bars = await fetchHistorical(symbol, interval, "5d", options);
  return bars[bars.length - 1] ?? null;
}
