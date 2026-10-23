import "server-only";

import {
  EXPECTED_HOSTS,
  SOURCE_URLS,
  WALLEX_SYMBOL,
} from "../../utils/constants.server.js";
import {
  fetchWithTimeout,
  parsePrice,
  readJsonLimited,
  ScraperError,
  toIsoTimestamp,
} from "./http.js";

/**
 * Read the last traded toman price of WALLEX_SYMBOL from a market payload.
 *
 * @param {unknown} json - Parsed market list response.
 * @returns {number} Positive integer toman price.
 * @throws {ScraperError} With code "parse" when the price is missing/invalid.
 */
export function parseWallexPayload(json) {
  const rawPrice =
    json?.result?.symbols?.[WALLEX_SYMBOL]?.stats?.lastPrice;

  if (rawPrice === undefined || rawPrice === null) {
    throw new ScraperError("Market price was not found.", "parse");
  }

  return parsePrice(rawPrice);
}

/**
 * Fetch the tether price once. The dollar price mirrors the tether price by
 * design, but both are returned as independent fields.
 *
 * @param {{ fetchImpl?: typeof fetch, now?: Date | string | number | (() => Date | string | number) }} [options] - Injection points for tests.
 * @returns {Promise<{ prices: { usdt: number, usd: number }, fetchedAt: string }>} Integer toman prices and ISO timestamp.
 * @throws {ScraperError} On configuration, transport or parsing errors.
 */
export async function fetchWallex({ fetchImpl, now } = {}) {
  const response = await fetchWithTimeout(SOURCE_URLS.wallex, {
    fetchImpl,
    expectedHost: EXPECTED_HOSTS.wallex,
    headers: { Accept: "application/json" },
  });

  const json = await readJsonLimited(response);
  const price = parseWallexPayload(json);

  return {
    prices: { usdt: price, usd: price },
    fetchedAt: toIsoTimestamp(now),
  };
}
