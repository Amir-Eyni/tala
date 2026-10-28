import "server-only";

import {
  ASSET_IDS,
  SINGLE_FLIGHT_MAX_LOCK_MS,
  STALE_TTL_MULTIPLIER,
  TTL_SECONDS,
} from "../utils/constants.js";

const STATE_KEY = Symbol.for("tala.priceCache.v1");

/**
 * Create an empty asset record.
 *
 * @returns {{ price: null, previousPrice: null, updatedAt: null, lastAttemptAt: null, lastErrorCode: null, consecutiveFailures: number }} Fresh record.
 */
function createAssetRecord() {
  return {
    price: null,
    previousPrice: null,
    high24h: null,
    low24h: null,
    rangeUpdatedAt: null,
    changePercent: null,
    updatedAt: null,
    lastAttemptAt: null,
    lastErrorCode: null,
    consecutiveFailures: 0,
  };
}

/**
 * Create the complete singleton state.
 *
 * @returns {{ assets: Record<string, ReturnType<typeof createAssetRecord>>, inflight: Map<unknown, { promise: Promise<unknown>, startedAt: number }> }} Fresh state.
 */
function createState() {
  const assets = {};

  for (const id of ASSET_IDS) {
    assets[id] = createAssetRecord();
  }

  return { assets, inflight: new Map() };
}

/**
 * Repair a state object left by an older module instance or a partial reload.
 *
 * @param {{ assets?: unknown, inflight?: unknown }} candidate - Existing global state.
 * @returns {{ assets: Record<string, ReturnType<typeof createAssetRecord>>, inflight: Map<unknown, { promise: Promise<unknown>, startedAt: number }> }} Usable state.
 */
function ensureStateShape(candidate) {
  if (
    !candidate.assets ||
    typeof candidate.assets !== "object"
  ) {
    candidate.assets = {};
  }

  for (const id of ASSET_IDS) {
    const record = candidate.assets[id];

    if (!record || typeof record !== "object") {
      candidate.assets[id] = createAssetRecord();
      continue;
    }

    if (!Object.hasOwn(record, "lastErrorCode")) {
      record.lastErrorCode = null;
    }

    if (!Object.hasOwn(record, "high24h")) {
      record.high24h = null;
    }
    if (!Object.hasOwn(record, "low24h")) {
      record.low24h = null;
    }
    if (!Object.hasOwn(record, "rangeUpdatedAt")) {
      record.rangeUpdatedAt = null;
    }
    if (!Object.hasOwn(record, "changePercent")) {
      record.changePercent = null;
    }

    if (!Number.isSafeInteger(record.consecutiveFailures)) {
      record.consecutiveFailures = 0;
    }
  }

  if (!(candidate.inflight instanceof Map)) {
    candidate.inflight = new Map();
  }

  return candidate;
}

const state = (() => {
  const existing = globalThis[STATE_KEY];

  if (existing && typeof existing === "object") {
    return ensureStateShape(existing);
  }

  const created = createState();
  globalThis[STATE_KEY] = created;
  return created;
})();

/**
 * Normalize a millisecond timestamp.
 *
 * @param {unknown} now - Caller-supplied timestamp.
 * @returns {number} Finite millisecond timestamp.
 */
function resolveNow(now) {
  return typeof now === "number" && Number.isFinite(now) ? now : Date.now();
}

/**
 * Resolve a known asset record.
 *
 * @param {unknown} id - Asset identifier.
 * @returns {ReturnType<typeof createAssetRecord> | null} Record or null.
 */
function getAssetRecord(id) {
  if (!ASSET_IDS.includes(id)) {
    return null;
  }

  return state.assets[id] ?? null;
}

/**
 * Convert milliseconds to an ISO string.
 *
 * @param {unknown} milliseconds - Millisecond timestamp.
 * @returns {string | null} ISO timestamp or null.
 */
