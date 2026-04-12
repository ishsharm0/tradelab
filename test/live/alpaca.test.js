import test from "node:test";
import assert from "node:assert/strict";

import { AlpacaBroker } from "../../src/live/broker/alpaca.js";

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}

test("AlpacaBroker maps account/orders and sends auth headers", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/v2/account")) {
      return response({ equity: "10000", buying_power: "8000", cash: "5000", currency: "USD" });
    }
    if (String(url).includes("/v2/orders")) {
      return response({
        id: "123",
        status: "new",
        filled_qty: "0",
        symbol: "AAPL",
        side: "buy",
        type: "limit",
        qty: "1",
      });
    }
    if (String(url).includes("/v2/stocks/AAPL/bars")) {
      return response({
        bars: [{ t: "2025-01-02T14:30:00Z", o: 100, h: 101, l: 99, c: 100.5, v: 1000 }],
      });
    }
    return response({});
  };

  const broker = new AlpacaBroker({ fetchImpl });
  await broker.connect({ apiKey: "k", apiSecret: "s", paper: true });
  const account = await broker.getAccount();
  assert.equal(account.equity, 10000);
  await broker.submitOrder({
    symbol: "AAPL",
    side: "buy",
    type: "limit",
    qty: 1,
    limitPrice: 100,
  });
  const bars = await broker.getHistoricalBars("AAPL", "1Min", 1);
  assert.equal(bars.length, 1);
  const authHeaders = calls[0].init.headers;
  assert.equal(authHeaders["APCA-API-KEY-ID"], "k");
  assert.equal(authHeaders["APCA-API-SECRET-KEY"], "s");
});
