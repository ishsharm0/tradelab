import { exportHtmlReport } from "./renderHtmlReport.js";
import { exportMetricsJSON } from "./exportMetricsJson.js";
import { exportTradesCsv } from "./exportTradesCsv.js";

export function exportBacktestArtifacts({
  result,
  symbol = result?.symbol,
  interval = result?.interval ?? "tf",
  range = result?.range ?? "range",
  outDir = "output",
  exportCsv = true,
  exportHtml = true,
  exportMetrics = true,
  csvSource = "positions",
  plotlyCdnUrl,
} = {}) {
  if (!result) {
    throw new Error("exportBacktestArtifacts() requires a backtest result");
  }

  const outputs = {
    csv: null,
    html: null,
    metrics: null,
  };

  const csvTrades =
    csvSource === "trades"
      ? result.trades
      : result.positions ?? result.trades;

  if (exportCsv) {
    outputs.csv = exportTradesCsv(csvTrades, {
      symbol,
      interval,
      range,
      outDir,
    });
  }

  if (exportHtml) {
    outputs.html = exportHtmlReport({
      symbol,
      interval,
      range,
      metrics: result.metrics,
      eqSeries: result.eqSeries,
      replay: result.replay,
      positions: result.positions ?? [],
      outDir,
      plotlyCdnUrl,
    });
  }

  if (exportMetrics) {
    outputs.metrics = exportMetricsJSON({
      result,
      symbol,
      interval,
      range,
      outDir,
    });
  }

  return outputs;
}
