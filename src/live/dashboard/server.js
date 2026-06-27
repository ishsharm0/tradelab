import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FALLBACK_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>tradelab live</title>
  </head>
  <body>
    <h1>tradelab live</h1>
    <pre id="state"></pre>
    <script>
      fetch("/state")
        .then((res) => res.json())
        .then((state) => {
          document.getElementById("state").textContent = JSON.stringify(state, null, 2);
        });
    </script>
  </body>
</html>`;

function callerModuleDir() {
  const stack = new Error().stack || "";
  const lines = stack.split("\n").slice(1);
  const match = lines
    .map((line) => line.match(/(?:\()?(file:\/\/\/[^\s)]+|\/[^\s)]+):\d+:\d+/))
    .find(Boolean);
  if (!match) return process.cwd();
  const filePath = match[1].startsWith("file://") ? fileURLToPath(match[1]) : match[1];
  return path.dirname(filePath);
}

function readDashboardHtml() {
  const here = callerModuleDir();
  const candidates = [
    path.join(here, "..", "..", "..", "templates", "dashboard.html"),
    path.join(here, "..", "..", "templates", "dashboard.html"),
    path.join(process.cwd(), "templates", "dashboard.html"),
  ];
  const htmlPath = candidates.find((candidate) => existsSync(candidate));
  if (htmlPath) return readFileSync(htmlPath, "utf8");
  try {
    return readFileSync(path.join(process.cwd(), "templates", "dashboard.html"), "utf8");
  } catch {
    return FALLBACK_HTML;
  }
}

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
      res.end(readDashboardHtml());
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
