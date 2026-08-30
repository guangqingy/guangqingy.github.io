// Why a product pair cannot be computed — and whether waiting will ever help.
//
// The snapshot only records that two session dates differ. That single reason
// covers two very different situations: a thinly traded product that simply had
// no print on the latest session, and a fund that was liquidated months ago.
// Telling a user to "check back later" for a liquidated fund is a false promise,
// so the browser classifies the gap by how old the product's last print is.

export const STALE_TIERS = {
  lagging: { maxDays: 5, label: "近期无成交", permanent: false },
  dormant: { maxDays: 30, label: "长期停牌", permanent: false },
  delisted: { maxDays: Infinity, label: "已清算或退市", permanent: true },
};

function toDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Calendar days between the reference session and the product's last print. */
export function staleDays(referenceDate, productDate) {
  const reference = toDate(referenceDate);
  const product = toDate(productDate);
  if (!reference || !product) return null;
  return Math.round((reference - product) / 86_400_000);
}

/**
 * Classify an unavailable pair.
 * @returns {{tier: string, days: number|null, label: string, permanent: boolean}}
 */
export function classifyStaleness(referenceDate, productDate) {
  const days = staleDays(referenceDate, productDate);
  if (days == null) {
    return { tier: "unknown", days: null, label: "缺少报价", permanent: false };
  }
  if (days <= 0) return { tier: "current", days, label: "同日锚点", permanent: false };
  for (const [tier, config] of Object.entries(STALE_TIERS)) {
    if (days <= config.maxDays) {
      return { tier, days, label: config.label, permanent: config.permanent };
    }
  }
  return { tier: "delisted", days, label: STALE_TIERS.delisted.label, permanent: true };
}

/** User-facing explanation for a pair that cannot be computed. */
export function stalenessMessage({ underlyingSymbol, productSymbol, referenceDate, productDate }) {
  const { tier, days, permanent } = classifyStaleness(referenceDate, productDate);
  if (tier === "unknown") {
    return {
      permanent: false,
      text: `每日快照中缺少 ${productSymbol} 的完整收盘锚点，请稍后检查更新。`,
    };
  }
  if (permanent) {
    return {
      permanent: true,
      text: `${productSymbol} 最后一次成交是 ${productDate}，距今 ${days} 天，基本可以判定已经清算或退市。等待新报价不会让它恢复，${underlyingSymbol} 需要换一个可计算的标的。`,
    };
  }
  if (tier === "dormant") {
    return {
      permanent: false,
      text: `${productSymbol} 已经 ${days} 天没有成交（最后一次是 ${productDate}）。它可能流动性极低或正在清算流程中，恢复同日锚点前不会输出数字。`,
    };
  }
  return {
    permanent: false,
    text: `${productSymbol} 在最近一个交易日（${referenceDate}）没有成交，最后成交价停留在 ${productDate}。为避免跨日混算，本次不输出数字，通常下一个有成交的交易日会恢复。`,
  };
}
