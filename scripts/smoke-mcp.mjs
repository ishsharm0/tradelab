#!/usr/bin/env node
/**
 * MCP stdio smoke test for tradelab-mcp
 *
 * Spawns bin/tradelab-mcp.js, speaks MCP JSON-RPC over stdio:
 *   1. initialize
 *   2. tools/list   — asserts place_order (live) + run_backtest (research) present
 *   3. tools/call create_session (paper)
 *   4. tools/call list_sessions
 *
 * Exits 0 on success, non-zero on any assertion failure or timeout.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_BIN = path.resolve(__dirname, "../bin/tradelab-mcp.js");

// Hard kill after 15 s so the process never hangs CI
const TIMEOUT_MS = 15_000;
const timeout = setTimeout(() => {
  console.error("FAIL: smoke-mcp timed out after", TIMEOUT_MS, "ms");
  process.exit(2);
}, TIMEOUT_MS);
timeout.unref();

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

async function main() {
  // ── 1. Connect ──────────────────────────────────────────────────────────
  const transport = new StdioClientTransport({
    command: "node",
    args: [MCP_BIN],
  });

  const client = new Client({ name: "smoke-mcp-client", version: "1.0.0" }, { capabilities: {} });

  await client.connect(transport);
  console.log("✓ MCP stdio connection established");

  // ── 2. tools/list ───────────────────────────────────────────────────────
  const listResult = await client.listTools();
  const tools = listResult.tools ?? [];
  const toolNames = tools.map((t) => t.name).sort();

  console.log("\n── Registered tools ──────────────────────────────────────");
  for (const name of toolNames) {
    console.log(" ", name);
  }
  console.log("──────────────────────────────────────────────────────────");
  console.log(`Total: ${toolNames.length} tools\n`);

  assert(toolNames.includes("place_order"), "place_order (live tool) must be in tools/list");
  assert(toolNames.includes("run_backtest"), "run_backtest (research tool) must be in tools/list");
  console.log("✓ Both place_order (live) and run_backtest (research) are present");

  // ── 3. tools/call create_session ────────────────────────────────────────
  const sessionId = `smoke-${Date.now()}`;
  const createResult = await client.callTool({
    name: "create_session",
    arguments: {
      sessionId,
      symbol: "BTCUSDT",
      mode: "paper",
      equity: 10000,
    },
  });

  console.log("\n── create_session result ─────────────────────────────────");
  const createText = createResult.content?.[0]?.text ?? "";
  console.log(createText);
  console.log("──────────────────────────────────────────────────────────");

  assert(!createResult.isError, `create_session returned error: ${createText}`);
  const created = JSON.parse(createText);
  assert(created.id === sessionId, `session id mismatch: ${created.id} !== ${sessionId}`);
  assert(created.mode === "paper", `mode should be paper, got: ${created.mode}`);
  assert(created.symbol === "BTCUSDT", `symbol mismatch: ${created.symbol}`);
  assert(created.running === true, "session.running should be true");
  console.log("✓ create_session round-trip succeeded");

  // ── 4. tools/call list_sessions ─────────────────────────────────────────
  const listSessionsResult = await client.callTool({
    name: "list_sessions",
    arguments: {},
  });

  console.log("\n── list_sessions result ──────────────────────────────────");
  const listText = listSessionsResult.content?.[0]?.text ?? "";
  console.log(listText);
  console.log("──────────────────────────────────────────────────────────");

  assert(!listSessionsResult.isError, `list_sessions returned error: ${listText}`);
  const sessions = JSON.parse(listText);
  assert(Array.isArray(sessions), "list_sessions should return an array");
  const found = sessions.find((s) => s.id === sessionId);
  assert(found !== undefined, `session ${sessionId} not found in list_sessions result`);
  assert(found.symbol === "BTCUSDT", `expected BTCUSDT, got: ${found.symbol}`);
  console.log(`✓ list_sessions shows session "${sessionId}" with symbol BTCUSDT`);

  // ── Cleanup ──────────────────────────────────────────────────────────────
  await client.close();
  clearTimeout(timeout);

  console.log("\n✓ smoke-mcp PASS — agent round-trip (create_session → list_sessions) works");
}

main().catch((err) => {
  console.error("FAIL:", err.message ?? err);
  process.exit(1);
});
