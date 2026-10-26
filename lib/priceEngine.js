import "server-only";

import {
  commitPrice,
  getAssetState,
  getHealth,
  getLastGood,
  getSnapshot,
  recordFailure,
  resetCacheForTests,
  singleFlight,
} from "./cache.js";
import { SCRAPER_REGISTRY } from "./scrapers/index.js";
import {
  changePercentSchema,
  priceRangeSchema,
  validatePrice,
} from "./validator.js";
import {
  ASSET_IDS,
  ASSETS,
  BREAKER_COOLDOWN_MS,
  BREAKER_FAILURE_THRESHOLD,
  COLD_START_MAX_WAIT_MS,
  CURRENCY_LABEL,
  GROUP_DEADLINE_MS,
  MIN_RETRY_INTERVAL_MS,
} from "../utils/constants.js";
import { calcChange } from "../utils/formatPrice.js";

const ENGINE_KEY = Symbol.for("tala.priceEngine.v1");
const COLD_TIMEOUT = "timeout";

/**
 * Create an empty breaker record for one group.
 *
 * @returns {{ failures: number, lastAttemptAt: number | null }} Breaker record.
 */
function createGroupState() {
  return { failures: 0, lastAttemptAt: null };
}

/**
 * Create the complete engine state.
 *
 * @returns {{ groups: Record<string, ReturnType<typeof createGroupState>>, overrides: { registry: unknown, fetchImpl: unknown } }} Engine state.
 */
function createEngineState() {
  return {
    groups: {},
    overrides: { registry: null, fetchImpl: null },
  };
}

/**
 * Repair state left by an older module instance or a partial reload.
 *
 * @param {{ groups?: unknown, overrides?: unknown }} candidate - Existing state.
 * @returns {{ groups: Record<string, ReturnType<typeof createGroupState>>, overrides: { registry: unknown, fetchImpl: unknown } }} Usable state.
 */
function ensureEngineState(candidate) {
  if (!candidate.groups || typeof candidate.groups !== "object") {
    candidate.groups = {};
  }

  if (!candidate.overrides || typeof candidate.overrides !== "object") {
    candidate.overrides = { registry: null, fetchImpl: null };
  } else {
    if (!Object.hasOwn(candidate.overrides, "registry")) {
      candidate.overrides.registry = null;
    }

    if (!Object.hasOwn(candidate.overrides, "fetchImpl")) {
      candidate.overrides.fetchImpl = null;
    }
  }

  for (const [groupId, record] of Object.entries(candidate.groups)) {
    if (!record || typeof record !== "object") {
      candidate.groups[groupId] = createGroupState();
      continue;
    }

    if (!Number.isSafeInteger(record.failures) || record.failures < 0) {
      record.failures = 0;
    }

    if (!Number.isFinite(record.lastAttemptAt)) {
      record.lastAttemptAt = null;
    }
  }

  return candidate;
}

const engineState = (() => {
  const existing = globalThis[ENGINE_KEY];

  if (existing && typeof existing === "object") {
    return ensureEngineState(existing);
  }

  const created = createEngineState();
  globalThis[ENGINE_KEY] = created;
  return created;
})();

/**
 * Normalize a caller-supplied timestamp.
 *
 * @param {unknown} now - Millisecond timestamp.
 * @returns {number} Finite timestamp.
 */
function resolveNow(now) {
  return typeof now === "number" && Number.isFinite(now) ? now : Date.now();
}

/**
 * Keep log codes short and free of messages, URLs or provider names.
 *
 * @param {unknown} code - Candidate error code.
 * @returns {string} Neutral code.
 */
function neutralCode(code) {
  if (typeof code !== "string") {
    return "unknown";
  }

  const normalized = code.trim().toLowerCase();
  return /^[a-z][a-z0-9-]{0,31}$/.test(normalized) ? normalized : "unknown";
}

/**
 * Normalize a group id before writing it to a log line.
 *
 * @param {unknown} groupId - Group id.
 * @returns {string} Safe group id.
 */
