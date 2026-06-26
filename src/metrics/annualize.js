// src/metrics/annualize.js

const TRADING_DAYS = 252;
const RTH_HOURS = 6.5; // US regular trading hours per day
const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

// Known intra/inter-day intervals => periods per trading year.
const INTERVAL_PERIODS = {
  "1m": TRADING_DAYS * RTH_HOURS * 60,
  "2m": TRADING_DAYS * RTH_HOURS * 30,
  "5m": TRADING_DAYS * RTH_HOURS * 12,
  "15m": TRADING_DAYS * RTH_HOURS * 4,
  "30m": TRADING_DAYS * RTH_HOURS * 2,
  "1h": TRADING_DAYS * RTH_HOURS,
  "60m": TRADING_DAYS * RTH_HOURS,
  "1d": TRADING_DAYS,
  "1wk": 52,
  "1mo": 12,
};

/**
 * Number of bars in one year for the given interval. Used to annualize
 * per-bar Sharpe/Sortino. Falls back to estBarMs (assuming a 24/7 clock)
 * when the interval string is unknown, then to 252.
 */
export function periodsPerYear(interval, estBarMs) {
  if (interval && INTERVAL_PERIODS[interval]) return INTERVAL_PERIODS[interval];
  if (Number.isFinite(estBarMs) && estBarMs > 0) {
    return Math.round(MS_PER_YEAR / estBarMs);
  }
  return TRADING_DAYS;
}
