import { Worker } from "node:worker_threads";
import os from "node:os";

function defaultConcurrency() {
  return Math.max(1, (os.cpus()?.length ?? 2) - 1);
}

function scoreValue(metrics, scoreBy) {
  const v = metrics?.[scoreBy];
  return Number.isFinite(v) ? v : -Infinity;
}

export function optimize({
  candles,
  signalModulePath,
  parameterSets,
  interval,
  backtestOptions = {},
  concurrency,
  scoreBy = "profitFactor",
}) {
  if (!Array.isArray(parameterSets) || parameterSets.length === 0) {
    return Promise.resolve({ results: [], leaderboard: [], best: null });
  }

  return new Promise((resolve, reject) => {
    const poolSize = Math.min(concurrency || defaultConcurrency(), parameterSets.length);
    const results = new Array(parameterSets.length);
    const workers = [];
    let nextIndex = 0;
    let completed = 0;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      for (const w of workers) w.terminate();
      const ranked = results
        .filter((r) => r && r.metrics)
        .sort((a, b) => scoreValue(b.metrics, scoreBy) - scoreValue(a.metrics, scoreBy));
      resolve({ results, leaderboard: ranked, best: ranked[0] ?? null });
    };

    const fail = (error) => {
      if (settled) return;
      settled = true;
      for (const w of workers) w.terminate();
      reject(error);
    };

    const dispatch = (worker) => {
      if (nextIndex >= parameterSets.length) {
        worker.postMessage({ type: "stop" });
        return;
      }
      const index = nextIndex;
      nextIndex += 1;
      worker.postMessage({ type: "run", index, params: parameterSets[index] });
    };

    for (let i = 0; i < poolSize; i += 1) {
      const worker = new Worker(new URL("./optimizeWorker.js", import.meta.url), {
        workerData: { candles, signalModulePath, interval, backtestOptions },
      });
      workers.push(worker);

      worker.on("message", (msg) => {
        if (msg.type === "ready") {
          dispatch(worker);
          return;
        }
        if (msg.type === "result" || msg.type === "error") {
          results[msg.index] =
            msg.type === "result"
              ? { params: msg.params, metrics: msg.metrics }
              : { params: msg.params, error: msg.error };
          completed += 1;
          if (completed === parameterSets.length) finish();
          else dispatch(worker);
        }
      });

      worker.on("error", fail);
    }
  });
}