function neutralGroupId(groupId) {
  return typeof groupId === "string" &&
    /^[a-z][a-z0-9-]{0,31}$/i.test(groupId)
    ? groupId.toLowerCase()
    : "unknown";
}

/**
 * Write one breaker state transition to the server log.
 *
 * @param {unknown} groupId - Group id.
 * @param {"closed" | "open" | "half-open"} state - New breaker state.
 * @param {unknown} [code] - Optional neutral error code.
 * @returns {void}
 */
function logBreakerTransition(groupId, state, code) {
  if (typeof console === "undefined" || typeof console.warn !== "function") {
    return;
  }

  const suffix =
    state === "open" ? ` code=${neutralCode(code)}` : "";

  try {
    console.warn(
      `[price-engine] group=${neutralGroupId(groupId)} breaker=${state}${suffix}`,
    );
  } catch {
    // Logging must never break a refresh.
  }
}

/**
 * Resolve or create the breaker record for a group.
 *
 * @param {unknown} groupId - Group id.
 * @returns {{ failures: number, lastAttemptAt: number | null } | null} Breaker record.
 */
function getGroupState(groupId) {
  if (typeof groupId !== "string") {
    return null;
  }

  if (!engineState.groups[groupId] || typeof engineState.groups[groupId] !== "object") {
    engineState.groups[groupId] = createGroupState();
  }

  const record = engineState.groups[groupId];

  if (!Number.isSafeInteger(record.failures) || record.failures < 0) {
    record.failures = 0;
  }

  if (!Number.isFinite(record.lastAttemptAt)) {
    record.lastAttemptAt = null;
  }

  return record;
}

/**
 * Apply the circuit-breaker admission rules for one group.
 *
 * @param {{ id: string }} group - Scraper group.
 * @param {number} now - Current time in milliseconds.
 * @returns {boolean} True when an attempt is allowed.
 */
function shouldAttempt(group, now) {
  const breaker = getGroupState(group?.id);

  if (!breaker) {
    return false;
  }

  if (breaker.failures === 0) {
    return true;
  }

  if (!Number.isFinite(breaker.lastAttemptAt)) {
    return true;
  }

  const elapsed = now - breaker.lastAttemptAt;

  if (breaker.failures < BREAKER_FAILURE_THRESHOLD) {
    return elapsed >= MIN_RETRY_INTERVAL_MS;
  }

  return elapsed >= BREAKER_COOLDOWN_MS;
}

/**
 * Normalize a registry into valid groups.
 *
 * @param {unknown} candidate - Candidate registry.
 * @returns {Array<{ id: string, assets: string[], fetch: Function }>} Valid groups.
 */
function normalizeRegistry(candidate) {
  if (!Array.isArray(candidate)) {
    return SCRAPER_REGISTRY;
  }

  return candidate.filter(
    (group) =>
      group &&
      typeof group === "object" &&
      typeof group.id === "string" &&
      Array.isArray(group.assets) &&
      typeof group.fetch === "function",
  );
}

/**
 * Pick the registry for this call, honoring test overrides.
 *
 * @param {unknown} explicitRegistry - Per-call registry.
 * @returns {Array<{ id: string, assets: string[], fetch: Function }>} Effective registry.
 */
function effectiveRegistry(explicitRegistry) {
  const selected =
    explicitRegistry ??
    engineState.overrides.registry ??
    SCRAPER_REGISTRY;

  return normalizeRegistry(selected);
}

/**
 * Build the neutral timeout error used by group deadlines.
 *
 * @returns {Error & { code: "timeout" }} Timeout error.
 */
function makeTimeoutError() {
  const error = new Error("Group deadline exceeded.");
  error.code = "timeout";
  return error;
}

/**
 * Run work with a hard deadline and clear the timer in every outcome.
 *
 * @param {() => unknown} run - Work to execute.
 * @param {unknown} deadlineMs - Deadline in milliseconds.
 * @returns {Promise<unknown>} Work result.
 */
