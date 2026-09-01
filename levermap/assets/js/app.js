import {
  anchorSessionMove,
  buildCatalogIndexes,
  buildLadder,
  buildLeveragedPairLadder,
  convertTarget,
  groupCatalog,
  leveragedAtLeveraged,
  percentMove,
  resolveCatalogSymbol,
  validatePairAnchors,
} from "./calculator.js?v=20260829-1";
import {
  extractTickerLevels,
  parseAliasAssignments,
  plausibleLevel,
} from "./recognition.js?v=20260829-1";
import { classifyStaleness, stalenessMessage } from "./staleness.js?v=20260829-1";
import { peerSuggestions } from "./peers.js?v=20260829-1";
import { smoothPathOutcome, roundTripDrag } from "./path.js?v=20260829-1";
import { createImeGuard } from "./input-method.js?v=20260821-1";
import {
  builtinRecognitionAliases,
  buildZhNameIndex,
  containsCjk,
  resolveZhQuery,
} from "./zh-names.js?v=20260821-1";
import {
  parseRecentList,
  pushRecentEntry,
  RECENT_STORAGE_KEY,
  serializeRecentList,
} from "./recent.js?v=20260821-1";
import { suggestSimilarSymbols } from "./similar.js?v=20260821-1";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const CATALOG_URL = new URL("../../data/catalog.json", import.meta.url);
const API_ORIGIN = new URL(
  $("meta[name='leverpath-api-origin']")?.content || window.location.origin,
  window.location.origin,
).origin;
const SNAPSHOT_URL = new URL("/api/market-snapshot", API_ORIGIN);
const DEFAULT_RECOGNITION_ALIASES = "迪子=SNDK";
const RECOGNITION_ALIAS_KEY = "leverpath.recognition.aliases";
const EXAMPLE_CANDIDATES = ["TSLA", "NVDA", "QQQ", "MSTR", "SOXX", "台积电"];
const RECOGNITION_SAMPLE = `今晚的QQQ看着要去705，极端最低会跌到702。
英伟达这波强，目标190，回踩172可以加。
SOXX在515这个位置有支撑。
迪子是1565。`;
const PREFERRED_PRODUCTS = {
  TSLA: "TSLL",
  NVDA: "NVDL",
  QQQ: "TQQQ",
  SPY: "UPRO",
  AAPL: "AAPU",
  AMD: "AMDL",
  COIN: "CONL",
  MSTR: "MSTU",
};

const state = {
  groups: [],
  indexes: { underlyings: new Map(), products: new Map() },
  searchIndex: [],
  zhNames: new Map(),
  allSymbols: [],
  marketSnapshot: null,
  active: null,
  driverRole: "underlying",
  conversionMode: "underlying",
  compareProductSymbol: null,
  compareDriver: "primary",
  recognitionGroups: [],
  recent: [],
  range: 10,
  step: 2,
  pathDays: 5,
  recognitionIgnored: 0,
  selectedSuggestion: -1,
};

const dom = {
  hero: $("#hero"),
  heroStatus: $("#heroStatus"),
  heroStatusText: $("#heroStatusText"),
  exampleChips: $("#exampleChips"),
  recentRail: $("#recentRail"),
  recentChips: $("#recentChips"),
  clearRecentButton: $("#clearRecentButton"),
  symbolForm: $("#symbolForm"),
  symbolInput: $("#symbolInput"),
  suggestions: $("#searchSuggestions"),
  workspace: $("#workspace"),
  errorState: $("#errorState"),
  errorTitle: $("#errorTitle"),
  errorMessage: $("#errorMessage"),
  errorSuggestions: $("#errorSuggestions"),
  errorSuggestionChips: $("#errorSuggestionChips"),
  errorSuggestionLabel: $("#errorSuggestionLabel"),
  loadingLayer: $("#loadingLayer"),
  toast: $("#toast"),
  dataPill: $("#dataPill"),
  dataPillText: $("#dataPillText"),
  refreshButton: $("#refreshButton"),
  shareButton: $("#shareButton"),
  newSearchButton: $("#newSearchButton"),
  copyResultButton: $("#copyResultButton"),
  productTabs: $("#productTabs"),
  conversionModeButtons: $("#conversionModeButtons"),
  compareProductField: $("#compareProductField"),
  compareProductSelect: $("#compareProductSelect"),
  swapConversionButton: $("#swapConversionButton"),
  targetPriceInput: $("#targetPriceInput"),
  nudgeRow: $("#nudgeRow"),
  conversionLive: $("#conversionLive"),
  ladderWrap: $("#ladderWrap"),
  pathPanel: $("#pathPanel"),
  pathDays: $("#pathDays"),
  pathLead: $("#pathLead"),
  pathRows: $("#pathRows"),
  methodDialog: $("#methodDialog"),
  statusDialog: $("#statusDialog"),
  statusList: $("#statusList"),
  recognitionDialog: $("#recognitionDialog"),
  recognitionText: $("#recognitionText"),
  recognitionAliases: $("#recognitionAliases"),
  recognitionResults: $("#recognitionResults"),
  recognitionSymbolSelect: $("#recognitionSymbolSelect"),
  recognitionGroupMeta: $("#recognitionGroupMeta"),
  recognitionHead: $("#recognitionHead"),
  recognitionBody: $("#recognitionBody"),
  recognitionSummary: $("#recognitionSummary"),
  runRecognitionButton: $("#runRecognitionButton"),
  recognitionSampleButton: $("#recognitionSampleButton"),
  recognitionOpenButton: $("#recognitionOpenButton"),
};

