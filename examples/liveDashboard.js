// Run: node examples/liveDashboard.js
// Then open the printed URL.
import {
  LiveEngine,
  PaperEngine,
  JsonFileStorage,
  createDashboardServer,
} from "../src/live/index.js";

const engine = new LiveEngine({
  id: "aapl-1m",
  symbol: "AAPL",
  interval: "1m",
  mode: "polling",
  broker: new PaperEngine({ equity: 25_000 }),
  storage: new JsonFileStorage({ baseDir: "./output/live-state" }),
  signal({ bar, openPosition }) {
    if (openPosition) return null;
    return { side: "long", stop: bar.close - 1, rr: 2 };
  },
});

const dashboard = createDashboardServer({ source: engine });
const url = await dashboard.start();
console.log(`Dashboard running at ${url} - Ctrl+C to stop`);

await engine.start();

process.on("SIGINT", async () => {
  await engine.stop();
  await dashboard.close();
  process.exit(0);
});
