import { ASSET_IDS } from "./constants.js";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPrice(value) {
  return value === null || (Number.isSafeInteger(value) && value > 0);
}

function isPricePayload(value) {
  if (
    !isRecord(value) ||
    !(value.updatedAt === null || typeof value.updatedAt === "string") ||
    !["healthy", "stale", "offline"].includes(value.status) ||
    typeof value.currency !== "string" ||
    !isRecord(value.assets)
  ) {
    return false;
  }

  return ASSET_IDS.every((assetId) => {
    const asset = value.assets[assetId];
    const hasHigh = Object.hasOwn(asset ?? {}, "high24h");
    const hasLow = Object.hasOwn(asset ?? {}, "low24h");
    const hasValidExtrema =
      !hasHigh && !hasLow
        ? true
        : hasHigh &&
          hasLow &&
          Number.isSafeInteger(asset.high24h) &&
          asset.high24h > 0 &&
          Number.isSafeInteger(asset.low24h) &&
          asset.low24h > 0 &&
          asset.low24h <= asset.high24h &&
          (asset.price === null ||
            (asset.low24h <= asset.price && asset.high24h >= asset.price));

    return (
      isRecord(asset) &&
      asset.id === assetId &&
      typeof asset.title === "string" &&
      typeof asset.unit === "string" &&
      isPrice(asset.price) &&
      isPrice(asset.previousPrice) &&
      (!Object.hasOwn(asset, "changePercent") ||
        (typeof asset.changePercent === "number" &&
          Number.isFinite(asset.changePercent))) &&
      typeof asset.isStale === "boolean" &&
      hasValidExtrema
    );
  });
}

/**
 * Fetch the white-label price payload from the app's API.
 *
 * @returns {Promise<object>} Validated price payload.
 * @throws {Error} When the request fails or the API response is invalid.
 */
export async function fetchPrices() {
  const response = await fetch("/api/prices", {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok && response.status !== 503) {
    throw new Error("The prices service is temporarily unavailable.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The prices service returned an invalid response.");
  }

  if (!isPricePayload(payload)) {
    throw new Error("The prices service returned an invalid response.");
  }

  return payload;
}