const symbolImeGuard = createImeGuard({
  schedule: window.setTimeout.bind(window),
  cancel: window.clearTimeout.bind(window),
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeSymbol(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function factorLabel(value) {
  const factor = Number(value);
  if (!Number.isFinite(factor)) return "—";
  const magnitude = Number.isInteger(Math.abs(factor))
    ? Math.abs(factor).toFixed(0)
    : Math.abs(factor);
  return `${factor > 0 ? "+" : "−"}${magnitude}×`;
}

function formatPrice(value, currency = "USD") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const digits = Math.abs(number) < 10 ? 3 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(number);
}

function formatPriceBare(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const digits = Math.abs(number) < 10 ? 3 : 2;
  return number.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPercent(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const sign = number > 0 ? "+" : number < 0 ? "−" : "";
  return `${sign}${Math.abs(number).toFixed(digits)}%`;
}

function movementClass(value) {
  const number = Number(value);
  return number > 0 ? "positive" : number < 0 ? "negative" : "";
}

function setMovement(element, value, text) {
  element.classList.remove("positive", "negative");
  const className = movementClass(value);
  if (className) element.classList.add(className);
  element.textContent = text;
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${new Intl.DateTimeFormat("zh-CN", {
    timeZone: "America/New_York",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)} ET`;
}

function showToast(message, duration = 3000) {
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  dom.toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    dom.toast.classList.remove("visible");
    dom.toast.hidden = true;
  }, duration);
}

function setLoading(active) {
  dom.loadingLayer.hidden = !active;
  dom.refreshButton?.classList.toggle("loading", active);
  if (dom.refreshButton) dom.refreshButton.disabled = active;
}

function setView(name) {
  dom.workspace.hidden = name !== "workspace";
  dom.errorState.hidden = name !== "error";
  dom.hero.classList.toggle("hero-compact", name !== "empty");
  document.body.dataset.view = name;
}

async function fetchJson(url, { bustCache = false, timeoutMs = 12000 } = {}) {
  const requestUrl = new URL(url);
  if (bustCache) requestUrl.searchParams.set("v", Date.now().toString());
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const requestInit = {
      headers: { Accept: "application/json" },
      cache: bustCache ? "no-store" : "default",
      signal: controller.signal,
    };
    const response = await fetch(requestUrl, requestInit);
    if (!response.ok) throw new Error(`数据没读到（${response.status}）`);
    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("读取超时了");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

/* ---------------------------------------------------------------- catalog */

function snapshotQuotes() {
  const quotes = state.marketSnapshot?.quotes || state.marketSnapshot?.symbols;
  return quotes && typeof quotes === "object" ? quotes : {};
}

function pairFor(underlyingSymbol, productSymbol) {
  const quotes = snapshotQuotes();
  return validatePairAnchors(
    quotes[underlyingSymbol],
    quotes[productSymbol],
    state.marketSnapshot?.anchor_date,
  );
}

/** Can this underlying produce at least one same-day pair right now? */
function isComputableUnderlying(symbol) {
  const group = state.indexes.underlyings.get(String(symbol || "").toUpperCase());
  if (!group || isCryptoGroup(group)) return false;
  return (group.products || []).some((product) => pairFor(group.symbol, product.symbol).ok);
}

function suggestPeersFor(symbol) {
  return peerSuggestions(symbol, isComputableUnderlying);
}

function isCryptoGroup(underlying) {
  return underlying?.kind === "crypto" || Boolean(underlying?.symbol?.endsWith("-USD"));
}

/**
 * Pick the product to open for an underlying. A catalog group can contain a
 * product whose snapshot anchor is stale, so preferring the first row blindly
 * would show an error even when sibling products are perfectly calculable.
 */
function pickProductForUnderlying(underlying, preferredSymbol) {
  const products = underlying.products || [];
  const wanted = normalizeSymbol(preferredSymbol);
  const explicit = products.find((product) => product.symbol === wanted);
  if (explicit) return explicit;
  if (isCryptoGroup(underlying)) return products[0] || null;
  const ranked = [
    products.find((product) => product.symbol === PREFERRED_PRODUCTS[underlying.symbol]),
    ...products,
  ].filter(Boolean);
  return (
    ranked.find((product) => pairFor(underlying.symbol, product.symbol).ok) || products[0] || null
  );
}

function buildSearchIndex() {
  state.searchIndex = [];
  state.zhNames = buildZhNameIndex([
    ...state.indexes.underlyings.keys(),
    ...state.indexes.products.keys(),
  ]);
  for (const underlying of state.groups) {
    state.searchIndex.push({
      symbol: underlying.symbol,
      name: underlying.name,
      type:
        underlying.kind === "stock"
          ? "正股"
          : underlying.kind === "crypto"
            ? "加密参考"
            : "基准 ETF",
      zh: state.zhNames.get(underlying.symbol) || [],
      rank: 0,
    });
    for (const product of underlying.products || []) {
      state.searchIndex.push({
        symbol: product.symbol,
        name: product.name,
        type: `${factorLabel(product.factor)} · ${underlying.symbol}`,
        zh: state.zhNames.get(product.symbol) || [],
        rank: 1,
      });
    }
  }
  state.allSymbols = state.searchIndex.map((item) => item.symbol);
}

function searchMatches(rawQuery) {
  const query = String(rawQuery || "").trim();
  if (!query) return [];
  if (containsCjk(query)) {
    return state.searchIndex
      .filter((item) => item.zh.some((name) => name.includes(query) || query.includes(name)))
      .sort((left, right) => left.rank - right.rank || left.symbol.localeCompare(right.symbol))
      .slice(0, 9);
  }
  const upper = normalizeSymbol(query);
  return state.searchIndex
    .filter((item) => item.symbol.includes(upper) || item.name.toUpperCase().includes(upper))
    .sort((left, right) => {
      const leftRank = left.symbol.startsWith(upper) ? 0 : 1;
      const rightRank = right.symbol.startsWith(upper) ? 0 : 1;
      return (
        leftRank - rightRank || left.symbol.length - right.symbol.length || left.rank - right.rank
      );
    })
    .slice(0, 9);
}

/* ------------------------------------------------------------ suggestions */

function renderSuggestions(value) {
  const matches = searchMatches(value);
  if (!matches.length) {
    closeSuggestions();
    return;
  }

  state.selectedSuggestion = -1;
  dom.suggestions.innerHTML = matches
    .map(
      (item, index) => `
        <button class="suggestion-item" id="search-option-${index}" type="button" role="option" aria-selected="false" data-index="${index}" data-symbol="${escapeHtml(item.symbol)}">
          <strong>${escapeHtml(item.symbol)}</strong>
          <span>${escapeHtml(item.name)}${item.zh.length ? `<i>${escapeHtml(item.zh[0])}</i>` : ""}</span>
          <small>${escapeHtml(item.type)}</small>
        </button>`,
    )
    .join("");
  dom.suggestions.hidden = false;
  dom.symbolInput.setAttribute("aria-expanded", "true");
}

function closeSuggestions() {
  dom.suggestions.hidden = true;
  dom.symbolInput.setAttribute("aria-expanded", "false");
  dom.symbolInput.removeAttribute("aria-activedescendant");
  state.selectedSuggestion = -1;
}

function moveSuggestion(direction) {
  const items = $$(".suggestion-item");
  if (!items.length) return;
  state.selectedSuggestion = (state.selectedSuggestion + direction + items.length) % items.length;
  items.forEach((item, index) =>
    item.setAttribute("aria-selected", String(index === state.selectedSuggestion)),
  );
  const selected = items[state.selectedSuggestion];
  dom.symbolInput.setAttribute("aria-activedescendant", selected.id);
  selected.scrollIntoView({ block: "nearest" });
}

/* --------------------------------------------------------- recent / chips */

function loadRecent() {
  try {
    state.recent = parseRecentList(window.localStorage.getItem(RECENT_STORAGE_KEY));
  } catch {
    state.recent = [];
  }
}

function persistRecent() {
  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, serializeRecentList(state.recent));
  } catch {
    // Private browsing disables storage; the in-memory list still works.
  }
}

function rememberPair(symbol, product) {
  state.recent = pushRecentEntry(state.recent, { symbol, product });
  persistRecent();
  renderRecentRail();
}

function renderRecentRail() {
  const usable = state.recent.filter((entry) => state.indexes.underlyings.has(entry.symbol));
  dom.recentRail.hidden = usable.length === 0;
  dom.recentChips.innerHTML = usable
    .map(
      (entry) =>
        `<button class="chip" type="button" data-symbol="${escapeHtml(entry.symbol)}" data-product="${escapeHtml(entry.product || "")}">${escapeHtml(entry.symbol)}${entry.product ? `<span>${escapeHtml(entry.product)}</span>` : ""}</button>`,
    )
    .join("");
}

function renderExampleRail() {
  const chips = EXAMPLE_CANDIDATES.map((candidate) => {
    const symbol = containsCjk(candidate)
      ? resolveZhQuery(candidate, [
          ...state.indexes.underlyings.keys(),
          ...state.indexes.products.keys(),
        ])
      : normalizeSymbol(candidate);
    if (!symbol) return null;
    const resolved = resolveCatalogSymbol(symbol, state.indexes);
    if (!resolved || isCryptoGroup(resolved.underlying)) return null;
    const product = pickProductForUnderlying(
      resolved.underlying,
      resolved.inputRole === "leveraged" ? resolved.product.symbol : null,
    );
    if (!product || !pairFor(resolved.underlying.symbol, product.symbol).ok) return null;
    return { label: candidate, symbol, product: product.symbol };
  }).filter(Boolean);

  dom.exampleChips.innerHTML = chips
    .map(
      (chip) =>
        `<button class="chip" type="button" data-symbol="${escapeHtml(chip.symbol)}" data-product="${escapeHtml(chip.product)}">${escapeHtml(chip.label)}</button>`,
    )
    .join("");
}

/* -------------------------------------------------------- conversion core */

function comparisonCandidates() {
  if (!state.active) return [];
  return state.active.underlying.products
    .filter((product) => product.symbol !== state.active.product.symbol)
    .map((product) => {
      const pair = pairFor(state.active.underlying.symbol, product.symbol);
      return pair.ok && pair.anchorDate === state.active.anchorDate
        ? { product, anchor: pair.leveraged }
        : null;
    })
    .filter(Boolean);
}

function ensureComparisonSelection() {
  const candidates = comparisonCandidates();
  let selected = candidates.find(({ product }) => product.symbol === state.compareProductSymbol);
  if (!selected) {
    const primaryFactor = Number(state.active?.product.factor);
    selected =
      candidates.find(
        ({ product }) => Math.sign(Number(product.factor)) !== Math.sign(primaryFactor),
      ) ||
      candidates.find(({ product }) => Number(product.factor) !== primaryFactor) ||
      candidates[0] ||
      null;
    state.compareProductSymbol = selected?.product.symbol || null;
  }
  return selected;
}

function conversionContext() {
  if (!state.active) return null;
  if (state.conversionMode === "leveraged-pair") {
    const comparison = ensureComparisonSelection();
    if (!comparison) return null;
    const primary = {
      symbol: state.active.product.symbol,
      anchor: state.active.leveragedAnchor.value,
      factor: state.active.product.factor,
    };
    const secondary = {
      symbol: comparison.product.symbol,
      anchor: comparison.anchor.value,
      factor: comparison.product.factor,
    };
    const input = state.compareDriver === "comparison" ? secondary : primary;
    const output = state.compareDriver === "comparison" ? primary : secondary;
    return { mode: "leveraged-pair", input, output };
  }

  const isUnderlying = state.driverRole === "underlying";
  return {
    mode: "underlying",
    input: isUnderlying
      ? { symbol: state.active.underlying.symbol, anchor: state.active.underlyingAnchor.value }
      : { symbol: state.active.product.symbol, anchor: state.active.leveragedAnchor.value },
    output: isUnderlying
      ? { symbol: state.active.product.symbol, anchor: state.active.leveragedAnchor.value }
      : { symbol: state.active.underlying.symbol, anchor: state.active.underlyingAnchor.value },
  };
}

function activateSymbol(symbol, preferredProduct = null, { scroll = true, remember = true } = {}) {
  const raw = String(symbol || "").trim();
  const zhResolved = containsCjk(raw)
    ? resolveZhQuery(raw, [...state.indexes.underlyings.keys(), ...state.indexes.products.keys()])
    : null;
  const normalized = zhResolved || normalizeSymbol(raw);
  const asUnderlying = state.indexes.underlyings.get(normalized);
  const preferred =
    preferredProduct ||
    (asUnderlying ? pickProductForUnderlying(asUnderlying, null)?.symbol : null) ||
    null;
  const resolved = resolveCatalogSymbol(normalized, state.indexes, preferred);

  if (!resolved) {
    const similar = suggestSimilarSymbols(normalized, state.allSymbols);
    showError(
      `${normalized || raw} 暂未收录`,
      containsCjk(raw)
        ? "内置词典里没有这个名字。可以直接输代码，或者在识别里加一条自己的叫法。"
        : "可以搜正股、指数 ETF 或者杠杆产品的代码。",
      { chips: similar },
    );
    return;
  }

  const { underlying, product, inputRole } = resolved;
  if (isCryptoGroup(underlying)) {
    const { peers, note } = suggestPeersFor(underlying.symbol);
    showError(
      `${product.symbol} 算不了`,
      `加密资产 24 小时都在交易，美股杠杆 ETF 每天美东 16:00 重置，两边根本没有同一时刻的收盘价——不是数据缺了，换个时间也一样。${peers.length ? `想要同方向的敞口，下面这几个有正常收盘价，可以算。` : ""}`,
      { chips: peers, chipsLabel: note, permanent: true },
    );
    return;
  }

  const pair = pairFor(underlying.symbol, product.symbol);
  if (!pair.ok) {
    const workable = (underlying.products || []).filter(
      (item) => pairFor(underlying.symbol, item.symbol).ok,
    );
    const reference = sampleAnchorDate() || pair.underlying?.date;
    const { text, permanent } = stalenessMessage({
      underlyingSymbol: underlying.symbol,
      productSymbol: product.symbol,
      referenceDate: reference,
      productDate: pair.leveraged?.date,
    });

    if (workable.length) {
      // Same underlying still has a live product: keep the user in place.
      showError(
        `${product.symbol} 现在算不了`,
        `${text}同一基准下的 ${workable.map((item) => item.symbol).join("、")} 还能正常算。`,
        {
          chips: workable.map((item) => item.symbol).slice(0, 3),
          chipsLabel: `${underlying.symbol} 可用产品`,
        },
      );
      return;
    }

    const { peers, note } = suggestPeersFor(underlying.symbol);
    showError(
      permanent
        ? `${underlying.symbol} 没有能用的杠杆产品了`
        : `${underlying.symbol} ↔ ${product.symbol} 没有可用的收盘价`,
      permanent
        ? `${text}`
        : `${text}${underlying.symbol} 这一组现在都没有同一天的收盘价，恢复之前算不了。`,
      { chips: peers, chipsLabel: note, permanent },
    );
    return;
  }

  const sameUnderlying = state.active?.underlying.symbol === underlying.symbol;
  if (!sameUnderlying) {
    state.conversionMode = "underlying";
    state.compareProductSymbol = null;
    state.compareDriver = "primary";
  }
  state.active = {
    underlying,
    product,
    underlyingAnchor: pair.underlying,
    leveragedAnchor: pair.leveraged,
    anchorDate: pair.anchorDate,
  };
  state.driverRole = inputRole;
  dom.symbolInput.value = normalized;
  closeSuggestions();
  renderActive({ resetTarget: true });
  setView("workspace");
  updateUrl(normalized, product.symbol);
  if (remember) rememberPair(underlying.symbol, product.symbol);
  if (scroll) dom.workspace.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showError(
  title,
  message,
  { chips = [], chipsLabel = "你是不是想找", permanent = false } = {},
) {
  state.active = null;
  dom.errorTitle.textContent = title;
  dom.errorMessage.textContent = message;
  const list = chips.filter(Boolean).slice(0, 4);
  dom.errorSuggestions.hidden = list.length === 0;
  dom.errorSuggestionLabel.textContent = chipsLabel;
  dom.errorSuggestionChips.innerHTML = list
    .map(
      (symbol) =>
        `<button class="chip" type="button" data-symbol="${escapeHtml(symbol)}">${escapeHtml(symbol)}</button>`,
    )
    .join("");
  dom.errorState.classList.toggle("permanent", permanent);
  setView("error");
  dom.errorState.scrollIntoView({ behavior: "smooth", block: "center" });
}

function updateUrl(symbol, product) {
  const url = new URL(window.location.href);
  url.searchParams.set("symbol", symbol);
  if (product && symbol !== product) url.searchParams.set("product", product);
  else url.searchParams.delete("product");
  if (state.conversionMode === "leveraged-pair" && state.compareProductSymbol) {
    url.searchParams.set("mode", "pair");
    url.searchParams.set("compare", state.compareProductSymbol);
    url.searchParams.set(
      "input",
      state.compareDriver === "comparison"
        ? state.compareProductSymbol
        : state.active.product.symbol,
    );
  } else {
    url.searchParams.delete("mode");
    url.searchParams.delete("compare");
    url.searchParams.delete("input");
  }
  url.searchParams.delete("target");
  window.history.replaceState({}, "", url);
}

/* ------------------------------------------------------------- rendering */

function renderActive({ resetTarget = false } = {}) {
  const active = state.active;
  if (!active) return;
  const { underlying, product, underlyingAnchor, leveragedAnchor } = active;
  const factor = Number(product.factor);

  $("#pairTitle").innerHTML =
    `${escapeHtml(underlying.symbol)} <span>↔</span> ${escapeHtml(product.symbol)}`;
  $("#pairSubtitle").textContent = `${underlying.name} · ${product.name}`;
  $("#factorBadge").textContent = factorLabel(factor);
  $("#factorBadge").classList.toggle("inverse", factor < 0);
  $("#bridgeFactor").textContent = factorLabel(factor).replace("+", "");
  document.title = `${underlying.symbol} ↔ ${product.symbol} · LeverPath`;

  renderQuote("underlying", underlying.symbol, underlying.name, underlyingAnchor);
  renderQuote("leveraged", product.symbol, product.name, leveragedAnchor);
  renderProductTabs();
  renderConversionControls();
  renderProxyNotice();
  renderDiagnostics();

  if (resetTarget || !finitePositive(dom.targetPriceInput.value)) {
    dom.targetPriceInput.value = formatInputValue(conversionContext()?.input.anchor);
  }
  updateDriverUi();
  updateConversionOutputs(); // also refreshes the ladder and chart
  updateDataStatus();
}

function renderQuote(role, symbol, name, anchor) {
  $(`#${role}Symbol`).textContent = symbol;
  $(`#${role}Name`).textContent = name;
  $(`#${role}Price`).textContent = formatPriceBare(anchor.value);
  $(`#${role}Previous`).textContent = anchor.date || "—";
  const card = $(`#${role}QuoteCard`);
  card.querySelector(".session-badge").textContent = "收盘价";
  const sessionMove = anchorSessionMove(anchor);
  const changeNode = $(`#${role}Change`);
  if (sessionMove == null) {
    setMovement(changeNode, null, "上一个常规收盘");
  } else {
    setMovement(
      changeNode,
      sessionMove,
      `当日 ${formatPercent(sessionMove)} · 前收 ${formatPriceBare(anchor.previousClose)}`,
    );
  }
}

function renderProductTabs() {
  const selected = state.active.product.symbol;
  // Catalog order stays stable so the tab strip never reshuffles under the cursor.
  dom.productTabs.innerHTML = state.active.underlying.products
    .map((product) => {
      const active = product.symbol === selected;
      const inverse = Number(product.factor) < 0;
      const check = pairFor(state.active.underlying.symbol, product.symbol);
      const usable = check.ok;
      const tier = usable
        ? null
        : classifyStaleness(
            sampleAnchorDate() || state.active.anchorDate || check.underlying?.date,
            check.leveraged?.date,
          );
      const title = usable
        ? product.issuer
        : `${product.issuer} · ${tier?.label || "缺少报价"}${tier?.days ? `（${tier.days} 天前）` : ""}`;
      return `<button class="product-tab ${active ? "active" : ""} ${inverse ? "inverse" : ""} ${usable ? "" : "stale"} ${tier?.permanent ? "retired" : ""}" type="button" role="tab" aria-selected="${active}" aria-controls="converterPanel" tabindex="${active ? "0" : "-1"}" title="${escapeHtml(title)}" data-product="${escapeHtml(product.symbol)}">
        ${escapeHtml(product.symbol)} <span>${escapeHtml(factorLabel(product.factor))}</span>
      </button>`;
    })
    .join("");
  const activeTab = dom.productTabs.querySelector(".product-tab.active");
  activeTab?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function renderConversionControls() {
  const candidates = comparisonCandidates();
  const pairButton = dom.conversionModeButtons.querySelector(
    '[data-conversion-mode="leveraged-pair"]',
  );
  pairButton.disabled = candidates.length === 0;
  pairButton.title = candidates.length
    ? "在同一基准的两只杠杆之间换算"
    : "这个基准下没有第二只能用的杠杆产品";
  if (state.conversionMode === "leveraged-pair" && !candidates.length) {
    state.conversionMode = "underlying";
    state.compareProductSymbol = null;
  }

  const comparison = ensureComparisonSelection();
  dom.conversionModeButtons.querySelectorAll("[data-conversion-mode]").forEach((button) => {
    const active = button.dataset.conversionMode === state.conversionMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  dom.compareProductField.hidden = state.conversionMode !== "leveraged-pair";
  dom.compareProductSelect.innerHTML = candidates
    .map(
      ({ product }) =>
        `<option value="${escapeHtml(product.symbol)}">${escapeHtml(product.symbol)} · ${escapeHtml(factorLabel(product.factor))}</option>`,
    )
    .join("");
  if (comparison) dom.compareProductSelect.value = comparison.product.symbol;
}

function renderProxyNotice() {
  const basis = String(state.active.product.basis || "single_stock");
  const notice = $("#proxyNotice");
  if (basis === "single_stock") {
    notice.hidden = true;
    return;
  }
  const labels = {
    same_index_proxy: "同指数 ETF 代理",
    sector_proxy: "行业代理估算",
    commodity_proxy: "商品代理估算",
    currency_proxy: "汇率代理估算",
    rates_proxy: "利率代理估算",
    regional_proxy: "地区代理估算",
  };
  $("#proxyNoticeTitle").textContent = labels[basis] || "用了代理基准";
  $("#proxyNoticeText").textContent =
    basis === "same_index_proxy"
      ? "这里拿同指数的 1× ETF 当可交易的价格代理，结果里会带上两只基金各自的跟踪误差。"
      : "参考代码并不是产品的官方基准，两者可能差得不少，这里的点位只能粗看。";
  notice.hidden = false;
}

function renderDiagnostics() {
  const { product, underlyingAnchor, leveragedAnchor, anchorDate } = state.active;
  $("#anchorUnderlying").textContent = formatPrice(underlyingAnchor.value);
  $("#anchorLeveraged").textContent = formatPrice(leveragedAnchor.value);
  $("#anchorFactor").textContent = `× ${product.factor}`;
  $("#anchorDate").textContent = anchorDate;
  $("#snapshotTime").textContent = formatDateTime(state.marketSnapshot?.generated_at);
  $("#catalogVerified").textContent = product.verified_at || "—";
  const anchorLabels = $$(".anchor-equation small");
  if (anchorLabels[0]) anchorLabels[0].textContent = "正股收盘";
  if (anchorLabels[1]) anchorLabels[1].textContent = "杠杆收盘";
  $("#diagnosticCaption").textContent = "两边必须是同一天的收盘价。缺一边就不出数字。";
}

function snapshotAgeHours() {
  const generatedAt = state.marketSnapshot?.generated_at;
  const generated = generatedAt ? new Date(generatedAt) : null;
  if (!generated || Number.isNaN(generated.getTime())) return null;
  return (Date.now() - generated.getTime()) / 3_600_000;
}

function updateDataStatus() {
  dom.dataPill.classList.remove("error", "warning");
  dom.heroStatus.classList.remove("warning");
  const ageHours = snapshotAgeHours();
  const partial = state.marketSnapshot?.status === "partial";
  if (ageHours == null || ageHours > 120 || partial) {
    dom.dataPill.classList.add("warning");
    dom.heroStatus.classList.add("warning");
  }

  const catalog = state.marketSnapshot?.catalog || {};
  const available = catalog.available_product_count;
  const total = catalog.product_count;
  const anchorDate = sampleAnchorDate() || state.active?.anchorDate;
  dom.dataPillText.textContent = anchorDate ? `收盘 ${anchorDate}` : `${available ?? "—"} 只可算`;
  dom.heroStatusText.textContent = anchorDate
    ? `收盘 ${anchorDate} · 可算 ${available ?? "—"} 只 / 可搜 ${total ?? "—"} 只`
    : "暂时读不到数据";

  $("#sourceLine").textContent = "Yahoo Finance · 每日收盘数据";
  $("#timeLine").textContent =
    `数据生成 ${formatDateTime(state.marketSnapshot?.generated_at)} · 收盘日 ${anchorDate || "—"}`;
}

function sampleAnchorDate() {
  const declared = state.marketSnapshot?.anchor_date;
  if (declared) return declared;
  const quotes = snapshotQuotes();
  const counts = new Map();
  for (const quote of Object.values(quotes)) {
    const date = quote?.session_date || quote?.anchor_date;
    if (date) counts.set(date, (counts.get(date) || 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || null;
}

function renderStatusDialog() {
  const catalog = state.marketSnapshot?.catalog || {};
  const rows = [
    ["数据生成", formatDateTime(state.marketSnapshot?.generated_at)],
    ["收盘日", state.active?.anchorDate || sampleAnchorDate() || "—"],
    ["可以计算", `${catalog.available_product_count ?? "—"} / ${catalog.product_count ?? "—"}`],
    ["没有收盘价", `${catalog.unavailable_product_count ?? "—"} 只（收盘日对不上或缺报价）`],
    ["只能搜索", `${catalog.reference_only_product_count ?? "—"} 只（24 小时交易的加密参考）`],
    ["数据来源", state.marketSnapshot?.provider?.name || "Yahoo Finance"],
  ];
  dom.statusList.innerHTML = rows
    .map(
      ([label, value]) =>
        `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`,
    )
    .join("");
}

function updateDriverUi() {
  if (!state.active) return;
  const context = conversionContext();
  if (!context) return;
  $("#targetPriceLabel").textContent = `${context.input.symbol} 目标价`;
  $("#outputPriceLabel").textContent = `${context.output.symbol} 对应点位`;
  $("#driverColumn").textContent = `${context.input.symbol} 价格`;
  $("#driverMoveColumn").textContent = "较收盘";
  $("#mappedColumn").textContent = `${context.output.symbol} 价格`;
  $("#mappedMoveColumn").textContent = "较收盘";
  $("#chartAxisNote").textContent = `横轴 ${context.input.symbol} · 纵轴 ${context.output.symbol}`;
  dom.nudgeRow.hidden = false;
  const modeLabels = $$(".chart-mode-label");
  if (modeLabels[0]) modeLabels[0].textContent = "按收盘价的理论值";
  if (modeLabels[1]) modeLabels[1].textContent = "理论值";
  $("#chartDescription").textContent =
    "在设定的跨度里，填进去的价格和算出来的价格之间的理论关系，并标出收盘价和当前目标价。";
  $$(".legend-anchor").forEach((label) => {
    label.textContent = "收盘价";
  });
  const underlyingIsDriver = context.mode === "underlying" && state.driverRole === "underlying";
  const primaryIsDriver =
    context.mode === "leveraged-pair"
      ? state.compareDriver === "primary"
      : state.driverRole === "leveraged";
  $("#underlyingQuoteCard").classList.toggle("driver", underlyingIsDriver);
  $("#leveragedQuoteCard").classList.toggle("driver", primaryIsDriver);
  $("#underlyingQuoteCard").setAttribute("aria-pressed", String(underlyingIsDriver));
  $("#leveragedQuoteCard").setAttribute("aria-pressed", String(primaryIsDriver));
}

function formatInputValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return number < 10 ? number.toFixed(3) : number.toFixed(2);
}

function calculateTarget(value) {
  if (!state.active) return null;
  const context = conversionContext();
  if (context?.mode === "leveraged-pair") {
    return leveragedAtLeveraged({
      driverTarget: value,
      driverAnchor: context.input.anchor,
      driverFactor: context.input.factor,
      mappedAnchor: context.output.anchor,
      mappedFactor: context.output.factor,
    });
  }
  return convertTarget({
    driverRole: state.driverRole,
    target: value,
    underlyingAnchor: state.active.underlyingAnchor.value,
    leveragedAnchor: state.active.leveragedAnchor.value,
    factor: state.active.product.factor,
  });
}

function renderPathStatus(message, detail = "改一下目标价会自动更新") {
  dom.pathPanel.hidden = false;
  dom.pathLead.textContent = message;
  dom.pathRows.innerHTML = `<div class="path-status">
    <strong>${escapeHtml(message)}</strong>
    <span>${escapeHtml(detail)}</span>
  </div>`;
}

function updateConversionOutputs() {
  if (!state.active) return;
  const context = conversionContext();
  if (!context) return;
  const inputValue = finitePositive(dom.targetPriceInput.value);
  const inputAnchor = context.input.anchor;
  const outputAnchor = context.output.anchor;
  const inputMove = inputValue ? percentMove(inputValue, inputAnchor) : null;
  setMovement(
    $("#targetMove"),
    inputMove,
    inputMove == null ? "价格要大于 0" : `较收盘 ${formatPercent(inputMove)}`,
  );

  try {
    const output = calculateTarget(inputValue);
    if (output == null) throw new Error("这个价格已经到理论归零的边界了");
    $("#convertedPrice").textContent = formatPriceBare(output);
    const outputMove = percentMove(output, outputAnchor);
    setMovement($("#convertedMove"), outputMove, `较收盘 ${formatPercent(outputMove)}`);
    dom.copyResultButton.disabled = false;
    dom.conversionLive.textContent = `${context.input.symbol} ${formatPriceBare(inputValue)} 对应 ${context.output.symbol} ${formatPriceBare(output)}，较收盘 ${formatPercent(outputMove)}`;
  } catch (error) {
    $("#convertedPrice").textContent = "—";
    $("#convertedMove").classList.remove("positive", "negative");
    $("#convertedMove").textContent = error.message || "目标价超出了模型范围";
    dom.copyResultButton.disabled = true;
    dom.conversionLive.textContent = error.message || "";
  }
  renderLadderAndChart();
  renderPathPanel();
}

/**
 * The leveraged leg and the underlying move behind the current conversion.
 * In leveraged-pair mode the shared underlying move is recovered from the
 * input product's own factor.
 */
function pathContext() {
  if (!state.active) return null;
  const context = conversionContext();
  const target = finitePositive(dom.targetPriceInput.value);
  if (!context || !target) return null;

  if (context.mode === "leveraged-pair") {
    const inputMove = percentMove(target, context.input.anchor);
    return {
      underlyingMove: inputMove / Number(context.input.factor),
      factor: Number(context.output.factor),
      productSymbol: context.output.symbol,
    };
  }

  const underlyingMove =
    state.driverRole === "underlying"
      ? percentMove(target, state.active.underlyingAnchor.value)
      : percentMove(target, state.active.leveragedAnchor.value) /
        Number(state.active.product.factor);
  return {
    underlyingMove,
    factor: Number(state.active.product.factor),
    productSymbol: state.active.product.symbol,
  };
}

const PATH_SWING = 3;

function renderPathPanel() {
  const context = pathContext();
  if (!context) {
    renderPathStatus("目标价要大于 0", "填完就能看到几天走完的差别");
    return;
  }
  const { underlyingMove, factor, productSymbol } = context;
  const days = state.pathDays;
  const smooth = smoothPathOutcome({ underlyingMove, factor, days });
  const single = smoothPathOutcome({ underlyingMove, factor, days: 1 });
  const drag = roundTripDrag({ swing: PATH_SWING, factor, days });
  if (!single) {
    renderPathStatus("这个目标价已经到理论边界", "改一下再试");
    return;
  }
  dom.pathPanel.hidden = false;

  dom.pathLead.innerHTML = `换算给的是<strong>一天走完</strong>的结果。同样是正股 ${escapeHtml(formatPercent(underlyingMove))}，分 ${days} 个交易日走完的话，${escapeHtml(productSymbol)} 就不一样了：`;

  const rows = [
    {
      label: "一天走完（上面算出来的）",
      value: single.totalMove,
      detail: "正股一天走完全部涨跌",
      tone: "base",
    },
    {
      label: `${days} 天匀速单边`,
      value: smooth ? smooth.totalMove : null,
      detail: smooth
        ? `每日 ${formatPercent(smooth.dailyMove, 3)} · 复利${smooth.edge >= 0 ? "帮忙" : "拖累"} ${formatPercent(smooth.edge)}`
        : "该路径理论归零",
      tone: "smooth",
    },
    {
      label: `${days} 天来回震荡后回到原点`,
      value: drag,
      detail: drag == null ? "该路径理论归零" : `正股每天 ±${PATH_SWING}%，最后回到 0%，产品还是亏`,
      tone: "drag",
    },
  ];

  dom.pathRows.innerHTML = rows
    .map(
      (row) => `<div class="path-row" data-tone="${row.tone}">
        <span class="path-label">${escapeHtml(row.label)}</span>
        <strong class="path-value ${row.value == null ? "" : movementClass(row.value)}">${row.value == null ? "—" : escapeHtml(formatPercent(row.value))}</strong>
        <span class="path-detail">${escapeHtml(row.detail)}</span>
      </div>`,
    )
    .join("");
}

function scenarioRows() {
  if (!state.active) return [];
  const context = conversionContext();
  if (context?.mode === "leveraged-pair") {
    return buildLeveragedPairLadder({
      range: state.range,
      step: state.step,
      driverAnchor: context.input.anchor,
      driverFactor: context.input.factor,
      mappedAnchor: context.output.anchor,
      mappedFactor: context.output.factor,
    });
  }
  return buildLadder({
    driverRole: state.driverRole,
    range: state.range,
    step: state.step,
    underlyingAnchor: state.active.underlyingAnchor.value,
    leveragedAnchor: state.active.leveragedAnchor.value,
    factor: state.active.product.factor,
  });
}

function closestRowIndex(rows, target) {
  if (!target || !rows.length) return -1;
  let bestIndex = -1;
  let bestGap = Infinity;
  rows.forEach((row, index) => {
    const gap = Math.abs(row.driverPrice - target);
    if (gap < bestGap) {
      bestGap = gap;
      bestIndex = index;
    }
  });
  // Only flag a row when the target actually sits inside the rendered ladder.
  const span = Math.abs(rows.at(-1).driverPrice - rows[0].driverPrice);
  const tolerance = span / Math.max(rows.length - 1, 1);
  return bestGap <= tolerance ? bestIndex : -1;
}

function renderLadderAndChart() {
  const rows = scenarioRows();
  const target = finitePositive(dom.targetPriceInput.value);
  const targetIndex = closestRowIndex(rows, target);

  $("#ladderBody").innerHTML = rows
    .map((row, index) => {
      const flags = [
        row.driverMove === 0 ? "anchor-row" : "",
        index === targetIndex ? "target-row" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const marker =
        row.driverMove === 0
          ? '<span class="row-tag">收盘</span>'
          : index === targetIndex
            ? '<span class="row-tag target">目标</span>'
            : "";
      if (row.mappedPrice == null) {
        return `<tr class="invalid-row ${flags}"><td><strong>${formatPrice(row.driverPrice)}</strong>${marker}</td><td class="${movementClass(row.driverMove)}">${formatPercent(row.driverMove)}</td><td>模型边界</td><td>—</td></tr>`;
      }
      return `<tr class="${flags}">
        <td><strong>${formatPrice(row.driverPrice)}</strong>${marker}</td>
        <td class="${movementClass(row.driverMove)}">${formatPercent(row.driverMove)}</td>
        <td><strong>${formatPrice(row.mappedPrice)}</strong></td>
        <td class="${movementClass(row.mappedMove)}">${formatPercent(row.mappedMove)}</td>
      </tr>`;
    })
    .join("");

  // Keep the interesting row in view, but do not yank the table on every keystroke.
  const focusRow =
    dom.ladderWrap.querySelector(".target-row") || dom.ladderWrap.querySelector(".anchor-row");
  if (focusRow) {
    const wrap = dom.ladderWrap;
    const top = focusRow.offsetTop;
    const bottom = top + focusRow.clientHeight;
    const visibleTop = wrap.scrollTop;
    const visibleBottom = visibleTop + wrap.clientHeight;
    if (top < visibleTop || bottom > visibleBottom) {
      wrap.scrollTop = Math.max(0, top - wrap.clientHeight / 2 + focusRow.clientHeight / 2);
    }
  }

  renderChart(
    rows.filter((row) => row.mappedPrice != null),
    target,
  );
}

function svgNode(name, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function renderChart(rows, target) {
  const grid = $("#chartGrid");
  const pointsGroup = $("#chartPoints");
  const labelsGroup = $("#chartLabels");
  const markersGroup = $("#chartMarkers");
  const line = $("#chartLine");
  const area = $("#chartArea");
  grid.replaceChildren();
  pointsGroup.replaceChildren();
  labelsGroup.replaceChildren();
  markersGroup.replaceChildren();
  if (rows.length < 2) {
    line.setAttribute("d", "");
    area.setAttribute("d", "");
    return;
  }

  const width = 720;
  const height = 300;
  const margin = { top: 22, right: 22, bottom: 36, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const xValues = rows.map((row) => row.driverPrice);
  const yValues = rows.map((row) => row.mappedPrice);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMinRaw = Math.min(...yValues);
  const yMaxRaw = Math.max(...yValues);
  const yPadding = Math.max((yMaxRaw - yMinRaw) * 0.1, yMaxRaw * 0.005);
  const yMin = yMinRaw - yPadding;
  const yMax = yMaxRaw + yPadding;
  const xScale = (value) => margin.left + ((value - xMin) / (xMax - xMin || 1)) * innerWidth;
  const yScale = (value) =>
    margin.top + innerHeight - ((value - yMin) / (yMax - yMin || 1)) * innerHeight;

  for (let index = 0; index < 5; index += 1) {
    const ratio = index / 4;
    const y = margin.top + ratio * innerHeight;
    grid.append(
      svgNode("line", {
        x1: margin.left,
        x2: width - margin.right,
        y1: y,
        y2: y,
        class: "chart-grid-line",
      }),
    );
    const yLabel = svgNode("text", {
      x: margin.left - 10,
      y: y + 4,
      class: "chart-axis-label",
      "text-anchor": "end",
    });
    yLabel.textContent = formatPriceBare(yMax - ratio * (yMax - yMin));
    labelsGroup.append(yLabel);

    const x = margin.left + ratio * innerWidth;
    grid.append(
      svgNode("line", {
        x1: x,
        x2: x,
        y1: margin.top,
        y2: height - margin.bottom,
        class: "chart-grid-line",
      }),
    );
    const xLabel = svgNode("text", {
      x,
      y: height - 12,
      class: "chart-axis-label",
      "text-anchor": "middle",
    });
    xLabel.textContent = formatPriceBare(xMin + ratio * (xMax - xMin));
    labelsGroup.append(xLabel);
  }

  const coordinates = rows.map((row) => [xScale(row.driverPrice), yScale(row.mappedPrice), row]);
  const pathData = coordinates
    .map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  line.setAttribute("d", pathData);
  area.setAttribute(
    "d",
    `${pathData} L${coordinates.at(-1)[0].toFixed(2)},${height - margin.bottom} L${coordinates[0][0].toFixed(2)},${height - margin.bottom} Z`,
  );

  const anchorRow = rows.find((row) => row.driverMove === 0);
  if (anchorRow) {
    const x = xScale(anchorRow.driverPrice);
    const y = yScale(anchorRow.mappedPrice);
    markersGroup.append(
      svgNode("line", {
        x1: x,
        x2: x,
        y1: margin.top,
        y2: height - margin.bottom,
        class: "marker-line anchor",
      }),
    );
    markersGroup.append(
      svgNode("line", {
        x1: margin.left,
        x2: width - margin.right,
        y1: y,
        y2: y,
        class: "marker-line anchor",
      }),
    );
    markersGroup.append(svgNode("circle", { cx: x, cy: y, r: 5.5, class: "marker-dot anchor" }));
  }

  const targetInRange = target != null && target >= xMin && target <= xMax;
  if (targetInRange) {
    const mapped = calculateTarget(target);
    if (mapped != null && mapped >= yMin && mapped <= yMax) {
      const x = xScale(target);
      const y = yScale(mapped);
      markersGroup.append(
        svgNode("line", {
          x1: x,
          x2: x,
          y1: margin.top,
          y2: height - margin.bottom,
          class: "marker-line target",
        }),
      );
      markersGroup.append(svgNode("circle", { cx: x, cy: y, r: 5.5, class: "marker-dot target" }));
    }
  }

  coordinates.forEach(([x, y, row], index) => {
    if (index % Math.max(1, Math.floor(rows.length / 10)) !== 0 && index !== rows.length - 1)
      return;
    const circle = svgNode("circle", {
      cx: x,
      cy: y,
      r: 4,
      class: "chart-point",
      tabindex: "0",
      role: "img",
    });
    const label = svgNode("title");
    label.textContent = `${formatPrice(row.driverPrice)} → ${formatPrice(row.mappedPrice)}`;
    circle.append(label);
    const show = () => showChartTooltip(x, y, row);
    circle.addEventListener("mouseenter", show);
    circle.addEventListener("focus", show);
    circle.addEventListener("mouseleave", hideChartTooltip);
    circle.addEventListener("blur", hideChartTooltip);
    pointsGroup.append(circle);
  });
}

function showChartTooltip(x, y, row) {
  const tooltip = $("#chartTooltip");
  const svg = $("#mappingChart");
  const rect = svg.getBoundingClientRect();
  const scaleX = rect.width / 720;
  const scaleY = rect.height / 300;
  tooltip.innerHTML = `${formatPrice(row.driverPrice)} → ${formatPrice(row.mappedPrice)}<br>${formatPercent(row.driverMove)} → ${formatPercent(row.mappedMove)}`;
  tooltip.hidden = false;
  tooltip.style.left = `${x * scaleX + svg.offsetLeft}px`;
  tooltip.style.top = `${y * scaleY + svg.offsetTop}px`;
}

function hideChartTooltip() {
  $("#chartTooltip").hidden = true;
}

/* ------------------------------------------------------------- behaviours */

function setDriver(role, resetTarget = true) {
  if (!state.active || !["underlying", "leveraged"].includes(role)) return;
  state.conversionMode = "underlying";
  state.driverRole = role;
  renderConversionControls();
  if (resetTarget) {
    const anchor =
      role === "underlying"
        ? state.active.underlyingAnchor.value
        : state.active.leveragedAnchor.value;
    dom.targetPriceInput.value = formatInputValue(anchor);
  }
  updateDriverUi();
  updateConversionOutputs();
  updateUrl(state.active.underlying.symbol, state.active.product.symbol);
}

function setConversionMode(mode) {
  if (!state.active || !["underlying", "leveraged-pair"].includes(mode)) return;
  if (mode === "leveraged-pair" && !comparisonCandidates().length) {
    showToast("这个基准下暂时没有第二只能用的杠杆产品。", 4200);
    return;
  }
  state.conversionMode = mode;
  if (mode === "leveraged-pair") state.compareDriver = "primary";
  renderConversionControls();
  const context = conversionContext();
  dom.targetPriceInput.value = formatInputValue(context?.input.anchor);
  updateDriverUi();
  updateConversionOutputs();
  updateUrl(state.active.underlying.symbol, state.active.product.symbol);
}

function selectComparisonProduct(symbol) {
  if (!state.active) return;
  state.compareProductSymbol = normalizeSymbol(symbol);
  if (!ensureComparisonSelection()) return;
  renderConversionControls();
  const context = conversionContext();
  dom.targetPriceInput.value = formatInputValue(context?.input.anchor);
  updateDriverUi();
  updateConversionOutputs();
  updateUrl(state.active.underlying.symbol, state.active.product.symbol);
}

function swapConversionDirection() {
  if (!state.active) return;
  if (state.conversionMode === "leveraged-pair") {
    state.compareDriver = state.compareDriver === "primary" ? "comparison" : "primary";
    const context = conversionContext();
    dom.targetPriceInput.value = formatInputValue(context?.input.anchor);
    updateDriverUi();
    updateConversionOutputs();
    updateUrl(state.active.underlying.symbol, state.active.product.symbol);
    return;
  }
  setDriver(state.driverRole === "underlying" ? "leveraged" : "underlying");
}

function nudgeTarget(percent) {
  const context = conversionContext();
  if (!context) return;
  const next = context.input.anchor * (1 + Number(percent) / 100);
  dom.targetPriceInput.value = formatInputValue(next);
  updateConversionOutputs();
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
  } catch {
    window.prompt("复制以下内容", text);
  }
}

function resultSummary() {
  const context = conversionContext();
  if (!context || !state.active) return "";
  const input = finitePositive(dom.targetPriceInput.value);
  if (!input) return "";
  const output = calculateTarget(input);
  if (output == null) return "";
  return [
    `${context.input.symbol} ${formatPriceBare(input)} → ${context.output.symbol} ${formatPriceBare(output)}`,
    `较收盘 ${formatPercent(percentMove(input, context.input.anchor))} → ${formatPercent(percentMove(output, context.output.anchor))}`,
    `收盘日 ${state.active.anchorDate} · ${state.active.underlying.symbol} ${formatPriceBare(state.active.underlyingAnchor.value)} / ${state.active.product.symbol} ${formatPriceBare(state.active.leveragedAnchor.value)}`,
    "LeverPath 按收盘价算的理论值，不构成投资建议",
  ].join("\n");
}

async function refreshSnapshot() {
  const identity = state.active
    ? {
        symbol:
          state.driverRole === "leveraged"
            ? state.active.product.symbol
            : state.active.underlying.symbol,
        product: state.active.product.symbol,
      }
    : null;
  setLoading(true);
  try {
    const previousStamp = state.marketSnapshot?.generated_at || null;
    const previousAnchor = state.active?.anchorDate || sampleAnchorDate();
    state.marketSnapshot = await fetchJson(SNAPSHOT_URL, { bustCache: true });
    if (identity)
      activateSymbol(identity.symbol, identity.product, { scroll: false, remember: false });
    updateDataStatus();
    renderExampleRail();
    const nextStamp = state.marketSnapshot?.generated_at || null;
    const nextAnchor = state.active?.anchorDate || sampleAnchorDate();
    if (nextAnchor && previousAnchor && nextAnchor !== previousAnchor) {
      showToast(`数据已更新到 ${nextAnchor}。`);
    } else if (nextStamp && previousStamp && nextStamp !== previousStamp) {
      showToast("有新数据，但收盘日没变。");
    } else {
      showToast(`已经是最新的，收盘日还是 ${nextAnchor || "—"}。要等收盘后才有新数据。`, 4200);
    }
  } catch (error) {
    showToast(`检查更新失败：${error.message}`, 4500);
  } finally {
    setLoading(false);
  }
}

/* ---------------------------------------------------------- recognition */

function recognitionAliasMap() {
  const known = new Set([...state.indexes.underlyings.keys(), ...state.indexes.products.keys()]);
  // Built-ins first so personal aliases can override any collision.
  const aliases = new Map(builtinRecognitionAliases(known));
  for (const [alias, symbol] of parseAliasAssignments(dom.recognitionAliases.value)) {
    aliases.set(alias, symbol);
  }
  return aliases;
}

function buildRecognitionGroups(points) {
  const groups = new Map();
  for (const point of points) {
    const resolved = resolveCatalogSymbol(point.symbol, state.indexes);
    const underlying = resolved?.underlying || null;
    const symbol = underlying?.symbol || point.symbol;
    if (!groups.has(symbol)) {
      groups.set(symbol, {
        symbol,
        name: underlying?.name || "未收录代码",
        underlying,
        points: [],
        products: [],
        anchorDate: null,
      });
    }
    const sourceProduct = resolved?.inputRole === "leveraged" ? resolved.product : null;
    const sourcePair =
      underlying && sourceProduct ? pairFor(underlying.symbol, sourceProduct.symbol) : null;
    groups.get(symbol).points.push({ point, sourceProduct, sourcePair });
  }

  for (const group of groups.values()) {
    if (!group.underlying || isCryptoGroup(group.underlying)) continue;
    group.products = group.underlying.products
      .map((product) => {
        const pair = pairFor(group.underlying.symbol, product.symbol);
        return pair.ok ? { product, pair } : null;
      })
      .filter(Boolean);
    group.anchorDate = group.products[0]?.pair.anchorDate || null;
  }
  return [...groups.values()];
}

function recognitionCell(entry, target) {
  if (!target) return { status: "unavailable", label: "—" };
  if (!entry.sourceProduct) {
    const mapped = convertTarget({
      driverRole: "underlying",
      target: entry.point.level,
      underlyingAnchor: target.pair.underlying.value,
      leveragedAnchor: target.pair.leveraged.value,
      factor: target.product.factor,
    });
    return mapped == null
      ? { status: "boundary", label: "理论归零" }
      : { status: "ok", label: formatPrice(mapped) };
  }
  if (target.product.symbol === entry.sourceProduct.symbol) {
    return { status: "source", label: formatPrice(entry.point.level) };
  }
  if (!entry.sourcePair?.ok || entry.sourcePair.anchorDate !== target.pair.anchorDate) {
    return { status: "unavailable", label: "没有收盘价" };
  }
  const mapped = leveragedAtLeveraged({
    driverTarget: entry.point.level,
    driverAnchor: entry.sourcePair.leveraged.value,
    driverFactor: entry.sourceProduct.factor,
    mappedAnchor: target.pair.leveraged.value,
    mappedFactor: target.product.factor,
  });
  return mapped == null
    ? { status: "boundary", label: "理论归零" }
    : { status: "ok", label: formatPrice(mapped) };
}

function renderRecognitionGroup(symbol = dom.recognitionSymbolSelect.value) {
  const group =
    state.recognitionGroups.find((item) => item.symbol === symbol) || state.recognitionGroups[0];
  if (!group) return;
  dom.recognitionSymbolSelect.value = group.symbol;
  const tableWrap = dom.recognitionResults.querySelector(".table-wrap");
  if (tableWrap) {
    tableWrap.scrollLeft = 0;
    tableWrap.scrollTop = 0;
  }
  dom.recognitionOpenButton.hidden = !group.products.length;
  dom.recognitionOpenButton.dataset.symbol = group.symbol;

  if (!group.products.length) {
    dom.recognitionHead.innerHTML = "<tr><th>识别到的点位</th><th>状态</th></tr>";
    const message = !group.underlying
      ? "代码未收录"
      : isCryptoGroup(group.underlying)
        ? "24 小时交易的标的不做收盘价换算"
        : "没有同一天收盘价的杠杆产品";
    dom.recognitionBody.innerHTML = group.points
      .map(({ point }) => {
        const aliasLabel =
          point.rawSymbol !== point.symbol ? `${point.rawSymbol} → ${point.symbol}` : point.symbol;
        return `<tr><td><strong>${escapeHtml(aliasLabel)} · ${escapeHtml(formatPriceBare(point.level))}</strong><span class="recognition-source-line" title="${escapeHtml(point.line)}">${escapeHtml(point.line)}</span></td><td>${escapeHtml(message)}</td></tr>`;
      })
      .join("");
    dom.recognitionGroupMeta.textContent = `识别到 ${group.points.length} 个点位 · ${message}`;
    return;
  }

  dom.recognitionHead.innerHTML = `<tr><th>识别到的点位</th>${group.products.map(({ product }) => `<th><strong>${escapeHtml(product.symbol)}</strong><small>${escapeHtml(factorLabel(product.factor))}</small></th>`).join("")}</tr>`;
  dom.recognitionBody.innerHTML = group.points
    .map((entry) => {
      const point = entry.point;
      const aliasLabel =
        point.rawSymbol !== point.symbol ? `${point.rawSymbol} → ${point.symbol}` : point.symbol;
      const source = `<strong>${escapeHtml(aliasLabel)} · ${escapeHtml(formatPriceBare(point.level))}</strong><span class="recognition-source-line" title="${escapeHtml(point.line)}">${escapeHtml(point.line)}</span>`;
      const cells = group.products
        .map((target) => {
          const cell = recognitionCell(entry, target);
          return `<td data-status="${cell.status}"><strong>${escapeHtml(cell.label)}</strong></td>`;
        })
        .join("");
      return `<tr><td>${source}</td>${cells}</tr>`;
    })
    .join("");
  dom.recognitionGroupMeta.textContent = `识别到 ${group.points.length} 个点位 · ${group.products.length} 只杠杆 · 收盘 ${group.anchorDate || "—"}`;
}

function runRecognition() {
  const text = dom.recognitionText.value.trim();
  if (!text) {
    dom.recognitionResults.hidden = true;
    dom.recognitionSummary.textContent = "先贴一段带代码和价格的文字";
    dom.recognitionText.focus();
    return;
  }
  try {
    window.localStorage.setItem(RECOGNITION_ALIAS_KEY, dom.recognitionAliases.value.trim());
  } catch {
    // Private browsing may disable local storage; recognition still works.
  }
  const knownSymbols = new Set([
    ...state.indexes.underlyings.keys(),
    ...state.indexes.products.keys(),
  ]);
  const rawPoints = extractTickerLevels(text, { knownSymbols, aliases: recognitionAliasMap() });
  // A number near a ticker still has to be a believable price for it. EPS,
  // share counts and index points that survive the text rules die here.
  const quotes = snapshotQuotes();
  const points = rawPoints.filter((point) => {
    const resolved = resolveCatalogSymbol(point.symbol, state.indexes);
    const reference = resolved
      ? quotes[
          resolved.inputRole === "leveraged" ? resolved.product.symbol : resolved.underlying.symbol
        ]
      : null;
    return plausibleLevel(point.level, reference?.close ?? reference?.anchor);
  });
  state.recognitionIgnored = rawPoints.length - points.length;
  if (!points.length) {
    state.recognitionGroups = [];
    dom.recognitionSymbolSelect.innerHTML = '<option value="">没有识别结果</option>';
    dom.recognitionHead.innerHTML = "<tr><th>状态</th></tr>";
    dom.recognitionBody.innerHTML =
      "<tr><td>没找到“代码 + 价格”。可以在自己的叫法那栏补一条，比如 迪子=SNDK。</td></tr>";
    dom.recognitionGroupMeta.textContent = "—";
    dom.recognitionOpenButton.hidden = true;
    dom.recognitionResults.hidden = false;
    dom.recognitionSummary.textContent = "没找到能换算的点位";
    return;
  }

  const previousSymbol = dom.recognitionSymbolSelect.value;
  state.recognitionGroups = buildRecognitionGroups(points);
  dom.recognitionSymbolSelect.innerHTML = state.recognitionGroups
    .map(
      (group) =>
        `<option value="${escapeHtml(group.symbol)}">${escapeHtml(group.symbol)} · ${group.points.length} 个点位</option>`,
    )
    .join("");
  const selectedSymbol = state.recognitionGroups.some((group) => group.symbol === previousSymbol)
    ? previousSymbol
    : state.recognitionGroups[0]?.symbol;
  renderRecognitionGroup(selectedSymbol);
  dom.recognitionResults.hidden = false;
  dom.recognitionSummary.textContent = state.recognitionIgnored
    ? `识别到 ${points.length} 个点位 · ${state.recognitionGroups.length} 只正股 · 忽略了 ${state.recognitionIgnored} 个不像价格的数字`
    : `识别到 ${points.length} 个点位 · ${state.recognitionGroups.length} 只正股`;
}

function initializeRecognitionAliases() {
  try {
    dom.recognitionAliases.value =
      window.localStorage.getItem(RECOGNITION_ALIAS_KEY) ?? DEFAULT_RECOGNITION_ALIASES;
  } catch {
    dom.recognitionAliases.value = DEFAULT_RECOGNITION_ALIASES;
  }
}

/* ----------------------------------------------------------------- events */

function commitSymbolInput() {
  renderSuggestions(dom.symbolInput.value);
}

function focusSearch() {
  setView("empty");
  dom.hero.scrollIntoView({ behavior: "smooth", block: "start" });
  dom.symbolInput.focus();
  dom.symbolInput.select();
}

dom.symbolForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (symbolImeGuard.shouldBlockSubmit(event)) return;
  const selected = $(`.suggestion-item[data-index="${state.selectedSuggestion}"]`);
  activateSymbol(selected?.dataset.symbol || dom.symbolInput.value);
});

dom.symbolInput.addEventListener("compositionstart", () => {
  symbolImeGuard.start();
  closeSuggestions();
});

dom.symbolInput.addEventListener("compositionend", () => {
  symbolImeGuard.end();
  commitSymbolInput();
});

dom.symbolInput.addEventListener("input", (event) => {
  if (symbolImeGuard.isComposing(event)) return;
  commitSymbolInput();
});

dom.symbolInput.addEventListener("keydown", (event) => {
  if (symbolImeGuard.shouldBlockKeydown(event)) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSuggestion(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSuggestion(-1);
  } else if (event.key === "Escape") {
    closeSuggestions();
  }
});

dom.suggestions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-symbol]");
  if (button) activateSymbol(button.dataset.symbol);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-shell")) closeSuggestions();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
  const tag = document.activeElement?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || document.activeElement?.isContentEditable)
    return;
  if ($$("dialog[open]").length) return;
  event.preventDefault();
  focusSearch();
});

for (const rail of [dom.exampleChips, dom.recentChips, dom.errorSuggestionChips]) {
  rail.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-symbol]");
    if (chip) activateSymbol(chip.dataset.symbol, chip.dataset.product || null);
  });
}

dom.clearRecentButton.addEventListener("click", () => {
  state.recent = [];
  persistRecent();
  renderRecentRail();
});

dom.productTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-product]");
  if (button && state.active)
    activateSymbol(state.active.underlying.symbol, button.dataset.product, { scroll: false });
});

