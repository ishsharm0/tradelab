import test from "node:test";
import assert from "node:assert/strict";
import { financingCost, fundingEvents } from "../../src/engine/execution.js";

const YEAR = 365 * 24 * 60 * 60 * 1000;

test("carry: a long held one year at 5% annual on 10k notional costs 500", () => {
  const cost = financingCost({
    side: "long",
    notional: 10_000,
    fromMs: 0,
    toMs: YEAR,
    costs: { carry: { longAnnualBps: 500, shortAnnualBps: 800 } },
  });
  assert.ok(Math.abs(cost - 500) < 1e-6);
});

test("carry: a short uses shortAnnualBps", () => {
  const cost = financingCost({
    side: "short",
    notional: 10_000,
    fromMs: 0,
    toMs: YEAR / 2,
    costs: { carry: { longAnnualBps: 500, shortAnnualBps: 800 } },
  });
  assert.ok(Math.abs(cost - 400) < 1e-6);
});

test("fundingEvents counts boundaries strictly after from and up to to", () => {
  const h8 = 8 * 60 * 60 * 1000;
  assert.equal(fundingEvents(0, 24 * 60 * 60 * 1000, h8, 0), 3);
  assert.equal(fundingEvents(0, h8 - 1, h8, 0), 0);
  assert.equal(fundingEvents(h8, 24 * 60 * 60 * 1000, h8, 0), 2);
});

test("funding: a long pays when rate is positive, a short receives", () => {
  const h8 = 8 * 60 * 60 * 1000;
  const base = { funding: { rateBps: 10, intervalMs: h8, anchorMs: 0 } };
  const longCost = financingCost({
    side: "long",
    notional: 10_000,
    fromMs: 0,
    toMs: 24 * 60 * 60 * 1000,
    costs: base,
  });
  const shortCost = financingCost({
    side: "short",
    notional: 10_000,
    fromMs: 0,
    toMs: 24 * 60 * 60 * 1000,
    costs: base,
  });
  assert.ok(Math.abs(longCost - 30) < 1e-6);
  assert.ok(Math.abs(shortCost + 30) < 1e-6);
});

test("no carry/funding config => zero cost", () => {
  assert.equal(
    financingCost({ side: "long", notional: 10_000, fromMs: 0, toMs: YEAR, costs: {} }),
    0
  );
  assert.equal(
    financingCost({ side: "long", notional: 10_000, fromMs: 0, toMs: YEAR, costs: null }),
    0
  );
});
