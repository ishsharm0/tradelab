import fs from "fs";
import path from "path";

function safeSegment(value) {
  return String(value).replace(/[^-_.A-Za-z0-9]/g, "_");
}

export function exportMetricsJSON({
  result,
  symbol = result?.symbol,
  interval = result?.interval ?? "tf",
  range = result?.range ?? "range",
  outDir = "output",
} = {}) {
  if (!result?.metrics) {
    throw new Error("exportMetricsJSON() requires a backtest result with metrics");
  }

  fs.mkdirSync(outDir, { recursive: true });
  const fileName = `metrics-${safeSegment(symbol)}-${safeSegment(interval)}-${safeSegment(range)}.json`;
  const outputPath = path.join(outDir, fileName);
  fs.writeFileSync(outputPath, JSON.stringify(result.metrics, null, 2), "utf8");
  return outputPath;
}
