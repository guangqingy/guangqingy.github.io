// Built-in Chinese name → U.S. ticker dictionary.
//
// Scope levels:
//   "all"    — safe in both search suggestions and free-text recognition
//              (the phrase almost always refers to the instrument itself).
//   "search" — search suggestions only; too generic for free-text extraction
//              (e.g. sector or country words that often appear near unrelated numbers).
//
// Entries are filtered against the loaded catalog at runtime, so rows whose
// symbol is not in data/catalog.json are ignored instead of causing errors.
// Personal aliases entered in the recognition dialog always override this dictionary.

export const ZH_ALIAS_ENTRIES = [
  // ——— Mega caps & popular single names ———
  { zh: "特斯拉", symbol: "TSLA", scope: "all" },
  { zh: "英伟达", symbol: "NVDA", scope: "all" },
  { zh: "老黄", symbol: "NVDA", scope: "all" },
  { zh: "苹果", symbol: "AAPL", scope: "all" },
  { zh: "微软", symbol: "MSFT", scope: "all" },
  { zh: "谷歌", symbol: "GOOGL", scope: "all" },
  { zh: "亚马逊", symbol: "AMZN", scope: "all" },
  { zh: "脸书", symbol: "META", scope: "all" },
  { zh: "奈飞", symbol: "NFLX", scope: "all" },
  { zh: "网飞", symbol: "NFLX", scope: "all" },
  { zh: "台积电", symbol: "TSM", scope: "all" },
  { zh: "博通", symbol: "AVGO", scope: "all" },
  { zh: "苏妈", symbol: "AMD", scope: "all" },
  { zh: "超威", symbol: "AMD", scope: "all" },
  { zh: "英特尔", symbol: "INTC", scope: "all" },
  { zh: "美光", symbol: "MU", scope: "all" },
  { zh: "高通", symbol: "QCOM", scope: "all" },
  { zh: "甲骨文", symbol: "ORCL", scope: "all" },
  { zh: "赛富时", symbol: "CRM", scope: "all" },
  { zh: "阿斯麦", symbol: "ASML", scope: "all" },
  { zh: "应用材料", symbol: "AMAT", scope: "all" },
  { zh: "德州仪器", symbol: "TXN", scope: "all" },
  { zh: "思科", symbol: "CSCO", scope: "all" },
  { zh: "戴尔", symbol: "DELL", scope: "all" },
  { zh: "诺基亚", symbol: "NOK", scope: "all" },
  { zh: "康宁", symbol: "GLW", scope: "all" },
  { zh: "超微", symbol: "SMCI", scope: "all" },
  { zh: "超微电脑", symbol: "SMCI", scope: "all" },
  { zh: "海力士", symbol: "SKHY", scope: "all" },
  { zh: "闪迪", symbol: "SNDK", scope: "all" },
  { zh: "西部数据", symbol: "WDC", scope: "all" },
  { zh: "西数", symbol: "WDC", scope: "all" },
  { zh: "希捷", symbol: "STX", scope: "all" },
  { zh: "帕兰提尔", symbol: "PLTR", scope: "all" },
  { zh: "雪花", symbol: "SNOW", scope: "all" },
  { zh: "微策略", symbol: "MSTR", scope: "all" },
  { zh: "游戏驿站", symbol: "GME", scope: "all" },
  { zh: "罗宾汉", symbol: "HOOD", scope: "all" },
  { zh: "多邻国", symbol: "DUOL", scope: "all" },
  { zh: "火箭实验室", symbol: "RKLB", scope: "all" },
  { zh: "小马智行", symbol: "PONY", scope: "all" },
  { zh: "波音", symbol: "BA", scope: "all" },
  { zh: "洛马", symbol: "LMT", scope: "all" },
  { zh: "洛克希德", symbol: "LMT", scope: "all" },
  { zh: "霍尼韦尔", symbol: "HON", scope: "all" },
  { zh: "卡特彼勒", symbol: "CAT", scope: "all" },
  { zh: "埃克森美孚", symbol: "XOM", scope: "all" },
  { zh: "埃克森", symbol: "XOM", scope: "all" },
  { zh: "淡水河谷", symbol: "VALE", scope: "all" },
  { zh: "伯克希尔", symbol: "BRK-B", scope: "all" },
  { zh: "高盛", symbol: "GS", scope: "all" },
  { zh: "联合健康", symbol: "UNH", scope: "all" },
  { zh: "礼来", symbol: "LLY", scope: "all" },
  { zh: "莫德纳", symbol: "MRNA", scope: "all" },
  { zh: "诺和诺德", symbol: "NVO", scope: "all" },
  { zh: "开市客", symbol: "COST", scope: "all" },
  { zh: "好市多", symbol: "COST", scope: "all" },
  { zh: "优步", symbol: "UBER", scope: "all" },
  { zh: "特朗普媒体", symbol: "DJT", scope: "all" },
  // ——— China ADRs ———
  { zh: "阿里巴巴", symbol: "BABA", scope: "all" },
  { zh: "阿里", symbol: "BABA", scope: "all" },
  { zh: "拼多多", symbol: "PDD", scope: "all" },
  { zh: "百度", symbol: "BIDU", scope: "all" },
  { zh: "蔚来", symbol: "NIO", scope: "all" },
  { zh: "小鹏", symbol: "XPEV", scope: "all" },
  { zh: "富途", symbol: "FUTU", scope: "all" },
  // ——— Index / commodity phrases（交易语境下几乎总是指标的本身）———
  { zh: "纳指", symbol: "QQQ", scope: "all" },
  { zh: "纳斯达克", symbol: "QQQ", scope: "all" },
  { zh: "标普", symbol: "SPY", scope: "all" },
  { zh: "道指", symbol: "DIA", scope: "all" },
  { zh: "道琼斯", symbol: "DIA", scope: "all" },
  { zh: "罗素", symbol: "IWM", scope: "all" },
  { zh: "费半", symbol: "SOXX", scope: "all" },
  { zh: "七巨头", symbol: "MAGS", scope: "all" },
  { zh: "木头姐", symbol: "ARKK", scope: "all" },
  { zh: "方舟", symbol: "ARKK", scope: "all" },
  { zh: "黄金", symbol: "GLD", scope: "all" },
  { zh: "白银", symbol: "SLV", scope: "all" },
  { zh: "原油", symbol: "USO", scope: "all" },
  { zh: "天然气", symbol: "UNG", scope: "all" },
  { zh: "美债", symbol: "TLT", scope: "all" },
  { zh: "长债", symbol: "TLT", scope: "all" },
  // ——— Crypto references（目录内保留、站点不出位点，仅便于检索与解释）———
  { zh: "比特币", symbol: "BTC-USD", scope: "all" },
  { zh: "以太坊", symbol: "ETH-USD", scope: "all" },
  { zh: "瑞波", symbol: "XRP-USD", scope: "all" },
  { zh: "索拉纳", symbol: "SOL-USD", scope: "all" },
  // ——— Generic sector / region words: search suggestions only ———
  { zh: "半导体", symbol: "SOXX", scope: "search" },
  { zh: "中概", symbol: "KWEB", scope: "search" },
  { zh: "中概互联", symbol: "KWEB", scope: "search" },
  { zh: "富时中国", symbol: "FXI", scope: "search" },
  { zh: "沪深300", symbol: "ASHR", scope: "search" },
  { zh: "A股", symbol: "ASHR", scope: "search" },
  { zh: "日本", symbol: "EWJ", scope: "search" },
  { zh: "韩国", symbol: "EWY", scope: "search" },
  { zh: "印度", symbol: "INDA", scope: "search" },
  { zh: "巴西", symbol: "EWZ", scope: "search" },
  { zh: "欧洲", symbol: "VGK", scope: "search" },
  { zh: "新兴市场", symbol: "EEM", scope: "search" },
  { zh: "金融", symbol: "XLF", scope: "search" },
  { zh: "能源", symbol: "XLE", scope: "search" },
  { zh: "科技", symbol: "XLK", scope: "search" },
  { zh: "医疗", symbol: "XLV", scope: "search" },
  { zh: "生物科技", symbol: "XBI", scope: "search" },
  { zh: "房地产", symbol: "IYR", scope: "search" },
  { zh: "公用事业", symbol: "XLU", scope: "search" },
  { zh: "工业", symbol: "XLI", scope: "search" },
  { zh: "材料", symbol: "XLB", scope: "search" },
  { zh: "通信", symbol: "XLC", scope: "search" },
  { zh: "零售", symbol: "XRT", scope: "search" },
  { zh: "区域银行", symbol: "KRE", scope: "search" },
  { zh: "金矿", symbol: "GDX", scope: "search" },
  { zh: "铜", symbol: "CPER", scope: "search" },
  { zh: "铜矿", symbol: "COPX", scope: "search" },
  { zh: "铂金", symbol: "PPLT", scope: "search" },
  { zh: "钯金", symbol: "PALL", scope: "search" },
  { zh: "恐慌指数", symbol: "VIXY", scope: "search" },
  { zh: "高收益债", symbol: "HYG", scope: "search" },
];