function toIsoTimestamp(milliseconds) {
  if (!Number.isFinite(milliseconds)) {
    return null;
  }

  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Build one public asset state object from the internal record.
 *
 * @param {string} id - Known asset identifier.
 * @param {number} now - Current time in milliseconds.
 * @returns {{ id: string, price: number | null, previousPrice: number | null, changePercent: number | null, high24h: number | null, low24h: number | null, updatedAt: string | null, ageSeconds: number | null, ttlSeconds: number, isStale: boolean, needsRefresh: boolean, lastErrorCode: string | null }} Asset state.
 */
function buildAssetState(id, now) {
  const record = state.assets[id];
  const ttlSeconds = TTL_SECONDS[id];
  const hasData =
    Number.isSafeInteger(record.price) &&
    record.price > 0 &&
    Number.isFinite(record.updatedAt);
  const ageSeconds = hasData
    ? Math.max(0, (now - record.updatedAt) / 1000)
    : null;
  const needsRefresh = !hasData || ageSeconds > ttlSeconds;
  const isStale =
    !hasData ||
    record.consecutiveFailures > 0 ||
    ageSeconds > ttlSeconds * STALE_TTL_MULTIPLIER;

  return {
    id,
    price: record.price,
    previousPrice: record.previousPrice,
    changePercent:
      typeof record.changePercent === "number" &&
      Number.isFinite(record.changePercent)
        ? record.changePercent
        : null,
    high24h:
      Number.isSafeInteger(record.high24h) &&
      record.high24h >= record.price &&
      Number.isFinite(record.rangeUpdatedAt) &&
      now - record.rangeUpdatedAt <= 24 * 60 * 60 * 1000
        ? record.high24h
        : null,
    low24h:
      Number.isSafeInteger(record.low24h) &&
      record.low24h <= record.price &&
      Number.isFinite(record.rangeUpdatedAt) &&
      now - record.rangeUpdatedAt <= 24 * 60 * 60 * 1000
        ? record.low24h
        : null,
    updatedAt: toIsoTimestamp(record.updatedAt),
    ageSeconds,
    ttlSeconds,
    isStale,
    needsRefresh,
    lastErrorCode: record.lastErrorCode,
  };
}

/**
 * Derive the dashboard health label from stale asset states.
 *
 * @param {number} staleCount - Number of stale assets.
 * @returns {"healthy" | "stale" | "offline"} Health label.
 */
function deriveHealth(staleCount) {
  if (staleCount === ASSET_IDS.length) {
    return "offline";
  }

  if (staleCount === 0) {
    return "healthy";
  }

  return "stale";
}

/**
 * Read the last accepted price for an asset.
 *
 * @param {unknown} id - Asset identifier.
 * @returns {{ price: number, updatedAt: number } | null} Last good price and its millisecond timestamp.
 */
export function getLastGood(id) {
  const record = getAssetRecord(id);

  if (
    !record ||
    !Number.isSafeInteger(record.price) ||
    record.price <= 0 ||
    !Number.isFinite(record.updatedAt)
  ) {
    return null;
  }

  return { price: record.price, updatedAt: record.updatedAt };
}

/**
 * Store an accepted price and reset its failure state.
 *
 * @param {unknown} id - Asset identifier.
 * @param {unknown} price - Positive safe integer price.
 * @param {number} [now] - Current time in milliseconds.
 * @param {{ high24h: number, low24h: number } | null} [range] - Validated 24-hour range.
 * @param {number | null} [changePercent] - Validated source change percentage.
 * @returns {boolean} True when the price was stored.
 */
export function commitPrice(
  id,
  price,
  now = Date.now(),
  range = null,
  changePercent = null,
) {
  const record = getAssetRecord(id);

  if (!record || !Number.isSafeInteger(price) || price <= 0) {
    return false;
  }

  const timestamp = resolveNow(now);
  const currentPrice = record.price;

  if (currentPrice === null) {
    record.previousPrice = price;
  } else {
    record.previousPrice = currentPrice;
  }

  record.price = price;
  const hasValidRange =
    range &&
    Number.isSafeInteger(range.high24h) &&
    range.high24h >= price &&
    Number.isSafeInteger(range.low24h) &&
    range.low24h > 0 &&
    range.low24h <= price &&
    range.low24h <= range.high24h;
  record.high24h = hasValidRange ? range.high24h : price;
  record.low24h = hasValidRange ? range.low24h : price;
  record.rangeUpdatedAt = timestamp;
  record.changePercent =
    typeof changePercent === "number" && Number.isFinite(changePercent)
      ? changePercent
      : null;
  record.updatedAt = timestamp;
  record.lastAttemptAt = timestamp;
  record.lastErrorCode = null;
  record.consecutiveFailures = 0;

  return true;
}

/**
 * Record a failed fetch attempt without changing the last good price.
 *
 * @param {unknown} id - Asset identifier.
 * @param {unknown} errorCode - Short neutral error code.
 * @param {number} [now] - Current time in milliseconds.
 * @returns {boolean} True when the failure was recorded.
 */
export function recordFailure(id, errorCode, now = Date.now()) {
  const record = getAssetRecord(id);

  if (!record) {
    return false;
  }

  record.lastAttemptAt = resolveNow(now);
  record.lastErrorCode =
    typeof errorCode === "string" ? errorCode : "unknown";
  record.consecutiveFailures += 1;

  return true;
}

/**
 * Describe one asset without exposing internal records.
 *
 * @param {unknown} id - Asset identifier.
 * @param {number} [now] - Current time in milliseconds.
 * @returns {{ id: string, price: number | null, previousPrice: number | null, updatedAt: string | null, ageSeconds: number | null, ttlSeconds: number, isStale: boolean, needsRefresh: boolean, lastErrorCode: string | null } | null} Public asset state.
 */
export function getAssetState(id, now = Date.now()) {
  if (!ASSET_IDS.includes(id)) {
    return null;
  }

  return buildAssetState(id, resolveNow(now));
}

/**
 * Return a deep, consumer-safe copy of the entire cache.
 *
 * @param {number} [now] - Current time in milliseconds.
 * @returns {{ assets: Record<string, ReturnType<typeof buildAssetState>>, health: "healthy" | "stale" | "offline", generatedAt: string | null }} Snapshot.
 */
export function getSnapshot(now = Date.now()) {
  const timestamp = resolveNow(now);
  const assets = {};
  let staleCount = 0;

  for (const id of ASSET_IDS) {
    const assetState = buildAssetState(id, timestamp);
    assets[id] = assetState;

    if (assetState.isStale) {
      staleCount += 1;
    }
  }

  return structuredClone({
    assets,
    health: deriveHealth(staleCount),
    generatedAt: toIsoTimestamp(timestamp),
  });
}

/**
 * Return the aggregate health label.
 *
 * @param {number} [now] - Current time in milliseconds.
 * @returns {"healthy" | "stale" | "offline"} Health label.
 */
export function getHealth(now = Date.now()) {
  const timestamp = resolveNow(now);
  let staleCount = 0;

  for (const id of ASSET_IDS) {
    if (buildAssetState(id, timestamp).isStale) {
      staleCount += 1;
    }
  }

  return deriveHealth(staleCount);
}

/**
 * Run one task per key while concurrent callers share its promise.
 *
 * Locks older than SINGLE_FLIGHT_MAX_LOCK_MS are treated as dead. An old
 * task finishing late cannot delete a newer lock.
 *
 * @param {unknown} key - Opaque per-task key.
 * @param {() => unknown} task - Work to run.
 * @param {{ now?: number }} [options] - Current time in milliseconds.
 * @returns {Promise<unknown>} Shared task promise.
 */
export function singleFlight(key, task, { now } = {}) {
  const timestamp = resolveNow(now);
  const existing = state.inflight.get(key);

  if (
    existing &&
    timestamp - existing.startedAt <= SINGLE_FLIGHT_MAX_LOCK_MS
  ) {
    return existing.promise;
  }

  let entry;
  const promise = Promise.resolve()
    .then(() => task())
    .finally(() => {
      if (state.inflight.get(key) === entry) {
        state.inflight.delete(key);
      }
    });

  entry = { promise, startedAt: timestamp };
  state.inflight.set(key, entry);

  return promise;
}

/**
 * Check whether a live single-flight lock exists for a key.
 *
 * @param {unknown} key - Opaque per-task key.
 * @param {number} [now] - Current time in milliseconds.
 * @returns {boolean} True while the lock is live.
 */
export function isRefreshing(key, now = Date.now()) {
  const timestamp = resolveNow(now);
  const entry = state.inflight.get(key);

  if (!entry) {
    return false;
  }

  if (timestamp - entry.startedAt > SINGLE_FLIGHT_MAX_LOCK_MS) {
    if (state.inflight.get(key) === entry) {
      state.inflight.delete(key);
    }

    return false;
  }

  return true;
}

/**
 * Clear all cache records and locks. Test-only.
 *
 * @returns {void}
 * @throws {Error} In production.
 */
export function resetCacheForTests() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Cache reset is not allowed in production.");
  }

  for (const id of ASSET_IDS) {
    state.assets[id] = createAssetRecord();
  }

  state.inflight.clear();
}
