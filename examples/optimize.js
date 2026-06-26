// Run: node examples/optimize.js
import path from "node:path";
import { fileURLToPath } from "node:url";
import { optimize, grid, getHistoricalCandles } from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const candles = await getHistoricalCandles({
  source: "yahoo",
  symbol: "SPY",
  interval: "1d",
  period: "2y",
  cache: true,
});

const { leaderboard, best } = await optimize({
  candles,
  interval: "1d",
  signalModulePath: path.join(here, "..", "test", "fixtures", "emaSignal.js"),
  parameterSets: grid({ fast: [5, 8, 10, 12], slow: [20, 30, 50] }),
  scoreBy: "sharpeAnnualized",
});

console.log("best params:", best?.params, "sharpe:", best?.metrics.sharpeAnnualized);
console.table(leaderboard.slice(0, 5).map((r) => ({ ...r.params, ...r.metrics })));