function withDeadline(run, deadlineMs) {
  const effectiveDeadline =
    typeof deadlineMs === "number" && Number.isFinite(deadlineMs) && deadlineMs >= 0
      ? deadlineMs
      : GROUP_DEADLINE_MS;

  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      reject(makeTimeoutError());
    }, effectiveDeadline);

    Promise.resolve()
      .then(run)
      .then(
        (value) => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      );
  });
}

/**
 * Wait for a promise or a timeout without rejecting.
 *
 * @param {Promise<unknown>} promise - Work to await.
 * @param {unknown} waitMs - Maximum wait in milliseconds.
 * @returns {Promise<"settled" | "timeout">} Wait outcome.
 */
function waitForSettledOrTimeout(promise, waitMs) {
  const effectiveWait =
    typeof waitMs === "number" && Number.isFinite(waitMs) && waitMs >= 0
      ? waitMs
      : COLD_START_MAX_WAIT_MS;

  return new Promise((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve(COLD_TIMEOUT);
    }, effectiveWait);

    Promise.resolve(promise).then(
      () => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        resolve("settled");
      },
      () => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        resolve("settled");
      },
    );
  });
}

/**
 * Refresh one scraper group behind its single-flight lock.
 *
 * @param {{ id: string, assets: string[], fetch: Function }} group - Group to refresh.
 * @param {{ now?: number, fetchImpl?: typeof fetch, deadlineMs?: number }} [options] - Injection points.
 * @returns {Promise<{ groupId: string, ok: boolean, accepted: string[], rejected: Array<{ assetId: string, reason: string }> }>} Group result.
 */
