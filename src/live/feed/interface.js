function notImplemented(method) {
  throw new Error(`FeedProvider.${method}() not implemented`);
}

/**
 * Base class for feed providers.
 */
export class FeedProvider {
  async connect() {
    notImplemented("connect");
  }

  async disconnect() {
    notImplemented("disconnect");
  }

  subscribeBars(_symbol, _interval, _handler) {
    notImplemented("subscribeBars");
  }

  subscribeTicks(_symbol, _handler) {
    notImplemented("subscribeTicks");
  }

  async getHistoricalBars(_symbol, _interval, _count) {
    notImplemented("getHistoricalBars");
  }
}