const CJK_PATTERN = /[㐀-鿿]/;

export function containsCjk(value) {
  return CJK_PATTERN.test(String(value || ""));
}

/**
 * Chinese names usable in search suggestions, keyed by catalog symbol.
 * @returns Map<symbol, string[]>
 */
export function buildZhNameIndex(knownSymbols) {
  const known = new Set([...knownSymbols].map((symbol) => String(symbol).toUpperCase()));
  const index = new Map();
  for (const { zh, symbol } of ZH_ALIAS_ENTRIES) {
    if (!known.has(symbol)) continue;
    if (!index.has(symbol)) index.set(symbol, []);
    index.get(symbol).push(zh);
  }
  return index;
}

/**
 * Alias entries safe for free-text extraction, filtered to the loaded catalog.
 * Returned as [zh, symbol] pairs so callers can seed a Map and let personal
 * aliases override built-ins by inserting afterwards.
 */
export function builtinRecognitionAliases(knownSymbols) {
  const known = new Set([...knownSymbols].map((symbol) => String(symbol).toUpperCase()));
  return ZH_ALIAS_ENTRIES
    .filter((entry) => entry.scope === "all" && known.has(entry.symbol))
    .map((entry) => [entry.zh, entry.symbol]);
}

/**
 * Resolve a whole query that is (or contains) a Chinese name, e.g. "特斯拉" → "TSLA".
 * Exact match wins; otherwise a unique prefix/substring match is accepted.
 */
export function resolveZhQuery(query, knownSymbols) {
  const trimmed = String(query || "").trim();
  if (!trimmed || !containsCjk(trimmed)) return null;
  const known = new Set([...knownSymbols].map((symbol) => String(symbol).toUpperCase()));
  const usable = ZH_ALIAS_ENTRIES.filter((entry) => known.has(entry.symbol));
  const exact = usable.find((entry) => entry.zh === trimmed);
  if (exact) return exact.symbol;
  const partial = usable.filter((entry) => entry.zh.includes(trimmed) || trimmed.includes(entry.zh));
  const symbols = [...new Set(partial.map((entry) => entry.symbol))];
  return symbols.length === 1 ? symbols[0] : null;
}