async function refreshGroup(group, options = {}) {
  if (
    !group ||
    typeof group !== "object" ||
    typeof group.id !== "string" ||
    !Array.isArray(group.assets) ||
    typeof group.fetch !== "function"
  ) {
    return { groupId: "unknown", ok: false, accepted: [], rejected: [] };
  }

  const settings = options && typeof options === "object" ? options : {};
  const now = resolveNow(settings.now);
  const fetchImpl = settings.fetchImpl;
  const deadlineMs = settings.deadlineMs;

  return singleFlight(
    `engine:${group.id}`,
    async () => {
      const breaker = getGroupState(group.id);
      const accepted = [];
      const rejected = [];
      const handled = new Set();
      let failureCode = "unknown";
      let previousFailures = 0;

      if (!breaker) {
        return {
          groupId: group.id,
          ok: false,
          accepted,
          rejected,
        };
      }

      previousFailures = breaker.failures;
      const previousLastAttemptAt = breaker.lastAttemptAt;
      breaker.lastAttemptAt = now;

      if (
        previousFailures >= BREAKER_FAILURE_THRESHOLD &&
        (previousLastAttemptAt === null ||
          now - previousLastAttemptAt >= BREAKER_COOLDOWN_MS)
      ) {
        logBreakerTransition(group.id, "half-open");
      }

      const rejectAsset = (assetId, reason) => {
        if (handled.has(assetId)) {
          return;
        }

        const code = neutralCode(reason);
        handled.add(assetId);
        recordFailure(assetId, code, now);
        rejected.push({ assetId, reason: code });

        if (failureCode === "unknown") {
          failureCode = code;
        }
      };

      try {
        const result = await withDeadline(
          () => group.fetch({ fetchImpl, now }),
          deadlineMs,
        );
        const prices =
          result && typeof result === "object" ? result.prices : null;
        const ranges =
          result && typeof result === "object" ? result.ranges : null;
        const changes =
          result && typeof result === "object" ? result.changes : null;

        for (const assetId of group.assets) {
          if (handled.has(assetId)) {
            continue;
          }

          if (
            !prices ||
            typeof prices !== "object" ||
            !Object.prototype.hasOwnProperty.call(prices, assetId)
          ) {
            rejectAsset(assetId, "parse");
            continue;
          }

          const rawPrice = prices[assetId];

          try {
            const verdict = validatePrice({
              assetId,
              rawPrice,
              lastGood: getLastGood(assetId),
              now,
            });

            if (verdict && verdict.accepted === true) {
              const parsedRange = priceRangeSchema.safeParse(ranges?.[assetId]);
              const range =
                parsedRange.success &&
                parsedRange.data.high24h !== undefined &&
                parsedRange.data.low24h !== undefined &&
                parsedRange.data.high24h >= verdict.price &&
                parsedRange.data.low24h <= verdict.price
                  ? parsedRange.data
                  : null;
              const parsedChange = changePercentSchema.safeParse(
                changes?.[assetId],
              );
              const dailyChangePercent = parsedChange.success
                ? parsedChange.data
                : null;

              if (
                commitPrice(
                  assetId,
                  verdict.price,
                  now,
                  range,
                  dailyChangePercent,
                )
              ) {
                handled.add(assetId);
                accepted.push(assetId);
              } else {
                rejectAsset(assetId, "commit");
              }
            } else {
              rejectAsset(assetId, verdict?.reason ?? "invalid");
            }
          } catch {
            rejectAsset(assetId, "unknown");
          }
        }
      } catch (error) {
        failureCode = neutralCode(error?.code);

        for (const assetId of group.assets) {
          rejectAsset(assetId, failureCode);
        }
      }

      const ok = accepted.length > 0;

      if (ok) {
        breaker.failures = 0;

        if (previousFailures >= BREAKER_FAILURE_THRESHOLD) {
          logBreakerTransition(group.id, "closed");
        }
      } else {
        breaker.failures = previousFailures + 1;

        if (
          previousFailures < BREAKER_FAILURE_THRESHOLD &&
          breaker.failures >= BREAKER_FAILURE_THRESHOLD
        ) {
          logBreakerTransition(group.id, "open", failureCode);
        } else if (previousFailures >= BREAKER_FAILURE_THRESHOLD) {
          logBreakerTransition(group.id, "open", failureCode);
        }
      }

      return {
        groupId: group.id,
        ok,
        accepted,
        rejected,
      };
    },
    { now },
  );
}

/**
 * Refresh several groups in parallel without rejecting.
 *
 * @param {Array<{ id: string, assets: string[], fetch: Function }>} groups - Groups to refresh.
 * @param {{ now?: number, fetchImpl?: typeof fetch, deadlineMs?: number }} [options] - Injection points.
 * @returns {Promise<Array<{ groupId: string, ok: boolean, accepted: string[], rejected: Array<{ assetId: string, reason: string }> }>>} Group results.
 */
async function refreshGroups(groups, options = {}) {
  if (!Array.isArray(groups) || groups.length === 0) {
    return [];
  }

  const settings = options && typeof options === "object" ? options : {};
  const now = resolveNow(settings.now);
  const settled = await Promise.allSettled(
    groups.map((group) => refreshGroup(group, settings)),
  );

  return settled.map((entry, index) => {
    if (entry.status === "fulfilled") {
      return entry.value;
    }

    const group = groups[index];
    const assets = Array.isArray(group?.assets) ? group.assets : [];
    const rejected = [];

    for (const assetId of assets) {
      recordFailure(assetId, "unknown", now);
      rejected.push({ assetId, reason: "unknown" });
    }

    return {
      groupId: typeof group?.id === "string" ? group.id : "unknown",
      ok: false,
      accepted: [],
      rejected,
    };
  });
}

/**
 * Build the public API payload from the cache.
 *
 * updatedAt is the newest updatedAt among assets that have a price.
 *
 * @param {number} [now] - Current time in milliseconds.
 * @returns {{ updatedAt: string | null, status: "healthy" | "stale" | "offline", currency: string, assets: Record<string, { id: string, title: string, unit: string, price: number | null, previousPrice: number | null, changePercent: number, isStale: boolean }> }} API payload.
 */
