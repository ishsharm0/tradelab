import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function createServer(): McpServer;
export function startStdioServer(): Promise<McpServer>;
