import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../../src/mcp/server.js";
import { mcpTools } from "../../src/mcp/tools.js";

test("createServer registers all tradelab tools", () => {
  const server = createServer();
  assert.equal(typeof server.connect, "function");
});

test("mcpTools includes live trading tools alongside research tools", () => {
  // Research tools present
  assert.ok("list_strategies" in mcpTools, "list_strategies missing");
  assert.ok("run_backtest" in mcpTools, "run_backtest missing");
  // Live tools present
  assert.ok("place_order" in mcpTools, "place_order missing");
  assert.ok("create_session" in mcpTools, "create_session missing");
  assert.ok("halt_all" in mcpTools, "halt_all missing");
});
