import "server-only";

import { load } from "cheerio";

import { DAILY_EXTREMA_SELECTORS } from "../../utils/constants.server.js";
import { parseOptionalPercent, parseOptionalPrice } from "./http.js";

const DAILY_HIGH_LABEL = "بالاترین قیمت روز";
const DAILY_LOW_LABELS = ["پایین ترین قیمت روز", "پایین‌ترین قیمت روز"];
const DAILY_CHANGE_LABELS = [
  "درصد تغییر نسبت به روز گذشته",
  "درصد تغییر نسبت نرخ روز گذشته",
];
const DAILY_CHANGE_SELECTORS = [
  '[data-col="info.last_trade.last_change_percentage"]',
];

function normalizeLabel(value) {
  return String(value ?? "")
    .replace(/[\s\u200c]+/g, " ")
    .trim();
}

/**
 * Extract the daily percentage change from a profile page.
 *
 * @param {string} html - Upstream profile HTML.
 * @returns {number | null} Signed daily percentage, if present.
 */
export function parseDailyChangePercent(html) {
  const $ = load(String(html ?? ""));

  for (const selector of DAILY_CHANGE_SELECTORS) {
    for (const element of $(selector).toArray()) {
      const parsed = parseOptionalPercent($(element).text());
      if (parsed !== null) {
        return parsed;
      }
    }
  }

  for (const row of $("tr").toArray()) {
    const cells = $(row).find("td");
    if (
      cells.length >= 2 &&
      DAILY_CHANGE_LABELS.includes(normalizeLabel(cells.eq(0).text()))
    ) {
      return parseOptionalPercent(cells.eq(1).text());
    }
  }

  return null;
}

/**
 * Extract validated daily extrema from profile statistics or configured HTML selectors.
 *
 * @param {string} html - Upstream profile HTML.
 * @param {number} currentPrice - Current price normalized to toman.
 * @param {"toman" | "rial"} unit - Unit used by the profile statistics.
 * @returns {{ high24h: number, low24h: number } | null} Daily range in toman, if valid.
 */
export function parseDailyRange(html, currentPrice, unit) {
  const $ = load(String(html ?? ""));
  const readTableValue = (labels) => {
    for (const row of $("tr").toArray()) {
      const cells = $(row).find("td");
      if (
        cells.length >= 2 &&
        labels.includes(normalizeLabel(cells.eq(0).text()))
      ) {
        return cells.eq(1).text();
      }
    }

    return null;
  };
  const readSelectorValue = (selectors) => {
    for (const selector of selectors) {
      for (const element of $(selector).toArray()) {
        const parsed = parseOptionalPrice($(element).text(), unit);
        if (parsed !== null) {
          return parsed;
        }
      }
    }

    return null;
  };

  const tableHigh = readTableValue([DAILY_HIGH_LABEL]);
  const tableLow = readTableValue(DAILY_LOW_LABELS);
  const high24h =
    tableHigh === null
      ? readSelectorValue(DAILY_EXTREMA_SELECTORS.high)
      : parseOptionalPrice(tableHigh, unit);
  const low24h =
    tableLow === null
      ? readSelectorValue(DAILY_EXTREMA_SELECTORS.low)
      : parseOptionalPrice(tableLow, unit);

  if (
    high24h === null ||
    low24h === null ||
    !Number.isSafeInteger(currentPrice) ||
    currentPrice <= 0 ||
    high24h < currentPrice ||
    low24h > currentPrice ||
    low24h > high24h
  ) {
    return null;
  }

  return { high24h, low24h };
}
