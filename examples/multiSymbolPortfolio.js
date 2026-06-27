/**
 * multiSymbolPortfolio.js: Paper session trading two symbols with independent
 * bracket orders and a portfolio exposure cap.
 *
 * Shows:
 *   - SessionManager.create() with a symbols array
 *   - Per-symbol pushBar() and placeOrder()
 *   - maxGrossExposurePct exposure cap blocking over-sized orders
 *   - getStatus() reporting positions, equity, and the symbols list
 *
 *   node examples/multiSymbolPortfolio.js
 */

import { SessionManager, PaperEngine } from "../src/live/index.js";

function bar(time, price, { high = price, low = price } = {}) {
  return { time, open: price, high, low, close: price, volume: 1000 };
}

async function main() {
  // 1. One shared broker for two symbols.
  const broker = new PaperEngine({ equity: 20_000 });

  const manager = new SessionManager();
  const session = await manager.create({
    id: "btc-eth-portfolio",
    symbols: ["BTC", "ETH"],
    interval: "1h",
    equity: 20_000,
    riskPct: 1,
    // Cap total gross notional to 150% of equity.
    // A second order that would push exposure past that limit is rejected.
    maxGrossExposurePct: 150,
    broker,
  });

  console.log("Session started:", session.id);
  console.log("Tracked symbols:", session.symbols);

  // 2. Feed opening bars for each symbol.
  await session.pushBar(bar(1, 30_000), "BTC");
  await session.pushBar(bar(1, 2_000), "ETH");

  // 3. Place a risk-sized long bracket on BTC.
  //    1% of $20k = $200 risk, $500/BTC stop distance -> 0.4 BTC.
  const btcReceipt = await session.placeOrder({
    symbol: "BTC",
    side: "long",
    riskPct: 1,
    stop: 29_500,
    rr: 3,
  });
  console.log(
    "\nBTC entry filled:",
    btcReceipt.status,
    "qty:", btcReceipt.filledQty,
    "@", btcReceipt.avgFillPrice
  );

  // 4. Place a risk-sized long bracket on ETH.
  //    1% of $20k = $200 risk, $100/ETH stop distance -> 2 ETH.
  const ethReceipt = await session.placeOrder({
    symbol: "ETH",
    side: "long",
    riskPct: 1,
    stop: 1_900,
    rr: 2,
  });
  console.log(
    "ETH entry filled:",
    ethReceipt.status,
    "qty:", ethReceipt.filledQty,
    "@", ethReceipt.avgFillPrice
  );

  let status = session.getStatus();
  console.log("\nAfter both entries:");
  console.log("  positions:", status.positions.length, "(BTC + ETH)");
  console.log("  open orders:", status.openOrders.length, "(4 bracket legs)");
  console.log("  equity:", status.equity.toFixed(2));
  console.log("  symbols:", status.symbols);

  // 5. Demonstrate the exposure cap: trying to open a large third position is rejected.
  try {
    await session.placeOrder({
      symbol: "BTC",
      side: "long",
      qty: 1,            // large fixed size that would exceed the 150% cap
      stop: 28_000,
    });
    console.log("\nLarge order unexpectedly succeeded.");
  } catch (err) {
    console.log("\nExposure cap enforced:", err.message);
  }

  // 6. Simulate BTC hitting its target (high = 31_500).
  await session.pushBar(bar(2, 31_500, { high: 31_500 }), "BTC");
  await session.pushBar(bar(2, 2_000), "ETH");

  // 7. Close the remaining ETH position manually.
  await session.closePosition("ETH");

  status = session.getStatus();
  console.log("\nAfter BTC target + ETH close:");
  console.log("  positions:", status.positions.length, "(should be 0)");
  console.log("  open orders:", status.openOrders.length, "(should be 0)");
  console.log("  final equity:", status.equity.toFixed(2));
  console.log("  dayPnl:", status.dayPnl.toFixed(2));
  console.log("  risk.halted:", status.risk.halted);

  // 8. Per-symbol price and candle buffer accessors.
  console.log("\nlastPriceFor BTC:", session.lastPriceFor("BTC"));
  console.log("candleBufferFor ETH length:", session.candleBufferFor("ETH").length);

  await session.stop();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
