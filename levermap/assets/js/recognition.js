const TOKEN_PATTERN = /\b[A-Za-z][A-Za-z0-9.-]{0,9}\b/g;
const NUMBER_PATTERN = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
const CJK_CHAR = /[㐀-鿿豈-﫿]/;

// Uppercase Latin runs that look like tickers but are trading or macro jargon.
// Only consulted for tokens the catalog does NOT know, so real symbols that
// collide with an abbreviation (ON, NOW, ALL, FIX, ARM) are never suppressed.
const TOKEN_BLACKLIST = new Set([
  // order and position shorthand
  "AM", "PM", "MAX", "PAIN", "ETF", "ETFS", "USD", "CNY", "HKD", "EUR", "JPY",
  "TP", "SL", "PT", "BE", "DD", "TA", "FA", "OI", "IV", "DTE", "ITM", "OTM", "ATM",
  "ATH", "ATL", "YTD", "MTD", "QOQ", "YOY", "CAGR", "FCF", "EBITDA",
  // valuation and accounting
  "PE", "PB", "PS", "PEG", "EPS", "ROI", "ROE", "ROA", "GAAP", "IPO", "SEC",
  // macro
  "CPI", "PPI", "PCE", "GDP", "FOMC", "FED", "ECB", "BOJ", "PMI", "ISM", "NFP",
  "QE", "QT", "DXY",
  // indicators
  "RSI", "MACD", "EMA", "SMA", "VWAP", "KDJ", "CCI", "ADX", "BOLL",
  // calendar
  "Q1", "Q2", "Q3", "Q4", "H1", "H2", "FY", "YE", "ET", "EST", "EDT", "UTC",
  // chat and generic tech
  "AI", "IMO", "IMHO", "FYI", "BTW", "LOL", "TBH", "ASAP", "EOD", "EOW",
  "CEO", "CFO", "CTO", "COO", "FDA", "DOJ", "FTC", "IRS",
  "GPU", "CPU", "TPU", "RAM", "SSD", "HDD", "HBM", "LLM", "API", "SDK",
  "KPI", "OKR", "B2B", "B2C", "SAAS", "IOT", "ESG", "REIT",
]);

// Characters that turn a preceding number into a quantity, a ratio or a date
// rather than a price. Currency words are deliberately absent: "350美元" is a price.
const QUANTITY_SUFFIX = /[年月日万亿兆倍手股台份人次家秒周季度支只]/;

export function parseAliasAssignments(value) {
  const aliases = new Map();
  for (const entry of String(value || "").split(/[,，;；\n]+/)) {
    const match = entry.trim().match(/^(.+?)\s*[=:＝]\s*([A-Za-z][A-Za-z0-9.-]{0,9})$/);
    if (!match) continue;
    aliases.set(match[1].trim(), match[2].toUpperCase());
  }
  return aliases;
}

/**
 * Decide whether a Latin token may stand for a ticker.
 *
 * Short tokens are the dangerous ones: "Q3", "TP", "PE" and a bare "U" all look
 * like symbols next to Chinese text. They are accepted only when the catalog
 * actually lists them, and a one-letter symbol additionally has to stand clear
 * of Chinese characters. Longer unknown tokens stay eligible so a freshly
 * launched ticker still shows up as "未收录" instead of vanishing.
 */
function tokenEligibility(raw, symbol, isKnown, before, after) {
  const touchesCjk = CJK_CHAR.test(before) || CJK_CHAR.test(after);
  if (symbol.length === 1) return isKnown && !touchesCjk;
  if (symbol.length === 2) return isKnown;
  if (isKnown) return true;
  return raw === symbol && !TOKEN_BLACKLIST.has(symbol);
}

function symbolMentions(line, knownSymbols, aliases) {
  const mentions = [];
  for (const match of line.matchAll(TOKEN_PATTERN)) {
    const raw = match[0];
    const symbol = raw.toUpperCase();
    const isKnown = knownSymbols.has(symbol);
    const before = line[match.index - 1] || "";
    const after = line[match.index + raw.length] || "";
    if (!tokenEligibility(raw, symbol, isKnown, before, after)) continue;
    mentions.push({
      start: match.index,
      end: match.index + raw.length,
      raw,
      symbol,
      source: isKnown ? "ticker" : "unknown",
      confidence: isKnown ? 2 : 1,
    });
  }
  for (const [alias, symbol] of aliases) {
    let cursor = 0;
    while (alias && cursor < line.length) {
      const start = line.indexOf(alias, cursor);
      if (start < 0) break;
      mentions.push({
        start,
        end: start + alias.length,
        raw: alias,
        symbol,
        source: "alias",
        confidence: 2,
      });
      cursor = start + alias.length;
    }
  }

  const ordered = mentions
    .sort(
      (left, right) =>
        left.start - right.start
        || right.confidence - left.confidence
        || right.end - left.end,
    )
    .filter((mention, index, all) => !all.slice(0, index).some((other) => mention.start < other.end));

  // Keep eligible unknown tickers as real segment boundaries even when the
  // same line also contains a catalog-known symbol. Otherwise "AAPL 250，XYZ
  // 100" silently assigns 100 to AAPL. Jargon such as Q3/EPS is already
  // rejected by tokenEligibility(), while a newly launched ticker remains
  // visible as an unlisted symbol.
  return ordered;
}

function numericLevels(segment) {
  const levels = [];
  for (const match of segment.matchAll(NUMBER_PATTERN)) {
    const start = match.index;
    const end = start + match[0].length;
    const before = segment[start - 1] || "";
    const after = segment[end] || "";
    if (/[\/:]/.test(before) || /[\/:％%xX×]/.test(after)) continue;
    if (QUANTITY_SUFFIX.test(after)) continue;
    // Part of an alphanumeric token rather than a standalone price: the "3" in
    // "Q3", the "100" in "A100". Prices are not glued to a letter.
    if (/[A-Za-z]/.test(before)) continue;
    const value = Number(match[0].replaceAll(",", ""));
    if (Number.isFinite(value) && value > 0) levels.push(value);
  }
  return levels;
}

export function extractTickerLevels(text, { knownSymbols = [], aliases = new Map() } = {}) {
  const known = new Set([...knownSymbols].map((symbol) => String(symbol).toUpperCase()));
  const aliasMap = aliases instanceof Map ? aliases : new Map(Object.entries(aliases));
  const results = [];
  const seen = new Set();
  let context = null;

  String(text || "").split(/\r?\n/).forEach((line, lineIndex) => {
    const mentions = symbolMentions(line, known, aliasMap);
    if (mentions.length) context = mentions[0];
    const segments = mentions.length
      ? mentions.map((mention, index) => ({
          mention,
          text: line.slice(mention.end, mentions[index + 1]?.start ?? line.length),
        }))
      : context
        ? [{ mention: context, text: line }]
        : [];

    for (const { mention, text: segment } of segments) {
      for (const level of numericLevels(segment)) {
        const key = `${mention.symbol}:${level}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          symbol: mention.symbol,
          rawSymbol: mention.raw,
          source: mention.source,
          level,
          line: line.trim(),
          lineIndex,
        });
      }
    }
  });
  return results;
}

/**
 * A number sitting near a ticker is not automatically a price for it. EPS, share
 * counts and index points that survive the text filters are caught here by
 * comparing against the product's own anchor.
 */
export function plausibleLevel(level, anchor, { spread = 4 } = {}) {
  const value = Number(level);
  const base = Number(anchor);
  if (!Number.isFinite(value) || value <= 0) return false;
  if (!Number.isFinite(base) || base <= 0) return true;
  return value >= base / spread && value <= base * spread;
}
