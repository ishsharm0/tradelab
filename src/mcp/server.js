import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpTools } from "./tools.js";
import { schemas } from "./schemas.js";

const _require = createRequire(import.meta.url);
const { version } = _require("../../package.json");

/** Build (but do not start) an McpServer with all tradelab tools registered. */
export function createServer() {
  const server = new McpServer({ name: "tradelab", version });

  for (const [name, def] of Object.entries(mcpTools)) {
    server.tool(name, def.description, schemas[name] ?? {}, async (args) => {
      try {
        const result = await def.handler(args ?? {});
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { isError: true, content: [{ type: "text", text: `Error: ${message}` }] };
      }
    });
  }

  return server;
}

/** Start the server on stdio. Called by bin/tradelab-mcp.js. */
export async function startStdioServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
