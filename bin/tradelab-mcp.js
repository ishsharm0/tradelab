#!/usr/bin/env node
import { startStdioServer } from "../src/mcp/server.js";

startStdioServer().catch((error) => {
  console.error("tradelab-mcp failed to start:", error);
  process.exit(1);
});
