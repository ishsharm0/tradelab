import { EventEmitter } from "node:events";

export const LIVE_EVENTS = [
  "signal",
  "order:submitted",
  "order:filled",
  "order:canceled",
  "order:rejected",
  "order:modified",
  "position:opened",
  "position:updated",
  "position:closed",
  "equity:update",
  "risk:warning",
  "risk:halt",
  "bar",
  "tick",
  "error",
  "connected",
  "disconnected",
  "reconnecting",
  "shutdown",
  "stateRestored",
  "reconciled",
];

/**
 * Lightweight event bus used by live trading components.
 *
 * Events are emitted on their native channel plus the wildcard `*` channel for
 * consumers that want to capture all traffic (for logging/monitoring).
 */
export class EventBus extends EventEmitter {
  emitEvent(event, payload = {}) {
    this.emit(event, payload);
    this.emit("*", { event, payload });
    return true;
  }

  onAny(handler) {
    this.on("*", handler);
    return () => this.off("*", handler);
  }
}

export function createEventBus() {
  return new EventBus();
}
