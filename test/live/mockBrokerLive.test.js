// test/live/mockBrokerLive.test.js
//
// Integration test: TradingSession in mode:"live" against a MockBroker that
// fills orders ASYNCHRONOUSLY via setTimeout(0) + order:filled events.
// This exercises the async path that PaperEngine's synchronous simulateBar fills do not.

import test from "node:test";
import assert from "node:assert/strict";
import { BrokerAdapter } from "../../src/live/broker/interface.js";
import { SessionManager } from "../../src/live/session.js";

// ---------------------------------------------------------------------------
// MockBroker — async fills, price-feed crosses resting orders
// ---------------------------------------------------------------------------

class MockBroker extends BrokerAdapter {
  constructor({ equity = 10_000 } = {}) {
    super();
    this._connected = false;
    this._cash = equity;
    this._positions = new Map(); // symbol → { symbol, side, qty, avgEntry }
    this._openOrders = new Map(); // orderId → order record
    this._orderId = 0;
    this._lastPrice = 100;
    this._rejectNextMarket = false;
  }

  // ── connection ─────────────────────────────────────────────────────────────
  async connect() {
    this._connected = true;
  }
  async disconnect() {
    this._connected = false;
  }
  isConnected() {
    return this._connected;
  }

  // ── account ────────────────────────────────────────────────────────────────
  async getAccount() {
    let unrealized = 0;
    for (const pos of this._positions.values()) {
      const diff = this._lastPrice - pos.avgEntry;
      unrealized += pos.side === "long" ? diff * pos.qty : -diff * pos.qty;
    }
    const equity = this._cash + unrealized;
    return { equity, cash: this._cash, buyingPower: this._cash * 2, currency: "USD" };
  }

  // ── positions / orders ─────────────────────────────────────────────────────
  async getPositions() {
    return [...this._positions.values()].map((p) => ({ ...p }));
  }

  async getOpenOrders() {
    return [...this._openOrders.values()].map((o) => ({ ...o }));
  }

  // ── order submission ───────────────────────────────────────────────────────
  async submitOrder(order) {
    const orderId = `mock-${++this._orderId}`;
    const record = { ...order, orderId, status: "accepted" };
    this.emit("order:submitted", { ...record });

    if (order.type === "market") {
      if (this._rejectNextMarket) {
        this._rejectNextMarket = false;
        setTimeout(
          () =>
            this.emit("order:rejected", {
              ...record,
              status: "rejected",
              rejectReason: "rejected by test broker",
            }),
          0
        );
        return { orderId, clientOrderId: order.clientOrderId, status: "accepted" };
      }
      // Async fill — fires on next tick so the session can stage a bracket first.
      setTimeout(() => this._fill(record, this._lastPrice), 0);
      return { orderId, clientOrderId: order.clientOrderId, status: "accepted" };
    }

    // Resting order — stored until pushPrice crosses it.
    this._openOrders.set(orderId, record);
    return { orderId, clientOrderId: order.clientOrderId, status: "accepted" };
  }

  // ── cancel ─────────────────────────────────────────────────────────────────
  async cancelOrder(orderId) {
    const o = this._openOrders.get(orderId);
    this._openOrders.delete(orderId);
    if (o) this.emit("order:canceled", { ...o, status: "canceled" });
  }

  // ── internal fill ──────────────────────────────────────────────────────────
  _fill(record, price) {
    const { orderId, clientOrderId, side, symbol, qty } = record;

    // Remove from resting orders if present (market orders were never stored).
    this._openOrders.delete(orderId);

    // Net-position math
    const isBuy = side === "buy";
    const existing = this._positions.get(symbol);

    if (!existing) {
      this._positions.set(symbol, {
        symbol,
        side: isBuy ? "long" : "short",
        qty,
        avgEntry: price,
      });
    } else {
      const sameSide = (existing.side === "long") === isBuy;
      if (sameSide) {
        // Increase position; update weighted average.
        const totalQty = existing.qty + qty;
        existing.avgEntry = (existing.avgEntry * existing.qty + price * qty) / totalQty;
        existing.qty = totalQty;
      } else {
        // Reduce / close / reverse.
        const closedQty = Math.min(qty, existing.qty);
        const pnl =
          existing.side === "long"
            ? (price - existing.avgEntry) * closedQty
            : (existing.avgEntry - price) * closedQty;
        this._cash += pnl;

        if (qty >= existing.qty) {
          this._positions.delete(symbol);
          // Reversal — open opposing position with leftover qty.
          if (qty > existing.qty) {
            this._positions.set(symbol, {
              symbol,
              side: isBuy ? "long" : "short",
              qty: qty - existing.qty,
              avgEntry: price,
            });
          }
        } else {
          existing.qty -= qty;
        }
      }
    }

    this.emit("order:filled", {
      orderId,
      clientOrderId,
      status: "filled",
      filledQty: qty,
      avgFillPrice: price,
      side,
      type: record.type,
      symbol,
    });
    this.emit("equity:update", { equity: this._cash });
  }

