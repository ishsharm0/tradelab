import test from "node:test";
import assert from "node:assert/strict";
import { combinatorialPurgedSplits } from "../../src/research/cpcv.js";

test("cpcv produces C(nGroups, nTestGroups) splits with disjoint train/test", () => {
  const splits = combinatorialPurgedSplits({
    nObservations: 100,
    nGroups: 6,
    nTestGroups: 2,
    embargo: 0,
  });
  assert.equal(splits.length, 15);
  for (const { train, test: testIdx } of splits) {
    const trainSet = new Set(train);
    for (const t of testIdx) assert.equal(trainSet.has(t), false);
  }
});

test("embargo removes train observations adjacent to test blocks", () => {
  const noEmbargo = combinatorialPurgedSplits({
    nObservations: 60,
    nGroups: 6,
    nTestGroups: 1,
    embargo: 0,
  });
  const withEmbargo = combinatorialPurgedSplits({
    nObservations: 60,
    nGroups: 6,
    nTestGroups: 1,
    embargo: 3,
  });
  assert.ok(withEmbargo[0].train.length <= noEmbargo[0].train.length);
});
