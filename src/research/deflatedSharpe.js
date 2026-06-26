import { normalCdf, normalPpf } from "./stats.js";

const EULER_MASCHERONI = 0.5772156649015329;

/**
 * Expected maximum Sharpe under the null (no skill), given `numTrials`
 * independent strategy trials whose Sharpe estimates have std `sharpeStd`.
 */
export function sweepHaircut({ numTrials, sharpeStd }) {
  const N = Math.max(1, numTrials);
  const a = normalPpf(1 - 1 / N);
  const b = normalPpf(1 - 1 / (N * Math.E));
  const expectedMaxSharpe = sharpeStd * ((1 - EULER_MASCHERONI) * a + EULER_MASCHERONI * b);
  return { expectedMaxSharpe, numTrials: N };
}

/**
 * Deflated Sharpe Ratio: probability the observed `sharpe` is genuinely > 0
 * after accounting for strategy trials, non-normality, and finite sample size.
 */
export function deflatedSharpe({
  sharpe,
  sampleSize,
  numTrials = 1,
  sharpeStd = 0,
  skew = 0,
  kurtosis = 3,
}) {
  const sr0 = sweepHaircut({ numTrials, sharpeStd }).expectedMaxSharpe;
  const denom = Math.sqrt(
    Math.max(1e-12, 1 - skew * sharpe + ((kurtosis - 1) / 4) * sharpe * sharpe)
  );
  const z = ((sharpe - sr0) * Math.sqrt(Math.max(1, sampleSize - 1))) / denom;
  return normalCdf(z);
}
