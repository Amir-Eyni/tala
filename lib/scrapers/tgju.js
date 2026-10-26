import "server-only";

import { load } from "cheerio";

import {
  EXPECTED_HOSTS,
  SOURCE_URLS,
  TGJU_SELECTORS,
  TGJU_UNIT,
} from "../../utils/constants.server.js";
import {
  parseDailyChangePercent,
  parseDailyRange,
} from "./dailyRange.js";
import {
  fetchText,
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
  const range = parseDailyRange(html, price, TGJU_UNIT);
  const changePercent = parseDailyChangePercent(html);

  return {
    prices: { gold24k: price },
    ...(changePercent === null
      ? {}
      : { changes: { gold24k: changePercent } }),
    ...(range ? { ranges: { gold24k: range } } : {}),
    fetchedAt: toIsoTimestamp(now),
  };
}
