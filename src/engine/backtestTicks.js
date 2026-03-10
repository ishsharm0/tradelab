import { buildMetrics } from "../metrics/buildMetrics.js";
import { calculatePositionSize } from "../utils/positionSizing.js";
import {
  applyFill,
  dayKeyUTC,
  ocoExitCheck,
  roundStep,
} from "./execution.js";

function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeSide(value) {
  if (value === "long" || value === "buy") return "long";
  if (value === "short" || value === "sell") return "short";
  return null;
}

function normalizeTick(tick) {
  const time = Number(tick?.time);
  const bid = asNumber(tick?.bid);
  const ask = asNumber(tick?.ask);
  const last = asNumber(tick?.price ?? tick?.last ?? tick?.close);
  const mid =
    bid !== null && ask !== null
      ? (bid + ask) / 2
      : last ?? bid ?? ask;
  if (!Number.isFinite(time) || !Number.isFinite(mid)) return null;

  const prices = [asNumber(tick?.low), asNumber(tick?.high), bid, ask, last, mid].filter(
    Number.isFinite
  );
  const low = prices.length ? Math.min(...prices) : mid;
  const high = prices.length ? Math.max(...prices) : mid;

  return {
    ...tick,
    time,
    open: mid,
    high,
    low,
    close: mid,
    volume: asNumber(tick?.size ?? tick?.volume) ?? undefined,
  };
}

function normalizeSignal(signal, bar, fallbackR) {
  if (!signal) return null;
  const side = normalizeSide(signal.side ?? signal.direction ?? signal.action);
  if (!side) return null;

  const hasExplicitEntry =
    signal.entry !== undefined || signal.limit !== undefined || signal.price !== undefined;
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
    orderType: hasExplicitEntry ? "limit" : "market",
  };
}

function equityPoint(time, equity) {
  return { time, timestamp: time, equity };
}

function deterministicFill(probability, seedParts) {
  if (probability >= 1) return true;
  if (probability <= 0) return false;
  let hash = 2166136261;
  const seed = seedParts.join("|");
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = (hash >>> 0) / 0xffffffff;
  return normalized <= probability;
}

