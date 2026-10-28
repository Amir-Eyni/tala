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
  parseOptionalPercent,
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
  const changePercent = parseDailyChangePercent(html) ?? 0;

  return {
    prices: { gold24k: price },
    changePercent: { gold24k: changePercent },
    ...(range ? { ranges: { gold24k: range } } : {}),
    fetchedAt: toIsoTimestamp(now),
  };
}

/**
 * Fetch the TGJU dollar quote and convert rial-denominated prices to toman.
 *
 * The upstream percentage is already a ratio and must not be unit-converted.
 *
 * @param {{ fetchImpl?: typeof fetch, now?: Date | string | number | (() => Date | string | number) }} [options] - Injection points for tests.
 * @returns {Promise<{ prices: { usd: number }, ranges?: { usd: { high24h: number, low24h: number } }, changePercent?: { usd: number }, fetchedAt: string }>} Dollar data in toman.
 */
export async function scrapeTgjuDollar({ fetchImpl, now } = {}) {
  const html = await fetchText(SOURCE_URLS.tgjuDollar, {
    fetchImpl,
    expectedHost: EXPECTED_HOSTS.tgjuDollar,
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  const rialPrice = parseTgjuHtml(html);
  const price = toTomanInteger(rialPrice, TGJU_UNIT);
  const range = parseDailyRange(html, price, TGJU_UNIT);
  const changePercent = parseDailyChangePercent(html) ?? 0;

  return {
    prices: { usd: price },
    changePercent: { usd: changePercent },
    ...(range ? { ranges: { usd: range } } : {}),
    fetchedAt: toIsoTimestamp(now),
  };
}

/**
 * Fetch the TGJU euro quote and convert rial-denominated prices to toman.
 *
 * @param {{ fetchImpl?: typeof fetch, now?: Date | string | number | (() => Date | string | number) }} [options] - Injection points for tests.
 * @returns {Promise<{ prices: { euro: number }, ranges?: { euro: { high24h: number, low24h: number } }, changePercent?: { euro: number }, fetchedAt: string }>} Euro data in toman.
 */
export async function scrapeTgjuEuro({ fetchImpl, now } = {}) {
  const html = await fetchText(SOURCE_URLS.tgjuEuro, {
    fetchImpl,
    expectedHost: EXPECTED_HOSTS.tgjuEuro,
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  const rialPrice = parseTgjuHtml(html);
  const price = toTomanInteger(rialPrice, TGJU_UNIT);
  const range = parseDailyRange(html, price, TGJU_UNIT);
  const changePercent = parseDailyChangePercent(html) ?? 0;

  return {
    prices: { euro: price },
    changePercent: { euro: changePercent },
    ...(range ? { ranges: { euro: range } } : {}),
    fetchedAt: toIsoTimestamp(now),
  };
}

function parseTgjuSilverChangePercent(html) {
  const $ = load(String(html ?? ""));
  const selectors = [
    '[data-col="info.change_percent"]',
    '[data-col="info.last_trade.last_change_percentage"]',
  ];

  for (const selector of selectors) {
    for (const element of $(selector).toArray()) {
      const rawValue = $(element).text().trim();
      const normalizedValue = rawValue.replace(
        /^([0-9۰-۹٠-٩]+(?:[.٫][0-9۰-۹٠-٩]+)?)\s*([+-])$/,
        "$2$1",
      );
      const changePercent = parseOptionalPercent(normalizedValue);

      if (changePercent !== null) {
        return changePercent;
      }
    }
  }

  return parseDailyChangePercent(html);
}

function parseTgjuSilverRange(html, price) {
  const $ = load(String(html ?? ""));
  const high24h = parseOptionalPrice(
    $('[data-col="info.high"]').first().text(),
    TGJU_UNIT,
  );
  const low24h = parseOptionalPrice(
    $('[data-col="info.low"]').first().text(),
    TGJU_UNIT,
  );

  if (
    high24h !== null &&
    low24h !== null &&
    high24h >= price &&
    low24h <= price &&
    low24h <= high24h
  ) {
    return { high24h, low24h };
  }

  return parseDailyRange(html, price, TGJU_UNIT);
}

/**
 * Fetch TGJU's 999-silver quote and normalize rial prices to toman.
 *
 * @param {{ fetchImpl?: typeof fetch, now?: Date | string | number | (() => Date | string | number) }} [options] - Injection points for tests.
 * @returns {Promise<{ prices: { silver: number }, ranges?: { silver: { high24h: number, low24h: number } }, changePercent?: { silver: number }, fetchedAt: string }>} Silver prices in toman.
 */
export async function scrapeTgjuSilver({ fetchImpl, now } = {}) {
  const html = await fetchText(SOURCE_URLS.tgjuSilver, {
    fetchImpl,
    expectedHost: EXPECTED_HOSTS.tgjuSilver,
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  const $ = load(String(html ?? ""));
  const explicitPrice = parseOptionalPrice(
    $('[data-col="info.price"]').first().text(),
    TGJU_UNIT,
  );
  const price =
    explicitPrice ??
    toTomanInteger(parseTgjuHtml(html), TGJU_UNIT);
  const range = parseTgjuSilverRange(html, price);
  const changePercent = parseTgjuSilverChangePercent(html) ?? 0;

  return {
    prices: { silver: price },
    changePercent: { silver: changePercent },
    ranges: {
      silver: range ?? { high24h: price, low24h: price },
    },
    fetchedAt: toIsoTimestamp(now),
  };
}

function parseTgjuAssetChangePercent(html) {
  const $ = load(String(html ?? ""));
  const selectors = [
    '[data-col="info.change_percent"]',
    '[data-col="info.last_trade.last_change_percentage"]',
  ];

  for (const selector of selectors) {
    for (const element of $(selector).toArray()) {
      const rawValue = $(element).text().trim();
      const normalizedValue = rawValue.replace(
        /^([0-9۰-۹٠-٩]+(?:[.٫][0-9۰-۹٠-٩]+)?)\s*([+-])$/,
        "$2$1",
      );
      const changePercent = parseOptionalPercent(normalizedValue);

      if (changePercent !== null) {
        return changePercent;
      }
    }
  }

  return parseDailyChangePercent(html) ?? 0;
}

/**
 * Fetch TGJU's Emami coin price and convert rial-denominated amounts to toman.
 *
 * @param {{ fetchImpl?: typeof fetch, now?: Date | string | number | (() => Date | string | number) }} [options] - Injection points for tests.
 * @returns {Promise<{ prices: { coin: number }, ranges: { coin: { high24h: number, low24h: number } }, changePercent: { coin: number }, fetchedAt: string }>}
 */
export async function scrapeTgjuCoin({ fetchImpl, now } = {}) {
  const html = await fetchText(SOURCE_URLS.tgjuCoin, {
    fetchImpl,
    expectedHost: EXPECTED_HOSTS.tgjuCoin,
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  const $ = load(String(html ?? ""));
  const explicitPrice = parseOptionalPrice(
    $('[data-col="info.price"]').first().text(),
    TGJU_UNIT,
  );
  const rialPrice = explicitPrice === null
    ? parseTgjuHtml(html)
    : null;
  const price =
    explicitPrice ?? toTomanInteger(rialPrice, TGJU_UNIT);
  const explicitHigh = parseOptionalPrice(
    $('[data-col="info.high"]').first().text(),
    TGJU_UNIT,
  );
  const explicitLow = parseOptionalPrice(
    $('[data-col="info.low"]').first().text(),
    TGJU_UNIT,
  );
  const parsedRange =
    explicitHigh !== null &&
    explicitLow !== null &&
    explicitHigh >= price &&
    explicitLow <= price &&
    explicitLow <= explicitHigh
      ? { high24h: explicitHigh, low24h: explicitLow }
      : parseDailyRange(html, price, TGJU_UNIT);
  const changePercent = parseTgjuAssetChangePercent(html);

  return {
    prices: { coin: price },
    ranges: {
      coin: parsedRange ?? { high24h: price, low24h: price },
    },
    changePercent: { coin: changePercent },
    fetchedAt: toIsoTimestamp(now),
  };
}

/**
 * Fetch TGJU's Bahar Azadi coin quote and convert rial-denominated amounts to toman.
 *
 * @param {{ fetchImpl?: typeof fetch, now?: Date | string | number | (() => Date | string | number) }} [options] - Injection points for tests.
 * @returns {Promise<{ prices: { bahar: number }, ranges: { bahar: { high24h: number, low24h: number } }, changePercent: { bahar: number }, fetchedAt: string }>}
 */
export async function scrapeTgjuBahar({ fetchImpl, now } = {}) {
  const html = await fetchText(SOURCE_URLS.tgjuBahar, {
    fetchImpl,
    expectedHost: EXPECTED_HOSTS.tgjuBahar,
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  const $ = load(String(html ?? ""));
  const explicitPrice = parseOptionalPrice(
    $('[data-col="info.price"]').first().text(),
    TGJU_UNIT,
  );
  const rialPrice = explicitPrice === null
    ? parseTgjuHtml(html)
    : null;
  const price =
    explicitPrice ?? toTomanInteger(rialPrice, TGJU_UNIT);
  const explicitHigh = parseOptionalPrice(
    $('[data-col="info.high"]').first().text(),
    TGJU_UNIT,
  );
  const explicitLow = parseOptionalPrice(
    $('[data-col="info.low"]').first().text(),
    TGJU_UNIT,
  );
  const parsedRange =
    explicitHigh !== null &&
    explicitLow !== null &&
    explicitHigh >= price &&
    explicitLow <= price &&
    explicitLow <= explicitHigh
      ? { high24h: explicitHigh, low24h: explicitLow }
      : parseDailyRange(html, price, TGJU_UNIT);
  const changePercent = parseTgjuAssetChangePercent(html);

  return {
    prices: { bahar: price },
    ranges: {
      bahar: parsedRange ?? { high24h: price, low24h: price },
    },
    changePercent: { bahar: changePercent },
    fetchedAt: toIsoTimestamp(now),
  };
}
