// src/research/store.js
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_DIR = ".tradelab/research";

function fileFor(dir, id) {
  if (!/^[\w.-]+$/.test(String(id))) throw new Error(`invalid research id: ${id}`);
  return join(dir, `${id}.json`);
}

async function load(dir, id) {
  try {
    const raw = await readFile(fileFor(dir, id), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function save(dir, record) {
  await mkdir(dir, { recursive: true });
  await writeFile(fileFor(dir, record.id), JSON.stringify(record, null, 2));
  return record;
}

function bestSharpe(entries) {
  let best = null;
  for (const e of entries) {
    const s = e.metrics?.sharpe;
    if (Number.isFinite(s) && (best === null || s > best.sharpe)) best = { sharpe: s, params: e.params };
  }
  return best;
}

export function createResearchStore({ dir = DEFAULT_DIR } = {}) {
  return {
    async open(id, goal = "") {
      const existing = await load(dir, id);
      if (existing) return existing;
      const record = { id, goal, createdAt: new Date().toISOString(), closedAt: null, entries: [] };
      return save(dir, record);
    },
    async log(id, { hypothesis = "", params = {}, metrics = {}, verdict = null } = {}) {
      const record = (await load(dir, id)) || { id, goal: "", createdAt: new Date().toISOString(), closedAt: null, entries: [] };
      const entry = { at: new Date().toISOString(), hypothesis, params, metrics, verdict };
      record.entries.push(entry);
      await save(dir, record);
      return entry;
    },
    async recall(id, limit = 10) {
      const record = (await load(dir, id)) || { goal: "", entries: [] };
      const entries = record.entries.slice(-limit);
      const best = bestSharpe(record.entries);
      const flagged = record.entries.filter((e) => e.verdict?.overfit).length;
      const summary = record.entries.length
        ? `Best Sharpe so far: ${best ? best.sharpe.toFixed(2) : "n/a"}${best ? ` via ${JSON.stringify(best.params)}` : ""}. ${flagged} of ${record.entries.length} flagged overfit.`
        : "No entries logged yet.";
      return { goal: record.goal, entries, summary };
    },
    async close(id) {
      const record = (await load(dir, id)) || { id, goal: "", createdAt: new Date().toISOString(), entries: [] };
      record.closedAt = new Date().toISOString();
      return save(dir, record);
    },
  };
}
