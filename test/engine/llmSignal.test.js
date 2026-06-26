import test from "node:test";
import assert from "node:assert/strict";
import { LlmSignal } from "../../src/engine/llmSignal.js";

function ctx(index, candles) {
  return { index, bar: candles[index], candles: candles.slice(0, index + 1), equity: 10_000 };
}

test("LlmSignal caches by bar time so resolve runs once per bar", async () => {
  const candles = Array.from({ length: 5 }, (_, i) => ({
    time: i * 1000,
    close: 100 + i,
    high: 101 + i,
    low: 99 + i,
  }));
  let calls = 0;
  const sig = new LlmSignal({
    async resolve() {
      calls += 1;
      return { side: "long", stop: 99, rr: 2 };
    },
  });
  const c = ctx(2, candles);
  await sig.signal(c);
  await sig.signal(c);
  assert.equal(calls, 1);
  assert.equal(sig.log.length, 1);
  assert.equal(sig.log[0].index, 2);
});

test("LlmSignal records a timeout decision when the budget is exceeded", async () => {
  const candles = Array.from({ length: 3 }, (_, i) => ({
    time: i * 1000,
    close: 100,
    high: 101,
    low: 99,
  }));
  const sig = new LlmSignal({
    budgetMs: 5,
    onError: "skip",
    async resolve() {
      await new Promise((r) => setTimeout(r, 40));
      return { side: "long", stop: 99, rr: 2 };
    },
  });
  const out = await sig.signal(ctx(1, candles));
  assert.equal(out, null);
  assert.equal(sig.log[0].error.includes("budget"), true);
});

test("LlmSignal blocks lookahead access to future candles", async () => {
  const candles = Array.from({ length: 5 }, (_, i) => ({
    time: i * 1000,
    close: 100 + i,
    high: 101 + i,
    low: 99 + i,
  }));
  let leaked = false;
  const sig = new LlmSignal({
    async resolve({ candles: view, index }) {
      try {
        view[index + 1].close;
        leaked = true;
      } catch {
        leaked = false;
      }
      return null;
    },
  });
  await sig.signal(ctx(2, candles));
  assert.equal(leaked, false);
});
