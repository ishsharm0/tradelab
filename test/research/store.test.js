// test/research/store.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createResearchStore } from "../../src/research/store.js";

test("research store round-trips entries and synthesizes a summary", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tl-research-"));
  try {
    const store = createResearchStore({ dir });
    await store.open("r1", "find a robust BTC trend strategy");
    await store.log("r1", { hypothesis: "ema 10/30", params: { fast: 10, slow: 30 }, metrics: { sharpe: 0.8 }, verdict: { overfit: true } });
    await store.log("r1", { hypothesis: "ema 20/50", params: { fast: 20, slow: 50 }, metrics: { sharpe: 1.4 }, verdict: { overfit: false } });

    const recalled = await store.recall("r1");
    assert.equal(recalled.entries.length, 2);
    assert.match(recalled.summary, /1\.4/);
    assert.match(recalled.summary, /overfit/i);

    // persistence: a fresh store instance sees the same data
    const store2 = createResearchStore({ dir });
    const again = await store2.recall("r1");
    assert.equal(again.entries.length, 2);

    const closed = await store.close("r1");
    assert.ok(closed.closedAt);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
