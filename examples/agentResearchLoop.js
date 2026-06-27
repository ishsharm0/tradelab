/**
 * agentResearchLoop.js: Open a research session, run two backtests, log each
 * result with an overfit verdict, then recall entries and print the synthesis
 * plus a plain-English summary via summarize().
 *
 * Shows:
 *   - createResearchStore() with open / log / recall / close
 *   - Logging a backtest result manually (mirrors what run_backtest does when
 *     researchId is passed to the MCP tool)
 *   - research_recall synthesized summary (best Sharpe, overfit count)
 *   - summarize(metrics) for a one-paragraph plain-English output
 *
 *   node examples/agentResearchLoop.js
 */

import { backtest, ema } from "../src/index.js";
import { createResearchStore } from "../src/research/store.js";
import { deflatedSharpe } from "../src/research/index.js";
import { summarize } from "../src/reporting/summarize.js";

// ---------------------------------------------------------------------------
// Seeded candle generator; deterministic so the example output is stable.
// ---------------------------------------------------------------------------
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function syntheticCandles(count = 500) {
  const rng = makeRng(99999);
  const candles = [];
  let price = 100;
  const base = Date.UTC(2022, 0, 3);
  for (let i = 0; i < count; i++) {
    const noise = (rng() - 0.5) * 5;
    price = Math.max(price + noise + 0.1, 5);
    const range = Math.abs(noise) + 1;
    const open = price + (rng() - 0.5) * range * 0.4;
    const close = price;
    const high = Math.max(open, close) + rng() * range;
    const low = Math.min(open, close) - rng() * range;
    candles.push({ time: base + i * 86_400_000, open, high, low, close, volume: 10_000 });
  }
  return candles;
}

// ---------------------------------------------------------------------------
// Simple bidirectional EMA-cross signal.
// ---------------------------------------------------------------------------
function makeEmaSignal({ fast = 10, slow = 30, rr = 2 } = {}) {
  return ({ candles: history, bar }) => {
    if (history.length < slow + 2) return null;
    const closes = history.map((c) => c.close);
    const f = ema(closes, fast);
    const s = ema(closes, slow);
    const last = closes.length - 1;
    if (f[last - 1] <= s[last - 1] && f[last] > s[last]) {
      const stop = Math.min(...history.slice(-15).map((c) => c.low));
      if (stop >= bar.close) return null;
      return { side: "long", entry: bar.close, stop, rr };
    }
    if (f[last - 1] >= s[last - 1] && f[last] < s[last]) {
      const stop = Math.max(...history.slice(-15).map((c) => c.high));
      if (stop <= bar.close) return null;
      return { side: "short", entry: bar.close, stop, rr };
    }
    return null;
  };
}

// ---------------------------------------------------------------------------
// Helper: run a backtest, compute a DSR overfit verdict, log to the store.
// This mirrors what the MCP run_backtest tool does when researchId is passed.
// ---------------------------------------------------------------------------
async function runAndLog(store, researchId, { label, params, candles, symbol }) {
  const signal = makeEmaSignal(params);
  const result = backtest({ candles, symbol, interval: "1d", signal, collectReplay: false });
  const m = result.metrics;

  let verdict = null;
  try {
    const psr = deflatedSharpe({
      sharpe: m.sharpe,
      sampleSize: m.trades,
      numTrials: 2, // two parameter sets tried in this session
    });
    verdict = {
      deflatedSharpe: psr,
      overfit: Number.isFinite(psr) ? psr < 0.9 : false,
      note: Number.isFinite(psr) ? `PSR ${(psr * 100).toFixed(1)}%` : "insufficient data",
    };
  } catch {
    verdict = { deflatedSharpe: null, overfit: false, note: "verdict unavailable" };
  }

  await store.log(researchId, {
    hypothesis: label,
    params,
    metrics: {
      trades: m.trades,
      winRate: m.winRate,
      profitFactor: m.profitFactor,
      sharpe: m.sharpe,
      maxDrawdown: m.maxDrawdown,
      returnPct: m.returnPct,
    },
    verdict,
  });

  return { metrics: m, verdict };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const candles = syntheticCandles(500);
  // Use a unique subdirectory so repeated runs start fresh.
  const store = createResearchStore({ dir: ".tradelab/research-example" });
  const researchId = "ema-cross-study";

  // 1. Open (or resume) a named research session.
  const session = await store.open(researchId, "Compare fast vs slow EMA-cross on synthetic data");
  console.log("Research session:", session.id);
  console.log("Goal:", session.goal);
  console.log("");

  // 2. First backtest: tighter EMA pair, moderate R:R.
  const run1 = await runAndLog(store, researchId, {
    label: "EMA 5/20 rr=2",
    params: { fast: 5, slow: 20, rr: 2 },
    candles,
    symbol: "SYNTHETIC",
  });
  console.log("Run 1 (fast=5, slow=20, rr=2):");
  console.log("  trades:", run1.metrics.trades);
  console.log("  profitFactor:", run1.metrics.profitFactor?.toFixed(2));
  console.log("  sharpe:", run1.metrics.sharpe?.toFixed(2));
  console.log("  verdict:", run1.verdict);

  // 3. Second backtest: wider EMA pair, higher R:R.
  const run2 = await runAndLog(store, researchId, {
    label: "EMA 10/30 rr=3",
    params: { fast: 10, slow: 30, rr: 3 },
    candles,
    symbol: "SYNTHETIC",
  });
  console.log("\nRun 2 (fast=10, slow=30, rr=3):");
  console.log("  trades:", run2.metrics.trades);
  console.log("  profitFactor:", run2.metrics.profitFactor?.toFixed(2));
  console.log("  sharpe:", run2.metrics.sharpe?.toFixed(2));
  console.log("  verdict:", run2.verdict);

  // 4. Recall entries: the store returns recent entries plus a plain-text synthesis.
  const recall = await store.recall(researchId);
  console.log("\nResearch recall summary:");
  console.log(" ", recall.summary);
  console.log("  entries logged:", recall.entries.length);

  // 5. Pick the run with the better profitFactor and produce a human-readable summary.
  const bestMetrics =
    (run1.metrics.profitFactor ?? 0) >= (run2.metrics.profitFactor ?? 0)
      ? run1.metrics
      : run2.metrics;

  // summarize() expects percent-valued drawdown/return; backtest returns fractions.
  const normalized = {
    trades: bestMetrics.trades,
    winRate: bestMetrics.winRate,
    totalReturnPct: (bestMetrics.returnPct ?? 0) * 100,
    maxDrawdownPct: (bestMetrics.maxDrawdown ?? 0) * 100,
    sharpe: bestMetrics.sharpe,
  };
  console.log("\nBest run plain-English summary:");
  console.log(" ", summarize(normalized));

  // 6. Close the research session.
  const closed = await store.close(researchId);
  console.log("\nResearch session closed:", closed.closedAt);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
