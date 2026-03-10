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

function equityPoint(time, equity, extra = {}) {
  return { time, timestamp: time, equity, ...extra };
}

function isArrayIndexKey(property) {
  if (typeof property !== "string") return false;
  const numeric = Number(property);
  return Number.isInteger(numeric) && numeric >= 0;
}

function strictHistoryView(candles, currentIndex) {
  return new Proxy(candles, {
    get(target, property, receiver) {
      if (isArrayIndexKey(property) && Number(property) >= target.length) {
        throw new Error(
          `strict mode: signal() tried to access candles[${property}] beyond current index ${currentIndex}`
        );
      }
      return Reflect.get(target, property, receiver);
    },
  });
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
    costs: options.costs ?? null,
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
    strict: options.strict ?? false,
  };
}

function capitalForSize(entryPrice, size, maxLeverage) {
  const leverage = Math.max(1, Number(maxLeverage) || 1);
  return (Math.abs(entryPrice) * Math.max(0, size)) / leverage;
}

export class BarSystemRunner {
  constructor(rawOptions = {}) {
    this.options = mergeOptions(rawOptions);
    const { candles, signal } = this.options;

    if (!Array.isArray(candles) || candles.length === 0) {
      throw new Error("backtestPortfolio() requires each system to include non-empty candles");
    }
    if (typeof signal !== "function") {
      throw new Error("backtestPortfolio() requires each system to include a signal function");
    }

    this.symbol = this.options.symbol;
    this.candles = candles;
    this.closed = [];
    this.currentEquity = this.options.equity;
    this.open = null;
    this.cooldown = 0;
    this.pending = null;
    this.currentDay = null;
    this.dayPnl = 0;
    this.dayTrades = 0;
    this.dayEquityStart = this.options.equity;
    this.tradeIdCounter = 0;
    this.estimatedBarMs = estimateBarMs(candles);
    const atrSourcePeriod = this.options.volScale.enabled
      ? this.options.volScale.atrPeriod
      : this.options.atrTrailPeriod;
    const needAtr = this.options.atrTrailMult > 0 || this.options.volScale.enabled;
    this.atrValues = needAtr ? atr(candles, atrSourcePeriod) : null;
    this.wantEqSeries = Boolean(this.options.collectEqSeries);
    this.wantReplay = Boolean(this.options.collectReplay);
    this.eqSeries = this.wantEqSeries
      ? [equityPoint(candles[0].time, this.currentEquity)]
      : [];
    this.replayFrames = this.wantReplay ? [] : [];
    this.replayEvents = this.wantReplay ? [] : [];
    this.startIndex = Math.min(Math.max(1, this.options.warmupBars), candles.length);
    this.history = candles.slice(0, this.startIndex);
    this.index = this.startIndex;
    this.lastBar = this.history.length ? this.history[this.history.length - 1] : null;
  }

  hasNext() {
    return this.index < this.candles.length;
  }

  peekTime() {
    return this.hasNext() ? this.candles[this.index].time : Infinity;
  }

  getLockedCapital() {
    if (!this.open) return 0;
    return capitalForSize(this.open.entryFill ?? this.open.entry, this.open.size, this.options.maxLeverage);
  }

  getMarkPrice() {
    return this.lastBar?.close ?? null;
  }

  getMarkedEquity() {
    if (!this.open || !this.lastBar) return this.currentEquity;
    const direction = this.open.side === "long" ? 1 : -1;
    const markPnl =
      (this.lastBar.close - (this.open.entryFill ?? this.open.entry)) *
      direction *
      this.open.size;
    return this.currentEquity + markPnl;
  }

  recordFrame(bar, extraFrame = {}) {
    if (this.wantEqSeries) {
      this.eqSeries.push(equityPoint(bar.time, this.currentEquity));
    }

    if (this.wantReplay) {
      this.replayFrames.push({
        t: new Date(bar.time).toISOString(),
        price: bar.close,
        equity: this.currentEquity,
        posSide: this.open ? this.open.side : null,
        posSize: this.open ? this.open.size : 0,
        ...extraFrame,
      });
    }
  }

