import "server-only";

import { RETRY_AFTER_SECONDS } from "../utils/constants.js";

/**
 * Convert a price payload into a complete HTTP response description.
 *
 * When every asset is missing a price the response is a 503 so clients do not
 * discard their last known good data.
 *
 * @param {{ assets?: Record<string, { price?: number | null }> }} payload - API payload.
 * @returns {{ status: 200 | 503, headers: Record<string, string>, body: unknown }} HTTP response description.
 */
export function toHttpResponse(payload) {
  const assets =
    payload && typeof payload === "object" && payload.assets
      ? Object.values(payload.assets)
      : [];
  const hasAnyPrice = assets.some(
    (asset) =>
      asset &&
      typeof asset === "object" &&
      typeof asset.price === "number" &&
      Number.isFinite(asset.price),
  );

  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };

  if (!hasAnyPrice) {
    return {
      status: 503,
      headers: {
        ...headers,
        "Cache-Control": "no-store",
        "Retry-After": String(RETRY_AFTER_SECONDS),
      },
      body: payload,
    };
  }

  return {
    status: 200,
    headers: {
      ...headers,
      "Cache-Control": "no-store",
    },
    body: payload,
  };
}
