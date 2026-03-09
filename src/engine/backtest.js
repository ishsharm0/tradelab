import { atr } from "../utils/indicators.js";
import { calculatePositionSize } from "../utils/positionSizing.js";
import { buildMetrics } from "../metrics/buildMetrics.js";
import { normalizeCandles } from "../data/csv.js";
import {
  applyFill,
  clampStop,
  touchedLimit,
  ocoExitCheck,
  isEODBar,
  roundStep,
  estimateBarMs,
  dayKeyUTC,
  dayKeyET,
} from "./execution.js";

function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function mergeOptions(options) {
  const normalizedRiskPct = Number.isFinite(options.riskFraction)
    ? options.riskFraction * 100
    : options.riskPct;

  return {
    candles: normalizeCandles(options.candles ?? []),
    symbol: options.symbol ?? "UNKNOWN",
    equity: options.equity ?? 10_000,
    riskPct: normalizedRiskPct ?? 1,
    signal: options.signal,
    interval: options.interval,
    range: options.range,
    warmupBars: options.warmupBars ?? 200,
    slippageBps: options.slippageBps ?? 1,
    feeBps: options.feeBps ?? 0,
    scaleOutAtR: options.scaleOutAtR ?? 1,
    scaleOutFrac: options.scaleOutFrac ?? 0.5,
    finalTP_R: options.finalTP_R ?? 3,
    maxDailyLossPct: options.maxDailyLossPct ?? 2,
    atrTrailMult: options.atrTrailMult ?? 0,
    atrTrailPeriod: options.atrTrailPeriod ?? 14,
    oco: {
      mode: "intrabar",
      tieBreak: "pessimistic",
      clampStops: true,
      clampEpsBps: 0.25,
      ...(options.oco || {}),
    },
    triggerMode: options.triggerMode,
    flattenAtClose: options.flattenAtClose ?? true,
    dailyMaxTrades: options.dailyMaxTrades ?? 0,
    postLossCooldownBars: options.postLossCooldownBars ?? 0,
    mfeTrail: {
      enabled: false,
      armR: 1,
      givebackR: 0.5,
      ...(options.mfeTrail || {}),
    },
    pyramiding: {
      enabled: false,
      addAtR: 1,
      addFrac: 0.25,
      maxAdds: 1,
      onlyAfterBreakEven: true,
      ...(options.pyramiding || {}),
    },
    volScale: {
      enabled: false,
      atrPeriod: options.atrTrailPeriod ?? 14,
      cutIfAtrX: 1.3,
      cutFrac: 0.33,
      noCutAboveR: 1.5,
      ...(options.volScale || {}),
    },
    qtyStep: options.qtyStep ?? 0.001,
    minQty: options.minQty ?? 0.001,
    maxLeverage: options.maxLeverage ?? 2,
    entryChase: {
      enabled: true,
      afterBars: 2,
      maxSlipR: 0.2,
      convertOnExpiry: false,
      ...(options.entryChase || {}),
    },
    reanchorStopOnFill: options.reanchorStopOnFill ?? true,
    maxSlipROnFill: options.maxSlipROnFill ?? 0.4,
    collectEqSeries: options.collectEqSeries ?? true,
    collectReplay: options.collectReplay ?? true,
  };
}

function normalizeSide(value) {
  if (value === "long" || value === "buy") return "long";
  if (value === "short" || value === "sell") return "short";
  return null;
}

function normalizeSignal(signal, bar, fallbackR) {
  if (!signal) return null;

  const side = normalizeSide(signal.side ?? signal.direction ?? signal.action);
  if (!side) return null;

  const entry =
    asNumber(signal.entry ?? signal.limit ?? signal.price) ?? asNumber(bar?.close);
  const stop = asNumber(signal.stop ?? signal.stopLoss ?? signal.sl);
  if (entry === null || stop === null) return null;

  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return null;

  let takeProfit = asNumber(signal.takeProfit ?? signal.target ?? signal.tp);
  const rrHint = asNumber(signal._rr ?? signal.rr);
  const targetR = rrHint ?? fallbackR;

  if (takeProfit === null && Number.isFinite(targetR) && targetR > 0) {
    takeProfit =
      side === "long" ? entry + risk * targetR : entry - risk * targetR;
  }
  if (takeProfit === null) return null;

  return {
    ...signal,
    side,
    entry,
    stop,
    takeProfit,
    qty: asNumber(signal.qty ?? signal.size),
    riskPct: asNumber(signal.riskPct),
    riskFraction: asNumber(signal.riskFraction),
    _rr: rrHint ?? signal._rr,
    _initRisk: asNumber(signal._initRisk) ?? signal._initRisk,
  };
}

