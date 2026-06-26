import { workerData, parentPort } from "node:worker_threads";
import { pathToFileURL } from "node:url";
import { backtest } from "./backtest.js";

const { candles, signalModulePath, interval, backtestOptions } = workerData;

const mod = await import(pathToFileURL(signalModulePath).href);
const createSignal = mod.createSignal ?? mod.default;
if (typeof createSignal !== "function") {
  throw new Error(`optimize: ${signalModulePath} must export createSignal(params) or a default factory`);
}

function pickMetrics(metrics) {
  const keep = [
    "trades",
    "winRate",
    "profitFactor",
    "expectancy",
    "totalR",
    "avgR",
    "sharpe",
    "sharpeAnnualized",
    "maxDrawdown",
    "calmar",
    "returnPct",
    "totalPnL",
    "finalEquity",
  ];
  const out = {};
  for (const k of keep) out[k] = metrics[k];
  return out;
}

parentPort.on("message", (msg) => {
  if (msg.type === "stop") {
    process.exit(0);
  }
  if (msg.type === "run") {
    try {
      const result = backtest({
        candles,
        interval,
        signal: createSignal(msg.params),
        collectReplay: false,
        collectEqSeries: false,
        ...backtestOptions,
      });
      parentPort.postMessage({
        type: "result",
        index: msg.index,
        params: msg.params,
        metrics: pickMetrics(result.metrics),
      });
    } catch (error) {
      parentPort.postMessage({
        type: "error",
        index: msg.index,
        params: msg.params,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

parentPort.postMessage({ type: "ready" });
