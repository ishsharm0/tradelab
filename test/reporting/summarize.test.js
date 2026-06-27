// test/reporting/summarize.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize } from "../../src/reporting/summarize.js";

test("summarize produces a readable one-paragraph summary", () => {
  const text = summarize({
    trades: 23, winRate: 0.52, maxDrawdownPct: 8.1, totalReturnPct: 14.2, sharpe: 1.3,
  });
  assert.match(text, /23 trades/);
  assert.match(text, /52%/);
  assert.match(text, /8\.1%/);
  assert.doesNotMatch(text, /—/, "no em-dashes");
});

test("summarize appends an overfitting caveat when verdict says so", () => {
  const text = summarize(
    { trades: 5, winRate: 0.8, maxDrawdownPct: 3, totalReturnPct: 40, sharpe: 2.5 },
    { verdict: { overfit: true, note: "PBO high" } }
  );
  assert.match(text, /overfit/i);
});

test("summarize tolerates a sparse metrics object", () => {
  const text = summarize({ trades: 0 });
  assert.match(text, /0 trades/);
});