  closeLeg({ openPos, qty, exitPx, exitFeeTotal = 0, time, reason }) {
    const direction = openPos.side === "long" ? 1 : -1;
    const entryFill = openPos.entryFill;
    const grossPnl = (exitPx - entryFill) * direction * qty;
    const entryFeePortion =
      (openPos.entryFeeTotal || 0) * (qty / openPos.initSize);
    const pnl = grossPnl - entryFeePortion - exitFeeTotal;

    this.currentEquity += pnl;
    this.dayPnl += pnl;

    if (this.wantEqSeries) {
      this.eqSeries.push(equityPoint(time, this.currentEquity));
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

    if (this.wantReplay) {
      this.replayEvents.push({
        t: new Date(time).toISOString(),
        price: exitPx,
        type: eventType,
        side: openPos.side,
        size: qty,
        tradeId: openPos.id,
        reason,
        pnl,
        symbol: this.symbol,
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

    this.closed.push(record);
    openPos.size -= qty;
    openPos._realized = (openPos._realized || 0) + pnl;
    return record;
  }

  tightenStopToNetBreakeven(openPos, lastClose) {
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

    openPos.stop = this.options.oco.clampStops
      ? clampStop(lastClose, tightened, openPos.side, this.options.oco)
      : tightened;
  }

  forceExit(reason, bar, overridePrice = null) {
    if (!this.open || !bar) return;

    const exitSide = this.open.side === "long" ? "short" : "long";
    const exitBasePrice = overridePrice ?? bar.close;
    const { price: filled, feeTotal: exitFeeTotal } = applyFill(exitBasePrice, exitSide, {
      slippageBps: this.options.slippageBps,
      feeBps: this.options.feeBps,
      kind: "market",
      qty: this.open.size,
      costs: this.options.costs,
    });

    this.closeLeg({
      openPos: this.open,
      qty: this.open.size,
      exitPx: filled,
      exitFeeTotal,
      time: bar.time,
      reason,
    });

    this.cooldown = this.open?._cooldownBars || 0;
    this.open = null;
  }

  cancelPending() {
    this.pending = null;
  }

  openFromPending(bar, signalEquity, entryPrice, fillKind = "limit", resolveEntrySize) {
    if (!this.pending) return false;

    const plannedRisk = Math.max(
      1e-8,
      this.pending.plannedRiskAbs ?? Math.abs(this.pending.entry - this.pending.stop)
    );
    const slipR = Math.abs(entryPrice - this.pending.entry) / plannedRisk;
    if (slipR > this.options.maxSlipROnFill) return false;

    let stopPrice = this.pending.stop;
    if (this.options.reanchorStopOnFill) {
      const direction = this.pending.side === "long" ? 1 : -1;
      stopPrice =
        direction === 1
          ? entryPrice - plannedRisk
          : entryPrice + plannedRisk;
    }

    let takeProfit = this.pending.tp;
    const immediateRisk = Math.abs(entryPrice - stopPrice) || 1e-8;
    const rrHint = this.pending.meta?._rr;

    if (this.options.reanchorStopOnFill && Number.isFinite(rrHint)) {
      const plannedTarget =
        this.pending.side === "long"
          ? this.pending.entry + rrHint * plannedRisk
          : this.pending.entry - rrHint * plannedRisk;
      const closeEnough =
        Math.abs((this.pending.tp ?? plannedTarget) - plannedTarget) <=
        Math.max(1e-8, plannedRisk * 1e-6);

      if (closeEnough) {
        takeProfit =
          this.pending.side === "long"
            ? entryPrice + rrHint * immediateRisk
            : entryPrice - rrHint * immediateRisk;
      }
    }

    const desiredSize =
      this.pending.fixedQty ??
      calculatePositionSize({
        equity: signalEquity,
        entry: entryPrice,
        stop: stopPrice,
        riskFraction: this.pending.riskFrac,
        qtyStep: this.options.qtyStep,
        minQty: this.options.minQty,
        maxLeverage: this.options.maxLeverage,
      });

    const approvedSize = typeof resolveEntrySize === "function"
      ? resolveEntrySize({
          runner: this,
          desiredSize,
          entryPrice,
          stopPrice,
          pending: this.pending,
          fillKind,
        })
      : desiredSize;
    const size = roundStep(approvedSize, this.options.qtyStep);
    if (size < this.options.minQty) return false;

    const { price: entryFill, feeTotal: entryFeeTotal } = applyFill(
      entryPrice,
      this.pending.side,
      {
        slippageBps: this.options.slippageBps,
        feeBps: this.options.feeBps,
        kind: fillKind,
        qty: size,
        costs: this.options.costs,
      }
    );

    this.open = {
      symbol: this.symbol,
      ...this.pending.meta,
      id: ++this.tradeIdCounter,
      side: this.pending.side,
      entry: entryPrice,
      stop: stopPrice,
      takeProfit,
      size,
      openTime: bar.time,
      entryFill,
      entryFeeTotal,
      initSize: size,
      baseSize: size,
      _mfeR: 0,
      _maeR: 0,
      _adds: 0,
      _initRisk: Math.abs(entryPrice - stopPrice) || 1e-8,
    };

    if (this.atrValues && this.atrValues[this.index] !== undefined) {
      this.open.entryATR = this.atrValues[this.index];
      this.open._lastATR = this.atrValues[this.index];
    }

    this.dayTrades += 1;
    this.pending = null;

    if (this.wantReplay) {
      this.replayEvents.push({
        t: new Date(bar.time).toISOString(),
        price: entryFill,
        type: "entry",
        side: this.open.side,
        size,
        tradeId: this.open.id,
        symbol: this.symbol,
      });
    }

    return true;
  }

  buildSignalContext(index, bar, signalEquity) {
    if (this.options.strict && this.history.length !== index + 1) {
      throw new Error(
        `strict mode: signal() received ${this.history.length} candles at index ${index}`
      );
    }

    return {
      candles: this.options.strict ? strictHistoryView(this.history, index) : this.history,
      index,
      bar,
      equity: signalEquity,
      openPosition: this.open,
      pendingOrder: this.pending,
    };
  }

  step({ signalEquity, canTrade = true, resolveEntrySize } = {}) {
    if (!this.hasNext()) return null;

    const bar = this.candles[this.index];
    this.history.push(bar);
    this.lastBar = bar;

    const trigger = this.options.triggerMode || this.options.oco.mode || "intrabar";
    const dayKey =
      this.options.flattenAtClose || trigger === "close"
        ? dayKeyET(bar.time)
        : dayKeyUTC(bar.time);
    if (this.currentDay === null || dayKey !== this.currentDay) {
      this.currentDay = dayKey;
      this.dayPnl = 0;
      this.dayTrades = 0;
      this.dayEquityStart = this.currentEquity;
    }

    if (this.open && this.open._maxBarsInTrade > 0) {
      const barsHeld = Math.max(
        1,
        Math.round((bar.time - this.open.openTime) / this.estimatedBarMs)
      );
      if (barsHeld >= this.open._maxBarsInTrade) {
        this.forceExit("TIME", bar);
      }
    }

    if (this.open && Number.isFinite(this.open._maxHoldMin) && this.open._maxHoldMin > 0) {
      const heldMinutes = (bar.time - this.open.openTime) / 60000;
      if (heldMinutes >= this.open._maxHoldMin) {
        this.forceExit("TIME", bar);
      }
    }

    if (this.options.flattenAtClose && this.open && isEODBar(bar.time)) {
      this.forceExit("EOD", bar);
    }

    if (this.open) {
      const risk = this.open._initRisk || 1e-8;
      const highR =
        this.open.side === "long"
          ? (bar.high - this.open.entry) / risk
          : (this.open.entry - bar.low) / risk;
      const lowR =
        this.open.side === "long"
          ? (bar.low - this.open.entry) / risk
          : (this.open.entry - bar.high) / risk;
      const markR =
        this.open.side === "long"
          ? (bar.close - this.open.entry) / risk
          : (this.open.entry - bar.close) / risk;

      if (this.atrValues && this.atrValues[this.index] !== undefined) {
        this.open._lastATR = this.atrValues[this.index];
      }

      this.open._mfeR = Math.max(this.open._mfeR ?? -Infinity, highR);
      this.open._maeR = Math.min(this.open._maeR ?? Infinity, lowR);

      if (
        this.open._breakevenAtR > 0 &&
        highR >= this.open._breakevenAtR &&
        !this.open._beArmed
      ) {
        const tightened =
          this.open.side === "long"
            ? Math.max(this.open.stop, this.open.entry)
            : Math.min(this.open.stop, this.open.entry);
        this.open.stop = this.options.oco.clampStops
          ? clampStop(bar.close, tightened, this.open.side, this.options.oco)
          : tightened;
        this.open._beArmed = true;
      }

      if (this.open._trailAfterR > 0 && highR >= this.open._trailAfterR) {
        const candidate =
          this.open.side === "long" ? bar.close - risk : bar.close + risk;
        const tightened =
          this.open.side === "long"
            ? Math.max(this.open.stop, candidate)
            : Math.min(this.open.stop, candidate);
        this.open.stop = this.options.oco.clampStops
          ? clampStop(bar.close, tightened, this.open.side, this.options.oco)
          : tightened;
      }

      if (this.options.mfeTrail.enabled && this.open._mfeR >= this.options.mfeTrail.armR) {
        const targetR = Math.max(
          0,
          this.open._mfeR - Math.max(0, this.options.mfeTrail.givebackR)
        );
        const candidate =
          this.open.side === "long"
            ? this.open.entry + targetR * risk
            : this.open.entry - targetR * risk;
        const tightened =
          this.open.side === "long"
            ? Math.max(this.open.stop, candidate)
            : Math.min(this.open.stop, candidate);
        this.open.stop = this.options.oco.clampStops
          ? clampStop(bar.close, tightened, this.open.side, this.options.oco)
          : tightened;
      }

      if (this.options.atrTrailMult > 0 && this.atrValues && this.atrValues[this.index] !== undefined) {
        const trailDistance = this.atrValues[this.index] * this.options.atrTrailMult;
        const candidate =
          this.open.side === "long"
            ? bar.close - trailDistance
            : bar.close + trailDistance;
        const tightened =
          this.open.side === "long"
            ? Math.max(this.open.stop, candidate)
            : Math.min(this.open.stop, candidate);
        this.open.stop = this.options.oco.clampStops
          ? clampStop(bar.close, tightened, this.open.side, this.options.oco)
          : tightened;
      }

      if (
        this.options.volScale.enabled &&
        this.open.entryATR &&
        this.open.size > this.options.minQty &&
        this.atrValues &&
        this.atrValues[this.index] !== undefined
      ) {
        const ratio = this.atrValues[this.index] / Math.max(1e-12, this.open.entryATR);
        const shouldCut =
          ratio >= this.options.volScale.cutIfAtrX &&
          markR < this.options.volScale.noCutAboveR &&
          !this.open._volCutDone;

        if (shouldCut) {
          const cutQty = roundStep(this.open.size * this.options.volScale.cutFrac, this.options.qtyStep);
          if (cutQty >= this.options.minQty && cutQty < this.open.size) {
            const exitSide = this.open.side === "long" ? "short" : "long";
            const { price: filled, feeTotal: exitFeeTotal } = applyFill(bar.close, exitSide, {
              slippageBps: this.options.slippageBps,
              feeBps: this.options.feeBps,
              kind: "market",
              qty: cutQty,
              costs: this.options.costs,
            });
            this.closeLeg({
              openPos: this.open,
              qty: cutQty,
              exitPx: filled,
              exitFeeTotal,
              time: bar.time,
              reason: "SCALE",
            });
            this.tightenStopToNetBreakeven(this.open, bar.close);
            this.open._volCutDone = true;
          }
        }
      }

      let addedThisBar = false;
      if (this.options.pyramiding.enabled && (this.open._adds ?? 0) < this.options.pyramiding.maxAdds) {
        const addNumber = (this.open._adds || 0) + 1;
        const triggerR = this.options.pyramiding.addAtR * addNumber;
        const triggerPrice =
          this.open.side === "long"
            ? this.open.entry + triggerR * risk
            : this.open.entry - triggerR * risk;
        const breakEvenSatisfied =
          !this.options.pyramiding.onlyAfterBreakEven ||
          (this.open.side === "long" && this.open.stop >= this.open.entry) ||
          (this.open.side === "short" && this.open.stop <= this.open.entry);
        const touched =
          this.open.side === "long"
            ? trigger === "intrabar"
              ? bar.high >= triggerPrice
              : bar.close >= triggerPrice
            : trigger === "intrabar"
            ? bar.low <= triggerPrice
            : bar.close <= triggerPrice;

        if (breakEvenSatisfied && touched) {
          const baseSize = this.open.baseSize || this.open.initSize;
          const requestedQty = roundStep(baseSize * this.options.pyramiding.addFrac, this.options.qtyStep);
          const addQty = typeof resolveEntrySize === "function"
            ? roundStep(
                resolveEntrySize({
                  runner: this,
                  desiredSize: requestedQty,
                  entryPrice: triggerPrice,
                  stopPrice: this.open.stop,
                  pending: {
                    side: this.open.side,
                    meta: this.open,
                    riskFrac: this.options.riskPct / 100,
                  },
                  fillKind: "limit",
                }),
                this.options.qtyStep
              )
            : requestedQty;
          if (addQty >= this.options.minQty) {
            const { price: addFill, feeTotal: addFeeTotal } = applyFill(triggerPrice, this.open.side, {
              slippageBps: this.options.slippageBps,
              feeBps: this.options.feeBps,
              kind: "limit",
              qty: addQty,
              costs: this.options.costs,
            });
            const newSize = this.open.size + addQty;
            this.open.entryFeeTotal += addFeeTotal;
            this.open.entryFill =
              (this.open.entryFill * this.open.size + addFill * addQty) / newSize;
            this.open.size = newSize;
            this.open.initSize += addQty;
            if (!this.open.baseSize) this.open.baseSize = baseSize;
            this.open._adds = addNumber;
            addedThisBar = true;
          }
        }
      }

      if (!addedThisBar && !this.open._scaled && this.options.scaleOutAtR > 0) {
        const triggerPrice =
          this.open.side === "long"
            ? this.open.entry + this.options.scaleOutAtR * risk
            : this.open.entry - this.options.scaleOutAtR * risk;
        const touched =
          this.open.side === "long"
            ? trigger === "intrabar"
              ? bar.high >= triggerPrice
              : bar.close >= triggerPrice
            : trigger === "intrabar"
            ? bar.low <= triggerPrice
            : bar.close <= triggerPrice;

        if (touched) {
          const exitSide = this.open.side === "long" ? "short" : "long";
          const qty = roundStep(this.open.size * this.options.scaleOutFrac, this.options.qtyStep);
          if (qty >= this.options.minQty && qty < this.open.size) {
            const { price: filled, feeTotal: exitFeeTotal } = applyFill(triggerPrice, exitSide, {
              slippageBps: this.options.slippageBps,
              feeBps: this.options.feeBps,
              kind: "limit",
              qty,
              costs: this.options.costs,
            });
            this.closeLeg({
              openPos: this.open,
              qty,
              exitPx: filled,
              exitFeeTotal,
              time: bar.time,
              reason: "SCALE",
            });
            this.open._scaled = true;
            this.open.takeProfit =
              this.open.side === "long"
                ? this.open.entry + this.options.finalTP_R * risk
                : this.open.entry - this.options.finalTP_R * risk;
            this.tightenStopToNetBreakeven(this.open, bar.close);
            this.open._beArmed = true;
          }
        }
      }

      const exitSide = this.open.side === "long" ? "short" : "long";
      const { hit, px } = ocoExitCheck({
        side: this.open.side,
        stop: this.open.stop,
        tp: this.open.takeProfit,
        bar,
        mode: this.options.oco.mode,
        tieBreak: this.options.oco.tieBreak,
      });

      if (hit) {
        const exitKind = hit === "TP" ? "limit" : "stop";
        const { price: filled, feeTotal: exitFeeTotal } = applyFill(px, exitSide, {
          slippageBps: this.options.slippageBps,
          feeBps: this.options.feeBps,
          kind: exitKind,
          qty: this.open.size,
          costs: this.options.costs,
        });
        const localCooldown = this.open._cooldownBars || 0;
        this.closeLeg({
          openPos: this.open,
          qty: this.open.size,
          exitPx: filled,
          exitFeeTotal,
          time: bar.time,
          reason: hit,
        });
        this.cooldown =
          (hit === "SL"
            ? Math.max(this.cooldown, this.options.postLossCooldownBars)
            : this.cooldown) || localCooldown;
        this.open = null;
      }
    }

    const maxLossDollars = (this.options.maxDailyLossPct / 100) * this.dayEquityStart;
    const dailyLossHit = this.dayPnl <= -Math.abs(maxLossDollars);
    const dailyTradeCapHit =
      this.options.dailyMaxTrades > 0 && this.dayTrades >= this.options.dailyMaxTrades;

    if (!this.open && this.pending) {
      if (!canTrade) {
        this.pending = null;
      } else if (this.index > this.pending.expiresAt || dailyLossHit || dailyTradeCapHit) {
        if (this.options.entryChase.enabled && this.options.entryChase.convertOnExpiry) {
          const riskAtEdge = Math.abs(
            this.pending.meta._initRisk ?? (this.pending.entry - this.pending.stop)
          );
          const priceNow = bar.close;
          const direction = this.pending.side === "long" ? 1 : -1;
          const slippedR =
            Math.max(
              0,
              direction === 1 ? priceNow - this.pending.entry : this.pending.entry - priceNow
            ) / Math.max(1e-8, riskAtEdge);

          if (slippedR > this.options.maxSlipROnFill) {
            this.pending = null;
          } else if (!this.openFromPending(bar, signalEquity, priceNow, "market", resolveEntrySize)) {
            this.pending = null;
          }
        } else {
          this.pending = null;
        }
      } else if (touchedLimit(this.pending.side, this.pending.entry, bar, trigger)) {
        if (!this.openFromPending(bar, signalEquity, this.pending.entry, "limit", resolveEntrySize)) {
          this.pending = null;
        }
      } else if (this.options.entryChase.enabled) {
        const elapsedBars = this.index - (this.pending.startedAtIndex ?? this.index);
        const midpoint = this.pending.meta?._imb?.mid;

        if (!this.pending._chasedCE && midpoint !== undefined && elapsedBars >= Math.max(1, this.options.entryChase.afterBars)) {
          this.pending.entry = midpoint;
          this.pending._chasedCE = true;
        }

        if (this.pending._chasedCE) {
          const riskRef = Math.abs(
            this.pending.meta?._initRisk ?? (this.pending.entry - this.pending.stop)
          );
          const priceNow = bar.close;
          const direction = this.pending.side === "long" ? 1 : -1;
          const slippedR =
            Math.max(
              0,
              direction === 1 ? priceNow - this.pending.entry : this.pending.entry - priceNow
            ) / Math.max(1e-8, riskRef);

          if (slippedR > this.options.maxSlipROnFill) {
            this.pending = null;
          } else if (slippedR > 0 && slippedR <= this.options.entryChase.maxSlipR) {
            if (!this.openFromPending(bar, signalEquity, priceNow, "market", resolveEntrySize)) {
              this.pending = null;
            }
          }
        }
      }
    }

    if (this.open || this.cooldown > 0) {
      if (this.cooldown > 0) this.cooldown -= 1;
      this.recordFrame(bar);
      this.index += 1;
      return bar;
    }

    if (!canTrade || dailyLossHit || dailyTradeCapHit) {
      this.pending = null;
      this.recordFrame(bar);
      this.index += 1;
      return bar;
    }

    if (!this.pending) {
      const rawSignal = this.options.signal(this.buildSignalContext(this.index, bar, signalEquity));
      const nextSignal = normalizeSignal(rawSignal, bar, this.options.finalTP_R);

      if (nextSignal) {
        const signalRiskFraction = Number.isFinite(nextSignal.riskFraction)
          ? nextSignal.riskFraction
          : Number.isFinite(nextSignal.riskPct)
          ? nextSignal.riskPct / 100
          : this.options.riskPct / 100;
        const expiryBars = nextSignal._entryExpiryBars ?? 5;
        this.pending = {
          side: nextSignal.side,
          entry: nextSignal.entry,
          stop: nextSignal.stop,
          tp: nextSignal.takeProfit,
          riskFrac: signalRiskFraction,
          fixedQty: nextSignal.qty,
          expiresAt: this.index + Math.max(1, expiryBars),
          startedAtIndex: this.index,
          meta: nextSignal,
          plannedRiskAbs: Math.abs(
            nextSignal._initRisk ?? (nextSignal.entry - nextSignal.stop)
          ),
        };

        if (touchedLimit(this.pending.side, this.pending.entry, bar, trigger)) {
          if (!this.openFromPending(bar, signalEquity, this.pending.entry, "limit", resolveEntrySize)) {
            this.pending = null;
          }
        }
      }
    }

    this.recordFrame(bar);
    this.index += 1;
    return bar;
  }

  buildResult() {
    const metrics = buildMetrics({
      closed: this.closed,
      equityStart: this.options.equity,
      equityFinal: this.currentEquity,
      candles: this.candles,
      estBarMs: this.estimatedBarMs,
      eqSeries: this.eqSeries,
    });
    const positions = this.closed.filter((trade) => trade.exit.reason !== "SCALE");

    return {
      symbol: this.options.symbol,
      interval: this.options.interval,
      range: this.options.range,
      trades: this.closed,
      positions,
      metrics,
      eqSeries: this.eqSeries,
      replay: {
        frames: this.replayFrames,
        events: this.replayEvents,
      },
    };
  }
}

export function defaultSystemCap(totalEquity, capPct, maxAllocation, maxAllocationPct) {
  const limits = [];
  if (Number.isFinite(capPct) && capPct > 0) limits.push(totalEquity * capPct);
  if (Number.isFinite(maxAllocation) && maxAllocation > 0) limits.push(maxAllocation);
  if (Number.isFinite(maxAllocationPct) && maxAllocationPct > 0) {
    limits.push(totalEquity * maxAllocationPct);
  }
  return limits.length ? Math.min(...limits) : Math.max(0, totalEquity);
}
