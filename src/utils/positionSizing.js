function roundStep(value, step) {
  return Math.floor(value / step) * step;
}

let warnedNonPositiveEquity = false;

function warnNonPositiveEquity(equity) {
  if (warnedNonPositiveEquity) return;
  warnedNonPositiveEquity = true;
  console.warn(
    `[tradelab] calculatePositionSize() received non-positive equity (${equity}); returning size 0`
  );
}

export function calculatePositionSize({
  equity,
  entry,
  stop,
  riskFraction = 0.01,
  qtyStep = 0.001,
  minQty = 0.001,
  maxLeverage = 2,
}) {
  if (!Number.isFinite(equity) || equity <= 0) {
    warnNonPositiveEquity(equity);
    return 0;
  }

  const riskPerUnit = Math.abs(entry - stop);
  if (!Number.isFinite(riskPerUnit) || riskPerUnit <= 0) return 0;

  const maxRiskDollars = Math.max(0, equity * riskFraction);
  let quantity = maxRiskDollars / riskPerUnit;

  const leverageCapQty = (equity * maxLeverage) / Math.max(1e-12, Math.abs(entry));
  quantity = Math.min(quantity, leverageCapQty);
  quantity = roundStep(quantity, qtyStep);

  return quantity >= minQty ? quantity : 0;
}
