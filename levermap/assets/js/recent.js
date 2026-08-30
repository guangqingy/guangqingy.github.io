// Recently-viewed pairs, persisted per browser.
// Pure list helpers live here so they can be unit-tested in Node;
// the browser module wires them to localStorage.

export const RECENT_STORAGE_KEY = "leverpath.recent.v1";
export const RECENT_LIMIT = 8;

function normalizeEntry(entry) {
  const symbol = String(entry?.symbol || "").trim().toUpperCase();
  const product = String(entry?.product || "").trim().toUpperCase();
  if (!symbol) return null;
  return { symbol, product: product || null };
}

/** Parse a stored JSON string into a clean, de-duplicated list. */
export function parseRecentList(raw, limit = RECENT_LIMIT) {
  let parsed;
  try {
    parsed = JSON.parse(String(raw || "[]"));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set();
  const list = [];
  for (const item of parsed) {
    const entry = normalizeEntry(item);
    if (!entry || seen.has(entry.symbol)) continue;
    seen.add(entry.symbol);
    list.push(entry);
    if (list.length >= limit) break;
  }
  return list;
}

/**
 * Insert an entry at the front, de-duplicating by underlying symbol and
 * capping the list length. Returns a new array; never mutates the input.
 */
export function pushRecentEntry(list, entry, limit = RECENT_LIMIT) {
  const normalized = normalizeEntry(entry);
  if (!normalized) return [...list];
  const rest = list.filter((item) => item.symbol !== normalized.symbol);
  return [normalized, ...rest].slice(0, limit);
}

export function serializeRecentList(list) {
  return JSON.stringify(list.map(({ symbol, product }) => ({ symbol, product })));
}
