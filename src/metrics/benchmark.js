// src/metrics/benchmark.js

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/**
 * Ordinary least squares of strategy returns on benchmark returns.
 * Returns { alpha, beta, correlation, informationRatio, trackingError }.
 * `alpha` is per-period excess return (intercept). All null when inputs are
 * empty or length-mismatched.
 */
export function benchmarkStats(strategyReturns, benchmarkReturns) {
  const nullStats = {
    alpha: null,
    beta: null,
    correlation: null,
    informationRatio: null,
    trackingError: null,
  };
  if (
    !Array.isArray(strategyReturns) ||
    !Array.isArray(benchmarkReturns) ||
    strategyReturns.length === 0 ||
    strategyReturns.length !== benchmarkReturns.length
  ) {
    return nullStats;
  }

  const meanStrat = mean(strategyReturns);
  const meanBench = mean(benchmarkReturns);

  let covar = 0;
  let varBench = 0;
  let varStrat = 0;
  for (let i = 0; i < strategyReturns.length; i += 1) {
    const ds = strategyReturns[i] - meanStrat;
    const db = benchmarkReturns[i] - meanBench;
    covar += ds * db;
    varBench += db * db;
    varStrat += ds * ds;
  }

  const beta = varBench === 0 ? 0 : covar / varBench;
  const alpha = meanStrat - beta * meanBench;
  const denom = Math.sqrt(varStrat * varBench);
  const correlation = denom === 0 ? 0 : covar / denom;

  const active = strategyReturns.map((r, i) => r - benchmarkReturns[i]);
  const meanActive = mean(active);
  const trackingError = Math.sqrt(mean(active.map((a) => (a - meanActive) ** 2)));
  const informationRatio = trackingError === 0 ? 0 : meanActive / trackingError;

  return { alpha, beta, correlation, informationRatio, trackingError };
}
