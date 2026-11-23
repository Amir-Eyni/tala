import "server-only";

import { z } from "zod";

import { fetchForexRates } from "./scrapers/forex.js";
import { ScraperError } from "./scrapers/http.js";
import {
  FOREX_ASSET_IDS,
  FOREX_ASSETS,
  FOREX_BREAKER_COOLDOWN_MS,
  FOREX_BREAKER_FAILURE_THRESHOLD,
  FOREX_COLD_START_MAX_WAIT_MS,
  FOREX_CURRENCY_LABEL,
  FOREX_DEADLINE_MS,
  FOREX_RETRY_AFTER_SECONDS,
  FOREX_STALE_TTL_MULTIPLIER,
  FOREX_TTL_SECONDS,
} from "../utils/forexConstants.js";

const FOREX_STATE_KEY = Symbol.for("tala.forexEngine.v1");

export const forexPriceSchema = z.number().finite().positive();
export const forexChangePercentSchema = z.number().finite().nullable().optional();

function createAssetRecord() {
  return {
    price: null,
    previousPrice: null,
    changePercent: null,
    updatedAt: null,
    lastAttemptAt: null,
    isStale: true,
  };
}

function createInitialState() {
  const assets = {};
  for (const id of FOREX_ASSET_IDS) {
    assets[id] = createAssetRecord();
  }
  return {
    assets,
    breaker: { failures: 0, lastAttemptAt: null },
    inflight: new Map(),
    overrides: { fetchImpl: null },
  };
}

function getForexState() {
  const existing = globalThis[FOREX_STATE_KEY];
  if (existing && typeof existing === "object") {
    if (!existing.assets) existing.assets = {};
    for (const id of FOREX_ASSET_IDS) {
      if (!existing.assets[id]) {
        existing.assets[id] = createAssetRecord();
      }
    }
    if (!existing.breaker) existing.breaker = { failures: 0, lastAttemptAt: null };
    if (!existing.inflight) existing.inflight = new Map();
    if (!existing.overrides) existing.overrides = { fetchImpl: null };
    return existing;
  }

  const fresh = createInitialState();
  globalThis[FOREX_STATE_KEY] = fresh;
  return fresh;
}

export function resetForexCacheForTests() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Resetting Forex cache is not permitted in production.");
  }
  const state = getForexState();
  for (const id of FOREX_ASSET_IDS) {
    state.assets[id] = createAssetRecord();
  }
  state.breaker = { failures: 0, lastAttemptAt: null };
  state.inflight.clear();
  state.overrides = { fetchImpl: null };
}

export function setForexOverridesForTests(overrides) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Setting Forex overrides is not permitted in production.");
  }
  const state = getForexState();
  if (overrides) {
    state.overrides = { ...state.overrides, ...overrides };
  }
}

function singleFlight(key, task) {
  const state = getForexState();
  const existing = state.inflight.get(key);
  if (existing) {
    return existing.promise;
  }

  const promise = (async () => {
    try {
      return await task();
    } finally {
      state.inflight.delete(key);
    }
  })();

  state.inflight.set(key, { promise, startedAt: Date.now() });
  return promise;
}

function isBreakerOpen(nowMs) {
  const state = getForexState();
  const { failures, lastAttemptAt } = state.breaker;
  if (failures < FOREX_BREAKER_FAILURE_THRESHOLD) {
    return false;
  }
  if (!lastAttemptAt) {
    return false;
  }
  return nowMs - lastAttemptAt < FOREX_BREAKER_COOLDOWN_MS;
}

function recordBreakerSuccess() {
  const state = getForexState();
  state.breaker.failures = 0;
  state.breaker.lastAttemptAt = null;
}

function recordBreakerFailure(nowMs) {
  const state = getForexState();
  state.breaker.failures += 1;
  state.breaker.lastAttemptAt = nowMs;
}

function commitForexRates(rates, timestamp) {
  const state = getForexState();
  const nowIso = typeof timestamp === "string" ? timestamp : new Date().toISOString();

  for (const id of FOREX_ASSET_IDS) {
    const rawPrice = rates.prices?.[id];
    const rawChange = rates.changePercent?.[id];

    const priceValidation = forexPriceSchema.safeParse(rawPrice);
    if (!priceValidation.success) {
      continue;
    }

    const currentRecord = state.assets[id];
    const validatedPrice = priceValidation.data;

    let validatedChange = null;
    const changeValidation = forexChangePercentSchema.safeParse(rawChange);
    if (changeValidation.success && typeof changeValidation.data === "number") {
      validatedChange = changeValidation.data;
    }

    currentRecord.previousPrice =
      currentRecord.price !== null ? currentRecord.price : validatedPrice;
    currentRecord.price = validatedPrice;
    currentRecord.changePercent = validatedChange;
    currentRecord.updatedAt = nowIso;
    currentRecord.isStale = false;
  }
}

export function buildForexOfflinePayload() {
  const assets = {};
  for (const id of FOREX_ASSET_IDS) {
    assets[id] = {
      id,
      title: FOREX_ASSETS[id].title,
      displayTitle: FOREX_ASSETS[id].displayTitle,
      symbol: FOREX_ASSETS[id].symbol,
      unit: FOREX_ASSETS[id].unit,
      price: null,
      previousPrice: null,
      changePercent: null,
      isStale: true,
    };
  }

  return {
    updatedAt: null,
    status: "offline",
    currency: FOREX_CURRENCY_LABEL,
    assets,
  };
}

