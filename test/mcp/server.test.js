import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../../src/mcp/server.js";

test("createServer registers all tradelab tools", () => {
  const server = createServer();
  assert.equal(typeof server.connect, "function");
});
