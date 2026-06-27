import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionManager } from "./live.d.ts";

export function createServer(): McpServer;
export function startStdioServer(): Promise<McpServer>;

export interface McpToolHandler {
  description: string;
  handler(args: Record<string, unknown>): Promise<unknown>;
}

export const mcpTools: Record<string, McpToolHandler>;
export const researchTools: Record<string, McpToolHandler>;
export const liveTools: Record<string, McpToolHandler>;

/** The shared SessionManager instance used by the MCP server process. */
export const sessionManager: SessionManager;