export function buildForexPayload(nowMs = Date.now()) {
  const state = getForexState();
  const assets = {};
  let anyPrice = false;
  let allHealthy = true;
  let anyStale = false;
  let latestUpdate = null;

  for (const id of FOREX_ASSET_IDS) {
    const record = state.assets[id];
    const hasPrice = typeof record.price === "number" && Number.isFinite(record.price);
    if (hasPrice) anyPrice = true;

    const ageMs = record.updatedAt ? nowMs - Date.parse(record.updatedAt) : Infinity;
    const isStale =
      record.isStale ||
      !hasPrice ||
      ageMs > FOREX_TTL_SECONDS * FOREX_STALE_TTL_MULTIPLIER * 1000;

    if (isStale) anyStale = true;
    if (!hasPrice || isStale) allHealthy = false;

    if (record.updatedAt) {
      if (!latestUpdate || Date.parse(record.updatedAt) > Date.parse(latestUpdate)) {
        latestUpdate = record.updatedAt;
      }
    }

    assets[id] = {
      id,
      title: FOREX_ASSETS[id].title,
      displayTitle: FOREX_ASSETS[id].displayTitle,
      symbol: FOREX_ASSETS[id].symbol,
      unit: FOREX_ASSETS[id].unit,
      price: record.price,
      previousPrice: record.previousPrice,
      changePercent: record.changePercent,
      isStale,
    };
  }

  let status = "offline";
  if (anyPrice) {
    status = allHealthy && !anyStale ? "healthy" : "stale";
  }

  return {
    updatedAt: latestUpdate,
    status,
    currency: FOREX_CURRENCY_LABEL,
    assets,
  };
}

export function toForexHttpResponse(payload) {
  const assets = Object.values(payload?.assets ?? {});
  const hasAnyPrice = assets.some(
    (a) => typeof a?.price === "number" && Number.isFinite(a.price) && a.price > 0,
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
        "Retry-After": String(FOREX_RETRY_AFTER_SECONDS),
      },
      body: payload,
    };
  }

  return {
    status: 200,
    headers: {
      ...headers,
      "Cache-Control": "s-maxage=1, stale-while-revalidate=2",
    },
    body: payload,
  };
}

async function performForexFetch(nowMs) {
  const state = getForexState();
  const fetchImpl = state.overrides?.fetchImpl || undefined;

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new ScraperError("Forex source request timed out.", "timeout"));
    }, FOREX_DEADLINE_MS);
  });

  try {
    const fetchPromise = fetchForexRates({ fetchImpl, now: nowMs });
    const rates = await Promise.race([fetchPromise, timeoutPromise]);
    commitForexRates(rates, new Date(nowMs).toISOString());
    recordBreakerSuccess();
  } catch (error) {
    recordBreakerFailure(nowMs);
    // Mark assets as stale on failure
    for (const id of FOREX_ASSET_IDS) {
      state.assets[id].isStale = true;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Resolve Forex prices with SWR and single-flight locking.
 *
 * @param {{ now?: number, coldStartMaxWaitMs?: number }} [options]
 * @returns {Promise<{ payload: object, refresh: Promise<void> | null }>}
 */
export async function resolveForexPrices({
  now = Date.now(),
  coldStartMaxWaitMs = FOREX_COLD_START_MAX_WAIT_MS,
} = {}) {
  const state = getForexState();
  const currentPayload = buildForexPayload(now);
  const hasAnyPrice = Object.values(currentPayload.assets).some((a) => a.price !== null);

  // Check if refresh is needed
  let needsRefresh = !hasAnyPrice;
  if (hasAnyPrice) {
    const oldestAllowed = now - FOREX_TTL_SECONDS * 1000;
    for (const id of FOREX_ASSET_IDS) {
      const rec = state.assets[id];
      if (!rec.updatedAt || Date.parse(rec.updatedAt) < oldestAllowed || rec.isStale) {
        needsRefresh = true;
        break;
      }
    }
  }

  if (!needsRefresh) {
    return { payload: currentPayload, refresh: null };
  }

  if (isBreakerOpen(now)) {
    return { payload: currentPayload, refresh: null };
  }

  // Refresh function wrapped in single-flight
  const runRefresh = () => singleFlight("forex", () => performForexFetch(now));

  // If we already have prices (SWR), return cached payload immediately and background refresh
  if (hasAnyPrice) {
    const refreshPromise = runRefresh().catch(() => {});
    return { payload: currentPayload, refresh: refreshPromise };
  }

  // Cold start: await refresh with bounded timeout
  try {
    let timeoutId;
    const waitTimeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Cold start timeout")), coldStartMaxWaitMs);
    });

    await Promise.race([runRefresh(), waitTimeoutPromise]);
    clearTimeout(timeoutId);
    return { payload: buildForexPayload(now), refresh: null };
  } catch {
    return { payload: buildForexPayload(now), refresh: null };
  }
}
