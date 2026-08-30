const EPSILON = 1e-9;

export function asPositiveNumber(value, field = "value") {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(`${field} must be a positive number`);
  }
  return number;
}

export function asFactor(value) {
  const factor = Number(value);
  if (!Number.isFinite(factor) || Math.abs(factor) < EPSILON) {
    throw new RangeError("factor must be a non-zero number");
  }
  return factor;
}

export function leveragedAtUnderlying({
  underlyingTarget,
  underlyingAnchor,
  leveragedAnchor,
  factor,
}) {
  const target = asPositiveNumber(underlyingTarget, "underlyingTarget");
  const base = asPositiveNumber(underlyingAnchor, "underlyingAnchor");
  const leveragedBase = asPositiveNumber(leveragedAnchor, "leveragedAnchor");
  const beta = asFactor(factor);
  const multiplier = 1 + beta * (target / base - 1);
  const result = leveragedBase * multiplier;
  return result > EPSILON ? result : null;
}

export function underlyingAtLeveraged({
  leveragedTarget,
  underlyingAnchor,
  leveragedAnchor,
  factor,
}) {
  const target = asPositiveNumber(leveragedTarget, "leveragedTarget");
  const base = asPositiveNumber(underlyingAnchor, "underlyingAnchor");
  const leveragedBase = asPositiveNumber(leveragedAnchor, "leveragedAnchor");
  const beta = asFactor(factor);
  const result = base * (1 + (target / leveragedBase - 1) / beta);
  return result > EPSILON ? result : null;
}

export function convertTarget({
  driverRole,
  target,
  underlyingAnchor,
  leveragedAnchor,
  factor,
}) {
  if (driverRole === "leveraged") {
    return underlyingAtLeveraged({
      leveragedTarget: target,
      underlyingAnchor,
      leveragedAnchor,
      factor,
    });
  }
  return leveragedAtUnderlying({
    underlyingTarget: target,
    underlyingAnchor,
    leveragedAnchor,
    factor,
  });
}

export function leveragedAtLeveraged({
  driverTarget,
  driverAnchor,
  driverFactor,
  mappedAnchor,
  mappedFactor,
}) {
  const target = asPositiveNumber(driverTarget, "driverTarget");
  const inputBase = asPositiveNumber(driverAnchor, "driverAnchor");
  const outputBase = asPositiveNumber(mappedAnchor, "mappedAnchor");
  const inputBeta = asFactor(driverFactor);
  const outputBeta = asFactor(mappedFactor);
  const underlyingMove = (target / inputBase - 1) / inputBeta;
  const result = outputBase * (1 + outputBeta * underlyingMove);
  return result > EPSILON ? result : null;
}

export function percentMove(value, anchor) {
  const current = asPositiveNumber(value, "value");
  const base = asPositiveNumber(anchor, "anchor");
  return (current / base - 1) * 100;
}

export function buildLadder({
  driverRole,
  range,
  step,
  underlyingAnchor,
  leveragedAnchor,
  factor,
}) {
  const extent = asPositiveNumber(range, "range");
  const increment = asPositiveNumber(step, "step");
  const driverAnchor = driverRole === "leveraged" ? leveragedAnchor : underlyingAnchor;
  const rows = [];

  for (let move = -extent; move <= extent + EPSILON; move += increment) {
    const normalizedMove = Math.abs(move) < EPSILON ? 0 : Number(move.toFixed(8));
    const driverPrice = asPositiveNumber(driverAnchor, "driverAnchor") * (1 + normalizedMove / 100);
    if (driverPrice <= 0) continue;
    const mappedPrice = convertTarget({
      driverRole,
      target: driverPrice,
      underlyingAnchor,
      leveragedAnchor,
      factor,
    });
    rows.push({
      driverPrice,
      driverMove: normalizedMove,
      mappedPrice,
      mappedMove:
        mappedPrice == null
          ? null
          : percentMove(
              mappedPrice,
              driverRole === "leveraged" ? underlyingAnchor : leveragedAnchor,
            ),
    });
  }
  return rows;
}

export function buildLeveragedPairLadder({
  range,
  step,
  driverAnchor,
  driverFactor,
  mappedAnchor,
  mappedFactor,
}) {
  const extent = asPositiveNumber(range, "range");
  const increment = asPositiveNumber(step, "step");
  const inputBase = asPositiveNumber(driverAnchor, "driverAnchor");
  const outputBase = asPositiveNumber(mappedAnchor, "mappedAnchor");
  const rows = [];

  for (let move = -extent; move <= extent + EPSILON; move += increment) {
    const normalizedMove = Math.abs(move) < EPSILON ? 0 : Number(move.toFixed(8));
    const driverPrice = inputBase * (1 + normalizedMove / 100);
    if (driverPrice <= 0) continue;
    const mappedPrice = leveragedAtLeveraged({
      driverTarget: driverPrice,
      driverAnchor: inputBase,
      driverFactor,
      mappedAnchor: outputBase,
      mappedFactor,
    });
    rows.push({
      driverPrice,
      driverMove: normalizedMove,
      mappedPrice,
      mappedMove: mappedPrice == null ? null : percentMove(mappedPrice, outputBase),
    });
  }
  return rows;
}

