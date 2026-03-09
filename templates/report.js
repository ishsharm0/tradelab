(function renderBacktestReport() {
  const raw = document.getElementById("report-data");
  if (!raw) return;

  let data;
  try {
    data = JSON.parse(raw.textContent);
  } catch {
    return;
  }

  function plot(targetId, traces, layout = {}) {
    const el = document.getElementById(targetId);
    if (!el || typeof Plotly === "undefined") return;

    Plotly.newPlot(
      el,
      traces,
      {
        margin: { t: 16, r: 18, b: 42, l: 52 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { color: "#eef4ff" },
        xaxis: { gridcolor: "rgba(159,176,201,0.12)" },
        yaxis: { gridcolor: "rgba(159,176,201,0.12)" },
        legend: { orientation: "h" },
        ...layout,
      },
      {
        responsive: true,
        displayModeBar: false,
        displaylogo: false,
      }
    );
  }

  plot("equity-chart", [
    {
      x: data.eqSeries.map((point) => point.t),
      y: data.eqSeries.map((point) => point.equity),
      type: "scatter",
      mode: "lines",
      name: "Equity",
      line: { color: "#64e0c1", width: 2.5 },
    },
  ], {
    yaxis: { title: "Equity", gridcolor: "rgba(159,176,201,0.12)" },
  });

  plot("drawdown-chart", [
    {
      x: data.drawdown.map((point) => point.t),
      y: data.drawdown.map((point) => point.value),
      type: "scatter",
      mode: "lines",
      name: "Drawdown",
      line: { color: "#fb7185", width: 2.2 },
      fill: "tozeroy",
      fillcolor: "rgba(251,113,133,0.12)",
    },
  ], {
    yaxis: {
      title: "Drawdown",
      tickformat: ",.0%",
      gridcolor: "rgba(159,176,201,0.12)",
    },
  });

  if (Array.isArray(data.dailyPnl) && data.dailyPnl.length) {
    plot("daily-chart", [
      {
        x: data.dailyPnl.map((point) => point.date),
        y: data.dailyPnl.map((point) => point.pnl),
        type: "bar",
        name: "Daily PnL",
        marker: {
          color: data.dailyPnl.map((point) =>
            point.pnl >= 0 ? "#4ade80" : "#fb7185"
          ),
        },
      },
    ], {
      yaxis: { title: "PnL", gridcolor: "rgba(159,176,201,0.12)" },
    });
  }

  if (data.hasReplay && Array.isArray(data.replay.frames)) {
    const entries = data.replay.events.filter((event) => event.type === "entry");
    const exits = data.replay.events.filter((event) => event.type !== "entry");

    plot("replay-chart", [
      {
        x: data.replay.frames.map((frame) => frame.t),
        y: data.replay.frames.map((frame) => frame.price),
        type: "scatter",
        mode: "lines",
        name: "Price",
        line: { color: "#93c5fd", width: 2 },
      },
      {
        x: entries.map((event) => event.t),
        y: entries.map((event) => event.price),
        type: "scatter",
        mode: "markers",
        name: "Entries",
        marker: { color: "#4ade80", size: 9, symbol: "triangle-up" },
      },
      {
        x: exits.map((event) => event.t),
        y: exits.map((event) => event.price),
        type: "scatter",
        mode: "markers",
        name: "Exits",
        marker: { color: "#fb7185", size: 9, symbol: "triangle-down" },
      },
    ], {
      yaxis: { title: "Price", gridcolor: "rgba(159,176,201,0.12)" },
    });
  }
})();
