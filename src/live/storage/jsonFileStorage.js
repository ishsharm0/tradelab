import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { StorageProvider } from "./interface.js";

function sanitizeNamespace(namespace) {
  return String(namespace || "default").replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function readJsonFile(filePath) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomic(filePath, payload) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random()
    .toString(16)
    .slice(2)}.tmp`;
  await fsp.writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf8");
  await fsp.rename(tmpPath, filePath);
}

async function appendJsonLine(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fsp.appendFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

async function readJsonLines(filePath) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

/**
 * Zero-dependency JSON state storage.
 */
export class JsonFileStorage extends StorageProvider {
  constructor({ baseDir = path.resolve(process.cwd(), "output/live-state") } = {}) {
    super();
    this.baseDir = baseDir;
  }

  namespaceDir(namespace) {
    return path.join(this.baseDir, sanitizeNamespace(namespace));
  }

  statePath(namespace) {
    return path.join(this.namespaceDir(namespace), "state.json");
  }

  tradesPath(namespace) {
    return path.join(this.namespaceDir(namespace), "trades.jsonl");
  }

  equityPath(namespace) {
    return path.join(this.namespaceDir(namespace), "equity.jsonl");
  }

  async load(namespace) {
    return readJsonFile(this.statePath(namespace));
  }

  async save(namespace, state) {
    const dir = this.namespaceDir(namespace);
    await ensureDir(dir);
    await writeJsonAtomic(this.statePath(namespace), state);
  }

  async appendTrade(namespace, trade) {
    await appendJsonLine(this.tradesPath(namespace), trade);
  }

  async appendEquityPoint(namespace, point) {
    await appendJsonLine(this.equityPath(namespace), point);
  }

  async loadTrades(namespace) {
    return readJsonLines(this.tradesPath(namespace));
  }

  async loadEquityCurve(namespace) {
    return readJsonLines(this.equityPath(namespace));
  }

  async clear(namespace) {
    const dir = this.namespaceDir(namespace);
    if (!fs.existsSync(dir)) return;
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

export function createJsonFileStorage(options) {
  return new JsonFileStorage(options);
}
