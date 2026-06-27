import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { researchTools } from "../../src/mcp/researchSession.js";

test("research_open/log/recall/close round-trip via MCP tools", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tl-rs-"));
  try {
    const tools = researchTools({ dir });
    await tools.research_open.handler({ id: "x", goal: "test" });
    await tools.research_log.handler({ id: "x", hypothesis: "h", params: { a: 1 }, metrics: { sharpe: 1.1 } });
    const recalled = await tools.research_recall.handler({ id: "x" });
    assert.equal(recalled.entries.length, 1);
    const closed = await tools.research_close.handler({ id: "x" });
    assert.ok(closed.closedAt);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
