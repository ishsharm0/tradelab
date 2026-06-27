import { dayKeyET } from "../../engine/execution.js";
import { inWindowsET, isSession, parseWindowsCSV } from "../../utils/time.js";

function pctToFraction(value, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  return Math.abs(value) / 100;
}

/**
 * Live-trading risk gate and circuit breaker manager.
 */
export class RiskManager {
  constructor(options = {}) {
    this.options = {
      maxDailyLossPct: 2,
      maxDailyLossDollars: null,
      maxDrawdownPct: 20,
      maxPositions: 10,
      maxPositionPct: 50,
      maxDailyTrades: 0,
      cooldownAfterLossMs: 0,
      allowedSessions: "AUTO",
      allowedWindows: null,
      maxGrossExposurePct: 0,
      maxNetExposurePct: 0,
      ...options,
    };
    this.allowedWindows = parseWindowsCSV(this.options.allowedWindows);
    this.startEquity = null;
    this.currentEquity = null;
    this.peakEquity = null;
    this.currentDayKey = null;
    this.dayPnl = 0;
    this.dayTrades = 0;
    this.lastLossAt = null;
    this.halted = false;
    this.haltReason = null;
  }

  initialize(equity, timeMs = Date.now()) {
    const value = Number.isFinite(equity) ? equity : 0;
    this.startEquity = value;
    this.currentEquity = value;
    this.peakEquity = value;
    this.currentDayKey = dayKeyET(timeMs);
    this.dayPnl = 0;
    this.dayTrades = 0;
    this.lastLossAt = null;
    this.halted = false;
    this.haltReason = null;
  }

  update({ timeMs, equity }) {
    if (this.startEquity === null) this.initialize(equity, timeMs);
    const nextDay = dayKeyET(timeMs);
    if (this.currentDayKey !== nextDay) {
      this.currentDayKey = nextDay;
      this.dayPnl = 0;
      this.dayTrades = 0;
      this.halted = false;
      this.haltReason = null;
    }
    this.currentEquity = Number.isFinite(equity) ? equity : this.currentEquity;
    if (this.currentEquity > this.peakEquity) this.peakEquity = this.currentEquity;
    this._maybeHaltForDrawdown();
    this._maybeHaltForDailyLoss();
  }

  _maybeHaltForDrawdown() {
    if (this.halted || !Number.isFinite(this.currentEquity) || !(this.peakEquity > 0)) return;
    const drawdown = (this.peakEquity - this.currentEquity) / this.peakEquity;
    const maxDrawdown = pctToFraction(this.options.maxDrawdownPct, 0.2);
    if (maxDrawdown > 0 && drawdown >= maxDrawdown) {
      this.halt(`max drawdown reached (${(drawdown * 100).toFixed(2)}%)`);
    }
  }

  _maybeHaltForDailyLoss() {
    if (this.halted) return;
    const maxLossPct = pctToFraction(this.options.maxDailyLossPct, 0.02);
    const maxLossDollars = Number.isFinite(this.options.maxDailyLossDollars)
      ? Math.abs(this.options.maxDailyLossDollars)
      : null;
    const lossesExceededPct =
      maxLossPct > 0 && this.dayPnl <= -Math.abs(this.startEquity * maxLossPct);
    const lossesExceededAbs =
      Number.isFinite(maxLossDollars) && this.dayPnl <= -Math.abs(maxLossDollars);
    if (lossesExceededPct || lossesExceededAbs) {
      this.halt("daily loss limit reached");
    }
  }

  isSessionAllowed(timeMs) {
    const sessionName = this.options.allowedSessions || "AUTO";
    if (!isSession(timeMs, sessionName)) return false;
    return inWindowsET(timeMs, this.allowedWindows);
  }

  canTrade({ timeMs = Date.now() } = {}) {
    if (this.halted) return { ok: false, reason: this.haltReason || "risk halt active" };
    if (!this.isSessionAllowed(timeMs))
      return { ok: false, reason: "outside allowed session/window" };
    if (
      Number.isFinite(this.options.cooldownAfterLossMs) &&
      this.options.cooldownAfterLossMs > 0 &&
      Number.isFinite(this.lastLossAt) &&
      timeMs - this.lastLossAt < this.options.cooldownAfterLossMs
    ) {
      return { ok: false, reason: "cooldown after loss active" };
    }
    return { ok: true, reason: null };
  }

