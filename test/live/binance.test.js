import test from "node:test";
import assert from "node:assert/strict";

import { BinanceBroker } from "../../src/live/broker/binance.js";

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}

test("BinanceBroker signs requests and maps responses", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const full = String(url);
    if (full.includes("/api/v3/account")) {
      return response({ balances: [{ asset: "USDT", free: "1000" }] });
    }
    if (full.includes("/api/v3/order") && init.method === "POST") {
      return response({
        orderId: 1,
        status: "NEW",
        executedQty: "0",
        symbol: "BTCUSDT",
        side: "BUY",
        type: "LIMIT",
        origQty: "0.1",
      });
    }
    if (full.includes("/api/v3/klines")) {
      return response([[1, "100", "102", "99", "101", "10"]]);
    }
    if (full.includes("/api/v3/time")) {
      return response({ serverTime: 1 });
    }
    return response({});
  };

  const broker = new BinanceBroker({ fetchImpl });
  await broker.connect({ apiKey: "k", apiSecret: "s", paper: true });
  await broker.getServerTime();
  const account = await broker.getAccount();
  assert.equal(account.equity, 1000);
  await broker.submitOrder({
    symbol: "BTCUSDT",
    side: "buy",
    type: "limit",
    qty: 0.1,
    limitPrice: 100,
  });
  const bars = await broker.getHistoricalBars("BTCUSDT", "1m", 1);
  assert.equal(bars.length, 1);

  const signedCall = calls.find((call) => call.url.includes("/api/v3/account"));
  assert.match(signedCall.url, /signature=/);
  assert.equal(signedCall.init.headers["X-MBX-APIKEY"], "k");
});
