import test from "node:test";
import assert from "node:assert/strict";
import { withBudget, BudgetExceededError } from "../../src/engine/asyncSignal.js";

test("withBudget resolves when the promise beats the deadline", async () => {
  const value = await withBudget(Promise.resolve(42), 50);
  assert.equal(value, 42);
});

test("withBudget rejects with BudgetExceededError on timeout", async () => {
  const slow = new Promise((resolve) => setTimeout(() => resolve(1), 100));
  await assert.rejects(
    () => withBudget(slow, 10),
    (err) => err instanceof BudgetExceededError
  );
});

test("withBudget of 0 or undefined disables the timeout", async () => {
  const slow = new Promise((resolve) => setTimeout(() => resolve(7), 20));
  assert.equal(await withBudget(slow, 0), 7);
});
