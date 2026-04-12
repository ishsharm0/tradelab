import { FeedProvider } from "./interface.js";

/**
 * Feed provider that delegates to a broker adapter.
 */
export class BrokerFeed extends FeedProvider {
  constructor({ broker }) {
    super();
    this.broker = broker;
  }

  async connect() {
    return undefined;
  }

  async disconnect() {
    return undefined;
  }

  subscribeBars(symbol, interval, handler) {
    return this.broker.subscribeBars(symbol, interval, handler);
  }

  subscribeTicks(symbol, handler) {
    return this.broker.subscribeTrades(symbol, handler);
  }

  async getHistoricalBars(symbol, interval, count) {
    return this.broker.getHistoricalBars(symbol, interval, count);
  }
}

export function createBrokerFeed(options) {
  return new BrokerFeed(options);
}
