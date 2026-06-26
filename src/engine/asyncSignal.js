export class BudgetExceededError extends Error {
  constructor(ms) {
    super(`signal() exceeded its ${ms}ms per-bar budget`);
    this.name = "BudgetExceededError";
    this.budgetMs = ms;
  }
}

/**
 * Race a promise against a per-bar time budget. `budgetMs` of 0/undefined
 * disables the timeout. Rejects with BudgetExceededError on overrun.
 */
export function withBudget(promise, budgetMs) {
  if (!budgetMs || budgetMs <= 0) return Promise.resolve(promise);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new BudgetExceededError(budgetMs)), budgetMs);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