export function backtest(rawOptions) {
  const options = mergeOptions(rawOptions || {});
  const {
    candles,
    symbol,
    equity,
    riskPct,
    signal,
    slippageBps,
    feeBps,
    scaleOutAtR,
    scaleOutFrac,
    finalTP_R,
    maxDailyLossPct,
    atrTrailMult,
    atrTrailPeriod,
    oco,
    triggerMode,
    flattenAtClose,
    dailyMaxTrades,
    postLossCooldownBars,
    mfeTrail,
    pyramiding,
    volScale,
    qtyStep,
    minQty,
    maxLeverage,
    entryChase,
    reanchorStopOnFill,
    maxSlipROnFill,
    collectEqSeries,
    collectReplay,
    warmupBars,
  } = options;

  if (!Array.isArray(candles) || candles.length === 0) {
    throw new Error("backtest() requires a non-empty candles array");
  }

  if (typeof signal !== "function") {
    throw new Error("backtest() requires a signal function");
  }

  const closed = [];
  let currentEquity = equity;
  let open = null;
  let cooldown = 0;
  let pending = null;

  let currentDay = null;
  let dayPnl = 0;
  let dayTrades = 0;
  let dayEquityStart = equity;

  const wantReplay = Boolean(collectReplay);
  const wantEqSeries = Boolean(collectEqSeries);
  const estimatedBarMs = estimateBarMs(candles);
  const atrSourcePeriod = volScale.enabled ? volScale.atrPeriod : atrTrailPeriod;
  const needAtr = atrTrailMult > 0 || volScale.enabled;
  const atrValues = needAtr ? atr(candles, atrSourcePeriod) : null;

  const eqSeries = wantEqSeries ? [{ time: candles[0].time, equity: currentEquity }] : [];
  const replayFrames = wantReplay ? [] : [];
  const replayEvents = wantReplay ? [] : [];
  let tradeIdCounter = 0;

  const useVolScale = Boolean(volScale.enabled);
  const useAtrTrail = atrTrailMult > 0;
  const useMfeTrail = Boolean(mfeTrail.enabled);
  const usePyramiding = Boolean(pyramiding.enabled);
  const trigger = triggerMode || oco.mode || "intrabar";

  function recordFrame(bar) {
    if (wantEqSeries) {
      eqSeries.push({ time: bar.time, equity: currentEquity });
    }

    if (wantReplay) {
      replayFrames.push({
        t: new Date(bar.time).toISOString(),
        price: bar.close,
        equity: currentEquity,
        posSide: open ? open.side : null,
        posSize: open ? open.size : 0,
      });
    }
  }

  function closeLeg({ openPos, qty, exitPx, exitFeePerUnit, time, reason }) {
    const direction = openPos.side === "long" ? 1 : -1;
    const entryFill = openPos.entryFill;
    const grossPnl = (exitPx - entryFill) * direction * qty;
    const entryFeePortion =
      (openPos.entryFeeTotal || 0) * (qty / openPos.initSize);
    const exitFeeTotal = exitFeePerUnit * qty;
    const pnl = grossPnl - entryFeePortion - exitFeeTotal;

    currentEquity += pnl;
    dayPnl += pnl;

    if (wantEqSeries) {
      eqSeries.push({ time, equity: currentEquity });
    }

    const remaining = openPos.size - qty;
    const eventType =
      reason === "SCALE"
        ? "scale-out"
        : reason === "TP"
        ? "tp"
        : reason === "SL"
        ? "sl"
        : reason === "EOD"
        ? "eod"
        : remaining <= 0
        ? "exit"
        : "scale-out";

    if (wantReplay) {
      replayEvents.push({
        t: new Date(time).toISOString(),
        price: exitPx,
        type: eventType,
        side: openPos.side,
        size: qty,
        tradeId: openPos.id,
        reason,
        pnl,
      });
    }

    const record = {
      ...openPos,
      size: qty,
      exit: {
        price: exitPx,
        time,
        reason,
        pnl,
        exitATR: openPos._lastATR ?? undefined,
      },
      mfeR: openPos._mfeR ?? 0,
      maeR: openPos._maeR ?? 0,
      adds: openPos._adds ?? 0,
    };

    closed.push(record);
    openPos.size -= qty;
    openPos._realized = (openPos._realized || 0) + pnl;
    return record;
  }

  function tightenStopToNetBreakeven(openPos, lastClose) {
    if (!openPos || openPos.size <= 0) return;
    const realized = openPos._realized || 0;
    if (realized <= 0) return;

    const direction = openPos.side === "long" ? 1 : -1;
    const breakevenDelta = Math.abs(realized / openPos.size);
    const breakevenPrice =
      direction === 1
        ? openPos.entryFill - breakevenDelta
        : openPos.entryFill + breakevenDelta;

    const tightened =
      direction === 1
        ? Math.max(openPos.stop, breakevenPrice)
        : Math.min(openPos.stop, breakevenPrice);

    openPos.stop = oco.clampStops
      ? clampStop(lastClose, tightened, openPos.side, oco)
      : tightened;
  }

  function forceExit(reason, bar) {
    if (!open) return;

    const exitSide = open.side === "long" ? "short" : "long";
    const { price: filled, fee: exitFee } = applyFill(bar.close, exitSide, {
      slippageBps,
      feeBps,
      kind: "market",
    });

    closeLeg({
      openPos: open,
      qty: open.size,
      exitPx: filled,
      exitFeePerUnit: exitFee,
      time: bar.time,
      reason,
    });

    cooldown = open._cooldownBars || 0;
    open = null;
  }

  function openFromPending(bar, index, entryPrice, fillKind = "limit") {
    if (!pending) return false;

    const plannedRisk = Math.max(
      1e-8,
      pending.plannedRiskAbs ?? Math.abs(pending.entry - pending.stop)
    );
    const slipR = Math.abs(entryPrice - pending.entry) / plannedRisk;
    if (slipR > maxSlipROnFill) return false;

    let stopPrice = pending.stop;
    if (reanchorStopOnFill) {
      const direction = pending.side === "long" ? 1 : -1;
      stopPrice =
        direction === 1
          ? entryPrice - plannedRisk
          : entryPrice + plannedRisk;
    }

    let takeProfit = pending.tp;
    const immediateRisk = Math.abs(entryPrice - stopPrice) || 1e-8;
    const rrHint = pending.meta?._rr;

    if (reanchorStopOnFill && Number.isFinite(rrHint)) {
      const plannedTarget =
        pending.side === "long"
          ? pending.entry + rrHint * plannedRisk
          : pending.entry - rrHint * plannedRisk;
      const closeEnough =
        Math.abs((pending.tp ?? plannedTarget) - plannedTarget) <=
        Math.max(1e-8, plannedRisk * 1e-6);

      if (closeEnough) {
        takeProfit =
          pending.side === "long"
            ? entryPrice + rrHint * immediateRisk
            : entryPrice - rrHint * immediateRisk;
      }
    }

    const rawSize =
      pending.fixedQty ??
      calculatePositionSize({
        equity: currentEquity,
        entry: entryPrice,
        stop: stopPrice,
        riskFraction: pending.riskFrac,
        qtyStep,
        minQty,
        maxLeverage,
      });
    const size = roundStep(rawSize, qtyStep);
    if (size < minQty) return false;

    const { price: entryFill, fee: entryFee } = applyFill(
      entryPrice,
      pending.side,
      {
        slippageBps,
        feeBps,
        kind: fillKind,
      }
    );

    open = {
      symbol,
      ...pending.meta,
      id: ++tradeIdCounter,
      side: pending.side,
      entry: entryPrice,
      stop: stopPrice,
      takeProfit,
      size,
      openTime: bar.time,
      entryFill,
      entryFeeTotal: entryFee * size,
      initSize: size,
      baseSize: size,
      _mfeR: 0,
      _maeR: 0,
      _adds: 0,
      _initRisk: Math.abs(entryPrice - stopPrice) || 1e-8,
    };

    if (atrValues && atrValues[index] !== undefined) {
      open.entryATR = atrValues[index];
      open._lastATR = atrValues[index];
    }

    dayTrades += 1;
    pending = null;

    if (wantReplay) {
      replayEvents.push({
        t: new Date(bar.time).toISOString(),
        price: entryFill,
        type: "entry",
        side: open.side,
        size,
        tradeId: open.id,
      });
    }

    return true;
  }

  const startIndex = Math.min(Math.max(1, warmupBars), candles.length);
  const history = candles.slice(0, startIndex);

  for (let index = startIndex; index < candles.length; index += 1) {
    const bar = candles[index];
    history.push(bar);

    const dayKey =
      flattenAtClose || trigger === "close"
        ? dayKeyET(bar.time)
        : dayKeyUTC(bar.time);
    if (currentDay === null || dayKey !== currentDay) {
      currentDay = dayKey;
      dayPnl = 0;
      dayTrades = 0;
      dayEquityStart = currentEquity;
    }

    if (open && open._maxBarsInTrade > 0) {
      const barsHeld = Math.max(
        1,
        Math.round((bar.time - open.openTime) / estimatedBarMs)
      );
      if (barsHeld >= open._maxBarsInTrade) {
        forceExit("TIME", bar);
      }
    }

    if (open && Number.isFinite(open._maxHoldMin) && open._maxHoldMin > 0) {
      const heldMinutes = (bar.time - open.openTime) / 60000;
      if (heldMinutes >= open._maxHoldMin) {
        forceExit("TIME", bar);
      }
    }

    if (flattenAtClose && open && isEODBar(bar.time)) {
      forceExit("EOD", bar);
    }

    if (open) {
      const direction = open.side === "long" ? 1 : -1;
      const risk = open._initRisk || 1e-8;
      const highR =
        open.side === "long"
          ? (bar.high - open.entry) / risk
          : (open.entry - bar.low) / risk;
      const lowR =
        open.side === "long"
          ? (bar.low - open.entry) / risk
          : (open.entry - bar.high) / risk;
      const markR =
        direction === 1
          ? (bar.close - open.entry) / risk
          : (open.entry - bar.close) / risk;

      if (atrValues && atrValues[index] !== undefined) {
        open._lastATR = atrValues[index];
      }

      open._mfeR = Math.max(open._mfeR ?? -Infinity, highR);
      open._maeR = Math.min(open._maeR ?? Infinity, lowR);

      if (open._breakevenAtR > 0 && highR >= open._breakevenAtR && !open._beArmed) {
        const tightened =
          open.side === "long"
            ? Math.max(open.stop, open.entry)
            : Math.min(open.stop, open.entry);
        open.stop = oco.clampStops
          ? clampStop(bar.close, tightened, open.side, oco)
          : tightened;
        open._beArmed = true;
      }

      if (open._trailAfterR > 0 && highR >= open._trailAfterR) {
        const candidate =
          open.side === "long" ? bar.close - risk : bar.close + risk;
        const tightened =
          open.side === "long"
            ? Math.max(open.stop, candidate)
            : Math.min(open.stop, candidate);
        open.stop = oco.clampStops
          ? clampStop(bar.close, tightened, open.side, oco)
          : tightened;
      }

      if (useMfeTrail && open._mfeR >= mfeTrail.armR) {
        const targetR = Math.max(0, open._mfeR - Math.max(0, mfeTrail.givebackR));
        const candidate =
          open.side === "long"
            ? open.entry + targetR * risk
            : open.entry - targetR * risk;
        const tightened =
          open.side === "long"
            ? Math.max(open.stop, candidate)
            : Math.min(open.stop, candidate);
        open.stop = oco.clampStops
          ? clampStop(bar.close, tightened, open.side, oco)
          : tightened;
      }

      if (useAtrTrail && atrValues && atrValues[index] !== undefined) {
        const trailDistance = atrValues[index] * atrTrailMult;
        const candidate =
          open.side === "long"
            ? bar.close - trailDistance
            : bar.close + trailDistance;
        const tightened =
          open.side === "long"
            ? Math.max(open.stop, candidate)
            : Math.min(open.stop, candidate);
        open.stop = oco.clampStops
          ? clampStop(bar.close, tightened, open.side, oco)
          : tightened;
      }

      if (
        useVolScale &&
        open.entryATR &&
        open.size > minQty &&
        atrValues &&
        atrValues[index] !== undefined
      ) {
        const ratio = atrValues[index] / Math.max(1e-12, open.entryATR);
        const shouldCut =
          ratio >= volScale.cutIfAtrX &&
          markR < volScale.noCutAboveR &&
          !open._volCutDone;

        if (shouldCut) {
          const cutQty = roundStep(open.size * volScale.cutFrac, qtyStep);
          if (cutQty >= minQty && cutQty < open.size) {
            const exitSide = open.side === "long" ? "short" : "long";
            const { price: filled, fee: exitFee } = applyFill(
              bar.close,
              exitSide,
              { slippageBps, feeBps, kind: "market" }
            );
            closeLeg({
              openPos: open,
              qty: cutQty,
              exitPx: filled,
              exitFeePerUnit: exitFee,
              time: bar.time,
              reason: "SCALE",
            });
            tightenStopToNetBreakeven(open, bar.close);
            open._volCutDone = true;
          }
        }
      }

      let addedThisBar = false;
      if (usePyramiding && (open._adds ?? 0) < pyramiding.maxAdds) {
        const addNumber = (open._adds || 0) + 1;
        const triggerR = pyramiding.addAtR * addNumber;
        const triggerPrice =
          open.side === "long"
            ? open.entry + triggerR * risk
            : open.entry - triggerR * risk;
        const breakEvenSatisfied =
          !pyramiding.onlyAfterBreakEven ||
          (open.side === "long" && open.stop >= open.entry) ||
          (open.side === "short" && open.stop <= open.entry);
        const touched =
          open.side === "long"
            ? trigger === "intrabar"
              ? bar.high >= triggerPrice
              : bar.close >= triggerPrice
            : trigger === "intrabar"
            ? bar.low <= triggerPrice
            : bar.close <= triggerPrice;

        if (breakEvenSatisfied && touched) {
          const baseSize = open.baseSize || open.initSize;
          const addQty = roundStep(baseSize * pyramiding.addFrac, qtyStep);
          if (addQty >= minQty) {
            const { price: addFill, fee: addFee } = applyFill(
              triggerPrice,
              open.side,
              { slippageBps, feeBps, kind: "limit" }
            );
            const newSize = open.size + addQty;
            open.entryFeeTotal += addFee * addQty;
            open.entryFill =
              (open.entryFill * open.size + addFill * addQty) / newSize;
            open.size = newSize;
            open.initSize += addQty;
            if (!open.baseSize) open.baseSize = baseSize;
            open._adds = addNumber;
            addedThisBar = true;
          }
        }
      }

      if (!addedThisBar && !open._scaled && scaleOutAtR > 0) {
        const triggerPrice =
          open.side === "long"
            ? open.entry + scaleOutAtR * risk
            : open.entry - scaleOutAtR * risk;
        const touched =
          open.side === "long"
            ? trigger === "intrabar"
              ? bar.high >= triggerPrice
              : bar.close >= triggerPrice
            : trigger === "intrabar"
            ? bar.low <= triggerPrice
            : bar.close <= triggerPrice;

        if (touched) {
          const exitSide = open.side === "long" ? "short" : "long";
          const { price: filled, fee: exitFee } = applyFill(triggerPrice, exitSide, {
            slippageBps,
            feeBps,
            kind: "limit",
          });
          const qty = roundStep(open.size * scaleOutFrac, qtyStep);
          if (qty >= minQty && qty < open.size) {
            closeLeg({
              openPos: open,
              qty,
              exitPx: filled,
              exitFeePerUnit: exitFee,
              time: bar.time,
              reason: "SCALE",
            });
            open._scaled = true;
            open.takeProfit =
              open.side === "long"
                ? open.entry + finalTP_R * risk
                : open.entry - finalTP_R * risk;
            tightenStopToNetBreakeven(open, bar.close);
            open._beArmed = true;
          }
        }
      }

      const exitSide = open.side === "long" ? "short" : "long";
      const { hit, px } = ocoExitCheck({
        side: open.side,
        stop: open.stop,
        tp: open.takeProfit,
        bar,
        mode: oco.mode,
        tieBreak: oco.tieBreak,
      });

      if (hit) {
        const exitKind = hit === "TP" ? "limit" : "stop";
        const { price: filled, fee: exitFee } = applyFill(px, exitSide, {
          slippageBps,
          feeBps,
          kind: exitKind,
        });
        const localCooldown = open._cooldownBars || 0;
        closeLeg({
          openPos: open,
          qty: open.size,
          exitPx: filled,
          exitFeePerUnit: exitFee,
          time: bar.time,
          reason: hit,
        });
        cooldown =
          (hit === "SL"
            ? Math.max(cooldown, postLossCooldownBars)
            : cooldown) || localCooldown;
        open = null;
      }
    }

    const maxLossDollars = (maxDailyLossPct / 100) * dayEquityStart;
    const dailyLossHit = dayPnl <= -Math.abs(maxLossDollars);
    const dailyTradeCapHit = dailyMaxTrades > 0 && dayTrades >= dailyMaxTrades;

    if (!open && pending) {
      if (index > pending.expiresAt || dailyLossHit || dailyTradeCapHit) {
        if (entryChase.enabled && entryChase.convertOnExpiry) {
          const riskAtEdge = Math.abs(
            pending.meta._initRisk ?? (pending.entry - pending.stop)
          );
          const priceNow = bar.close;
          const direction = pending.side === "long" ? 1 : -1;
          const slippedR =
            Math.max(
              0,
              direction === 1 ? priceNow - pending.entry : pending.entry - priceNow
            ) / Math.max(1e-8, riskAtEdge);

          if (slippedR > maxSlipROnFill) {
            pending = null;
          } else if (!openFromPending(bar, index, priceNow, "market")) {
            pending = null;
          }
        } else {
          pending = null;
        }
      } else if (touchedLimit(pending.side, pending.entry, bar, trigger)) {
        if (!openFromPending(bar, index, pending.entry, "limit")) {
          pending = null;
        }
      } else if (entryChase.enabled) {
        const elapsedBars = index - (pending.startedAtIndex ?? index);
        const midpoint = pending.meta?._imb?.mid;

        if (!pending._chasedCE && midpoint !== undefined && elapsedBars >= Math.max(1, entryChase.afterBars)) {
          pending.entry = midpoint;
          pending._chasedCE = true;
        }

        if (pending._chasedCE) {
          const riskRef = Math.abs(
            pending.meta?._initRisk ?? (pending.entry - pending.stop)
          );
          const priceNow = bar.close;
          const direction = pending.side === "long" ? 1 : -1;
          const slippedR =
            Math.max(
              0,
              direction === 1 ? priceNow - pending.entry : pending.entry - priceNow
            ) / Math.max(1e-8, riskRef);

          if (slippedR > maxSlipROnFill) {
            pending = null;
          } else if (slippedR > 0 && slippedR <= entryChase.maxSlipR) {
            if (!openFromPending(bar, index, priceNow, "market")) {
              pending = null;
            }
          }
        }
      }
    }

    if (open || cooldown > 0) {
      if (cooldown > 0) cooldown -= 1;
      recordFrame(bar);
      continue;
    }

    if (dailyLossHit || dailyTradeCapHit) {
      pending = null;
      recordFrame(bar);
      continue;
    }

    if (!pending) {
      const rawSignal = signal({
        candles: history,
        index,
        bar,
        equity: currentEquity,
        openPosition: open,
        pendingOrder: pending,
      });
      const nextSignal = normalizeSignal(rawSignal, bar, finalTP_R);

      if (nextSignal) {
        const signalRiskFraction = Number.isFinite(nextSignal.riskFraction)
          ? nextSignal.riskFraction
          : Number.isFinite(nextSignal.riskPct)
          ? nextSignal.riskPct / 100
          : riskPct / 100;
        const expiryBars = nextSignal._entryExpiryBars ?? 5;
        pending = {
          side: nextSignal.side,
          entry: nextSignal.entry,
          stop: nextSignal.stop,
          tp: nextSignal.takeProfit,
          riskFrac: signalRiskFraction,
          fixedQty: nextSignal.qty,
          expiresAt: index + Math.max(1, expiryBars),
          startedAtIndex: index,
          meta: nextSignal,
          plannedRiskAbs: Math.abs(
            nextSignal._initRisk ?? (nextSignal.entry - nextSignal.stop)
          ),
        };

        if (touchedLimit(pending.side, pending.entry, bar, trigger)) {
          if (!openFromPending(bar, index, pending.entry, "limit")) {
            pending = null;
          }
        }
      }
    }

    recordFrame(bar);
  }

  const metrics = buildMetrics({
    closed,
    equityStart: equity,
    equityFinal: currentEquity,
    candles,
    estBarMs: estimatedBarMs,
    eqSeries,
  });
  const positions = closed.filter((trade) => trade.exit.reason !== "SCALE");

  return {
    symbol: options.symbol,
    interval: options.interval,
    range: options.range,
    trades: closed,
    positions,
    metrics,
    eqSeries,
    replay: {
      frames: replayFrames,
      events: replayEvents,
    },
  };
}
