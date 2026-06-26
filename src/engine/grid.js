/**
 * Expand a parameter grid into an array of parameter-set objects.
 * Array values are swept; scalar values are held fixed across all sets.
 */
export function grid(spec = {}) {
  const keys = Object.keys(spec);
  if (!keys.length) return [{}];
  return keys.reduce(
    (acc, key) => {
      const values = Array.isArray(spec[key]) ? spec[key] : [spec[key]];
      return acc.flatMap((base) => values.map((v) => ({ ...base, [key]: v })));
    },
    [{}]
  );
}
