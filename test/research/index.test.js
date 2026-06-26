import test from "node:test";
import assert from "node:assert/strict";
import { research } from "../../src/index.js";

test("research namespace exposes the full toolkit", () => {
  for (const fn of [
    "monteCarlo",
    "deflatedSharpe",
    "sweepHaircut",
    "probabilityOfBacktestOverfitting",
    "combinatorialPurgedSplits",
  ]) {
    assert.equal(typeof research[fn], "function", `missing research.${fn}`);
  }
});
