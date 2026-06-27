import { makeRng, randInt } from "../utils/random.js";

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
}

function maxDrawdownOf(equityPath) {
  let peak = equityPath[0];
  let maxDd = 0;
  for (const e of equityPath) {
    if (e > peak) peak = e;
    const dd = peak > 0 ? (peak - e) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}

/**
 * Block-bootstrap the trade PnL sequence `iterations` times to produce a
 * distribution of final equity and max drawdown. `blockSize > 1` resamples
 * contiguous blocks to preserve short-run autocorrelation (streaks).
 *
 * Returns percentile bands { p5, p25, p50, p75, p95 } for finalEquity and
 * maxDrawdown, plus pathBands (per-step p5/p50/p95 of the equity curve).
 */
export function monteCarlo({
  tradePnls,
  equityStart = 10_000,
  iterations = 1000,
  blockSize = 1,
  seed = "tradelab-mc",
}) {
  if (!Array.isArray(tradePnls) || tradePnls.length === 0) {
    throw new Error("monteCarlo() requires a non-empty tradePnls array");
  }
  const runCount = Math.floor(Number(iterations));
  if (!Number.isFinite(runCount) || runCount < 1) {
    throw new Error("monteCarlo() requires positive iterations");
  }
  const rng = makeRng(seed);
  const n = tradePnls.length;
  const block = Math.max(1, Math.floor(blockSize));

  const finals = [];
  const drawdowns = [];
  const pathSamples = Array.from({ length: n + 1 }, () => []);

  for (let it = 0; it < runCount; it += 1) {
    const path = [equityStart];
    let equity = equityStart;
    let filled = 0;
    while (filled < n) {
      const start = randInt(rng, n);
      for (let k = 0; k < block && filled < n; k += 1) {
        equity += tradePnls[(start + k) % n];
        path.push(equity);
        filled += 1;
      }
    }
    for (let step = 0; step < path.length; step += 1) {
      pathSamples[step].push(path[step]);
    }
    finals.push(equity);
    drawdowns.push(maxDrawdownOf(path));
  }

  const sortedFinals = [...finals].sort((a, b) => a - b);
  const sortedDd = [...drawdowns].sort((a, b) => a - b);
  const pathBands = pathSamples.map((samples) => {
    const s = [...samples].sort((a, b) => a - b);
    return { p5: percentile(s, 0.05), p50: percentile(s, 0.5), p95: percentile(s, 0.95) };
  });

  const bands = (sorted) => ({
    p5: percentile(sorted, 0.05),
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p95: percentile(sorted, 0.95),
  });

  return {
    iterations: runCount,
    blockSize: block,
    finalEquity: bands(sortedFinals),
    maxDrawdown: bands(sortedDd),
    pathBands,
    probProfit: finals.filter((f) => f > equityStart).length / iterations,
  };
}
