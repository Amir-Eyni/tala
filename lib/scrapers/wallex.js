import "server-only";

import {
  EXPECTED_HOSTS,
  SOURCE_URLS,
  WALLEX_SYMBOL,
} from "../../utils/constants.server.js";
import {
  fetchJson,
  parseOptionalPercent,
  parseOptionalPrice,
  parsePrice,
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

function parseWallex24hRange(json, price) {
  const stats = json?.result?.symbols?.[WALLEX_SYMBOL]?.stats;
  const high24h = parseOptionalPrice(
    stats?.["24h_highPrice"] ??
      stats?.high24h ??
      stats?.highPrice24h,
  );
  const low24h = parseOptionalPrice(
    stats?.["24h_lowPrice"] ??
      stats?.low24h ??
      stats?.lowPrice24h,
  );

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
 * Fetch the tether price once. The dollar price mirrors the tether price by
 * design, but both are returned as independent fields.
 *
 * fetchedAt is informational only; the price engine uses its own time when
 * recording values.
 *
 * @param {{ fetchImpl?: typeof fetch, now?: Date | string | number | (() => Date | string | number) }} [options] - Injection points for tests.
 * @returns {Promise<{ prices: { usdt: number, usd: number }, fetchedAt: string }>} Integer toman prices and ISO timestamp.
 * @throws {ScraperError} On configuration, transport or parsing errors.
 */
export async function fetchWallex({ fetchImpl, now } = {}) {
  const json = await fetchJson(SOURCE_URLS.wallex, {
    fetchImpl,
    expectedHost: EXPECTED_HOSTS.wallex,
    headers: { Accept: "application/json" },
  });
  const price = parseWallexPayload(json);
  const range = parseWallex24hRange(json, price);
  const changePercent = parseOptionalPercent(
    json?.result?.symbols?.[WALLEX_SYMBOL]?.stats?.["24h_ch"],
  );

  return {
    prices: { usdt: price, usd: price },
    ...(changePercent === null
      ? {}
      : {
          changePercent: {
            usdt: changePercent,
            usd: changePercent,
          },
        }),
    ...(range
      ? {
          ranges: {
            usdt: range,
            usd: range,
          },
        }
      : {}),
    fetchedAt: toIsoTimestamp(now),
  };
}
