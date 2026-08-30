// "Did you mean …" suggestions for unrecognized ticker input.
// Bounded edit distance keeps the scan over ~900 symbols cheap.

export function boundedEditDistance(left, right, max = 2) {
  const a = String(left || "");
  const b = String(right || "");
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

/**
 * Rank candidate symbols for a query the catalog does not recognize.
 * Prefix matches rank first, then containment, then small edit distances.
 */
export function suggestSimilarSymbols(query, symbols, { limit = 3, maxDistance = 2 } = {}) {
  const normalized = String(query || "").trim().toUpperCase();
  if (normalized.length < 2) return [];
  const scored = [];
  for (const candidate of symbols) {
    const symbol = String(candidate).toUpperCase();
    if (symbol === normalized) continue;
    let tier = null;
    let distance = 0;
    if (symbol.startsWith(normalized) || normalized.startsWith(symbol)) {
      tier = 0;
    } else if (symbol.includes(normalized)) {
      tier = 1;
    } else {
      distance = boundedEditDistance(normalized, symbol, maxDistance);
      if (distance <= maxDistance) tier = 2;
    }
    if (tier == null) continue;
    scored.push({ symbol, tier, distance, lengthGap: Math.abs(symbol.length - normalized.length) });
  }
  return scored
    .sort(
      (leftItem, rightItem) =>
        leftItem.tier - rightItem.tier
        || leftItem.distance - rightItem.distance
        || leftItem.lengthGap - rightItem.lengthGap
        || leftItem.symbol.localeCompare(rightItem.symbol),
    )
    .slice(0, limit)
    .map((item) => item.symbol);
}