export function backtestTicks({
  ticks = [],
  symbol = "UNKNOWN",
  equity = 10_000,
  riskPct = 1,
  signal,
  interval,
  range,
  slippageBps = 1,
  feeBps = 0,
  costs = null,
  finalTP_R = 3,
  maxDailyLossPct = 0,
  dailyMaxTrades = 0,
  qtyStep = 0.001,
  minQty = 0.001,
  maxLeverage = 2,
  collectEqSeries = true,
  collectReplay = true,
  queueFillProbability = 1,
  oco = {},
} = {}) {
  if (!Array.isArray(ticks) || ticks.length === 0) {
    throw new Error("backtestTicks() requires a non-empty ticks array");
  }
  if (typeof signal !== "function") {
    throw new Error("backtestTicks() requires a signal function");
  }

  const normalizedTicks = ticks.map(normalizeTick).filter(Boolean);
  if (!normalizedTicks.length) {
    throw new Error("backtestTicks() could not normalize any ticks");
  }

  const ocoOptions = {
    mode: "intrabar",
    tieBreak: "pessimistic",
    ...oco,
  };

  const trades = [];
  const eqSeries = collectEqSeries ? [equityPoint(normalizedTicks[0].time, equity)] : [];
  const replayFrames = collectReplay ? [] : [];
  const replayEvents = collectReplay ? [] : [];
  const history = [];
  let open = null;
  let pending = null;
  let currentEquity = equity;
  let dayKey = null;
  let dayStartEquity = equity;
  let dayPnl = 0;
  let dayTrades = 0;
  let tradeIdCounter = 0;

  function markedEquity(tick) {
    if (!open) return currentEquity;
    const direction = open.side === "long" ? 1 : -1;
    return currentEquity + (tick.close - open.entryFill) * direction * open.size;
  }

  function recordFrame(tick) {
    const equityNow = markedEquity(tick);
    if (collectEqSeries) {
      eqSeries.push(equityPoint(tick.time, equityNow));
    }
    if (collectReplay) {
      replayFrames.push({
        t: new Date(tick.time).toISOString(),
        price: tick.close,
        equity: equityNow,
        posSide: open?.side ?? null,
        posSize: open?.size ?? 0,
      });
    }
  }

  function closePosition(tick, reason, rawPrice, fillKind) {
    if (!open) return;
    const exitSide = open.side === "long" ? "short" : "long";
    const { price, feeTotal } = applyFill(rawPrice, exitSide, {
      slippageBps,
      feeBps,
      kind: fillKind,
      qty: open.size,
      costs,
    });
    const direction = open.side === "long" ? 1 : -1;
    const grossPnl = (price - open.entryFill) * direction * open.size;
    const pnl = grossPnl - (open.entryFeeTotal || 0) - feeTotal;
    currentEquity += pnl;
    dayPnl += pnl;
    const trade = {
      ...open,
      exit: {
        price,
        time: tick.time,
        reason,
        pnl,
      },
    };
    trades.push(trade);
    if (collectReplay) {
      replayEvents.push({
        t: new Date(tick.time).toISOString(),
        price,
        type: reason === "TP" ? "tp" : reason === "SL" ? "sl" : "exit",
        side: open.side,
        size: open.size,
        tradeId: open.id,
        reason,
        pnl,
      });
    }
    open = null;
  }

  for (let index = 0; index < normalizedTicks.length; index += 1) {
    const tick = normalizedTicks[index];
    history.push(tick);

    const currentDayKey = dayKeyUTC(tick.time);
    if (dayKey === null || currentDayKey !== dayKey) {
      dayKey = currentDayKey;
      dayStartEquity = currentEquity;
      dayPnl = 0;
      dayTrades = 0;
    }

    if (open) {
      const { hit, px } = ocoExitCheck({
        side: open.side,
        stop: open.stop,
        tp: open.takeProfit,
        bar: tick,
        mode: "intrabar",
        tieBreak: ocoOptions.tieBreak,
      });
      if (hit) {
        closePosition(tick, hit, px, hit === "TP" ? "limit" : "stop");
      }
    }

    if (!open && pending && index > pending.createdAtIndex) {
      if (pending.orderType === "market") {
        const rawSize =
          pending.fixedQty ??
          calculatePositionSize({
            equity: currentEquity,
            entry: tick.close,
            stop: pending.stop,
            riskFraction: pending.riskFrac,
            qtyStep,
            minQty,
            maxLeverage,
          });
        const size = roundStep(rawSize, qtyStep);
        if (size >= minQty) {
          const { price, feeTotal } = applyFill(tick.close, pending.side, {
            slippageBps,
            feeBps,
            kind: "market",
            qty: size,
            costs,
          });
          open = {
            symbol,
            id: ++tradeIdCounter,
            side: pending.side,
            entry: tick.close,
            stop: pending.stop,
            takeProfit: pending.takeProfit,
            size,
            openTime: tick.time,
            entryFill: price,
            entryFeeTotal: feeTotal,
            _initRisk: Math.abs(tick.close - pending.stop),
          };
          dayTrades += 1;
          if (collectReplay) {
            replayEvents.push({
              t: new Date(tick.time).toISOString(),
              price,
              type: "entry",
              side: open.side,
              size,
              tradeId: open.id,
            });
          }
        }
        pending = null;
      } else {
        const touched =
          pending.side === "long"
            ? tick.low <= pending.entry
            : tick.high >= pending.entry;
        if (
          touched &&
          deterministicFill(queueFillProbability, [
            symbol,
            tick.time,
            pending.entry,
            pending.stop,
            pending.side,
          ])
        ) {
          const rawSize =
            pending.fixedQty ??
            calculatePositionSize({
              equity: currentEquity,
              entry: pending.entry,
              stop: pending.stop,
              riskFraction: pending.riskFrac,
              qtyStep,
              minQty,
              maxLeverage,
            });
          const size = roundStep(rawSize, qtyStep);
          if (size >= minQty) {
            const { price, feeTotal } = applyFill(pending.entry, pending.side, {
              slippageBps,
              feeBps,
              kind: "limit",
              qty: size,
              costs,
            });
            open = {
              symbol,
              id: ++tradeIdCounter,
              side: pending.side,
              entry: pending.entry,
              stop: pending.stop,
              takeProfit: pending.takeProfit,
              size,
              openTime: tick.time,
              entryFill: price,
              entryFeeTotal: feeTotal,
              _initRisk: Math.abs(pending.entry - pending.stop),
            };
            dayTrades += 1;
            if (collectReplay) {
              replayEvents.push({
                t: new Date(tick.time).toISOString(),
                price,
                type: "entry",
                side: open.side,
                size,
                tradeId: open.id,
              });
            }
          }
          pending = null;
        }
      }
    }

    const maxLossDollars = (Math.abs(maxDailyLossPct) / 100) * dayStartEquity;
    const dailyLossHit = maxDailyLossPct > 0 && dayPnl <= -maxLossDollars;
    const dailyTradeCapHit = dailyMaxTrades > 0 && dayTrades >= dailyMaxTrades;

    if (!open && !pending && !dailyLossHit && !dailyTradeCapHit) {
      const nextSignal = normalizeSignal(
        signal({
          candles: history,
          index,
          bar: tick,
          equity: markedEquity(tick),
          openPosition: open,
          pendingOrder: pending,
        }),
        tick,
        finalTP_R
      );

      if (nextSignal) {
        pending = {
          side: nextSignal.side,
          entry: nextSignal.entry,
          stop: nextSignal.stop,
          takeProfit: nextSignal.takeProfit,
          fixedQty: nextSignal.qty,
          riskFrac: Number.isFinite(nextSignal.riskFraction)
            ? nextSignal.riskFraction
            : Number.isFinite(nextSignal.riskPct)
            ? nextSignal.riskPct / 100
            : riskPct / 100,
          orderType: nextSignal.orderType,
          createdAtIndex: index,
        };
      }
    }

    recordFrame(tick);
  }

  if (open) {
    const lastTick = normalizedTicks[normalizedTicks.length - 1];
    closePosition(lastTick, "EOT", lastTick.close, "market");
    recordFrame(lastTick);
  }

  const positions = trades;
  const metrics = buildMetrics({
    closed: trades,
    equityStart: equity,
    equityFinal: currentEquity,
    candles: normalizedTicks,
    estBarMs: normalizedTicks.length > 1
      ? Math.max(1, normalizedTicks[1].time - normalizedTicks[0].time)
      : 1,
    eqSeries,
  });

  return {
    symbol,
    interval,
    range,
    trades,
    positions,
    metrics,
    eqSeries,
    replay: {
      frames: replayFrames,
      events: replayEvents,
    },
  };
}