dom.productTabs.addEventListener("keydown", (event) => {
  const tabs = $$("#productTabs [role='tab']");
  const currentIndex = tabs.indexOf(document.activeElement);
  if (currentIndex < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  let nextIndex = currentIndex;
  if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = tabs.length - 1;
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
});

dom.conversionModeButtons.addEventListener("click", (event) => {
  const button = event.target.closest("[data-conversion-mode]");
  if (button && !button.disabled) setConversionMode(button.dataset.conversionMode);
});

dom.compareProductSelect.addEventListener("change", (event) => {
  selectComparisonProduct(event.target.value);
});

dom.swapConversionButton.addEventListener("click", swapConversionDirection);

dom.nudgeRow.addEventListener("click", (event) => {
  const button = event.target.closest("[data-nudge]");
  if (button) nudgeTarget(button.dataset.nudge);
});

$("#underlyingQuoteCard").addEventListener("click", () => setDriver("underlying"));
$("#leveragedQuoteCard").addEventListener("click", () => setDriver("leveraged"));
dom.targetPriceInput.addEventListener("input", updateConversionOutputs);

$("#rangeButtons").addEventListener("click", (event) => {
  const button = event.target.closest("[data-range]");
  if (!button) return;
  state.range = Number(button.dataset.range);
  $$("#rangeButtons button").forEach((item) => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  renderLadderAndChart();
});

$("#stepSelect").addEventListener("change", (event) => {
  state.step = Number(event.target.value);
  renderLadderAndChart();
});

dom.pathDays.addEventListener("click", (event) => {
  const button = event.target.closest("[data-days]");
  if (!button) return;
  state.pathDays = Number(button.dataset.days);
  dom.pathDays.querySelectorAll("[data-days]").forEach((item) => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  renderPathPanel();
});

dom.refreshButton.addEventListener("click", refreshSnapshot);
dom.newSearchButton.addEventListener("click", focusSearch);

dom.copyResultButton.addEventListener("click", () => {
  const summary = resultSummary();
  if (summary) copyText(summary, "换算结果已复制。");
});

dom.shareButton.addEventListener("click", async () => {
  const shareUrl = new URL(window.location.href);
  const target = finitePositive(dom.targetPriceInput.value);
  if (target) shareUrl.searchParams.set("target", formatInputValue(target));
  else shareUrl.searchParams.delete("target");
  const title = state.active
    ? `${state.active.underlying.symbol} ↔ ${state.active.product.symbol} · LeverPath`
    : "LeverPath";
  if (navigator.share) {
    try {
      await navigator.share({ title, url: shareUrl.href });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  copyText(shareUrl.href, "分享链接已复制。");
});

$("#backToCatalogButton").addEventListener("click", () => {
  state.active = null;
  dom.symbolInput.value = "";
  focusSearch();
});

function openDialog(dialog) {
  dialog.showModal();
}

// Native <dialog> closes on Escape; this adds click-outside-to-close.
for (const dialog of [dom.methodDialog, dom.recognitionDialog, dom.statusDialog]) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

$("#openMethodButton").addEventListener("click", () => openDialog(dom.methodDialog));
$("[data-close-method]").addEventListener("click", () => dom.methodDialog.close());
dom.dataPill.addEventListener("click", () => {
  renderStatusDialog();
  openDialog(dom.statusDialog);
});
$("[data-close-status]").addEventListener("click", () => dom.statusDialog.close());
$("#openRecognitionButton").addEventListener("click", () => {
  openDialog(dom.recognitionDialog);
  window.setTimeout(() => dom.recognitionText.focus(), 0);
});
$("[data-close-recognition]").addEventListener("click", () => dom.recognitionDialog.close());
dom.runRecognitionButton.addEventListener("click", runRecognition);
dom.recognitionSampleButton.addEventListener("click", () => {
  dom.recognitionText.value = RECOGNITION_SAMPLE;
  runRecognition();
});
dom.recognitionOpenButton.addEventListener("click", (event) => {
  const symbol = event.currentTarget.dataset.symbol;
  if (!symbol) return;
  dom.recognitionDialog.close();
  activateSymbol(symbol);
});
dom.recognitionSymbolSelect.addEventListener("change", (event) =>
  renderRecognitionGroup(event.target.value),
);
dom.recognitionText.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    runRecognition();
  }
});
window.addEventListener("resize", hideChartTooltip);

initializeRecognitionAliases();

async function boot() {
  // The search entrance must never be hidden behind network loading.
  setView("empty");
  setLoading(false);
  loadRecent();
  try {
    const [rawCatalog, marketSnapshot] = await Promise.all([
      fetchJson(CATALOG_URL),
      fetchJson(SNAPSHOT_URL),
    ]);
    state.groups = groupCatalog(rawCatalog);
    state.indexes = buildCatalogIndexes(state.groups);
    state.marketSnapshot = marketSnapshot;
    buildSearchIndex();
    renderExampleRail();
    renderRecentRail();
    updateDataStatus();
    dom.runRecognitionButton.disabled = false;
    dom.recognitionSummary.textContent = "等你贴文字";

    const params = new URL(window.location.href).searchParams;
    const symbol = normalizeSymbol(params.get("symbol"));
    const product = normalizeSymbol(params.get("product"));
    const requestedMode = params.get("mode");
    const requestedComparison = normalizeSymbol(params.get("compare"));
    const requestedInput = normalizeSymbol(params.get("input"));
    const requestedTarget = finitePositive(params.get("target"));
    if (symbol) {
      activateSymbol(symbol, product || null, { scroll: false });
      if (state.active && requestedMode === "pair") {
        state.conversionMode = "leveraged-pair";
        state.compareProductSymbol = requestedComparison;
        const comparison = ensureComparisonSelection();
        if (comparison) {
          state.compareDriver =
            requestedInput === comparison.product.symbol ? "comparison" : "primary";
          renderActive({ resetTarget: true });
          updateUrl(state.active.underlying.symbol, state.active.product.symbol);
        } else {
          state.conversionMode = "underlying";
        }
      }
      if (requestedTarget && state.active) {
        dom.targetPriceInput.value = formatInputValue(requestedTarget);
        updateConversionOutputs();
        const restoredUrl = new URL(window.location.href);
        restoredUrl.searchParams.set("target", formatInputValue(requestedTarget));
        window.history.replaceState({}, "", restoredUrl);
      }
    }
  } catch (error) {
    dom.dataPill.classList.add("error");
    dom.dataPillText.textContent = "数据读不到";
    dom.heroStatus.classList.add("warning");
    dom.heroStatusText.textContent = "暂时读不到数据，过一会儿刷新试试";
    dom.recognitionSummary.textContent = "暂时读不到数据";
    showError("暂时读不到数据", `${error.message}。过一会儿刷新试试。`);
  }
}

/* ------------------------------------------------------------- appearance */

const APPEARANCE_KEY = "leverpath.appearance";
const themeSwitch = $("#themeSwitch");

function readAppearance() {
  try {
    const stored = window.localStorage.getItem(APPEARANCE_KEY);
    return stored === "light" || stored === "dark" ? stored : "auto";
  } catch {
    return "auto";
  }
}

function applyAppearance(choice) {
  // "auto" leaves the attribute off so the prefers-color-scheme rules decide.
  if (choice === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;

  for (const button of themeSwitch.querySelectorAll("button[data-appearance]")) {
    button.setAttribute("aria-pressed", String(button.dataset.appearance === choice));
  }

  // The calculator runs inside a frame; keep the shell around it in step.
  if (window.parent !== window) {
    window.parent.postMessage(
      { type: "leverpath:appearance", value: choice },
      window.location.origin,
    );
  }
}

themeSwitch.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-appearance]");
  if (!button) return;
  const choice = button.dataset.appearance;
  try {
    if (choice === "auto") window.localStorage.removeItem(APPEARANCE_KEY);
    else window.localStorage.setItem(APPEARANCE_KEY, choice);
  } catch {
    /* private mode: the choice holds for this page only */
  }
  applyAppearance(choice);
});

applyAppearance(readAppearance());

initializePublicKeyPanel();

boot();
