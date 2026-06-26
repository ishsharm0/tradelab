// Run: node examples/llmSignal.js
import { backtestAsync, LlmSignal, getHistoricalCandles } from "../src/index.js";

const candles = await getHistoricalCandles({
  source: "yahoo",
  symbol: "SPY",
  interval: "1d",
  period: "1y",
  cache: true,
});

// Stand-in for a real model call. Replace `resolve` with an LLM/agent request.
const llm = new LlmSignal({
  budgetMs: 2000,
  onError: "skip",
  async resolve({ candles: history, bar }) {
    const closes = history.map((c) => c.close);
    const recent = closes.slice(-5);
    const rising = recent.every((c, i) => i === 0 || c >= recent[i - 1]);
    return rising ? { side: "long", stop: bar.close * 0.98, rr: 2 } : null;
  },
});

const result = await backtestAsync({
  candles,
  symbol: "SPY",
  interval: "1d",
  signal: llm.signal,
  signalBudgetMs: 3000,
});

console.log("trades:", result.metrics.trades, "PnL:", result.metrics.totalPnL.toFixed(2));
console.log("decisions logged:", llm.log.length);
