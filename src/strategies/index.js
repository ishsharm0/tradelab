import { BUILTINS } from "./builtins.js";

const registry = new Map(Object.entries(BUILTINS));

/** Register a custom strategy at runtime. `def` is a BUILTINS-shaped object. */
export function registerStrategy(name, def) {
  if (typeof def?.factory !== "function") {
    throw new Error(`registerStrategy("${name}") requires a factory function`);
  }
  registry.set(name, def);
}

/** List all strategies as { name, description, params }. */
export function listStrategies() {
  return [...registry.entries()].map(([name, def]) => ({
    name,
    description: def.description,
    params: def.params,
  }));
}

/** Get a strategy's signalFactory(params) => signal. Throws on unknown name. */
export function getStrategy(name) {
  const def = registry.get(name);
  if (!def) {
    const available = [...registry.keys()].join(", ");
    throw new Error(`Unknown strategy "${name}". Available: ${available}`);
  }
  return def.factory;
}
