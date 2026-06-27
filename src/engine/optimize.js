import { Worker } from "node:worker_threads";
import os from "node:os";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function defaultConcurrency() {
  return Math.max(1, (os.cpus()?.length ?? 2) - 1);
}

function scoreValue(metrics, scoreBy) {
  const v = metrics?.[scoreBy];
  return Number.isFinite(v) ? v : -Infinity;
}

function callerModuleDir() {
  const stack = new Error().stack || "";
  const lines = stack.split("\n").slice(1);
  const match = lines
    .map((line) => line.match(/(?:\()?(file:\/\/\/[^\s)]+|\/[^\s)]+):\d+:\d+/))
    .find(Boolean);
  if (!match) return process.cwd();
  const filePath = match[1].startsWith("file://") ? fileURLToPath(match[1]) : match[1];
  return path.dirname(filePath);
}

function workerUrl() {
  const here = callerModuleDir();
  const candidates = [
    path.join(here, "optimizeWorker.js"),
    path.join(here, "..", "..", "src", "engine", "optimizeWorker.js"),
    path.join(process.cwd(), "src", "engine", "optimizeWorker.js"),
  ];
  return pathToFileURL(candidates.find((candidate) => existsSync(candidate)) || candidates[0]);
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
      const worker = new Worker(workerUrl(), {
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
