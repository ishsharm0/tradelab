/**
 * mcpLiveTrading.js — Programmatic demo of TradingSession (no network, paper only).
 *
 * Shows: create session, feed bars, place a bracket order (entry → stop + target OCO),
 * simulate the target hitting, and print final status.
 *
 *   node examples/mcpLiveTrading.js
 */

import { PaperEngine } from "../src/live/engine/paperEngine.js";
import { TradingSession } from "../src/live/session.js";

function bar(time, price, { high = price, low = price } = {}) {
  return { time, open: price, high, low, close: price, volume: 1000 };
}

async function main() {
  // 1. Create a paper session backed by an in-process PaperEngine.
  const broker = new PaperEngine({ equity: 10_000 });
  const session = new TradingSession({
    id: "demo",
    symbol: "AAPL",
    interval: "1m",
    broker,
    equity: 10_000,
    maxDailyLossPct: 2, // halt trading if day loss exceeds 2%
  });
  await session.start();

  console.log("Session started:", session.getStatus().id);

  // 2. Feed the first price bar so PaperEngine knows the mark.
  await session.pushBar(bar(1, 100));

  // 3. Place a risk-sized bracket order: long with stop at 98 and target at 104.
  //    Risk: 1% of $10k = $100 risk, $2 per share risk → size = 50 shares.
  const receipt = await session.placeOrder({
    side: "long",
    type: "market",
    riskPct: 1,
    stop: 98,
    target: 104,
  });
  console.log("Entry filled:", receipt.status, "qty:", receipt.filledQty, "@", receipt.avgFillPrice);

  let status = session.getStatus();
  console.log("Open positions:", status.positions.length);
  console.log("Resting bracket orders (stop + limit target):", status.openOrders.length);

  // 4. Feed a bar that hits the target price (high = 104).
  await session.pushBar(bar(2, 104, { high: 104 }));

  // 5. Target filled, stop canceled (OCO). Position is closed.
  status = session.getStatus();
  console.log("\nAfter target bar:");
  console.log("  positions:", status.positions.length, "(should be 0 — flat)");
  console.log("  openOrders:", status.openOrders.length, "(should be 0 — stop canceled)");
  console.log("  equity:", status.equity.toFixed(2), "(should be > $10,000)");
  console.log("  dayPnl:", status.dayPnl.toFixed(2));
  console.log("  risk.halted:", status.risk.halted, "(should be false)");

  // 6. Shut down the session.
  await session.stop();
  console.log("\nSession stopped. Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