export function groupCatalog(rawCatalog) {
  if (rawCatalog && !Array.isArray(rawCatalog) && Array.isArray(rawCatalog.items)) {
    return rawCatalog.items;
  }
  if (!Array.isArray(rawCatalog)) return [];

  const groups = new Map();
  for (const row of rawCatalog) {
    const symbol = String(row.underlying_symbol || "").toUpperCase();
    const productSymbol = String(row.product_symbol || "").toUpperCase();
    if (!symbol || !productSymbol) continue;
    if (!groups.has(symbol)) {
      groups.set(symbol, {
        symbol,
        name: row.underlying_name || symbol,
        kind: row.underlying_kind || "other",
        products: [],
      });
    }
    groups.get(symbol).products.push({
      symbol: productSymbol,
      name: row.product_name || productSymbol,
      factor: Number(row.factor),
      issuer: row.issuer || "",
      direction: row.direction || (Number(row.factor) > 0 ? "bull" : "bear"),
      basis: row.basis || "other_proxy",
      issuer_url: row.issuer_url || "",
      verified_at: row.verified_at || null,
    });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      products: group.products.sort((left, right) => {
        if (left.factor >= 0 && right.factor < 0) return -1;
        if (left.factor < 0 && right.factor >= 0) return 1;
        return Math.abs(right.factor) - Math.abs(left.factor) || left.symbol.localeCompare(right.symbol);
      }),
    }))
    .sort((left, right) => left.symbol.localeCompare(right.symbol));
}

export function buildCatalogIndexes(groups) {
  const underlyings = new Map();
  const products = new Map();
  for (const group of groups) {
    underlyings.set(group.symbol, group);
    for (const product of group.products || []) {
      products.set(product.symbol, { underlying: group, product });
    }
  }
  return { underlyings, products };
}

export function resolveCatalogSymbol(symbol, indexes, preferredProduct = null) {
  const normalized = String(symbol || "").trim().toUpperCase();
  const asUnderlying = indexes.underlyings.get(normalized);
  if (asUnderlying) {
    const preferred = String(preferredProduct || "").trim().toUpperCase();
    const product =
      asUnderlying.products.find((item) => item.symbol === preferred) || asUnderlying.products[0] || null;
    return product ? { underlying: asUnderlying, product, inputRole: "underlying" } : null;
  }
  const asProduct = indexes.products.get(normalized);
  return asProduct ? { ...asProduct, inputRole: "leveraged" } : null;
}

export function quoteAnchor(quote) {
  if (!quote || typeof quote !== "object") return null;
  const value = Number(
    quote.anchor ?? quote.regular_market_price ?? quote.regularMarketPrice ?? quote.price ?? quote.close,
  );
  if (!Number.isFinite(value) || value <= 0) return null;
  const previous = Number(quote.previous_close ?? quote.previousClose ?? NaN);
  return {
    value,
    date: quote.anchor_date || quote.session_date || quote.regular_market_date || quote.date || null,
    asOf: quote.as_of || quote.regular_market_time || quote.regularMarketTime || null,
    status: quote.status || "ok",
    previousClose: Number.isFinite(previous) && previous > 0 ? previous : null,
  };
}

/**
 * Percent change of the anchor session itself (close vs the prior close).
 * Returns null when the snapshot has no usable previous close.
 */
export function anchorSessionMove(anchor) {
  if (!anchor?.previousClose) return null;
  return (anchor.value / anchor.previousClose - 1) * 100;
}

export function validatePairAnchors(underlyingQuote, leveragedQuote, expectedAnchorDate = null) {
  const underlying = quoteAnchor(underlyingQuote);
  const leveraged = quoteAnchor(leveragedQuote);
  if (!underlying || !leveraged) {
    return { ok: false, reason: "missing_anchor", underlying, leveraged };
  }
  if (!underlying.date || !leveraged.date || underlying.date !== leveraged.date) {
    return { ok: false, reason: "anchor_date_mismatch", underlying, leveraged };
  }
  const expected = String(expectedAnchorDate || "").trim();
  if (expected && underlying.date !== expected) {
    return {
      ok: false,
      reason: "stale_session_date",
      underlying,
      leveraged,
      anchorDate: underlying.date,
      expectedAnchorDate: expected,
    };
  }
  return { ok: true, underlying, leveraged, anchorDate: underlying.date };
}
