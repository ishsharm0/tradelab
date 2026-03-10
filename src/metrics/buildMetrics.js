function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values) {
  return values.length ? sum(values) / values.length : 0;
}

function stddev(values) {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}

function sortino(values) {
  const losses = values.filter((value) => value < 0);
  const downsideDeviation = stddev(losses.length ? losses : [0]);
  const avg = mean(values);
  return downsideDeviation === 0
    ? avg > 0
      ? Infinity
      : 0
    : avg / downsideDeviation;
}

function dayKeyUTC(timeMs) {
  const date = new Date(timeMs);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function tradeRMultiple(trade) {
  const initialRisk = trade._initRisk || 0;
  if (initialRisk <= 0) return 0;
  const entry = trade.entryFill ?? trade.entry;
  const perUnit =
    trade.side === "long"
      ? trade.exit.price - entry
      : entry - trade.exit.price;
  return perUnit / initialRisk;
}

function streaks(labels) {
  let wins = 0;
  let losses = 0;
  let maxWins = 0;
  let maxLosses = 0;

  for (const label of labels) {
    if (label === "win") {
      wins += 1;
      losses = 0;
      if (wins > maxWins) maxWins = wins;
      continue;
    }

    if (label === "loss") {
      losses += 1;
      wins = 0;
      if (losses > maxLosses) maxLosses = losses;
      continue;
    }

    wins = 0;
    losses = 0;
  }

  return { maxWin: maxWins, maxLoss: maxLosses };
}

function buildEquitySeriesFromLegs({ legs, equityStart }) {
  const firstTime = legs.length ? legs[0].exit.time : Date.now();
  const series = [{ time: firstTime, equity: equityStart }];
  let equity = equityStart;

  for (const leg of legs) {
    equity += leg.exit.pnl;
    series.push({ time: leg.exit.time, equity });
  }

  return series;
}

function dailyReturns(eqSeries) {
  if (!eqSeries?.length) return [];

  const byDay = new Map();
  for (const point of eqSeries) {
    const day = dayKeyUTC(point.time);
    const record = byDay.get(day) || {
      open: point.equity,
      close: point.equity,
      first: point.time,
      last: point.time,
    };

    if (point.time < record.first) {
      record.first = point.time;
      record.open = point.equity;
    }

    if (point.time >= record.last) {
      record.last = point.time;
      record.close = point.equity;
    }

    byDay.set(day, record);
  }

  const returns = [];
  for (const { open, close } of byDay.values()) {
    if (open > 0 && Number.isFinite(open) && Number.isFinite(close)) {
      returns.push((close - open) / open);
    }
  }

  return returns;
}

function percentile(values, percentileRank) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((sorted.length - 1) * percentileRank);
  return sorted[index];
}

/**
 * Build aggregate backtest metrics for completed positions and realized trade legs.
 *
 * The returned object includes top-level aliases for commonly consumed fields such as
 * `profitFactor`, `winRate`, `expectancy`, `maxDrawdown`, `sharpe`, `avgHold`,
 * and `sideBreakdown`, while preserving the more specific legacy fields.
 */
