// src/live/notify.js
const DEFAULT_EVENTS = ["order:filled", "risk:halt"];

/**
 * Subscribe a notifier to a trading session's event bus. Returns an unsubscribe
 * function. Fires onEvent and/or POSTs to webhookUrl for the configured events,
 * plus a drawdown breach on equity updates.
 */
export function attachNotifier(session, { onEvent, webhookUrl, events = DEFAULT_EVENTS, drawdownPct = 0 } = {}) {
  const wanted = new Set(events);
  let peak = null;

  const deliver = async (event, payload) => {
    if (typeof onEvent === "function") {
      try { onEvent({ event, payload }); } catch { /* non-fatal */ }
    }
    if (webhookUrl && typeof fetch === "function") {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ event, payload }),
        });
      } catch { /* non-fatal */ }
    }
  };

  const handler = ({ event, payload }) => {
    if (wanted.has(event)) { deliver(event, payload); return; }
    if (drawdownPct > 0 && event === "equity:update") {
      const eq = payload?.equity;
      if (Number.isFinite(eq)) {
        if (peak === null || eq > peak) peak = eq;
        if (peak > 0 && ((peak - eq) / peak) * 100 >= drawdownPct) {
          deliver("drawdown:breach", { equity: eq, peak, drawdownPct: ((peak - eq) / peak) * 100 });
        }
      }
    }
  };

  return session.eventBus.onAny(handler);
}
