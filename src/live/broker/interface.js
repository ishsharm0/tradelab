import { EventEmitter } from "node:events";

function notImplemented(method) {
  throw new Error(`BrokerAdapter.${method}() not implemented`);
}

/**
 * Base class for broker adapters.
 */
export class BrokerAdapter extends EventEmitter {
  async connect(_config = {}) {
    notImplemented("connect");
  }

  async disconnect() {
    notImplemented("disconnect");
  }

  isConnected() {
    notImplemented("isConnected");
  }

  async getAccount() {
    notImplemented("getAccount");
  }

  async getPositions() {
    notImplemented("getPositions");
  }

  async getServerTime() {
    return Date.now();
  }

  async submitOrder(_order) {
    notImplemented("submitOrder");
  }

  async cancelOrder(_orderId) {
    notImplemented("cancelOrder");
  }

  async modifyOrder(_orderId, _changes) {
    notImplemented("modifyOrder");
  }

  async getOpenOrders() {
    notImplemented("getOpenOrders");
  }

  async getOrderStatus(_orderId) {
    notImplemented("getOrderStatus");
  }

  async subscribeQuotes(_symbol, _handler) {
    notImplemented("subscribeQuotes");
  }

  async subscribeTrades(_symbol, _handler) {
    notImplemented("subscribeTrades");
  }

  async subscribeBars(_symbol, _interval, _handler) {
    notImplemented("subscribeBars");
  }

  async getHistoricalBars(_symbol, _interval, _limit = 200) {
    notImplemented("getHistoricalBars");
  }

  supportsPaperNative() {
    return false;
  }
}