export function buildMetrics({
  closed,
  equityStart,
  equityFinal,
  candles,
  estBarMs,
  eqSeries,
}) {
  const legs = [...closed].sort((left, right) => left.exit.time - right.exit.time);
  const completedTrades = [];
  const tradeRs = [];
  const tradePnls = [];
  const tradeReturns = [];
  const holdDurationsMinutes = [];
  const labels = [];
  const longRs = [];
  const shortRs = [];
  let totalR = 0;
  let realizedPnL = 0;
  let winningTradeCount = 0;
  let grossProfitPositions = 0;
  let grossLossPositions = 0;
  let grossProfitLegs = 0;
  let grossLossLegs = 0;
  let winningLegCount = 0;
  let openBars = 0;
  let longTradesCount = 0;
  let longTradeWins = 0;
  let longPnLSum = 0;
  let shortTradesCount = 0;
  let shortTradeWins = 0;
  let shortPnLSum = 0;

  let peakEquity = equityStart;
  let currentEquity = equityStart;
  let maxDrawdown = 0;

  for (const trade of legs) {
    const pnl = trade.exit.pnl;
    realizedPnL += pnl;

    if (pnl > 0) {
      grossProfitLegs += pnl;
      winningLegCount += 1;
    } else if (pnl < 0) {
      grossLossLegs += Math.abs(pnl);
    }

    currentEquity += pnl;
    if (currentEquity > peakEquity) peakEquity = currentEquity;
    const drawdown = (peakEquity - currentEquity) / Math.max(1e-12, peakEquity);
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    if (trade.exit.reason === "SCALE") continue;

    completedTrades.push(trade);
    tradePnls.push(pnl);
    tradeReturns.push(pnl / Math.max(1e-12, equityStart));
    const tradeR = tradeRMultiple(trade);
    tradeRs.push(tradeR);
    totalR += tradeR;
    labels.push(pnl > 0 ? "win" : pnl < 0 ? "loss" : "flat");

    const holdMinutes = (trade.exit.time - trade.openTime) / (1000 * 60);
    holdDurationsMinutes.push(holdMinutes);
    openBars += Math.max(1, Math.round((trade.exit.time - trade.openTime) / estBarMs));

    if (pnl > 0) {
      winningTradeCount += 1;
      grossProfitPositions += pnl;
    } else if (pnl < 0) {
      grossLossPositions += Math.abs(pnl);
    }

    if (trade.side === "long") {
      longTradesCount += 1;
      longPnLSum += pnl;
      longRs.push(tradeR);
      if (pnl > 0) longTradeWins += 1;
    } else if (trade.side === "short") {
      shortTradesCount += 1;
      shortPnLSum += pnl;
      shortRs.push(tradeR);
      if (pnl > 0) shortTradeWins += 1;
    }
  }

  const avgR = mean(tradeRs);
  const { maxWin, maxLoss } = streaks(labels);
  const expectancy = mean(tradePnls);
  const tradeReturnStd = stddev(tradeReturns);
  const sharpePerTrade =
    tradeReturnStd === 0
      ? tradeReturns.length
        ? Infinity
        : 0
      : mean(tradeReturns) / tradeReturnStd;
  const sortinoPerTrade = sortino(tradeReturns);

  const profitFactorPositions =
    grossLossPositions === 0
      ? grossProfitPositions > 0
        ? Infinity
        : 0
      : grossProfitPositions / grossLossPositions;
  const profitFactorLegs =
    grossLossLegs === 0
      ? grossProfitLegs > 0
        ? Infinity
        : 0
      : grossProfitLegs / grossLossLegs;
  const returnPct = (equityFinal - equityStart) / Math.max(1e-12, equityStart);
  const calmar = maxDrawdown === 0 ? (returnPct > 0 ? Infinity : 0) : returnPct / maxDrawdown;

  const totalBars = Math.max(1, candles.length);
  const exposurePct = openBars / totalBars;
  const avgHoldMin = mean(holdDurationsMinutes);

  const equitySeries =
    eqSeries && eqSeries.length
      ? eqSeries
      : buildEquitySeriesFromLegs({ legs, equityStart });
  const dailyReturnsSeries = dailyReturns(equitySeries);
  const dailyStd = stddev(dailyReturnsSeries);
  const sharpeDaily =
    dailyStd === 0
      ? dailyReturnsSeries.length
        ? Infinity
        : 0
      : mean(dailyReturnsSeries) / dailyStd;
  const sortinoDaily = sortino(dailyReturnsSeries);
  const dailyWinRate = dailyReturnsSeries.length
    ? dailyReturnsSeries.filter((value) => value > 0).length / dailyReturnsSeries.length
    : 0;

  const rDistribution = {
    p10: percentile(tradeRs, 0.1),
    p25: percentile(tradeRs, 0.25),
    p50: percentile(tradeRs, 0.5),
    p75: percentile(tradeRs, 0.75),
    p90: percentile(tradeRs, 0.9),
  };

  const holdDistribution = {
    p10: percentile(holdDurationsMinutes, 0.1),
    p25: percentile(holdDurationsMinutes, 0.25),
    p50: percentile(holdDurationsMinutes, 0.5),
    p75: percentile(holdDurationsMinutes, 0.75),
    p90: percentile(holdDurationsMinutes, 0.9),
  };

  const sideBreakdown = {
    long: {
      trades: longTradesCount,
      winRate: longTradesCount
        ? longTradeWins / longTradesCount
        : 0,
      avgPnL: longTradesCount ? longPnLSum / longTradesCount : 0,
      avgR: mean(longRs),
    },
    short: {
      trades: shortTradesCount,
      winRate: shortTradesCount
        ? shortTradeWins / shortTradesCount
        : 0,
      avgPnL: shortTradesCount ? shortPnLSum / shortTradesCount : 0,
      avgR: mean(shortRs),
    },
  };

  return {
    trades: completedTrades.length,
    winRate: completedTrades.length ? winningTradeCount / completedTrades.length : 0,
    profitFactor: profitFactorPositions,
    expectancy,
    totalR,
    avgR,
    sharpe: sharpeDaily,
    sharpePerTrade,
    sortinoPerTrade,
    maxDrawdown: maxDrawdown,
    maxDrawdownPct: maxDrawdown,
    calmar,
    maxConsecWins: maxWin,
    maxConsecLosses: maxLoss,
    avgHold: avgHoldMin,
    avgHoldMin,
    exposurePct,
    totalPnL: realizedPnL,
    returnPct,
    finalEquity: equityFinal,
    startEquity: equityStart,
    profitFactor_pos: profitFactorPositions,
    profitFactor_leg: profitFactorLegs,
    winRate_pos: completedTrades.length
      ? winningTradeCount / completedTrades.length
      : 0,
    winRate_leg: legs.length ? winningLegCount / legs.length : 0,
    sharpeDaily,
    sortinoDaily,
    sideBreakdown,
    long: sideBreakdown.long,
    short: sideBreakdown.short,
    rDist: rDistribution,
    holdDistMin: holdDistribution,
    daily: {
      count: dailyReturnsSeries.length,
      winRate: dailyWinRate,
      avgReturn: mean(dailyReturnsSeries),
    },
  };
}
