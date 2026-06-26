import { BarSystemRunner } from "./barSystemRunner.js";
import { withBudget } from "./asyncSignal.js";

/**
 * Async sibling of backtest(). Identical result shape, but `signal()` may return
 * a Promise. Each bar's signal is raced against `signalBudgetMs` (0 disables).
 *
 * Built on BarSystemRunner so position/pending/exit logic is shared with the
 * sync engine and portfolio mode.
 */
export async function backtestAsync(rawOptions = {}) {
  const budgetMs = rawOptions.signalBudgetMs ?? 0;
  const userSignal = rawOptions.signal;
  const budgetedSignal = (context) =>
    withBudget(
      Promise.resolve().then(() => userSignal(context)),
      budgetMs
    );

  const runner = new BarSystemRunner({ ...rawOptions, signal: budgetedSignal });

  while (runner.hasNext()) {
    await runner.stepAsync({ signalEquity: runner.getMarkedEquity() });
  }

  return runner.buildResult();
}
