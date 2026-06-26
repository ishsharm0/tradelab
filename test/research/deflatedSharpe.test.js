import test from "node:test";
import assert from "node:assert/strict";
import { normalCdf, normalPpf } from "../../src/research/stats.js";
import { deflatedSharpe, sweepHaircut } from "../../src/research/deflatedSharpe.js";

test("normalCdf/normalPpf are consistent inverses", () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-3);
  assert.ok(Math.abs(normalPpf(0.975) - 1.96) < 1e-2);
});

test("deflatedSharpe falls as the number of trials grows", () => {
  const base = {
    sharpe: 2.0,
    sampleSize: 250,
    skew: 0,
    kurtosis: 3,
    sharpeStd: 0.5,
  };
  const few = deflatedSharpe({ ...base, numTrials: 1 });
  const many = deflatedSharpe({ ...base, numTrials: 100 });
  assert.ok(many < few);
  assert.ok(few >= 0 && few <= 1);
  assert.ok(many >= 0 && many <= 1);
});

test("sweepHaircut returns the expected-max-sharpe threshold under the null", () => {
  const hc = sweepHaircut({ numTrials: 50, sharpeStd: 0.4 });
  assert.ok(hc.expectedMaxSharpe > 0);
  assert.ok(
    hc.expectedMaxSharpe > sweepHaircut({ numTrials: 5, sharpeStd: 0.4 }).expectedMaxSharpe
  );
});
