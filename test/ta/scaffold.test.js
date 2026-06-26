// test/ta/scaffold.test.js
import test from "node:test";
import assert from "node:assert/strict";
import * as ta from "../../src/ta/index.js";

test("ta namespace re-exports existing ema and atr", () => {
  assert.equal(typeof ta.ema, "function");
  assert.equal(typeof ta.atr, "function");
});
