import test from "node:test";
import assert from "node:assert/strict";

import { fetchHistorical } from "../src/index.js";

test("fetchHistorical accepts month-style periods and normalizes Yahoo data", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = null;

  globalThis.fetch = async (url) => {
    capturedUrl = String(url);
    return {
      ok: true,
      async json() {
        return {
          chart: {
            result: [
              {
                timestamp: [1735828200, 1735914600],
                indicators: {
                  quote: [
                    {
                      open: [100, 101],
                      high: [102, 103],
                      low: [99, 100],
                      close: [101, 102],
                      volume: [1000, 1100],
                    },
                  ],
                },
              },
            ],
          },
        };
      },
      async text() {
        return "";
      },
    };
  };

  try {
    const candles = await fetchHistorical("SPY", "1d", "6mo");
    assert.equal(candles.length, 2);
    assert.match(capturedUrl, /interval=1d/);
    assert.equal(candles[0].time, 1735828200 * 1000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
