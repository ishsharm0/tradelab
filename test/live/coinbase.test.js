import test from "node:test";
import assert from "node:assert/strict";

import { CoinbaseBroker } from "../../src/live/broker/coinbase.js";

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}

test("CoinbaseBroker builds auth header and maps responses", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/accounts")) {
      return response({
        accounts: [{ currency: "USD", available_balance: { value: "5000" } }],
      });
    }
    if (String(url).includes("/orders") && init.method === "POST") {
      return response({
        success_response: {
          order_id: "oid-1",
          status: "PENDING",
          filled_size: "0",
        },
      });
    }
    if (String(url).includes("/candles")) {
      return response({
        candles: [{ start: 1, low: 99, high: 101, open: 100, close: 100.5, volume: 1 }],
      });
    }
    return response({});
  };

  const broker = new CoinbaseBroker({ fetchImpl });
  await broker.connect({ apiKey: "k", apiSecret: "s" });
  const account = await broker.getAccount();
  assert.equal(account.equity, 5000);
  await broker.submitOrder({
    symbol: "BTC-USD",
    side: "buy",
    type: "market",
    qty: 0.1,
  });
  const bars = await broker.getHistoricalBars("BTC-USD", "1m", 1);
  assert.equal(bars.length, 1);
  const auth = calls[0].init.headers.Authorization;
  assert.match(auth, /^Bearer /);
});
