import { z } from "zod";

import { FOREX_ASSET_IDS } from "./forexConstants.js";

const forexAssetSchema = z.object({
  id: z.string(),
  title: z.string(),
  displayTitle: z.string(),
  symbol: z.string(),
  unit: z.string(),
  price: z.number().finite().positive().nullable(),
  previousPrice: z.number().finite().positive().nullable(),
  changePercent: z.number().finite().nullable().optional(),
  isStale: z.boolean(),
});

export const forexPayloadSchema = z.object({
  updatedAt: z.string().nullable(),
  status: z.enum(["healthy", "stale", "offline"]),
  currency: z.string(),
  assets: z.record(z.string(), forexAssetSchema),
}).refine((data) => {
  return FOREX_ASSET_IDS.every((id) => data.assets[id] !== undefined);
});

/**
 * Fetch the Forex market payload from the app's API.
 *
 * @returns {Promise<object>} Validated Forex payload.
 * @throws {Error} When the request fails or response is invalid.
 */
export async function fetchForexPrices() {
  const response = await fetch("/api/forex", {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok && response.status !== 503) {
    throw new Error("The forex service is temporarily unavailable.");
  }

  let json;
  try {
    json = await response.json();
  } catch {
    throw new Error("The forex service returned an invalid response.");
  }

  const result = forexPayloadSchema.safeParse(json);
  if (!result.success) {
    throw new Error("The forex service returned an invalid response.");
  }

  return result.data;
}