export function buildPayload(now = Date.now()) {
  const timestamp = resolveNow(now);

  try {
    const snapshot = getSnapshot(timestamp);
    let newestUpdatedAt = null;
    let newestTimestamp = null;

    for (const id of ASSET_IDS) {
      const assetState = snapshot.assets?.[id];

      if (!assetState || assetState.price === null) {
        continue;
      }

      const parsed = Date.parse(assetState.updatedAt ?? "");
      if (
        Number.isFinite(parsed) &&
        (newestTimestamp === null || parsed > newestTimestamp)
      ) {
        newestTimestamp = parsed;
        newestUpdatedAt = assetState.updatedAt;
      }
    }

    const assets = {};

    for (const id of ASSET_IDS) {
      const assetState = snapshot.assets?.[id] ?? {};
      const metadata = ASSETS[id] ?? { id, title: id, unit: "" };
      const price = normalizePrice(assetState.price);
      const previousPrice =
        price === null ? null : normalizePrice(assetState.previousPrice);
      const changePercent =
        price === null
          ? 0
          : Number.isFinite(assetState.dailyChangePercent)
            ? assetState.dailyChangePercent
            : calcChange(price, previousPrice).percent;

      assets[id] = {
        id,
        title: metadata.title,
        unit: metadata.unit,
        price,
        previousPrice,
        ...(assetState.high24h === null || assetState.low24h === null
          ? {}
          : {
              high24h: normalizePrice(assetState.high24h),
              low24h: normalizePrice(assetState.low24h),
            }),
        changePercent,
        isStale: price === null ? true : Boolean(assetState.isStale),
      };
    }

    return {
      updatedAt: newestUpdatedAt,
      status: getHealth(timestamp),
      currency: CURRENCY_LABEL,
      assets,
    };
  } catch {
    return buildFallbackPayload();
  }
}

/**
 * Normalize a cached value to a positive safe integer or null.
 *
 * @param {unknown} value - Candidate price.
 * @returns {number | null} Normalized price.
 */
