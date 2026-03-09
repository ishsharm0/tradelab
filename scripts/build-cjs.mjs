import { build } from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");
const outDir = path.join(rootDir, "dist", "cjs");

fs.mkdirSync(outDir, { recursive: true });

const shared = {
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: false,
  logLevel: "info",
};

await build({
  ...shared,
  entryPoints: [path.join(rootDir, "src", "index.js")],
  outfile: path.join(outDir, "index.cjs"),
});

await build({
  ...shared,
  entryPoints: [path.join(rootDir, "src", "data", "index.js")],
  outfile: path.join(outDir, "data.cjs"),
});
