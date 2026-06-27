// src/reporting/summarize.js

function pct(value, digits = 1) {
  return Number.isFinite(value) ? `${value.toFixed(digits)}%` : "n/a";
}

/**
 * Render a metrics object into one plain-English paragraph. Optionally append an
 * overfitting caveat from a research verdict. No em-dashes (house style).
 *
 * @param {object} metrics - Fields: trades, winRate, maxDrawdownPct, totalReturnPct, sharpe.
 * @param {{ verdict?: { overfit?: boolean, note?: string } }} [options]
 * @returns {string}
 */
export function summarize(metrics = {}, { verdict } = {}) {
  const trades = Number.isFinite(metrics.trades) ? metrics.trades : 0;
  const win = Number.isFinite(metrics.winRate) ? Math.round(metrics.winRate * 100) : null;
  const dd = Number.isFinite(metrics.maxDrawdownPct)
    ? metrics.maxDrawdownPct
    : Number.isFinite(metrics.maxDrawdown)
      ? metrics.maxDrawdown * 100
      : null;
  const ret = Number.isFinite(metrics.totalReturnPct) ? metrics.totalReturnPct : null;
  const sharpe = Number.isFinite(metrics.sharpe) ? metrics.sharpe : null;

  if (trades === 0) return "Ran with 0 trades, so there is nothing to evaluate yet.";

  const parts = [`Made ${trades} trades`];
  if (win !== null) parts.push(`won ${win}% of them`);
  if (ret !== null) parts.push(`for a ${pct(ret)} total return`);
  if (dd !== null) parts.push(`with a worst drawdown of ${pct(dd)}`);

  let text = parts.join(", ");
  if (sharpe !== null) {
    text += ` (Sharpe ${sharpe.toFixed(2)})`;
  }
  text += ".";

  if (verdict && verdict.overfit) {
    text += ` Caution: robustness checks flag this result as likely overfit${verdict.note ? ` (${verdict.note})` : ""}.`;
  }
  return text;
}
