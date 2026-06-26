import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { EventBus } from "../../src/live/events.js";
import { createDashboardServer } from "../../src/live/dashboard/server.js";
import * as live from "../../src/live/index.js";

function get(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode, body }));
      })
      .on("error", reject);
  });
}

function makeSource() {
  const eventBus = new EventBus();
  return {
    eventBus,
    getStatus: () => ({ symbol: "AAPL", equity: 25_000, dayPnl: 120, openPosition: null }),
  };
}

test("/state returns the source status as JSON", async () => {
  const source = makeSource();
  const dash = createDashboardServer({ source, port: 0 });
  const url = await dash.start();
  const res = await get(`${url}/state`);
  assert.equal(res.status, 200);
  const parsed = JSON.parse(res.body);
  assert.equal(parsed.symbol, "AAPL");
  await dash.close();
});

test("/ serves the dashboard HTML", async () => {
  const source = makeSource();
  const dash = createDashboardServer({ source, port: 0 });
  const url = await dash.start();
  const res = await get(`${url}/`);
  assert.equal(res.status, 200);
  assert.ok(res.body.includes("tradelab"));
  await dash.close();
});

test("/events streams a bussed event as SSE", async () => {
  const source = makeSource();
  const dash = createDashboardServer({ source, port: 0 });
  const url = await dash.start();

  const received = await new Promise((resolve, reject) => {
    http.get(`${url}/events`, (res) => {
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        if (chunk.includes("position:opened")) resolve(chunk);
      });
      res.on("error", reject);
      setTimeout(() => source.eventBus.emitEvent("position:opened", { symbol: "AAPL" }), 20);
    });
  });

  assert.ok(received.startsWith("data:"));
  assert.ok(received.includes("position:opened"));
  await dash.close();
});

test("createDashboardServer is exported from tradelab/live", () => {
  assert.equal(typeof live.createDashboardServer, "function");
});
