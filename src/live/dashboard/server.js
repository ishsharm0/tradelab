import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.join(here, "..", "..", "..", "templates", "dashboard.html");
const HTML = readFileSync(HTML_PATH, "utf8");

/**
 * Local realtime dashboard for a LiveEngine or LiveOrchestrator.
 *
 * @param {object} opts
 * @param {{ eventBus: import("../events.js").EventBus, getStatus: Function }} opts.source
 * @param {number} [opts.port=4317] 0 picks an ephemeral port for tests
 * @param {number} [opts.maxBuffer=200] recent events replayed to new clients
 * @returns {{ start: () => Promise<string>, close: () => Promise<void>, server: http.Server }}
 */
export function createDashboardServer({ source, port = 4317, maxBuffer = 200 }) {
  if (!source?.eventBus || typeof source.eventBus.onAny !== "function") {
    throw new Error("dashboard source must expose an eventBus with onAny()");
  }

  const recent = [];
  const clients = new Set();

  const unsubscribe = source.eventBus.onAny(({ event, payload }) => {
    const msg = { event, payload, t: Date.now() };
    recent.push(msg);
    if (recent.length > maxBuffer) recent.shift();
    const frame = `data: ${JSON.stringify(msg)}\n\n`;
    for (const res of clients) res.write(frame);
  });

  const server = http.createServer((req, res) => {
    const url = (req.url || "/").split("?")[0];

    if (url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(HTML);
      return;
    }

    if (url === "/state") {
      const status = typeof source.getStatus === "function" ? source.getStatus() : {};
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(status));
      return;
    }

    if (url === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.flushHeaders();
      for (const msg of recent) res.write(`data: ${JSON.stringify(msg)}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });

  return {
    start() {
      return new Promise((resolve) => {
        server.listen(port, () => {
          const address = server.address();
          const actualPort = typeof address === "object" && address ? address.port : port;
          resolve(`http://localhost:${actualPort}`);
        });
      });
    },
    close() {
      unsubscribe();
      for (const res of clients) res.end();
      clients.clear();
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
    server,
  };
}
