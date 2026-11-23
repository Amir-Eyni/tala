import "server-only";

import { load } from "cheerio";

import {
  EXPECTED_HOSTS,
  FOREX_SOURCE_URLS,
} from "../../utils/constants.server.js";
import { FOREX_ASSET_IDS } from "../../utils/forexConstants.js";
import {
  fetchText,
  ScraperError,
  toIsoTimestamp,
} from "./http.js";

/**
 * Parse instrument quote and daily change from JSON or HTML.
 *
 * @param {string} content - JSON or HTML response text.
 * @param {string} symbol - Instrument symbol (e.g. "XAUUSD" or "XAU").
 * @returns {{ price: number, changePercent: number | null }}
 */
export function parseForexInstrument(content, symbol) {
  if (!content || typeof content !== "string") {
    throw new ScraperError("Forex response content is empty.", "parse");
  }

  const trimmed = content.trim();

  // 1. JSON Feed Parsing (e.g., standard public JSON REST endpoints)
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const data = JSON.parse(trimmed);
      const rawPrice =
        data?.price ?? data?.lastPrice ?? data?.rate ?? data?.value;
      const parsedPrice =
        typeof rawPrice === "number"
          ? rawPrice
          : Number.parseFloat(String(rawPrice || "").replace(/,/g, ""));

      if (Number.isFinite(parsedPrice) && parsedPrice > 0) {
        const rawChange =
          data?.changePercent ??
          data?.priceChangePercent ??
          data?.change_percent ??
          null;
        const parsedChange =
          typeof rawChange === "number"
            ? rawChange
            : rawChange !== null && rawChange !== undefined
              ? Number.parseFloat(String(rawChange).replace(/%/g, ""))
              : null;

        const changePercent =
          Number.isFinite(parsedChange) ? parsedChange : null;

        return { price: parsedPrice, changePercent };
      }
    } catch (err) {
      if (err instanceof ScraperError) throw err;
      // If JSON parsing fails, fall through to HTML parsing
    }
  }

  // 2. HTML Parsing (fallback for server-rendered quote pages)
  const $ = load(content);
  const normalizedSymbol = String(symbol || "").toUpperCase();

  let bid = null;
  let ask = null;

  $(`[data-symbol="${normalizedSymbol}"]`).each((_, element) => {
    const type = $(element).attr("data-type");
    const rawText = $(element).text().trim();
    const parsed = Number.parseFloat(rawText.replace(/,/g, ""));

    if (Number.isFinite(parsed) && parsed > 0) {
      if (type === "bid" && bid === null) {
        bid = parsed;
      } else if (type === "ask" && ask === null) {
        ask = parsed;
      }
    }
  });

  let price = null;
  if (bid !== null && ask !== null) {
    price = Number(((bid + ask) / 2).toFixed(4));
  } else if (bid !== null) {
    price = bid;
  } else if (ask !== null) {
    price = ask;
  }

  // Fallback: look for generic price elements containing the symbol
  if (price === null) {
    $(".price, .main-price, .variable").each((_, element) => {
      if (price !== null) return;
      const rawText = $(element).text().trim();
      const parsed = Number.parseFloat(rawText.replace(/,/g, ""));
      if (Number.isFinite(parsed) && parsed > 0) {
        price = parsed;
      }
    });
  }

  if (price === null || !Number.isFinite(price) || price <= 0) {
    throw new ScraperError("Forex price quote was not found.", "parse");
  }

  // Parse 1-day change percent
  let changePercent = null;
  $("tr").each((_, row) => {
    if (changePercent !== null) return;
    const text = $(row).text();
    if (text.includes("1-day change") || text.includes("تغییر در ۱ روز")) {
      const match = text.match(/\(?([+-]?\d+(?:\.\d+)?)%\)?/);
      if (match) {
        const val = Number.parseFloat(match[1]);
        if (Number.isFinite(val)) {
          changePercent = val;
        }
      }
    }
  });

  if (changePercent === null) {
    $(".change, .plus, .minus").each((_, element) => {
      if (changePercent !== null) return;
      const text = $(element).text().trim();
      const match = text.match(/^([+-]?\d+(?:\.\d+)?)%$/);
      if (match) {
        const val = Number.parseFloat(match[1]);
        if (Number.isFinite(val)) {
          changePercent = val;
        }
      }
    });
  }

  return { price, changePercent };
}

/**
 * Fetch all Forex market instruments.
 *
 * @param {{ fetchImpl?: typeof fetch, now?: Date | string | number | (() => Date | string | number) }} [options]
 * @returns {Promise<{ prices: Record<string, number>, changePercent: Record<string, number | null>, fetchedAt: string }>}
 */
export async function fetchForexRates({ fetchImpl, now } = {}) {
  const symbolMap = {
    xauusd: "XAUUSD",
    xagusd: "XAGUSD",
    btcusd: "BTCUSD",
    ethusd: "ETHUSD",
  };

  const entries = await Promise.all(
    FOREX_ASSET_IDS.map(async (assetId) => {
      const url = FOREX_SOURCE_URLS[assetId];
      if (!url) {
        throw new ScraperError("Forex source URL is not configured.", "config");
      }

      const content = await fetchText(url, {
        fetchImpl,
        expectedHost: EXPECTED_HOSTS.forex,
        headers: { Accept: "application/json,text/html,*/*" },
      });

      const parsed = parseForexInstrument(content, symbolMap[assetId]);
      return [assetId, parsed];
    }),
  );

  const prices = {};
  const changePercent = {};

  for (const [assetId, data] of entries) {
    prices[assetId] = data.price;
    changePercent[assetId] = data.changePercent;
  }

  return {
    prices,
    changePercent,
    fetchedAt: toIsoTimestamp(now),
  };
}
