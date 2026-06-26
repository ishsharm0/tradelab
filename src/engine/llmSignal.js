import { withBudget } from "./asyncSignal.js";

function isArrayIndexKey(property) {
  if (typeof property !== "string") return false;
  const n = Number(property);
  return Number.isInteger(n) && n >= 0;
}

function noLookaheadView(candles, index) {
  return new Proxy(candles, {
    get(target, property, receiver) {
      if (isArrayIndexKey(property) && Number(property) > index) {
        throw new Error(
          `LlmSignal: lookahead access to candles[${String(property)}] (current index ${index})`
        );
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

/**
 * Wraps an async model-backed decision function for use as a tradelab signal.
 *
 * - Caches by bar time: resolve() runs at most once per bar.
 * - Enforces a per-bar `budgetMs` time budget.
 * - Exposes a no-lookahead candle view to resolve().
 * - Logs every decision (context summary, result or error) in `this.log`.
 *
 * `onError`: "skip" (return null, default) or "throw".
 * Use the instance's `.signal` bound method as the engine's `signal` option.
 */
export class LlmSignal {
  constructor({ resolve, budgetMs = 0, onError = "skip" } = {}) {
    if (typeof resolve !== "function") {
      throw new Error("LlmSignal requires a resolve(context) function");
    }
    this.resolve = resolve;
    this.budgetMs = budgetMs;
    this.onError = onError;
    this.log = [];
    this._cache = new Map();
    this.signal = this.signal.bind(this);
  }

  async signal(context) {
    const key = context.bar?.time ?? context.index;
    if (this._cache.has(key)) return this._cache.get(key);

    const safeContext = {
      ...context,
      candles: noLookaheadView(context.candles, context.index),
    };

    const startedAt = Date.now();
    try {
      const result = await withBudget(
        Promise.resolve().then(() => this.resolve(safeContext)),
        this.budgetMs
      );
      this._cache.set(key, result ?? null);
      this.log.push({
        index: context.index,
        time: context.bar?.time,
        close: context.bar?.close,
        latencyMs: Date.now() - startedAt,
        result: result ?? null,
      });
      return result ?? null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.push({
        index: context.index,
        time: context.bar?.time,
        close: context.bar?.close,
        latencyMs: Date.now() - startedAt,
        error: message,
      });
      this._cache.set(key, null);
      if (this.onError === "throw") throw error;
      return null;
    }
  }
}
