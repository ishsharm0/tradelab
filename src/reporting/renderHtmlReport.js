import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.join(__dirname, "..", "..");
const templateCache = new Map();

function readTemplate(relativePath) {
  const absolutePath = path.join(packageRoot, relativePath);
  if (!templateCache.has(absolutePath)) {
    templateCache.set(absolutePath, fs.readFileSync(absolutePath, "utf8"));
  }
  return templateCache.get(absolutePath);
}

function fmt(value, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  if (!Number.isFinite(value)) return value > 0 ? "Inf" : "0";
  return Number(value).toFixed(digits);
}

function fmtPct(value, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  if (!Number.isFinite(value)) return value > 0 ? "Inf" : "0";
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function serializeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/<\/script/gi, "<\\\\/script");
}

function renderTemplate(template, replacements) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => replacements[key] ?? "");
}

function metricCards(metrics) {
  const cards = [
    {
      label: "Net Return",
      value: fmtPct(metrics.returnPct ?? 0, 2),
      note: `PnL ${fmt(metrics.totalPnL ?? 0, 2)}`,
    },
    {
      label: "Win Rate",
      value: fmtPct(metrics.winRate ?? 0, 1),
      note: `${metrics.trades ?? 0} completed positions`,
    },
    {
      label: "Profit Factor",
      value: fmt(metrics.profitFactor ?? 0, 2),
      note: `Avg R ${fmt(metrics.avgR ?? 0, 2)}`,
    },
    {
      label: "Drawdown",
      value: fmtPct(metrics.maxDrawdownPct ?? 0, 2),
      note: `Calmar ${fmt(metrics.calmar ?? 0, 2)}`,
    },
  ];

  return cards
    .map(
      (card) => `
        <article class="metric-card">
          <div class="metric-card__label">${escapeHtml(card.label)}</div>
          <div class="metric-card__value">${escapeHtml(card.value)}</div>
          <div class="metric-card__note">${escapeHtml(card.note)}</div>
        </article>
      `
    )
    .join("");
}

function renderRows(rows, { empty = "No data available", colSpan = 2 } = {}) {
  if (!rows.length) {
    return `<tr><td class="table-empty" colspan="${colSpan}">${escapeHtml(empty)}</td></tr>`;
  }

  return rows
    .map(
      ([label, value]) => `
        <tr>
          <th>${escapeHtml(label)}</th>
          <td>${escapeHtml(value)}</td>
        </tr>
      `
    )
    .join("");
}

function renderPositionRows(positions) {
  if (!positions?.length) {
    return '<tr><td class="table-empty" colspan="7">No completed positions</td></tr>';
  }

  return positions
    .slice(-25)
    .reverse()
    .map((trade) => {
      const exit = trade.exit || {};
      return `
        <tr>
          <td>${escapeHtml(new Date(trade.openTime).toISOString())}</td>
          <td>${escapeHtml(trade.side)}</td>
          <td>${escapeHtml(fmt(trade.entryFill ?? trade.entry, 4))}</td>
          <td>${escapeHtml(fmt(exit.price, 4))}</td>
          <td>${escapeHtml(exit.reason ?? "—")}</td>
          <td>${escapeHtml(fmt(exit.pnl, 2))}</td>
          <td>${escapeHtml(fmt(trade.mfeR ?? 0, 2))} / ${escapeHtml(
            fmt(trade.maeR ?? 0, 2)
          )}</td>
        </tr>
      `;
    })
    .join("");
}

