import "server-only";

import { load } from "cheerio";

import {
  EXPECTED_HOSTS,
  SOURCE_URLS,
} from "../../utils/constants.server.js";
import {
  fetchText,
  parsePrice,
  parseOptionalPercent,
  ScraperError,
  toIsoTimestamp,
  toTomanInteger,
} from "./http.js";

const FIELD_SELECTORS = {
  price: [
    '[data-col="info.price"]',
    "[data-price]",
    ".current-price",
    ".price-value",
    '[itemprop="price"]',
  ],
  high24h: [
    '[data-col="info.high"]',
    '[data-col="info.max"]',
    "[data-high]",
    ".high-24h",
  ],
  low24h: [
    '[data-col="info.low"]',
    '[data-col="info.min"]',
    "[data-low]",
    ".low-24h",
  ],
  changePercent: [
    '[data-col="info.change_percent"]',
    '[data-col="info.last_trade.last_change_percentage"]',
    "[data-change-percent]",
  ],
};

const ROW_LABELS = {
  price: ["نرخ فعلی", "قیمت فعلی", "قیمت نقره", "نرخ نقره"],
  high24h: ["بالاترین قیمت روز", "بیشترین قیمت روز", "بیشترین قیمت"],
  low24h: ["پایین ترین قیمت روز", "پایین‌ترین قیمت روز", "کمترین قیمت روز"],
  changePercent: ["درصد تغییر نسبت به روز گذشته", "درصد تغییر روزانه"],
};

function normalizeLabel(value) {
  return String(value ?? "")
    .replace(/[\s\u200c]+/g, " ")
    .trim();
}

function unitInText(value) {
  const text = String(value ?? "");
  const hasRial = /ریال|ر\.?\s*یال|\b(?:rial|irr)\b/i.test(text);
  const hasToman = /تومان|\b(?:toman|irt)\b/i.test(text);

  if (hasRial === hasToman) {
    return null;
  }

  return hasRial ? "rial" : "toman";
}

function resolveUnit($, element) {
  let node = $(element);

  for (let depth = 0; depth < 4 && node.length > 0; depth += 1) {
    const attrUnit = unitInText(
      `${node.attr("data-currency") ?? ""} ${node.attr("content") ?? ""}`,
    );
    if (attrUnit) {
      return attrUnit;
    }

    const nodeUnit = unitInText(node.text());
    if (nodeUnit) {
      return nodeUnit;
    }

    node = node.parent();
  }

  return unitInText($("body").text());
}

function findField($, field) {
  for (const selector of FIELD_SELECTORS[field]) {
    for (const element of $(selector).toArray()) {
      const node = $(element);
      const value =
        node.attr("content") ??
        (field === "price" ? node.attr("data-price") : undefined) ??
        node.text();

      if (String(value ?? "").trim() !== "") {
        return { value, element };
      }
    }
  }

  for (const row of $("tr").toArray()) {
    const cells = $(row).find("td");
    if (
      cells.length >= 2 &&
      ROW_LABELS[field].includes(normalizeLabel(cells.eq(0).text()))
    ) {
      return { value: cells.eq(1).text(), element: cells.eq(1) };
    }
  }

  return null;
}

function parseSilverPriceField($, field) {
  const found = findField($, field);
  if (!found) {
    throw new ScraperError("Silver price field was not found.", "parse");
  }

  const unit = resolveUnit($, found.element);
  if (!unit) {
    throw new ScraperError("Silver price currency was not identified.", "parse");
  }

  return toTomanInteger(parsePrice(found.value), unit);
}

function parseSilverChangePercent($) {
  const found = findField($, "changePercent");
  if (!found) {
    throw new ScraperError("Silver percentage field was not found.", "parse");
  }

  const rawValue = String(found.value).trim();
  const normalizedValue = rawValue.replace(
    /^([0-9۰-۹٠-٩]+(?:[.٫][0-9۰-۹٠-٩]+)?)\s*([+-])$/,
    "$2$1",
  );
  const value = parseOptionalPercent(normalizedValue);

  if (value === null) {
    throw new ScraperError("Silver percentage field is invalid.", "parse");
  }

  return value;
}

/**
 * Parse the live silver price and market statistics from the primary source.
 *
 * @param {string} html - Source HTML.
 * @returns {{ price: number, high24h: number, low24h: number, changePercent: number }}
 */
export function parseNoghreseaSilverHtml(html) {
  const $ = load(String(html ?? ""));
  const price = parseSilverPriceField($, "price");
  const high24h = parseSilverPriceField($, "high24h");
  const low24h = parseSilverPriceField($, "low24h");
  const changePercent = parseSilverChangePercent($);

  if (
    high24h < price ||
    low24h > price ||
    low24h > high24h
  ) {
    throw new ScraperError("Silver daily range is inconsistent.", "parse");
  }

  return { price, high24h, low24h, changePercent };
}

/**
 * Fetch silver market data from the primary source.
 *
 * @param {{ fetchImpl?: typeof fetch, now?: Date | string | number | (() => Date | string | number) }} [options] - Injection points for tests.
 * @returns {Promise<{ prices: { silver: number }, ranges: { silver: { high24h: number, low24h: number } }, changePercent: { silver: number }, fetchedAt: string }>}
 */
export async function scrapeNoghreseaSilver({ fetchImpl, now } = {}) {
  const html = await fetchText(SOURCE_URLS.noghresea, {
    fetchImpl,
    expectedHost: EXPECTED_HOSTS.noghresea,
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  const { price, high24h, low24h, changePercent } =
    parseNoghreseaSilverHtml(html);

  return {
    prices: { silver: price },
    ranges: { silver: { high24h, low24h } },
    changePercent: { silver: changePercent },
    fetchedAt: toIsoTimestamp(now),
  };
}
