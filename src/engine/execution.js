import { minutesET } from "../utils/time.js";

export function applyFill(
  price,
  side,
  { slippageBps = 0, feeBps = 0, kind = "market" } = {}
) {
  let effectiveSlippageBps = slippageBps;
  if (kind === "limit") effectiveSlippageBps *= 0.25;
  if (kind === "stop") effectiveSlippageBps *= 1.25;

  const slippage = (effectiveSlippageBps / 10000) * price;
  const filledPrice = side === "long" ? price + slippage : price - slippage;
  const feePerUnit = (feeBps / 10000) * Math.abs(filledPrice);
  return { price: filledPrice, fee: feePerUnit };
}

export function clampStop(marketPrice, proposedStop, side, oco) {
  const epsilon = (oco?.clampEpsBps ?? 0.25) / 10000;
  const epsilonAbs = marketPrice * epsilon;
  return side === "long"
    ? Math.min(proposedStop, marketPrice - epsilonAbs)
    : Math.max(proposedStop, marketPrice + epsilonAbs);
}

export function touchedLimit(side, limitPrice, bar, mode = "intrabar") {
  if (!bar || limitPrice === undefined || limitPrice === null) return false;
  if (mode === "close") {
    return side === "long"
      ? bar.close <= limitPrice
      : bar.close >= limitPrice;
  }
  return side === "long" ? bar.low <= limitPrice : bar.high >= limitPrice;
}

export function ocoExitCheck({
  side,
  stop,
  tp,
  bar,
  mode = "intrabar",
  tieBreak = "pessimistic",
}) {
  if (mode === "close") {
    const close = bar.close;
    if (side === "long") {
      if (close <= stop) return { hit: "SL", px: stop };
      if (close >= tp) return { hit: "TP", px: tp };
    } else {
      if (close >= stop) return { hit: "SL", px: stop };
      if (close <= tp) return { hit: "TP", px: tp };
    }
    return { hit: null, px: null };
  }

  const hitStop = side === "long" ? bar.low <= stop : bar.high >= stop;
  const hitTarget = side === "long" ? bar.high >= tp : bar.low <= tp;

  if (hitStop && hitTarget) {
    return tieBreak === "optimistic"
      ? { hit: "TP", px: tp }
      : { hit: "SL", px: stop };
  }

  if (hitStop) return { hit: "SL", px: stop };
  if (hitTarget) return { hit: "TP", px: tp };
  return { hit: null, px: null };
}

export function isEODBar(timeMs) {
  return minutesET(timeMs) >= 16 * 60;
}

export function roundStep(value, step = 0.001) {
  return Math.floor(value / step) * step;
}

export function estimateBarMs(candles) {
  if (candles.length >= 2) {
    const deltas = [];
    for (let index = 1; index < Math.min(candles.length, 500); index += 1) {
      const delta = candles[index].time - candles[index - 1].time;
      if (Number.isFinite(delta) && delta > 0) deltas.push(delta);
    }

    if (deltas.length) {
      deltas.sort((a, b) => a - b);
      const middle = Math.floor(deltas.length / 2);
      const median =
        deltas.length % 2
          ? deltas[middle]
          : (deltas[middle - 1] + deltas[middle]) / 2;
      return Math.max(60e3, Math.min(median, 60 * 60e3));
    }
  }
  return 5 * 60 * 1000;
}

export function dayKeyUTC(timeMs) {
  const date = new Date(timeMs);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function dayKeyET(timeMs) {
  const date = new Date(timeMs);
  const minutes = minutesET(timeMs);
  const hoursET = Math.floor(minutes / 60);
  const minutesETDay = minutes % 60;

  const anchor = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0)
  );
  const pseudoEtTime =
    anchor.getTime() + hoursET * 60 * 60 * 1000 + minutesETDay * 60 * 1000;
  return dayKeyUTC(pseudoEtTime);
}
