import "server-only";

import { load } from "cheerio";

import {
  EXPECTED_HOSTS,
  SOURCE_URLS,
  TALASEA_GOLD18_SYMBOL,
  TALASEA_HTML_UNIT,
  TALASEA_JSON_PATH,
  TALASEA_SELECTORS,
  TALASEA_UNIT,
  TGJU_UNIT,
} from "../../utils/constants.server.js";
import {
  parseDailyChangePercent,
  parseDailyRange,
} from "./dailyRange.js";
import {
  fetchJson,
  fetchText,
  parseOptionalPrice,
  parsePrice,
  ScraperError,
  toIsoTimestamp,
  toTomanInteger,
} from "./http.js";

const NO_FALLBACK_CODES = new Set(["config", "blocked", "too-large"]);

/**
 * Read a nested value through an array of keys.
 *
 * @param {unknown} value - Root value.
 * @param {string[]} path - Keys to follow.
 * @returns {unknown} Value at path, or undefined.
 */
function readPath(value, path) {
  let current = value;

  for (const key of path) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

/**
 * Map a provider currency label to the shared unit vocabulary.
 *
 * @param {unknown} label - Currency label from the payload.
 * @returns {"toman" | "rial" | null} Normalized unit, or null when unsupported.
 */
function normalizeUnit(label) {
  const normalized = String(label ?? "")
    .trim()
    .toUpperCase();

  if (normalized === "") {
    return null;
  }

  if (
    normalized.includes("RIAL") ||
    normalized.includes("IRR") ||
    normalized.includes("ریال")
  ) {
    return "rial";
  }

  if (
    normalized.includes("TOMAN") ||
    normalized.includes("IRT") ||
    normalized.includes("TMN") ||
    normalized.includes("تومان")
  ) {
    return "toman";
  }

  return null;
}

/**
 * Find the 18-karat entry inside the verified JSON payload.
 *
 * @param {unknown} json - Parsed payload.
 * @returns {Record<string, unknown> | null} Matching entry, if any.
 */
function findGoldEntry(json) {
  const entries = readPath(json, [TALASEA_JSON_PATH[0]]);

  if (!Array.isArray(entries)) {
    return null;
  }

  return (
    entries.find((entry) => {
      const symbol = readPath(entry, ["tradeable", "nitrimoSymbol"]);
      const name = String(readPath(entry, ["tradeable", "name"]) ?? "").toLowerCase();

      return symbol === TALASEA_GOLD18_SYMBOL || name === "gold18";
    }) ?? null
  );
}

/**
 * Parse the verified JSON feed into a toman integer per gram.
 *
 * @param {unknown} json - Parsed payload.
 * @returns {number} Positive integer toman price per gram of 18k gold.
 * @throws {ScraperError} With code "parse" when the price or unit is invalid.
 */
export function parseTalaseaJson(json) {
  const entry = findGoldEntry(json);

  if (!entry) {
    throw new ScraperError("Gold price entry was not found.", "parse");
  }

  const unitCode = String(
    readPath(entry, ["unitCode"]) ??
      readPath(entry, ["tradeable", "unitCode"]) ??
      "",
  ).toUpperCase();

  if (unitCode !== "" && unitCode !== "GRAM") {
    throw new ScraperError("Price is not quoted per gram.", "parse");
  }

  const currencyLabel =
    readPath(entry, ["priceCurrency"]) ??
    readPath(entry, ["tradeable", "priceCurrency"]);
  const sourceUnit = normalizeUnit(currencyLabel) ?? TALASEA_UNIT;

  const rawPrice = readPath(entry, TALASEA_JSON_PATH.slice(1));

  if (rawPrice === undefined || rawPrice === null) {
    throw new ScraperError("Gold price was not found.", "parse");
  }

  return toTomanInteger(rawPrice, sourceUnit);
}

function parseTalaseaJsonRange(json, price) {
  const entry = findGoldEntry(json);
  if (!entry) {
    return null;
  }

  const unit =
    normalizeUnit(
      readPath(entry, ["priceCurrency"]) ??
        readPath(entry, ["tradeable", "priceCurrency"]),
    ) ?? TALASEA_UNIT;
  const high24h = parseOptionalPrice(
    entry.high24h ?? entry.highPrice24h,
    unit,
  );
  const low24h = parseOptionalPrice(entry.low24h ?? entry.lowPrice24h, unit);

  if (
    high24h === null ||
    low24h === null ||
    high24h < price ||
    low24h > price ||
    low24h > high24h
  ) {
    return null;
  }

  return { high24h, low24h };
}

/**
 * Parse the HTML fallback into a toman integer per gram.
 *
 * @param {string} html - HTML document.
 * @param {string[]} [selectors] - Selectors to try, defaulting to the configured list.
 * @param {"toman" | "rial"} [unit] - Unit reported by the HTML page.
 * @returns {number} Positive integer toman price per gram of 18k gold.
 * @throws {ScraperError} With code "parse" when no price is found.
 */
export function parseTalaseaHtml(
  html,
  selectors = TALASEA_SELECTORS,
  unit = TALASEA_HTML_UNIT,
) {
  if (!Array.isArray(selectors) || selectors.length === 0) {
    throw new ScraperError("No verified price selector is configured.", "parse");
  }

  const $ = load(String(html ?? ""));

  for (const selector of selectors) {
    for (const element of $(selector).toArray()) {
      const node = $(element);
      const price = (() => {
        try {
          return parsePrice(node.text());
        } catch (error) {
          if (error instanceof ScraperError && error.code === "parse") {
            return null;
          }

          throw error;
        }
      })();

      if (price === null) {
        continue;
      }

      return toTomanInteger(price, unit);
    }
  }

  throw new ScraperError("Gold price element was not found.", "parse");
}

/**
 * Fetch the 18-karat gram price, preferring JSON and falling back to HTML.
 *
 * The HTML fallback uses a separate allowlisted URL, selector and unit from
 * the primary JSON feed.
 *
 * fetchedAt is informational only; the price engine uses its own time when
 * recording values.
 *
 * @param {{ fetchImpl?: typeof fetch, now?: Date | string | number | (() => Date | string | number), domUrl?: string, domSelectors?: string[], domUnit?: "toman" | "rial" }} [options] - Injection points for tests.
 * @returns {Promise<{ prices: { gold18k: number }, fetchedAt: string, meta: { via: "json" | "dom" } }>} Price and path metadata.
 * @throws {ScraperError} When both configured paths fail.
 */
export async function fetchTalasea({
  fetchImpl,
  now,
  domUrl = SOURCE_URLS.gold18Html,
  domSelectors = TALASEA_SELECTORS,
  domUnit = TALASEA_HTML_UNIT,
} = {}) {
  let jsonError;

  try {
    const json = await fetchJson(SOURCE_URLS.talaseaJson, {
      fetchImpl,
      expectedHost: EXPECTED_HOSTS.talaseaJson,
      headers: { Accept: "application/json" },
    });

    const price = parseTalaseaJson(json);
    let range = parseTalaseaJsonRange(json, price);
    let changePercent = null;
    try {
      const profileHtml = await fetchText(SOURCE_URLS.gold18Html, {
        fetchImpl,
        expectedHost: EXPECTED_HOSTS.gold18Html,
        headers: { Accept: "text/html,application/xhtml+xml" },
      });
      range ??= parseDailyRange(profileHtml, price, TGJU_UNIT);
      changePercent = parseDailyChangePercent(profileHtml);
    } catch (error) {
      if (!(error instanceof ScraperError)) {
        throw error;
      }
    }

    return {
      prices: { gold18k: price },
      ...(changePercent === null
        ? {}
        : { changePercent: { gold18k: changePercent } }),
      ...(range ? { ranges: { gold18k: range } } : {}),
      fetchedAt: toIsoTimestamp(now),
      meta: { via: "json" },
    };
  } catch (error) {
    if (!(error instanceof ScraperError)) {
      throw error;
    }

    if (NO_FALLBACK_CODES.has(error.code)) {
      throw error;
    }

    jsonError = error;
  }

  try {
    const fallbackConfigured =
      typeof domUrl === "string" &&
      domUrl.trim() !== "" &&
      Array.isArray(domSelectors) &&
      domSelectors.length > 0;

    if (!fallbackConfigured) {
      throw jsonError;
    }

    const html = await fetchText(domUrl, {
      fetchImpl,
      expectedHost: EXPECTED_HOSTS.gold18Html,
      headers: { Accept: "text/html,application/xhtml+xml" },
    });

    const price = parseTalaseaHtml(html, domSelectors, domUnit);
    const range = parseDailyRange(html, price, domUnit);
    const changePercent = parseDailyChangePercent(html);

    return {
      prices: { gold18k: price },
      ...(changePercent === null
        ? {}
        : { changePercent: { gold18k: changePercent } }),
      ...(range ? { ranges: { gold18k: range } } : {}),
      fetchedAt: toIsoTimestamp(now),
      meta: { via: "dom" },
    };
  } catch (domError) {
    if (domError === jsonError) {
      throw domError;
    }

    if (!(domError instanceof ScraperError)) {
      throw domError;
    }

    throw new ScraperError(domError.message, domError.code, {
      status: domError.status,
      cause: jsonError,
    });
  }
}
