import { SessionManager } from "../live/session.js";
import { getStrategy } from "../strategies/index.js";

// Module-level shared SessionManager for the MCP server process
const manager = new SessionManager();

function requireSession(sessionId) {
  const s = manager.get(sessionId);
  if (!s) throw new Error(`No session found with id "${sessionId}"`);
  return s;
}

export { manager as sessionManager };

export const liveTools = {
  create_session: {
    description:
      "Create a new paper (default) or live (gated) trading session. Paper needs no credentials.",
    handler: async ({
      sessionId,
      symbol,
      mode = "paper",
      interval = "1m",
      equity = 10_000,
      riskPct,
      maxDailyLossPct,
      confirmLive = false,
    } = {}) => {
      const session = await manager.create({
        id: sessionId,
        symbol,
        mode,
        interval,
        equity,
        ...(riskPct != null ? { riskPct } : {}),
        ...(maxDailyLossPct != null ? { maxDailyLossPct } : {}),
        confirmLive,
      });
      return session.getStatus();
    },
  },

  list_sessions: {
    description: "List all active trading sessions and their current status.",
    handler: async () => {
      return manager.list().map((s) => s.getStatus());
    },
  },

  session_status: {
    description:
      "Get a full refreshed status snapshot for a session (positions, orders, equity, risk).",
    handler: async ({ sessionId } = {}) => {
      const session = requireSession(sessionId);
      return session.refresh();
    },
  },

  feed_price: {
    description:
      "Feed a price bar (or single price) to a session, advancing paper simulations and triggering fills.",
    handler: async ({ sessionId, bar, price } = {}) => {
      const session = requireSession(sessionId);
      let b = bar;
      if (!b && Number.isFinite(price)) {
        b = { time: Date.now(), open: price, high: price, low: price, close: price, volume: 0 };
      }
      if (!b) throw new Error("Provide either `bar` (OHLCV) or `price` (number)");
      await session.pushBar(b);

      // If a strategy is attached and session is flat, evaluate it
      if (session._strategy && session.getStatus().positions.length === 0) {
        try {
          const signal = session._strategy(session.candleBuffer, session.getStatus());
          if (signal && signal.side && signal.type) {
            await session.placeOrder(signal).catch(() => {});
          }
        } catch {
          // strategy errors are non-fatal
        }
      }

      return session.getStatus();
    },
  },

  place_order: {
    description:
      "Place a market or limit order in a session (optionally risk-sized with bracket stop/target).",
    handler: async ({
      sessionId,
      side,
      type = "market",
      qty,
      riskPct,
      stop,
      target,
      rr,
      limitPrice,
    } = {}) => {
      const session = requireSession(sessionId);
      return session.placeOrder({ side, type, qty, riskPct, stop, target, rr, limitPrice });
    },
  },

  close_position: {
    description: "Close the open position for a symbol in a session via an opposite market order.",
    handler: async ({ sessionId, symbol } = {}) => {
      const session = requireSession(sessionId);
      return session.closePosition(symbol);
    },
  },

  flatten: {
    description: "Flatten all positions and cancel all open orders in a session.",
    handler: async ({ sessionId } = {}) => {
      const session = requireSession(sessionId);
      await session.flatten();
      return { ok: true };
    },
  },

  cancel_order: {
    description: "Cancel a specific open order in a session.",
    handler: async ({ sessionId, orderId } = {}) => {
      const session = requireSession(sessionId);
      await session.cancelOrder(orderId);
      return { ok: true };
    },
  },

  account: {
    description: "Get the broker account details for a session (equity, cash, buying power).",
    handler: async ({ sessionId } = {}) => {
      const session = requireSession(sessionId);
      return session.getAccount();
    },
  },

  positions: {
    description: "Get all open positions for a session.",
    handler: async ({ sessionId } = {}) => {
      const session = requireSession(sessionId);
      return session.getPositions();
    },
  },

  recent_events: {
    description: "Get recent session events (fills, risk changes, bars) for monitoring.",
    handler: async ({ sessionId, limit = 50 } = {}) => {
      const session = requireSession(sessionId);
      return session.recentEvents(limit);
    },
  },

  attach_strategy: {
    description:
      "Attach a named built-in strategy to a session. It will auto-evaluate on each feed_price and place orders when flat.",
    handler: async ({ sessionId, strategy, params = {} } = {}) => {
      const session = requireSession(sessionId);
      const factory = getStrategy(strategy);
      const signal = factory(params);
      // Wrap: accept (candleBuffer, status) and call signal with the buffer
      session._strategy = (candleBuffer) => {
        if (!candleBuffer || candleBuffer.length === 0) return null;
        return signal(candleBuffer[candleBuffer.length - 1], candleBuffer);
      };
      return { ok: true, strategy, params };
    },
  },

  halt_all: {
    description: "Emergency kill switch: flatten all positions and stop all trading sessions.",
    handler: async () => {
      await manager.haltAll();
      return { ok: true, sessionsHalted: manager.list().length };
    },
  },
};
