import { combinations } from "./combinations.js";

function sharpeOf(returns) {
  const n = returns.length;
  if (n < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  let variance = 0;
  for (const r of returns) variance += (r - mean) ** 2;
  variance /= n - 1;
  const std = Math.sqrt(variance);
  if (std === 0) {
    if (mean > 0) return Infinity;
    if (mean < 0) return -Infinity;
    return 0;
  }
  return mean / std;
}

/**
 * Combinatorially-Symmetric Cross-Validation estimate of the Probability of
 * Backtest Overfitting (Bailey, Borwein, López de Prado, Zhu 2017).
 */
export function probabilityOfBacktestOverfitting(performanceMatrix, { groups = 16 } = {}) {
  const nStrategies = performanceMatrix.length;
  if (nStrategies < 2) throw new Error("PBO needs at least 2 strategies");
  const nObs = performanceMatrix[0].length;
  const S = Math.min(groups, nObs);
  if (S % 2 !== 0) throw new Error("groups must be even");

  const groupIdx = Array.from({ length: S }, () => []);
  for (let i = 0; i < nObs; i += 1) groupIdx[Math.floor((i * S) / nObs)].push(i);

  const isCombos = combinations(S, S / 2);
  const logits = [];
  let overfitCount = 0;

  for (const isGroups of isCombos) {
    const isSet = new Set(isGroups);
    const isIndices = [];
    const osIndices = [];
    for (let g = 0; g < S; g += 1) {
      (isSet.has(g) ? isIndices : osIndices).push(...groupIdx[g]);
    }

    const isScores = performanceMatrix.map((row) => sharpeOf(isIndices.map((i) => row[i])));
    const osScores = performanceMatrix.map((row) => sharpeOf(osIndices.map((i) => row[i])));

    let bestStrategy = 0;
    for (let s = 1; s < nStrategies; s += 1) {
      if (isScores[s] > isScores[bestStrategy]) bestStrategy = s;
    }

    const winnerOs = osScores[bestStrategy];
    let rank = 1;
    for (let s = 0; s < nStrategies; s += 1) {
      if (s !== bestStrategy && osScores[s] < winnerOs) rank += 1;
    }
    const relativeRank = rank / (nStrategies + 1);
    const logit = Math.log(relativeRank / (1 - relativeRank));
    logits.push(logit);
    if (relativeRank <= 0.5) overfitCount += 1;
  }

  return {
    pbo: overfitCount / isCombos.length,
    combos: isCombos.length,
    medianLogit: [...logits].sort((a, b) => a - b)[Math.floor(logits.length / 2)],
  };
}
