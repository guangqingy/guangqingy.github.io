// When a lookup lands on a dead end, offer somewhere to go.
//
// Two cases produce a permanent dead end: every leveraged product on an
// underlying has been liquidated, or the reference trades 24/7 and can never
// share a U.S. regular-session close. In both cases an error with no exit is a
// worse answer than a nearby instrument that does compute, so each dead end
// carries a short list of hand-picked peers plus a broad fallback.

// Same-industry or same-exposure substitutes. Every target is validated against
// the live catalog before it is shown, so a peer that later goes stale is dropped.
export const PEER_HINTS = {
  // Leveraged products liquidated by their issuer.
  GS: { note: "同为大型投行 / 金融板块", peers: ["XLF", "KRE"] },
  LYFT: { note: "同为网约车", peers: ["UBER", "XLY"] },
  DASH: { note: "同为本地生活 / 可选消费", peers: ["UBER", "XLY"] },
  CELH: { note: "同为消费品板块", peers: ["XLP", "XLY"] },
  DDOG: { note: "同为云 / 软件基础设施", peers: ["SKYY", "XLK"] },
  MDB: { note: "同为云 / 数据库软件", peers: ["SKYY", "XLK"] },
  SRPT: { note: "同为生物科技", peers: ["XBI", "IBB"] },
  TEL: { note: "同为连接器 / 电子元件", peers: ["APH", "XLK"] },
  VOYG: { note: "同为航天 / 国防", peers: ["ITA", "RKLB"] },
  AUR: { note: "同为自动驾驶 / 工业", peers: ["PONY", "XLI"] },
  ENPH: { note: "同为公用事业 / 工业板块", peers: ["XLU", "XLI"] },
  OSS: { note: "同为小盘科技", peers: ["IWM", "XLK"] },

  // 24/7 references: point at instruments that do close with the U.S. market.
  "BTC-USD": { note: "有常规收盘的比特币敞口", peers: ["IBIT", "MSTR", "COIN"] },
  "ETH-USD": { note: "有常规收盘的以太坊敞口", peers: ["ETHA", "BMNR", "COIN"] },
  "SOL-USD": { note: "有常规收盘的加密相关敞口", peers: ["COIN", "IBIT"] },
  "XRP-USD": { note: "有常规收盘的加密相关敞口", peers: ["COIN", "IBIT"] },
  "ADA-USD": { note: "有常规收盘的加密相关敞口", peers: ["COIN", "IBIT"] },
  "AVAX-USD": { note: "有常规收盘的加密相关敞口", peers: ["COIN", "IBIT"] },
  "LINK-USD": { note: "有常规收盘的加密相关敞口", peers: ["COIN", "IBIT"] },
  "SUI-USD": { note: "有常规收盘的加密相关敞口", peers: ["COIN", "IBIT"] },
  "XLM-USD": { note: "有常规收盘的加密相关敞口", peers: ["COIN", "IBIT"] },
};

// Shown when a dead end has no curated peer: broad, always-liquid benchmarks.
export const FALLBACK_PEERS = ["SPY", "QQQ", "IWM"];

/**
 * Resolve usable alternatives for a dead-end symbol.
 * @param symbol       the underlying the user asked for
 * @param isComputable predicate telling whether a candidate can be calculated now
 */
export function peerSuggestions(symbol, isComputable, { limit = 3 } = {}) {
  const key = String(symbol || "").toUpperCase();
  const hint = PEER_HINTS[key];
  const curated = (hint?.peers || []).filter((peer) => peer !== key && isComputable(peer));
  const filler = FALLBACK_PEERS.filter((peer) => peer !== key && !curated.includes(peer) && isComputable(peer));
  const peers = [...curated, ...filler].slice(0, limit);
  return {
    peers,
    note: curated.length ? hint.note : "流动性最好的宽基基准",
    curated: curated.length > 0,
  };
}
