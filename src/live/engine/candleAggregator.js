import { EventEmitter } from "node:events";

import { estimateBarMs } from "../../engine/execution.js";
import { isSession } from "../../utils/time.js";

function intervalToMs(interval) {
  const raw = String(interval || "1m")
    .trim()
    .toLowerCase();
  const match = raw.match(/^(\d+)(m|h|d)$/);
  if (!match) return 60_000;
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "m") return amount * 60_000;
  if (unit === "h") return amount * 60 * 60_000;
  return amount * 24 * 60 * 60_000;
}

function normalizeTick(tick) {
  const time = Number(tick?.time);
  const price = Number(tick?.price ?? tick?.last ?? tick?.close ?? tick?.bid ?? tick?.ask);
  const volume = Number(tick?.size ?? tick?.volume ?? 0);
  if (!Number.isFinite(time) || !Number.isFinite(price)) return null;
  return {
    time,
    price,
    volume: Number.isFinite(volume) ? volume : 0,
  };
}

function bucketStart(time, bucketMs) {
  return Math.floor(time / bucketMs) * bucketMs;
}

/**
 * Handles bar-completion detection for streaming bars, ticks, or polling data.
 */
export class CandleAggregator extends EventEmitter {
  constructor({ mode = "stream", interval = "1m", graceMs = 5000, session = "AUTO" } = {}) {
    super();
    this.mode = mode;
    this.interval = interval;
    this.graceMs = Math.max(0, Number(graceMs) || 5000);
    this.session = session;
    this.intervalMs = intervalToMs(interval);
    this.current = null;
    this.lastEmittedTime = -Infinity;
  }

  onBar(handler) {
    this.on("bar", handler);
    return () => this.off("bar", handler);
  }

  emitBar(bar) {
    if (!bar || !Number.isFinite(bar.time)) return;
    if (bar.time <= this.lastEmittedTime) return;
    this.lastEmittedTime = bar.time;
    this.emit("bar", bar);
  }

  processBar(bar, { isFinal = true } = {}) {
    if (!bar || !Number.isFinite(bar.time)) return;
    if (this.mode === "stream") {
      if (isFinal) this.emitBar(bar);
      return;
    }
    this.emitBar(bar);
  }

  processPolledBars(bars = []) {
    const ordered = [...bars].sort((left, right) => left.time - right.time);
    for (const bar of ordered) {
      this.emitBar(bar);
    }
  }

  processTick(rawTick) {
    const tick = normalizeTick(rawTick);
    if (!tick) return;

    const start = bucketStart(tick.time, this.intervalMs);
    if (!this.current) {
      this.current = {
        time: start,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: tick.volume,
        _lastTickTime: tick.time,
      };
      return;
    }

    if (start === this.current.time) {
      this.current.high = Math.max(this.current.high, tick.price);
      this.current.low = Math.min(this.current.low, tick.price);
      this.current.close = tick.price;
      this.current.volume += tick.volume;
      this.current._lastTickTime = tick.time;
      return;
    }

    if (start > this.current.time) {
      this.emitBar({
        time: this.current.time,
        open: this.current.open,
        high: this.current.high,
        low: this.current.low,
        close: this.current.close,
        volume: this.current.volume,
      });
      this.current = {
        time: start,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: tick.volume,
        _lastTickTime: tick.time,
      };
    }
  }

  forceClose(timeMs = Date.now()) {
    if (!this.current) return;
    const closeDeadline = this.current.time + this.intervalMs + this.graceMs;
    const sessionOpen = isSession(this.current.time + this.intervalMs, this.session);
    if (timeMs >= closeDeadline || !sessionOpen) {
      this.emitBar({
        time: this.current.time,
        open: this.current.open,
        high: this.current.high,
        low: this.current.low,
        close: this.current.close,
        volume: this.current.volume,
      });
      this.current = null;
    }
  }

  estimateFromSeries(candles) {
    const estimated = estimateBarMs(candles);
    if (Number.isFinite(estimated) && estimated > 0) {
      this.intervalMs = estimated;
    }
    return this.intervalMs;
  }
}

export function createCandleAggregator(options) {
  return new CandleAggregator(options);
}
