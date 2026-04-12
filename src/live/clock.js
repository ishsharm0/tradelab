/**
 * Broker-synchronized clock used by live engines.
 */
export class BrokerClock {
  constructor({ warnThresholdMs = 2000 } = {}) {
    this.warnThresholdMs = Math.max(0, warnThresholdMs);
    this.offsetMs = 0;
    this.syncedAt = null;
  }

  now() {
    return Date.now() + this.offsetMs;
  }

  getOffsetMs() {
    return this.offsetMs;
  }

  async syncWithBroker(broker) {
    if (!broker || typeof broker.getServerTime !== "function") {
      this.offsetMs = 0;
      this.syncedAt = Date.now();
      return {
        serverTime: null,
        localTime: this.syncedAt,
        offsetMs: this.offsetMs,
        warning: null,
      };
    }

    let serverTime = null;
    try {
      serverTime = Number(await broker.getServerTime());
    } catch {
      serverTime = null;
    }

    const localTime = Date.now();
    this.offsetMs = Number.isFinite(serverTime) ? serverTime - localTime : 0;
    this.syncedAt = localTime;
    const warning =
      Math.abs(this.offsetMs) > this.warnThresholdMs
        ? `clock offset ${this.offsetMs}ms exceeds threshold ${this.warnThresholdMs}ms`
        : null;
    return {
      serverTime,
      localTime,
      offsetMs: this.offsetMs,
      warning,
    };
  }
}

export function createClock(options) {
  return new BrokerClock(options);
}
