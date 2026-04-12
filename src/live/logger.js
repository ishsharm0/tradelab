const LOG_PRIORITIES = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function normalizeLevel(level) {
  return Object.prototype.hasOwnProperty.call(LOG_PRIORITIES, level) ? level : "info";
}

/**
 * Structured JSON logger for live components.
 */
export class LiveLogger {
  constructor({ level = "info", stream = process.stdout } = {}) {
    this.level = normalizeLevel(level);
    this.stream = stream;
    this._unsub = null;
  }

  shouldLog(level) {
    return LOG_PRIORITIES[level] >= LOG_PRIORITIES[this.level];
  }

  write(level, message, fields = {}) {
    const normalizedLevel = normalizeLevel(level);
    if (!this.shouldLog(normalizedLevel)) return;
    const record = {
      t: new Date().toISOString(),
      level: normalizedLevel,
      msg: message,
      ...fields,
    };
    this.stream.write(`${JSON.stringify(record)}\n`);
  }

  debug(message, fields) {
    this.write("debug", message, fields);
  }

  info(message, fields) {
    this.write("info", message, fields);
  }

  warn(message, fields) {
    this.write("warn", message, fields);
  }

  error(message, fields) {
    this.write("error", message, fields);
  }

  attach(eventBus) {
    if (!eventBus || typeof eventBus.onAny !== "function") return () => {};
    this.detach();
    this._unsub = eventBus.onAny(({ event, payload }) => {
      const level =
        event === "error"
          ? "error"
          : event.startsWith("risk:")
            ? "warn"
            : event === "reconnecting" || event === "disconnected"
              ? "warn"
              : "info";
      this.write(level, event, { event, payload });
    });
    return () => this.detach();
  }

  detach() {
    if (typeof this._unsub === "function") {
      this._unsub();
      this._unsub = null;
    }
  }
}

export function createLogger(options) {
  return new LiveLogger(options);
}