  canOpenPosition({
    timeMs = Date.now(),
    positionCount = 0,
    positionValue = 0,
    equity = null,
    grossExposure = undefined,
    netExposure = undefined,
  } = {}) {
    const base = this.canTrade({ timeMs });
    if (!base.ok) return base;

    if (this.options.maxPositions > 0 && positionCount >= this.options.maxPositions) {
      return { ok: false, reason: "max positions reached" };
    }

    if (this.options.maxDailyTrades > 0 && this.dayTrades >= this.options.maxDailyTrades) {
      return { ok: false, reason: "max daily trades reached" };
    }

    const eq = Number.isFinite(equity) ? equity : this.currentEquity;
    const maxPositionFraction = pctToFraction(this.options.maxPositionPct, 0.5);
    if (maxPositionFraction > 0 && Number.isFinite(eq) && eq > 0) {
      const fraction = Math.abs(positionValue) / eq;
      if (fraction > maxPositionFraction) {
        return { ok: false, reason: "max position size exceeded" };
      }
    }

    const grossCap = pctToFraction(this.options.maxGrossExposurePct, 0);
    if (grossCap > 0 && Number.isFinite(eq) && eq > 0 && Number.isFinite(grossExposure)) {
      if (Math.abs(grossExposure) / eq > grossCap) {
        return { ok: false, reason: "max gross exposure exceeded" };
      }
    }

    const netCap = pctToFraction(this.options.maxNetExposurePct, 0);
    if (netCap > 0 && Number.isFinite(eq) && eq > 0 && Number.isFinite(netExposure)) {
      if (Math.abs(netExposure) / eq > netCap) {
        return { ok: false, reason: "max net exposure exceeded" };
      }
    }

    return { ok: true, reason: null };
  }

  /**
   * Check only the portfolio exposure caps (no session/halt/trade-count checks).
   * Called from placeOrder after the halt check has already run.
   */
  checkExposure({ grossExposure = undefined, netExposure = undefined, equity = null } = {}) {
    const eq = Number.isFinite(equity) ? equity : this.currentEquity;

    const grossCap = pctToFraction(this.options.maxGrossExposurePct, 0);
    if (grossCap > 0 && Number.isFinite(eq) && eq > 0 && Number.isFinite(grossExposure)) {
      if (Math.abs(grossExposure) / eq > grossCap) {
        return { ok: false, reason: "max gross exposure exceeded" };
      }
    }

    const netCap = pctToFraction(this.options.maxNetExposurePct, 0);
    if (netCap > 0 && Number.isFinite(eq) && eq > 0 && Number.isFinite(netExposure)) {
      if (Math.abs(netExposure) / eq > netCap) {
        return { ok: false, reason: "max net exposure exceeded" };
      }
    }

    return { ok: true, reason: null };
  }

  recordTrade({ pnl = 0, timeMs = Date.now(), equity = null } = {}) {
    if (this.currentDayKey !== dayKeyET(timeMs)) {
      this.currentDayKey = dayKeyET(timeMs);
      this.dayPnl = 0;
      this.dayTrades = 0;
      this.halted = false;
      this.haltReason = null;
    }
    const realized = Number.isFinite(pnl) ? pnl : 0;
    this.dayPnl += realized;
    this.dayTrades += 1;
    if (realized < 0) this.lastLossAt = timeMs;
    if (Number.isFinite(equity)) this.currentEquity = equity;
    this._maybeHaltForDailyLoss();
    this._maybeHaltForDrawdown();
  }

  halt(reason = "manual halt") {
    this.halted = true;
    this.haltReason = reason;
  }

  clearHalt() {
    this.halted = false;
    this.haltReason = null;
  }

  getState() {
    return {
      startEquity: this.startEquity,
      currentEquity: this.currentEquity,
      peakEquity: this.peakEquity,
      dayPnl: this.dayPnl,
      dayTrades: this.dayTrades,
      currentDayKey: this.currentDayKey,
      halted: this.halted,
      haltReason: this.haltReason,
      lastLossAt: this.lastLossAt,
    };
  }
}

export function createRiskManager(options) {
  return new RiskManager(options);
}
