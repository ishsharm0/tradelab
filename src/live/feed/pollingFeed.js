import { FeedProvider } from "./interface.js";

function keyFor(symbol, interval) {
  return `${symbol}::${interval}`;
}

/**
 * REST polling feed suitable for serverless/cron mode.
 */
export class PollingFeed extends FeedProvider {
  constructor({ broker, pollIntervalMs = 60_000, defaultBarsPerPoll = 2 } = {}) {
    super();
    this.broker = broker;
    this.pollIntervalMs = Math.max(500, Number(pollIntervalMs) || 60_000);
    this.defaultBarsPerPoll = Math.max(1, Number(defaultBarsPerPoll) || 2);
    this.barSubscriptions = new Map();
    this.tickSubscriptions = new Map();
    this.lastEmittedByStream = new Map();
    this.timer = null;
    this.connected = false;
  }

  async connect() {
    this.connected = true;
  }

  async disconnect() {
    this.connected = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  subscribeBars(symbol, interval, handler) {
    const streamKey = keyFor(symbol, interval);
    const list = this.barSubscriptions.get(streamKey) || [];
    list.push(handler);
    this.barSubscriptions.set(streamKey, list);
    return {
      unsubscribe: () => {
        const current = this.barSubscriptions.get(streamKey) || [];
        this.barSubscriptions.set(
          streamKey,
          current.filter((candidate) => candidate !== handler)
        );
      },
    };
  }

  subscribeTicks(symbol, handler) {
    const list = this.tickSubscriptions.get(symbol) || [];
    list.push(handler);
    this.tickSubscriptions.set(symbol, list);
    return {
      unsubscribe: () => {
        const current = this.tickSubscriptions.get(symbol) || [];
        this.tickSubscriptions.set(
          symbol,
          current.filter((candidate) => candidate !== handler)
        );
      },
    };
  }

  async getHistoricalBars(symbol, interval, count) {
    return this.broker.getHistoricalBars(symbol, interval, count);
  }

  async pollOnce() {
    const streams = [...this.barSubscriptions.keys()];
    for (const stream of streams) {
      const [symbol, interval] = stream.split("::");
      const bars = await this.broker.getHistoricalBars(symbol, interval, this.defaultBarsPerPoll);
      const ordered = [...bars].sort((left, right) => left.time - right.time);
      const lastSeen = this.lastEmittedByStream.get(stream) ?? -Infinity;
      const next = ordered.filter((bar) => bar.time > lastSeen);
      if (!next.length) continue;
      const handlers = this.barSubscriptions.get(stream) || [];
      for (const bar of next) {
        for (const handler of handlers) {
          await handler(bar);
        }
      }
      this.lastEmittedByStream.set(stream, next[next.length - 1].time);
    }
  }

  startPolling() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.pollOnce().catch(() => {});
    }, this.pollIntervalMs);
  }

  stopPolling() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}

export function createPollingFeed(options) {
  return new PollingFeed(options);
}
