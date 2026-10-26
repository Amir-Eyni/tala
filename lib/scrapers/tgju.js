import "server-only";

import { load } from "cheerio";

import {
  EXPECTED_HOSTS,
  SOURCE_URLS,
  DAILY_EXTREMA_SELECTORS,
  TGJU_SELECTORS,
  TGJU_UNIT,
} from "../../utils/constants.server.js";
import {
  fetchText,
  parseOptionalPrice,
  parsePrice,
  ScraperError,
  toIsoTimestamp,
  toTomanInteger,
} from "./http.js";

/**
 * Parse the 24-karat gram price from the verified page HTML.
 *
 * Selectors are tried in priority order and the first valid value wins.
 *
 * @param {string} html - HTML document.
 * @returns {number} Positive integer price in the source unit (rial).
 * @throws {ScraperError} With code "parse" when no selector yields a price.
 */
export function parseTgjuHtml(html) {
  const $ = load(String(html ?? ""));

  for (const selector of TGJU_SELECTORS) {
    for (const element of $(selector).toArray()) {
      try {
        return parsePrice($(element).text());
      } catch (error) {
        if (error instanceof ScraperError && error.code === "parse") {
          continue;
        }

        throw error;
      }
    }
  }

  throw new ScraperError("Gold price element was not found.", "parse");
}

function parseTgjuRange(html, price) {
  const $ = load(String(html ?? ""));
  const findPrice = (selectors) => {
    for (const selector of selectors) {
      for (const element of $(selector).toArray()) {
        const parsed = parseOptionalPrice($(element).text(), TGJU_UNIT);
        if (parsed !== null) {
          return parsed;
        }
      }
    }
    return null;
  };

  const high24h = findPrice(DAILY_EXTREMA_SELECTORS.high);
  const low24h = findPrice(DAILY_EXTREMA_SELECTORS.low);

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
 * Fetch the 24-karat gram price once and convert it to toman.
 *
 * fetchedAt is informational only; the price engine uses its own time when
 * recording values.
 *
 * @param {{ fetchImpl?: typeof fetch, now?: Date | string | number | (() => Date | string | number) }} [options] - Injection points for tests.
 * @returns {Promise<{ prices: { gold24k: number }, fetchedAt: string }>} Integer toman price and ISO timestamp.
 * @throws {ScraperError} On configuration, transport or parsing errors.
 */
export async function fetchTgju({ fetchImpl, now } = {}) {
  const html = await fetchText(SOURCE_URLS.tgju, {
    fetchImpl,
    expectedHost: EXPECTED_HOSTS.tgju,
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  const rialPrice = parseTgjuHtml(html);
  const price = toTomanInteger(rialPrice, TGJU_UNIT);
  const range = parseTgjuRange(html, price);

  return {
    prices: { gold24k: price },
    ...(range ? { ranges: { gold24k: range } } : {}),
    fetchedAt: toIsoTimestamp(now),
  };
}