  // ── price feed (test helper) ───────────────────────────────────────────────
  pushPrice(price) {
    this._lastPrice = price;
    // Snapshot entries so _fill-triggered cancels don't mutate the iterated Map.
    for (const [orderId, o] of [...this._openOrders]) {
      const isBuy = o.side === "buy";
      let triggered = false;
      if (o.type === "stop") {
        triggered = isBuy ? price >= o.stopPrice : price <= o.stopPrice;
      } else if (o.type === "limit") {
        triggered = isBuy ? price <= o.limitPrice : price >= o.limitPrice;
      }
      if (triggered) {
        this._openOrders.delete(orderId); // prevent double-fill
        this._fill(o, o.stopPrice ?? o.limitPrice);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function flushAsync() {
  return new Promise((r) => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("live gating: rejects when TRADELAB_ALLOW_LIVE is unset", async () => {
  const saved = process.env.TRADELAB_ALLOW_LIVE;
  try {
    delete process.env.TRADELAB_ALLOW_LIVE;
    const mgr = new SessionManager();
    await assert.rejects(
      () =>
        mgr.create({
          id: "gate-1",
          mode: "live",
          confirmLive: true,
          symbol: "AAPL",
          broker: new MockBroker({ equity: 10_000 }),
        }),
      /live mode requires/i
    );
  } finally {
    if (saved === undefined) delete process.env.TRADELAB_ALLOW_LIVE;
    else process.env.TRADELAB_ALLOW_LIVE = saved;
  }
});

test("live gating: rejects when confirmLive is false even with env set", async () => {
  const saved = process.env.TRADELAB_ALLOW_LIVE;
  try {
    process.env.TRADELAB_ALLOW_LIVE = "true";
    const mgr = new SessionManager();
    await assert.rejects(
      () =>
        mgr.create({
          id: "gate-2",
          mode: "live",
          confirmLive: false,
          symbol: "AAPL",
          broker: new MockBroker({ equity: 10_000 }),
        }),
      /live mode requires/i
    );
  } finally {
    if (saved === undefined) delete process.env.TRADELAB_ALLOW_LIVE;
    else process.env.TRADELAB_ALLOW_LIVE = saved;
  }
});

test("async market entry → position tracked + bracket attached after flush", async () => {
  const saved = process.env.TRADELAB_ALLOW_LIVE;
  try {
    process.env.TRADELAB_ALLOW_LIVE = "true";
    const broker = new MockBroker({ equity: 10_000 });
    const mgr = new SessionManager();
    const session = await mgr.create({
      id: "async-entry-1",
      mode: "live",
      confirmLive: true,
      symbol: "AAPL",
      broker,
      equity: 10_000,
      qtyStep: 1,
      minQty: 1,
    });

    // Give session a price reference without calling pushBar (which calls simulateBar).
    broker._lastPrice = 100;
    session.lastPrice = 100;

    // Place a market order with a bracket. Receipt must be "accepted" (async broker).
    const receipt = await session.placeOrder({
      side: "long",
      type: "market",
      qty: 10,
      stop: 98,
      target: 104,
    });
    assert.notEqual(receipt.status, "filled", "async broker must NOT fill synchronously");

    // Flush the event loop so setTimeout(0) fires, then sync session state.
    await flushAsync();
    await session.refresh();

    const status = session.getStatus();
    assert.equal(status.positions.length, 1, "position must be tracked after async fill");
    assert.equal(status.positions[0].side, "long");
    assert.equal(status.positions[0].qty, 10);
    assert.equal(status.openOrders.length, 2, "bracket (stop + target) must be attached");
  } finally {
    if (saved === undefined) delete process.env.TRADELAB_ALLOW_LIVE;
    else process.env.TRADELAB_ALLOW_LIVE = saved;
  }
});

test("rejected async entry clears its staged bracket before later entries", async () => {
  const saved = process.env.TRADELAB_ALLOW_LIVE;
  try {
    process.env.TRADELAB_ALLOW_LIVE = "true";
    const broker = new MockBroker({ equity: 10_000 });
    const mgr = new SessionManager();
    const session = await mgr.create({
      id: "reject-entry-1",
      mode: "live",
      confirmLive: true,
      symbol: "AAPL",
      broker,
      equity: 10_000,
      qtyStep: 1,
      minQty: 1,
    });

    broker._lastPrice = 100;
    session.lastPrice = 100;
    broker._rejectNextMarket = true;

    await session.placeOrder({
      side: "long",
      type: "market",
      qty: 10,
      stop: 98,
      target: 104,
    });
    await flushAsync();
    await session.refresh();

    assert.equal(session.getStatus().positions.length, 0);
    assert.equal(session.getStatus().openOrders.length, 0);
    assert.equal(session._pendingBracket, null);

    await session.placeOrder({ side: "long", type: "market", qty: 5 });
    await flushAsync();
    await session.refresh();

    const status = session.getStatus();
    assert.equal(status.positions.length, 1);
    assert.equal(status.positions[0].qty, 5);
    assert.equal(status.openOrders.length, 0, "old rejected bracket must not attach later");
  } finally {
    if (saved === undefined) delete process.env.TRADELAB_ALLOW_LIVE;
    else process.env.TRADELAB_ALLOW_LIVE = saved;
  }
});

test("resting target fills via pushPrice → OCO cancels stop, equity rises", async () => {
  const saved = process.env.TRADELAB_ALLOW_LIVE;
  try {
    process.env.TRADELAB_ALLOW_LIVE = "true";
    const broker = new MockBroker({ equity: 10_000 });
    const mgr = new SessionManager();
    const session = await mgr.create({
      id: "oco-1",
      mode: "live",
      confirmLive: true,
      symbol: "AAPL",
      broker,
      equity: 10_000,
      qtyStep: 1,
      minQty: 1,
    });

    broker._lastPrice = 100;
    session.lastPrice = 100;

    // Open a bracketed long and flush the async entry fill.
    await session.placeOrder({
      side: "long",
      type: "market",
      qty: 10,
      stop: 98,
      target: 104,
    });
    await flushAsync();
    await session.refresh();
    assert.equal(session.getStatus().openOrders.length, 2, "bracket must be resting before test");

    // Push price to target — limit order fills, stop gets OCO-canceled.
    broker.pushPrice(104);
    await flushAsync();
    await session.refresh();

    const status = session.getStatus();
    assert.equal(status.positions.length, 0, "must be flat after target fill");
    assert.equal(status.openOrders.length, 0, "stop must be OCO-canceled");
    assert.ok(status.equity > 10_000, `equity must rise after TP fill (got ${status.equity})`);
  } finally {
    if (saved === undefined) delete process.env.TRADELAB_ALLOW_LIVE;
    else process.env.TRADELAB_ALLOW_LIVE = saved;
  }
});

test("flatten closes open position via market order on async broker", async () => {
  const saved = process.env.TRADELAB_ALLOW_LIVE;
  try {
    process.env.TRADELAB_ALLOW_LIVE = "true";
    const broker = new MockBroker({ equity: 10_000 });
    const mgr = new SessionManager();
    const session = await mgr.create({
      id: "flatten-1",
      mode: "live",
      confirmLive: true,
      symbol: "AAPL",
      broker,
      equity: 10_000,
      qtyStep: 1,
      minQty: 1,
    });

    broker._lastPrice = 100;
    session.lastPrice = 100;

    // Open a market long without a bracket.
    await session.placeOrder({ side: "long", type: "market", qty: 10 });
    await flushAsync();
    await session.refresh();
    assert.equal(session.getStatus().positions.length, 1, "must be long before flatten");

    // flatten() calls closePosition which submits an opposite market order (also async).
    await session.flatten();
    await flushAsync();
    await session.refresh();

    assert.equal(session.getStatus().positions.length, 0, "must be flat after flatten");
  } finally {
    if (saved === undefined) delete process.env.TRADELAB_ALLOW_LIVE;
    else process.env.TRADELAB_ALLOW_LIVE = saved;
  }
});