function normalizePrice(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * Build a completely offline payload for unexpected failures.
 *
 * @returns {{ updatedAt: null, status: "offline", currency: string, assets: Record<string, { id: string, title: string, unit: string, price: null, previousPrice: null, changePercent: number, isStale: true }> }} Offline payload.
 */
function buildFallbackPayload() {
  const assets = {};

  for (const id of ASSET_IDS) {
    const metadata = ASSETS[id] ?? { id, title: id, unit: "" };
    assets[id] = {
      id,
      title: metadata.title,
      unit: metadata.unit,
      price: null,
      previousPrice: null,
      changePercent: 0,
      isStale: true,
    };
  }

  return {
    updatedAt: null,
    status: "offline",
    currency: CURRENCY_LABEL,
    assets,
  };
}

/**
 * Build a completely offline payload for unexpected failures.
 *
 * @returns {{ updatedAt: null, status: "offline", currency: string, assets: Record<string, { id: string, title: string, unit: string, price: null, previousPrice: null, changePercent: number, isStale: true }> }} Offline payload.
 */
export function buildOfflinePayload() {
  return buildFallbackPayload();
}

/**
 * Resolve the current payload and schedule any required background refreshes.
 *
 * @param {{ now?: number, fetchImpl?: typeof fetch, registry?: unknown, deadlineMs?: number, coldStartMaxWaitMs?: number }} [options] - Injection points.
 * @returns {Promise<{ payload: ReturnType<typeof buildPayload>, refresh: Promise<unknown> | null }>} Current payload and background work.
 */
export async function resolvePrices(options = {}) {
  const settings = options && typeof options === "object" ? options : {};
  const hasInjectedNow =
    typeof settings.now === "number" && Number.isFinite(settings.now);
  const now = hasInjectedNow ? settings.now : Date.now();

  try {
    const registry = effectiveRegistry(settings.registry);
    const fetchImpl =
      settings.fetchImpl ?? engineState.overrides.fetchImpl ?? undefined;
    const coldGroups = [];
    const dueGroups = [];

    for (const group of registry) {
      const isCold = group.assets.some((assetId) => getLastGood(assetId) === null);

      if (isCold) {
        if (shouldAttempt(group, now)) {
          coldGroups.push(group);
        }
        continue;
      }

      const isDue = group.assets.some(
        (assetId) => getAssetState(assetId, now)?.needsRefresh === true,
      );

      if (isDue && shouldAttempt(group, now)) {
        dueGroups.push(group);
      }
    }

    let coldRefresh = null;
    let coldTimedOut = false;

    if (coldGroups.length > 0) {
      coldRefresh = refreshGroups(coldGroups, {
        now,
        fetchImpl,
        deadlineMs: settings.deadlineMs,
      });

      const outcome = await waitForSettledOrTimeout(
        coldRefresh,
        settings.coldStartMaxWaitMs,
      );
      coldTimedOut = outcome === COLD_TIMEOUT;
    }

    const payloadNow = hasInjectedNow ? now : Date.now();
    const dueRefresh =
      dueGroups.length > 0
        ? refreshGroups(dueGroups, {
            now: payloadNow,
            fetchImpl,
            deadlineMs: settings.deadlineMs,
          })
        : null;

    const background = [];
    if (coldRefresh && coldTimedOut) {
      background.push(coldRefresh);
    }
    if (dueRefresh) {
      background.push(dueRefresh);
    }

    let refresh = null;
    if (background.length === 1) {
      refresh = background[0];
    } else if (background.length > 1) {
      refresh = Promise.allSettled(background).then(() => undefined);
    }

    if (refresh) {
      refresh = Promise.resolve(refresh).catch(() => undefined);
    }

    return {
      payload: buildPayload(payloadNow),
      refresh,
    };
  } catch {
    return {
      payload: buildFallbackPayload(),
      refresh: null,
    };
  }
}

/**
 * Report the circuit-breaker state for every known group.
 *
 * @param {number} [now] - Current time in milliseconds.
 * @returns {Record<string, { state: "closed" | "open" | "half-open", failures: number }>} Breaker status.
 */
export function getBreakerStatus(now = Date.now()) {
  const timestamp = resolveNow(now);

  try {
    const status = {};

    for (const group of effectiveRegistry(null)) {
      const breaker = getGroupState(group.id);
      const failures = breaker?.failures ?? 0;
      let state;

      if (failures < BREAKER_FAILURE_THRESHOLD) {
        state = "closed";
      } else if (
        Number.isFinite(breaker?.lastAttemptAt) &&
        timestamp - breaker.lastAttemptAt >= BREAKER_COOLDOWN_MS
      ) {
        state = "half-open";
      } else {
        state = "open";
      }

      status[group.id] = { state, failures };
    }

    return status;
  } catch {
    return {};
  }
}

/**
 * Clear breaker, cache and override state. Test-only.
 *
 * @returns {void}
 * @throws {Error} In production.
 */
export function resetEngineForTests() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Engine reset is not allowed in production.");
  }

  engineState.groups = {};
  engineState.overrides = { registry: null, fetchImpl: null };
  resetCacheForTests();
}

/**
 * Install test-only registry and fetch overrides. Disabled in production.
 *
 * @param {{ registry?: unknown, fetchImpl?: unknown }} [options] - Overrides.
 * @returns {void}
 * @throws {Error} In production.
 */
export function setEngineOverridesForTests(options = {}) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Engine overrides are not allowed in production.");
  }

  const settings = options && typeof options === "object" ? options : {};

  if (settings.registry !== undefined) {
    engineState.overrides.registry = settings.registry;
  }

  if (settings.fetchImpl !== undefined) {
    engineState.overrides.fetchImpl = settings.fetchImpl;
  }
}
