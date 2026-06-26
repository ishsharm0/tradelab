/** All k-sized index combinations of [0..n). Returns arrays of indices. */
export function combinations(n, k) {
  const result = [];
  const combo = [];
  function recurse(start) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < n; i += 1) {
      combo.push(i);
      recurse(i + 1);
      combo.pop();
    }
  }
  recurse(0);
  return result;
}
