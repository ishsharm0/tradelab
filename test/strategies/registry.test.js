import test from "node:test";
import assert from "node:assert/strict";
import { listStrategies, getStrategy } from "../../src/strategies/index.js";

test("listStrategies returns built-ins with name, description, params", () => {
  const all = listStrategies();
  const names = all.map((s) => s.name);
  assert.ok(names.includes("ema-cross"));
  assert.ok(names.includes("rsi-reversion"));
  assert.ok(names.includes("donchian-breakout"));
  assert.ok(names.includes("buy-hold"));
  const ema = all.find((s) => s.name === "ema-cross");
  assert.equal(typeof ema.description, "string");
  assert.equal(typeof ema.params.fast.default, "number");
});

test("getStrategy returns a signalFactory producing a working signal", () => {
  const factory = getStrategy("ema-cross");
  const signal = factory({ fast: 3, slow: 5, rr: 2 });
  assert.equal(typeof signal, "function");
  const candles = Array.from({ length: 20 }, (_, i) => ({
    time: i * 60000,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
  }));
  const out = signal({ candles, index: 19, bar: candles[19], equity: 10_000 });
  assert.ok(out === null || typeof out === "object");
});

test("getStrategy throws on unknown name with the available list", () => {
  assert.throws(() => getStrategy("nope"), /Unknown strategy "nope"/);
});
