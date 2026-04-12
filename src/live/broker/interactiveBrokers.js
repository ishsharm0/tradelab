import { BrokerAdapter } from "./interface.js";

/**
 * Interactive Brokers adapter with optional dynamic dependency.
 */
export class InteractiveBrokersBroker extends BrokerAdapter {
  constructor() {
    super();
    this.connected = false;
    this.config = {};
    this.ibModule = null;
    this.orderCounter = 1;
    this.orders = new Map();
    this.positions = new Map();
  }

  async connect(config = {}) {
    this.config = { ...config };
    try {
      this.ibModule = await import("@stoqey/ib");
    } catch {
      throw new Error(
        'InteractiveBrokersBroker requires optional peer dependency "@stoqey/ib". Install it to enable IB support.'
      );
    }
    this.connected = true;
  }

  async disconnect() {
    this.connected = false;
  }

  isConnected() {
    return this.connected;
  }

  supportsPaperNative() {
    return true;
  }

  async getServerTime() {
    return Date.now();
  }

  async getAccount() {
    return {
      equity: 0,
      buyingPower: 0,
      cash: 0,
      currency: "USD",
      marginUsed: 0,
    };
  }

  async getPositions() {
    return [...this.positions.values()];
  }

  async submitOrder(order) {
    const receipt = {
      orderId: String(this.orderCounter++),
      clientOrderId: order.clientOrderId,
      status: "new",
      filledQty: 0,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      qty: Number(order.qty || 0),
      avgFillPrice: undefined,
      filledAt: undefined,
    };
    this.orders.set(receipt.orderId, receipt);
    this.emit("order:submitted", receipt);
    return receipt;
  }

  async cancelOrder(orderId) {
    const order = this.orders.get(String(orderId));
    if (!order) return;
    order.status = "canceled";
    this.emit("order:canceled", { ...order });
  }

  async modifyOrder(orderId, changes = {}) {
    const order = this.orders.get(String(orderId));
    if (!order) throw new Error(`IB order "${orderId}" not found`);
    if (changes.qty !== undefined) order.qty = Number(changes.qty || order.qty);
    if (changes.limitPrice !== undefined) order.limitPrice = Number(changes.limitPrice);
    if (changes.stopPrice !== undefined) order.stopPrice = Number(changes.stopPrice);
    this.emit("order:modified", { ...order });
    return { ...order };
  }

  async getOpenOrders() {
    return [...this.orders.values()].filter((order) => order.status === "new");
  }

  async getOrderStatus(orderId) {
    const order = this.orders.get(String(orderId));
    if (!order) throw new Error(`IB order "${orderId}" not found`);
    return { ...order };
  }

  async subscribeQuotes(_symbol, _handler) {
    return { unsubscribe: () => {} };
  }

  async subscribeTrades(_symbol, _handler) {
    return { unsubscribe: () => {} };
  }

  async subscribeBars(_symbol, _interval, _handler) {
    return { unsubscribe: () => {} };
  }

  async getHistoricalBars(_symbol, _interval, _limit = 200) {
    return [];
  }
}

export function createInteractiveBrokersBroker(options) {
  return new InteractiveBrokersBroker(options);
}
