import fs from "fs";
import path from "path";

function safeSegment(value) {
  return String(value).replace(/[^-_.A-Za-z0-9]/g, "_");
}

function tradeRMultiple(trade) {
  const initialRisk = trade._initRisk || 0;
  if (initialRisk <= 0) return 0;
  const entry = trade.entryFill ?? trade.entry;
  const perUnit =
    trade.side === "long"
      ? trade.exit.price - entry
      : entry - trade.exit.price;
  return perUnit / initialRisk;
}

export function exportTradesCsv(
  closedTrades,
  { symbol = "UNKNOWN", interval = "tf", range = "range", outDir = "output" } = {}
) {
  if (!closedTrades?.length) return null;

  const rows = [
    [
      "time_open",
      "time_close",
      "side",
      "entry",
      "stop",
      "takeProfit",
      "exit",
      "reason",
      "size",
      "pnl",
      "R",
      "mfeR",
      "maeR",
      "adds",
      "entryATR",
      "exitATR",
    ].join(","),
    ...closedTrades.map((trade) =>
      [
        new Date(trade.openTime).toISOString(),
        new Date(trade.exit.time).toISOString(),
        trade.side,
        Number(trade.entry).toFixed(6),
        Number(trade.stop).toFixed(6),
        Number(trade.takeProfit).toFixed(6),
        Number(trade.exit.price).toFixed(6),
        trade.exit.reason,
        trade.size,
        trade.exit.pnl.toFixed(2),
        tradeRMultiple(trade).toFixed(3),
        (trade.mfeR ?? 0).toFixed(3),
        (trade.maeR ?? 0).toFixed(3),
        trade.adds ?? 0,
        trade.entryATR !== undefined ? Number(trade.entryATR).toFixed(6) : "",
        trade.exit.exitATR !== undefined
          ? Number(trade.exit.exitATR).toFixed(6)
          : "",
      ].join(",")
    ),
  ].join("\n");

  fs.mkdirSync(outDir, { recursive: true });
  const filename = `trades-${safeSegment(symbol)}-${safeSegment(interval)}-${safeSegment(range)}.csv`;
  const outputPath = path.join(outDir, filename);
  fs.writeFileSync(outputPath, rows, "utf8");
  return outputPath;
}
