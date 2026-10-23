import "server-only";

import { load } from "cheerio";

import {
  EXPECTED_HOSTS,
  SOURCE_URLS,
  TGJU_SELECTORS,
  TGJU_UNIT,
} from "../../utils/constants.server.js";
import {
  fetchWithTimeout,
  parsePrice,
  readTextLimited,
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
 * @param {{ fetchImpl?: typeof fetch, now?: Date | string | number | (() => Date | string | number) }} [options] - Injection points for tests.
 * @returns {Promise<{ prices: { gold24k: number }, fetchedAt: string }>} Integer toman price and ISO timestamp.
 * @throws {ScraperError} On configuration, transport or parsing errors.
 */
export async function fetchTgju({ fetchImpl, now } = {}) {
  const response = await fetchWithTimeout(SOURCE_URLS.tgju, {
    fetchImpl,
    expectedHost: EXPECTED_HOSTS.tgju,
    headers: { Accept: "text/html,application/xhtml+xml" },
  });

  const html = await readTextLimited(response);
  const rialPrice = parseTgjuHtml(html);

  return {
    prices: { gold24k: toTomanInteger(rialPrice, TGJU_UNIT) },
    fetchedAt: toIsoTimestamp(now),
  };
}
