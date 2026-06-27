import { createResearchStore } from "../research/store.js";

export function researchTools({ dir } = {}) {
  const store = createResearchStore(dir ? { dir } : {});
  return {
    research_open: {
      description: "Open or resume a persistent research session for iterating on strategy hypotheses.",
      handler: async ({ id, goal } = {}) => store.open(id, goal),
    },
    research_log: {
      description: "Append a tested hypothesis (params, metrics, optional overfitting verdict) to a research session.",
      handler: async ({ id, hypothesis, params, metrics, verdict } = {}) =>
        store.log(id, { hypothesis, params, metrics, verdict }),
    },
    research_recall: {
      description: "Recall recent research entries plus a synthesized summary (best Sharpe, overfit count).",
      handler: async ({ id, limit } = {}) => store.recall(id, limit),
    },
    research_close: {
      description: "Mark a research session complete and return its final record.",
      handler: async ({ id } = {}) => store.close(id),
    },
  };
}