function buildDailyPnl(eqSeries) {
  if (!eqSeries?.length) return [];

  const byDay = new Map();
  for (const point of eqSeries) {
    const date = new Date(point.time).toISOString().slice(0, 10);
    const record = byDay.get(date) || {
      date,
      open: point.equity,
      close: point.equity,
      firstTime: point.time,
      lastTime: point.time,
    };

    if (point.time < record.firstTime) {
      record.firstTime = point.time;
      record.open = point.equity;
    }

    if (point.time >= record.lastTime) {
      record.lastTime = point.time;
      record.close = point.equity;
    }

    byDay.set(date, record);
  }

  return [...byDay.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((record) => ({
      date: record.date,
      pnl: record.close - record.open,
    }));
}

function buildReportPayload({ eqSeries, replay }) {
  const normalizedEqSeries = eqSeries.map((point) => ({
    t: new Date(point.time).toISOString(),
    equity: point.equity,
  }));

  let peak = normalizedEqSeries[0]?.equity ?? 0;
  const drawdown = normalizedEqSeries.map((point) => {
    peak = Math.max(peak, point.equity);
    return {
      t: point.t,
      value: peak > 0 ? (point.equity - peak) / peak : 0,
    };
  });

  const normalizedReplay = {
    frames: Array.isArray(replay?.frames) ? replay.frames : [],
    events: Array.isArray(replay?.events) ? replay.events : [],
  };

  return {
    eqSeries: normalizedEqSeries,
    drawdown,
    dailyPnl: buildDailyPnl(eqSeries),
    replay: normalizedReplay,
    hasReplay: normalizedReplay.frames.length > 0,
  };
}

export function renderHtmlReport({
  symbol,
  interval,
  range,
  metrics,
  eqSeries,
  replay,
  positions = [],
  plotlyCdnUrl = "https://cdn.plot.ly/plotly-2.35.2.min.js",
}) {
  if (!eqSeries?.length) {
    throw new Error("renderHtmlReport() requires a populated eqSeries array");
  }

  const template = readTemplate("templates/report.html");
  const css = readTemplate("templates/report.css");
  const clientJs = readTemplate("templates/report.js");

  const title = `${symbol} ${interval} (${range})`;
  const payload = buildReportPayload({ eqSeries, replay });
  const summaryRows = renderRows([
    ["Trades", String(metrics.trades ?? 0)],
    ["Win rate", fmtPct(metrics.winRate ?? 0, 1)],
    ["Profit factor", fmt(metrics.profitFactor ?? 0, 2)],
    ["Expectancy / trade", fmt(metrics.expectancy ?? 0, 2)],
    ["Total R", fmt(metrics.totalR ?? 0, 2)],
    ["Avg R / trade", fmt(metrics.avgR ?? 0, 2)],
    ["Max drawdown", fmtPct(metrics.maxDrawdownPct ?? 0, 2)],
    ["Exposure", fmtPct(metrics.exposurePct ?? 0, 1)],
    ["Avg hold (min)", fmt(metrics.avgHoldMin ?? 0, 1)],
    ["Daily Sharpe", fmt(metrics.sharpeDaily ?? 0, 2)],
  ]);

  const breakdownRows = renderRows([
    [
      "Long",
      `${metrics.long?.trades ?? 0} trades, ${fmtPct(
        metrics.long?.winRate ?? 0,
        1
      )} win, avg R ${fmt(metrics.long?.avgR ?? 0, 2)}`,
    ],
    [
      "Short",
      `${metrics.short?.trades ?? 0} trades, ${fmtPct(
        metrics.short?.winRate ?? 0,
        1
      )} win, avg R ${fmt(metrics.short?.avgR ?? 0, 2)}`,
    ],
    ["R p50 / p90", `${fmt(metrics.rDist?.p50 ?? 0, 2)} / ${fmt(metrics.rDist?.p90 ?? 0, 2)}`],
    [
      "Hold p50 / p90",
      `${fmt(metrics.holdDistMin?.p50 ?? 0, 1)} / ${fmt(
        metrics.holdDistMin?.p90 ?? 0,
        1
      )} min`,
    ],
  ]);

  return renderTemplate(template, {
    TITLE: escapeHtml(title),
    CSS: css,
    REPORT_JS: clientJs,
    PLOTLY_CDN_URL: escapeHtml(plotlyCdnUrl),
    HERO_SUBTITLE: escapeHtml(
      `Start ${fmt(metrics.startEquity ?? 0, 2)} • End ${fmt(metrics.finalEquity ?? 0, 2)}`
    ),
    HERO_PILL: escapeHtml(
      `Return ${fmtPct(metrics.returnPct ?? 0, 2)} • Max DD ${fmtPct(
        metrics.maxDrawdownPct ?? 0,
        2
      )}`
    ),
    METRIC_CARDS: metricCards(metrics),
    SUMMARY_ROWS: summaryRows,
    BREAKDOWN_ROWS: breakdownRows,
    POSITION_ROWS: renderPositionRows(positions),
    REPLAY_VISIBILITY: payload.hasReplay ? "" : "is-hidden",
    REPORT_DATA_JSON: serializeJson(payload),
  });
}

export function exportHtmlReport({
  symbol,
  interval,
  range,
  metrics,
  eqSeries,
  replay,
  positions,
  outDir = "output",
  plotlyCdnUrl,
}) {
  if (!eqSeries?.length) return null;

  fs.mkdirSync(outDir, { recursive: true });
  const safeSymbol = String(symbol).replace(/[^a-zA-Z0-9_.-]+/g, "_");
  const safeInterval = String(interval).replace(/[^a-zA-Z0-9_.-]+/g, "_");
  const safeRange = String(range).replace(/[^a-zA-Z0-9_.-]+/g, "_");
  const outputPath = path.join(
    outDir,
    `report-${safeSymbol}-${safeInterval}-${safeRange}.html`
  );

  const html = renderHtmlReport({
    symbol,
    interval,
    range,
    metrics,
    eqSeries,
    replay,
    positions,
    plotlyCdnUrl,
  });

  fs.writeFileSync(outputPath, html, "utf8");
  return outputPath;
}
