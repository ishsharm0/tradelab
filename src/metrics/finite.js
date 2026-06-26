// src/metrics/finite.js

// Sentinel for "effectively infinite" metric values (e.g. profit factor with zero
// losses). Large enough to be unmistakable, small enough to survive JSON.stringify
// and JSON.parse round-trips without becoming Infinity.
export const BIG_NUMBER = 1e9;

/**
 * Coerce a metric to a finite, JSON-safe number.
 * +/-Infinity clamp to +/-BIG_NUMBER. NaN/null/undefined become `fallback`.
 */
export function clampFinite(value, fallback = 0) {
  if (value === Infinity) return BIG_NUMBER;
  if (value === -Infinity) return -BIG_NUMBER;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}
