import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { beforeEach } from "node:test";

import { getAssetState, isRefreshing } from "../lib/cache.js";
import { SCRAPER_REGISTRY } from "../lib/scrapers/index.js";
import {
  buildOfflinePayload,
  buildPayload,
  getBreakerStatus,
  resetEngineForTests,
  resolvePrices,
  setEngineOverridesForTests,
} from "../lib/priceEngine.js";
import { toHttpResponse } from "../lib/pricesResponse.js";
import {
  ASSET_IDS,
  BREAKER_COOLDOWN_MS,
  BREAKER_FAILURE_THRESHOLD,
  COLD_START_MAX_WAIT_MS,
  GROUP_DEADLINE_MS,
  MIN_RETRY_INTERVAL_MS,
  SINGLE_FLIGHT_MAX_LOCK_MS,
  TTL_SECONDS,
} from "../utils/constants.js";

const T0 = 1_700_000_000_000;
const BASE_PRICES = {
  usdt: 100_000,
  usd: 100_000,
  gold18k: 5_000_000,
  gold24k: 6_650_000,
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function resultFor(prices, now = T0, extra = {}) {
  return {
    prices,
    fetchedAt: new Date(now).toISOString(),
    ...extra,
  };
}

function createRegistry(overrides = {}) {
  return [
    {
      id: "fx",
      assets: ["usdt", "usd"],
      fetch:
        overrides.fx ??
        (async ({ now }) =>
          resultFor(
            { usdt: BASE_PRICES.usdt, usd: BASE_PRICES.usd },
            now,
          )),
    },
    {
      id: "gold18",
      assets: ["gold18k"],
      fetch:
        overrides.gold18 ??
        (async ({ now }) =>
          resultFor({ gold18k: BASE_PRICES.gold18k }, now)),
    },
    {
      id: "gold24",
      assets: ["gold24k"],
      fetch:
        overrides.gold24 ??
        (async ({ now }) =>
          resultFor({ gold24k: BASE_PRICES.gold24k }, now)),
    },
  ];
}

function oneGroupRegistry(fetch, assets = ["usd"]) {
  return [{ id: "fx", assets, fetch }];
}

function engineError(code, message = "source failed") {
  const error = new Error(message);
  error.code = code;
  return error;
}

beforeEach(() => {
  resetEngineForTests();
});

test("registry contains every asset once with neutral group ids", () => {
  assert.equal(Object.isFrozen(SCRAPER_REGISTRY), true);
  assert.deepEqual(
    SCRAPER_REGISTRY.map((group) => group.id),
    ["fx", "gold18", "gold24"],
  );

  const seen = [];
  for (const group of SCRAPER_REGISTRY) {
    assert.equal(Object.isFrozen(group), true);
    seen.push(...group.assets);
  }

  assert.equal(seen.length, ASSET_IDS.length);
  assert.deepEqual(new Set(seen), new Set(ASSET_IDS));
  for (const assetId of ASSET_IDS) {
    assert.equal(seen.filter((value) => value === assetId).length, 1);
  }
});

test("group deadline stays below the single-flight lock", () => {
  assert.equal(MIN_RETRY_INTERVAL_MS, 5_000);
  assert.equal(BREAKER_FAILURE_THRESHOLD, 3);
  assert.equal(BREAKER_COOLDOWN_MS, 60_000);
  assert.equal(COLD_START_MAX_WAIT_MS, 7_000);
  assert.equal(GROUP_DEADLINE_MS, 12_000);
  assert.equal(GROUP_DEADLINE_MS < SINGLE_FLIGHT_MAX_LOCK_MS, true);
});

test("every asset cache TTL is shorter than the 15-second client poll", () => {
  for (const ttlSeconds of Object.values(TTL_SECONDS)) {
    assert.ok(ttlSeconds <= 15);
  }
});

test("cold start fetches all groups and returns a healthy payload", async () => {
  const registry = createRegistry();
  const { payload, refresh } = await resolvePrices({
    now: T0,
    registry,
    coldStartMaxWaitMs: 200,
  });

  assert.equal(refresh, null);
  assert.equal(payload.status, "healthy");
  assert.equal(payload.currency, "تومان");
  assert.equal(payload.updatedAt, new Date(T0).toISOString());
  assert.equal(payload.assets.usd.price, BASE_PRICES.usd);
  assert.equal(payload.assets.usdt.price, BASE_PRICES.usdt);
  assert.equal(payload.assets.usd.changePercent, 0);
  assert.equal(payload.assets.usdt.changePercent, 0);
  assert.notEqual(payload.assets.usd, payload.assets.usdt);
  assert.equal(payload.assets.usd.isStale, false);
  assert.equal(payload.assets.usdt.isStale, false);
});

test("payload includes validated upstream 24-hour extrema when available", async () => {
  const registry = createRegistry({
    fx: async ({ now }) =>
      resultFor(
        { usdt: BASE_PRICES.usdt, usd: BASE_PRICES.usd },
        now,
        {
          ranges: {
            usdt: { high24h: 110_000, low24h: 90_000 },
            usd: { high24h: 110_000, low24h: 90_000 },
          },
        },
      ),
    gold18: async ({ now }) =>
      resultFor(
        { gold18k: BASE_PRICES.gold18k },
        now,
        {
          ranges: {
            gold18k: { high24h: 5_500_000, low24h: 4_500_000 },
          },
        },
      ),
    gold24: async ({ now }) =>
      resultFor(
        { gold24k: BASE_PRICES.gold24k },
        now,
        {
          ranges: {
            gold24k: { high24h: 7_000_000, low24h: 6_000_000 },
          },
        },
      ),
  });

  const { payload } = await resolvePrices({
    now: T0,
    registry,
    coldStartMaxWaitMs: 200,
  });

  assert.deepEqual(payload.assets.gold18k.high24h, 5_500_000);
  assert.deepEqual(payload.assets.gold18k.low24h, 4_500_000);
  assert.deepEqual(payload.assets.gold24k.high24h, 7_000_000);
  assert.deepEqual(payload.assets.usd.high24h, 110_000);
  assert.deepEqual(payload.assets.usdt.low24h, 90_000);
});

test("a second request inside TTL does not call any scraper", async () => {
  const calls = { fx: 0, gold18: 0, gold24: 0 };
  const registry = createRegistry({
    fx: async ({ now }) => {
      calls.fx += 1;
      return resultFor(
        { usdt: BASE_PRICES.usdt, usd: BASE_PRICES.usd },
        now,
      );
    },
    gold18: async ({ now }) => {
      calls.gold18 += 1;
      return resultFor({ gold18k: BASE_PRICES.gold18k }, now);
    },
    gold24: async ({ now }) => {
      calls.gold24 += 1;
      return resultFor({ gold24k: BASE_PRICES.gold24k }, now);
    },
  });

  const first = await resolvePrices({
    now: T0,
    registry,
    coldStartMaxWaitMs: 200,
  });
  assert.equal(first.refresh, null);

  const second = await resolvePrices({
    now: T0 + 1,
    registry,
    coldStartMaxWaitMs: 200,
  });

  assert.deepEqual(calls, { fx: 1, gold18: 1, gold24: 1 });
  assert.equal(second.refresh, null);
  assert.equal(second.payload.assets.usd.price, BASE_PRICES.usd);
});

test("stale-while-revalidate returns old data and then applies the new price", async () => {
  let mode = "initial";
  let release;
  const registry = createRegistry({
    fx: async ({ now }) => {
      if (mode === "initial") {
        return resultFor(
          { usdt: BASE_PRICES.usdt, usd: BASE_PRICES.usd },
          now,
        );
      }

      return new Promise((resolve) => {
        release = () =>
          resolve(
            resultFor(
              { usdt: BASE_PRICES.usdt + 10, usd: BASE_PRICES.usd + 10 },
              now,
            ),
          );
      });
    },
  });

  const cold = await resolvePrices({
    now: T0,
    registry,
    coldStartMaxWaitMs: 200,
  });
  assert.equal(cold.payload.assets.usd.price, BASE_PRICES.usd);

  mode = "pending";
  const staleTime = T0 + 16_000;
  const stale = await resolvePrices({
    now: staleTime,
    registry,
    coldStartMaxWaitMs: 200,
  });

  assert.notEqual(stale.refresh, null);
  assert.equal(stale.payload.assets.usd.price, BASE_PRICES.usd);
  await Promise.resolve();
  assert.equal(typeof release, "function");

  release();
  await stale.refresh;

  const next = await resolvePrices({
    now: staleTime + 1,
    registry,
    coldStartMaxWaitMs: 200,
  });

  assert.equal(next.refresh, null);
  assert.equal(next.payload.assets.usd.price, BASE_PRICES.usd + 10);
  assert.equal(next.payload.assets.usd.previousPrice, BASE_PRICES.usd);
  assert.equal(next.payload.assets.usd.changePercent, 0.01);
  assert.equal(next.payload.assets.usd.isStale, false);
});

test("500 concurrent cold requests share one fetch per group", async () => {
  const calls = { fx: 0, gold18: 0, gold24: 0 };
  const registry = createRegistry({
    fx: async ({ now }) => {
      calls.fx += 1;
      return resultFor(
        { usdt: BASE_PRICES.usdt, usd: BASE_PRICES.usd },
        now,
      );
    },
    gold18: async ({ now }) => {
      calls.gold18 += 1;
      return resultFor({ gold18k: BASE_PRICES.gold18k }, now);
    },
    gold24: async ({ now }) => {
      calls.gold24 += 1;
      return resultFor({ gold24k: BASE_PRICES.gold24k }, now);
    },
  });

  const requests = Array.from({ length: 500 }, () =>
    resolvePrices({ now: T0, registry, coldStartMaxWaitMs: 500 }),
  );
  const responses = await Promise.all(requests);

  assert.deepEqual(calls, { fx: 1, gold18: 1, gold24: 1 });
  for (const response of responses) {
    assert.equal(response.payload.assets.usd.price, BASE_PRICES.usd);
  }
});

test("one failing group does not block the others and preserves old prices", async () => {
  let failGold18 = false;
  const registry = createRegistry({
    fx: async ({ now }) =>
      resultFor(
        { usdt: BASE_PRICES.usdt + 1, usd: BASE_PRICES.usd + 1 },
        now,
      ),
    gold18: async ({ now }) => {
      if (failGold18) {
        throw engineError("network");
      }

      return resultFor({ gold18k: BASE_PRICES.gold18k }, now);
    },
    gold24: async ({ now }) =>
      resultFor({ gold24k: BASE_PRICES.gold24k + 1 }, now),
  });

  const cold = await resolvePrices({
    now: T0,
    registry,
    coldStartMaxWaitMs: 200,
  });
  assert.equal(cold.payload.status, "healthy");

  failGold18 = true;
  const dueTime = T0 + 61_000;
  const stale = await resolvePrices({
    now: dueTime,
    registry,
    coldStartMaxWaitMs: 200,
  });

  assert.notEqual(stale.refresh, null);
  await stale.refresh;

  const afterwards = buildPayload(dueTime);
  assert.equal(afterwards.status, "stale");
  assert.equal(afterwards.assets.gold18k.price, BASE_PRICES.gold18k);
  assert.equal(afterwards.assets.gold18k.isStale, true);
  assert.equal(afterwards.assets.usd.price, BASE_PRICES.usd + 1);
  assert.equal(afterwards.assets.gold24k.price, BASE_PRICES.gold24k + 1);
  assert.equal(getAssetState("gold18k", dueTime).lastErrorCode, "network");

  resetEngineForTests();
  const coldFailureRegistry = createRegistry({
    gold18: async () => {
      throw engineError("parse");
    },
  });
  const coldFailure = await resolvePrices({
    now: T0,
    registry: coldFailureRegistry,
    coldStartMaxWaitMs: 200,
  });

  assert.equal(coldFailure.payload.status, "stale");
  assert.equal(coldFailure.payload.assets.gold18k.price, null);
  assert.equal(coldFailure.payload.assets.gold18k.isStale, true);
  assert.equal(coldFailure.payload.assets.usd.price, BASE_PRICES.usd);
});

test("all cold failures produce an offline payload and a 503", async () => {
  const registry = createRegistry({
    fx: async () => {
      throw engineError("network");
    },
    gold18: async () => {
      throw engineError("blocked");
    },
    gold24: async () => {
      throw engineError("http");
    },
  });

  const { payload, refresh } = await resolvePrices({
    now: T0,
    registry,
    coldStartMaxWaitMs: 200,
  });

  assert.equal(refresh, null);
  assert.equal(payload.status, "offline");
  assert.equal(payload.updatedAt, null);
  for (const assetId of ASSET_IDS) {
    assert.equal(payload.assets[assetId].price, null);
    assert.equal(payload.assets[assetId].isStale, true);
  }

  const response = toHttpResponse(payload);
  assert.equal(response.status, 503);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal(response.headers["Retry-After"], "5");
});

test("buildOfflinePayload returns full contract shape and order", () => {
  const payload = buildOfflinePayload();

  assert.deepEqual(Object.keys(payload), [
    "updatedAt",
    "status",
    "currency",
    "assets",
  ]);
  assert.equal(payload.status, "offline");
  assert.equal(payload.updatedAt, null);
  assert.equal(payload.currency, "تومان");
  assert.deepEqual(Object.keys(payload.assets), ASSET_IDS);

  for (const assetId of ASSET_IDS) {
    assert.deepEqual(Object.keys(payload.assets[assetId]), [
      "id",
      "title",
      "unit",
      "price",
      "previousPrice",
      "changePercent",
      "isStale",
    ]);
    assert.equal(payload.assets[assetId].price, null);
    assert.equal(payload.assets[assetId].previousPrice, null);
    assert.equal(payload.assets[assetId].changePercent, 0);
    assert.equal(payload.assets[assetId].isStale, true);
  }
});

test("toHttpResponse handles offline payload and keeps online headers exact", () => {
  const offline = buildOfflinePayload();
  const offlineResponse = toHttpResponse(offline);

  assert.equal(offlineResponse.status, 503);
  assert.equal(offlineResponse.headers["Cache-Control"], "no-store");
  assert.equal(offlineResponse.headers["Retry-After"], "5");
  assert.equal(
    offlineResponse.headers["Content-Type"],
    "application/json; charset=utf-8",
  );
  assert.equal(offlineResponse.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(offlineResponse.body, offline);

  const registry = createRegistry();
  const online = resolvePrices({
    now: T0,
    registry,
    coldStartMaxWaitMs: 200,
  });
  const ok = toHttpResponse(
    {
      updatedAt: new Date(T0).toISOString(),
      status: "healthy",
      currency: "تومان",
      assets: Object.fromEntries(
        ASSET_IDS.map((id) => [
          id,
          {
            id,
            title: "x",
            unit: "تومان",
            price: 1,
            previousPrice: 1,
            changePercent: 0,
            isStale: false,
          },
        ]),
      ),
    },
  );

  assert.equal(ok.status, 200);
  assert.equal(
    ok.headers["Cache-Control"],
    "no-store",
  );
  assert.equal(ok.headers["Content-Type"], "application/json; charset=utf-8");
  assert.equal(ok.headers["X-Content-Type-Options"], "nosniff");
});

test("outliers are rejected and become acceptable outside the outlier window", async () => {
  let price = 1_000;
  const registry = oneGroupRegistry(async ({ now }) =>
    resultFor({ usd: price }, now),
  );

  const cold = await resolvePrices({
    now: T0,
    registry,
    coldStartMaxWaitMs: 200,
  });
  assert.equal(cold.payload.assets.usd.price, 1_000);

  price = 1_200;
  const rejectedAt = T0 + 30_000;
  const rejected = await resolvePrices({
    now: rejectedAt,
    registry,
    coldStartMaxWaitMs: 200,
  });
  await rejected.refresh;

  const afterRejection = buildPayload(rejectedAt);
  assert.equal(afterRejection.assets.usd.price, 1_000);
  assert.equal(afterRejection.assets.usd.isStale, true);
  assert.equal(afterRejection.assets.usd.changePercent, 0);
  assert.equal(getAssetState("usd", rejectedAt).lastErrorCode, "outlier");

  const acceptedAt = T0 + 61_000;
  const accepted = await resolvePrices({
    now: acceptedAt,
    registry,
    coldStartMaxWaitMs: 200,
  });
  await accepted.refresh;

  const afterAcceptance = buildPayload(acceptedAt);
  assert.equal(afterAcceptance.assets.usd.price, 1_200);
  assert.equal(afterAcceptance.assets.usd.previousPrice, 1_000);
  assert.equal(afterAcceptance.assets.usd.changePercent, 20);
  assert.equal(afterAcceptance.assets.usd.isStale, false);
});

test("circuit breaker opens, stays open, half-opens once, then closes", async () => {
  let fxCalls = 0;
  const registry = oneGroupRegistry(async ({ now }) => {
    fxCalls += 1;

    if (fxCalls <= BREAKER_FAILURE_THRESHOLD) {
      throw engineError("timeout");
    }

    return resultFor({ usd: 1_000 }, now);
  });
  setEngineOverridesForTests({ registry });

  const first = await resolvePrices({ now: T0, coldStartMaxWaitMs: 200 });
  assert.equal(first.payload.assets.usd.price, null);
  assert.equal(getBreakerStatus(T0).fx.state, "closed");
  assert.equal(getBreakerStatus(T0).fx.failures, 1);

  const secondTime = T0 + MIN_RETRY_INTERVAL_MS;
  await resolvePrices({ now: secondTime, coldStartMaxWaitMs: 200 });
  assert.equal(getBreakerStatus(secondTime).fx.failures, 2);
  assert.equal(getBreakerStatus(secondTime).fx.state, "closed");

  const thirdTime = T0 + MIN_RETRY_INTERVAL_MS * 2;
  await resolvePrices({ now: thirdTime, coldStartMaxWaitMs: 200 });
  assert.equal(getBreakerStatus(thirdTime).fx.failures, 3);
  assert.equal(getBreakerStatus(thirdTime).fx.state, "open");

  const beforeCooldown = thirdTime + BREAKER_COOLDOWN_MS - 1;
  const blocked = await resolvePrices({
    now: beforeCooldown,
    coldStartMaxWaitMs: 200,
  });
  assert.equal(blocked.refresh, null);
  assert.equal(fxCalls, 3);
  assert.equal(getBreakerStatus(beforeCooldown).fx.state, "open");

  const halfOpenTime = thirdTime + BREAKER_COOLDOWN_MS;
  assert.equal(getBreakerStatus(halfOpenTime).fx.state, "half-open");

  const trialResponses = await Promise.all(
    Array.from({ length: 5 }, () =>
      resolvePrices({ now: halfOpenTime, coldStartMaxWaitMs: 200 }),
    ),
  );

  assert.equal(fxCalls, 4);
  assert.equal(getBreakerStatus(halfOpenTime).fx.state, "closed");
  assert.equal(getBreakerStatus(halfOpenTime).fx.failures, 0);
  for (const response of trialResponses) {
    assert.equal(response.payload.assets.usd.price, 1_000);
  }
});

test("a retry is blocked until MIN_RETRY_INTERVAL_MS has elapsed", async () => {
  let calls = 0;
  const registry = oneGroupRegistry(async ({ now }) => {
    calls += 1;

    if (calls === 1) {
      throw engineError("network");
    }

    return resultFor({ usd: 1_000 }, now);
  });

  await resolvePrices({ now: T0, registry, coldStartMaxWaitMs: 200 });
  assert.equal(calls, 1);

  const early = await resolvePrices({
    now: T0 + MIN_RETRY_INTERVAL_MS - 1,
    registry,
    coldStartMaxWaitMs: 200,
  });
  assert.equal(early.refresh, null);
  assert.equal(early.payload.assets.usd.price, null);
  assert.equal(calls, 1);

  const retry = await resolvePrices({
    now: T0 + MIN_RETRY_INTERVAL_MS,
    registry,
    coldStartMaxWaitMs: 200,
  });
  assert.equal(calls, 2);
  assert.equal(retry.payload.assets.usd.price, 1_000);
});

test("deadline converts a hanging scraper to timeout and releases the lock", async () => {
  let calls = 0;
  const registry = oneGroupRegistry(async ({ now }) => {
    calls += 1;

    if (calls === 1) {
      return new Promise(() => {});
    }

    return resultFor({ usd: 1_000 }, now);
  });

  const first = await resolvePrices({
    now: T0,
    registry,
    deadlineMs: 50,
    coldStartMaxWaitMs: 500,
  });

  assert.equal(first.payload.assets.usd.price, null);
  assert.equal(getAssetState("usd", T0).lastErrorCode, "timeout");
  assert.equal(isRefreshing("engine:fx", T0), false);
  assert.equal(calls, 1);

  const retry = await resolvePrices({
    now: T0 + MIN_RETRY_INTERVAL_MS,
    registry,
    deadlineMs: 50,
    coldStartMaxWaitMs: 500,
  });

  assert.equal(calls, 2);
  assert.equal(retry.payload.assets.usd.price, 1_000);
});

test("cold-start wait is bounded and the refresh continues afterwards", async () => {
  const gate = deferred();
  let calls = 0;
  const registry = oneGroupRegistry(async ({ now }) => {
    calls += 1;
    await gate.promise;
    return resultFor({ usd: 1_000 }, now);
  });

  const cold = await resolvePrices({
    now: T0,
    registry,
    coldStartMaxWaitMs: 20,
    deadlineMs: 500,
  });

  assert.equal(cold.payload.assets.usd.price, null);
  assert.notEqual(cold.refresh, null);
  assert.equal(calls, 1);

  gate.resolve();
  await cold.refresh;

  const next = await resolvePrices({
    now: T0 + 1_000,
    registry,
    coldStartMaxWaitMs: 200,
  });

  assert.equal(next.refresh, null);
  assert.equal(next.payload.assets.usd.price, 1_000);
  assert.equal(calls, 1);
});

test("a missing scraper price fails only that asset with parse", async () => {
  const registry = oneGroupRegistry(
    async ({ now }) => resultFor({ usd: 1_000 }, now),
    ["usd", "usdt"],
  );

  const { payload, refresh } = await resolvePrices({
    now: T0,
    registry,
    coldStartMaxWaitMs: 200,
  });

  assert.equal(refresh, null);
  assert.equal(payload.assets.usd.price, 1_000);
  assert.equal(payload.assets.usdt.price, null);
  assert.equal(payload.assets.usdt.isStale, true);
  assert.equal(getAssetState("usdt", T0).lastErrorCode, "parse");
});

test("payload has the exact whitelist shape and order", async () => {
  const registry = createRegistry();
  const { payload } = await resolvePrices({
    now: T0,
    registry,
    coldStartMaxWaitMs: 200,
  });

  assert.deepEqual(Object.keys(payload), [
    "updatedAt",
    "status",
    "currency",
    "assets",
  ]);
  assert.deepEqual(Object.keys(payload.assets), ASSET_IDS);

  for (const assetId of ASSET_IDS) {
    assert.deepEqual(Object.keys(payload.assets[assetId]), [
      "id",
      "title",
      "unit",
      "price",
      "previousPrice",
      "changePercent",
      "isStale",
    ]);
  }

  const serialized = JSON.stringify(payload);
  for (const forbidden of [
    "source",
    "lastErrorCode",
    "consecutiveFailures",
    "meta",
    "via",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("toHttpResponse returns the 200 and 503 headers for both states", async () => {
  const registry = createRegistry();
  const online = await resolvePrices({
    now: T0,
    registry,
    coldStartMaxWaitMs: 200,
  });
  const ok = toHttpResponse(online.payload);

  assert.equal(ok.status, 200);
  assert.equal(
    ok.headers["Cache-Control"],
    "no-store",
  );
  assert.equal(ok.headers["Content-Type"], "application/json; charset=utf-8");
  assert.equal(ok.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(ok.body, online.payload);
  assert.equal(Object.hasOwn(ok.headers, "Set-Cookie"), false);
  assert.equal(Object.hasOwn(ok.headers, "Access-Control-Allow-Origin"), false);

  resetEngineForTests();
  const offline = buildPayload(T0);
  const unavailable = toHttpResponse(offline);

  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers["Cache-Control"], "no-store");
  assert.equal(unavailable.headers["Retry-After"], "5");
  assert.equal(
    unavailable.headers["Content-Type"],
    "application/json; charset=utf-8",
  );
  assert.equal(unavailable.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(unavailable.body, offline);
});

test("implementation files and engine logs contain no provider names", async () => {
  const forbidden = /wallex|talasea|tgju/i;
  const files = [
    "../lib/priceEngine.js",
    "../lib/pricesResponse.js",
    "../app/api/prices/route.js",
  ];

  for (const file of files) {
    const content = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(content, forbidden);
  }

  const logs = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    logs.push(args.join(" "));
  };

  try {
    const registry = oneGroupRegistry(async () => {
      throw engineError("network", "wallex");
    });
    setEngineOverridesForTests({ registry });

    for (let index = 0; index < BREAKER_FAILURE_THRESHOLD; index += 1) {
      await resolvePrices({
        now: T0 + index * MIN_RETRY_INTERVAL_MS,
        coldStartMaxWaitMs: 200,
      });
    }
  } finally {
    console.warn = originalWarn;
  }

  const engineLogs = logs.filter((line) => line.startsWith("[price-engine]"));
  assert.ok(engineLogs.length > 0);
  for (const line of engineLogs) {
    assert.doesNotMatch(line, forbidden);
  }
});

test("engine test helpers throw in production", () => {
  const original = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = "production";
    assert.throws(() => resetEngineForTests(), /production/i);
    assert.throws(() => setEngineOverridesForTests({}), /production/i);
  } finally {
    if (original === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = original;
    }
  }
});
