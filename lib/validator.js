import { z } from "zod";
import {
  ASSET_IDS,
  OUTLIER_MAX_CHANGE,
  OUTLIER_WINDOW_SECONDS,
} from "../utils/constants.js";

/**
 * Zod schema for a valid price: a finite, positive integer.
 */
export const priceSchema = z.number().finite().int().positive();
export const changePercentSchema = z.number().finite();
export const priceRangeSchema = z
  .object({
    high24h: priceSchema.optional(),
    low24h: priceSchema.optional(),
  })
  .strict()
  .refine(
    ({ high24h, low24h }) =>
      (high24h === undefined && low24h === undefined) ||
      (high24h !== undefined && low24h !== undefined && low24h <= high24h),
  );

/**
 * Check whether a value is a finite number.
 *
 * @param {unknown} value - Value to inspect.
 * @returns {boolean} True when the value is a finite number.
 */
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Normalize a Date, millisecond timestamp, or ISO string to milliseconds.
 *
 * @param {unknown} value - Timestamp value.
 * @returns {number | null} Milliseconds since epoch, or null when invalid.
 */
function toTimestampMs(value) {
  if (value instanceof Date) {
    const milliseconds = value.getTime();
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }

  return null;
}

/**
 * Extract a valid price from a last-good record.
 *
 * @param {unknown} lastGood - Last known good price record.
 * @returns {number | null} The last valid price, or null.
 */
function getLastGoodPrice(lastGood) {
  if (!lastGood || typeof lastGood !== "object") {
    return null;
  }

  return priceSchema.safeParse(lastGood.price).success ? lastGood.price : null;
}

/**
 * Calculate the absolute relative change between two prices.
 *
 * @param {unknown} newPrice - New price.
 * @param {unknown} oldPrice - Previous price.
 * @returns {number} Absolute relative change, or 0 for invalid input.
 */
export function calcRelativeChange(newPrice, oldPrice) {
  if (!isFiniteNumber(oldPrice) || oldPrice <= 0) {
    return 0;
  }

  if (!isFiniteNumber(newPrice) || newPrice < 0) {
    return 0;
  }

  return Math.abs((newPrice - oldPrice) / oldPrice);
}

/**
 * Check whether a new price is an outlier compared with the last good price.
 *
 * @param {{ newPrice?: unknown, lastGood?: unknown, now?: unknown }} input -
 *   New price, last good record, and current time.
 * @returns {{ isOutlier: boolean, reason: "ok" | "no-previous" | "outside-window" | "outlier", changeRatio: number }}
 *   Outlier decision, reason, and absolute relative change.
 */
export function checkOutlier(input) {
  const options = input && typeof input === "object" ? input : {};
  const { newPrice, lastGood, now } = options;

  if (!lastGood || typeof lastGood !== "object") {
    return { isOutlier: false, reason: "no-previous", changeRatio: 0 };
  }

  const lastGoodPrice = getLastGoodPrice(lastGood);
  const lastUpdatedAt = toTimestampMs(lastGood.updatedAt);

  if (lastGoodPrice === null || lastUpdatedAt === null) {
    return { isOutlier: false, reason: "no-previous", changeRatio: 0 };
  }

  if (!priceSchema.safeParse(newPrice).success) {
    return { isOutlier: false, reason: "ok", changeRatio: 0 };
  }

  const changeRatio = calcRelativeChange(newPrice, lastGoodPrice);
  const nowMs = toTimestampMs(now);

  if (nowMs === null || nowMs - lastUpdatedAt > OUTLIER_WINDOW_SECONDS * 1000) {
    return { isOutlier: false, reason: "outside-window", changeRatio };
  }

  if (changeRatio > OUTLIER_MAX_CHANGE + Number.EPSILON) {
    return { isOutlier: true, reason: "outlier", changeRatio };
  }

  return { isOutlier: false, reason: "ok", changeRatio };
}

/**
 * Validate a raw price and apply the outlier guard with last-good fallback.
 *
 * @param {{ assetId?: unknown, rawPrice?: unknown, lastGood?: unknown, now?: unknown }} input -
 *   Asset identifier, raw price, last good record, and current time.
 * @returns {{ accepted: boolean, price: number | null, reason: "unknown-asset" | "invalid" | "outlier" | "ok" | "no-previous" | "outside-window", usedFallback: boolean, changeRatio: number }}
 *   The validated result and fallback information.
 */
export function validatePrice(input) {
  const options = input && typeof input === "object" ? input : {};
  const { assetId, rawPrice, lastGood, now } = options;
  const fallbackPrice = getLastGoodPrice(lastGood);
  const rejectedBase = {
    accepted: false,
    price: fallbackPrice,
    reason: "invalid",
    usedFallback: true,
    changeRatio: 0,
  };

  if (!ASSET_IDS.includes(assetId)) {
    return { ...rejectedBase, reason: "unknown-asset" };
  }

  if (!priceSchema.safeParse(rawPrice).success) {
    return rejectedBase;
  }

  const outlier = checkOutlier({ newPrice: rawPrice, lastGood, now });

  if (outlier.isOutlier) {
    return {
      ...rejectedBase,
      reason: "outlier",
      changeRatio: outlier.changeRatio,
    };
  }

  return {
    accepted: true,
    price: rawPrice,
    reason: outlier.reason,
    usedFallback: false,
    changeRatio: outlier.changeRatio,
  };
}
