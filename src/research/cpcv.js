import { combinations } from "./combinations.js";

/**
 * Combinatorial Purged Cross-Validation index splits.
 *
 * Splits [0..nObservations) into `nGroups` contiguous blocks, then forms every
 * combination choosing `nTestGroups` blocks as the test set. Training indices
 * that fall within `embargo` observations of any test block are purged.
 */
export function combinatorialPurgedSplits({
  nObservations,
  nGroups = 6,
  nTestGroups = 2,
  embargo = 0,
}) {
  if (!(nObservations > 0)) throw new Error("nObservations must be positive");
  if (nTestGroups >= nGroups) throw new Error("nTestGroups must be < nGroups");

  const bounds = [];
  for (let g = 0; g < nGroups; g += 1) {
    bounds.push([
      Math.floor((g * nObservations) / nGroups),
      Math.floor(((g + 1) * nObservations) / nGroups),
    ]);
  }

  const splits = [];
  for (const testGroups of combinations(nGroups, nTestGroups)) {
    const testSet = new Set();
    const purgeZones = [];
    for (const g of testGroups) {
      const [start, end] = bounds[g];
      for (let i = start; i < end; i += 1) testSet.add(i);
      purgeZones.push([start - embargo, end + embargo]);
    }
    const inPurge = (i) => purgeZones.some(([lo, hi]) => i >= lo && i < hi);

    const train = [];
    const testIdx = [];
    for (let i = 0; i < nObservations; i += 1) {
      if (testSet.has(i)) testIdx.push(i);
      else if (!inPurge(i)) train.push(i);
    }
    splits.push({ train, test: testIdx, testGroups });
  }
  return splits;
}
