import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import {
  ASSET_IDS,
  SINGLE_FLIGHT_MAX_LOCK_MS,
  TTL_SECONDS,
} from "../utils/constants.js";
import {
  commitPrice,
  getAssetState,
  getHealth,
  getLastGood,
  getSnapshot,
  isRefreshing,
  recordFailure,
  resetCacheForTests,
  singleFlight,
} from "../lib/cache.js";

const T0 = 1_700_000_000_000;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

beforeEach(() => {
  resetCacheForTests();
});

test("initial state is empty and fully unhealthy", () => {
  assert.equal(getHealth(T0), "offline");

  for (const id of ASSET_IDS) {
    assert.equal(getLastGood(id), null);
    assert.deepEqual(getAssetState(id, T0), {
      id,
      price: null,
      previousPrice: null,
      high24h: null,
      low24h: null,
      updatedAt: null,
      ageSeconds: null,
      ttlSeconds: TTL_SECONDS[id],
      isStale: true,
      needsRefresh: true,
      lastErrorCode: null,
    });
  }

  const snapshot = getSnapshot(T0);
  assert.deepEqual(Object.keys(snapshot.assets), ASSET_IDS);
  assert.equal(snapshot.health, "offline");
  assert.equal(snapshot.generatedAt, new Date(T0).toISOString());
  assert.equal(getAssetState("unknown", T0), null);
  assert.equal(getLastGood("unknown"), null);
});

test("first commit sets previousPrice to price and getLastGood matches validator input", () => {
  assert.equal(commitPrice("usd", 1_000, T0), true);

  assert.deepEqual(getLastGood("usd"), {
    price: 1_000,
    updatedAt: T0,
  });

  const state = getAssetState("usd", T0);
  assert.equal(state.previousPrice, 1_000);
  assert.equal(state.price, 1_000);
  assert.equal(state.updatedAt, new Date(T0).toISOString());
  assert.equal(state.ageSeconds, 0);
  assert.equal(state.ttlSeconds, TTL_SECONDS.usd);
  assert.equal(state.needsRefresh, false);
  assert.equal(state.isStale, false);
  assert.equal(state.lastErrorCode, null);
  assert.equal(getHealth(T0), "stale");
});

test("different prices move previousPrice while equal prices keep it", () => {
  commitPrice("usd", 1_000, T0);

  assert.equal(commitPrice("usd", 2_000, T0 + 1_000), true);
  let state = getAssetState("usd", T0 + 1_000);
  assert.equal(state.price, 2_000);
  assert.equal(state.previousPrice, 1_000);
  assert.equal(state.updatedAt, new Date(T0 + 1_000).toISOString());

  assert.equal(commitPrice("usd", 2_000, T0 + 2_000), true);
  state = getAssetState("usd", T0 + 2_000);
  assert.equal(state.price, 2_000);
  assert.equal(state.previousPrice, 1_000);
  assert.equal(state.updatedAt, new Date(T0 + 2_000).toISOString());
  assert.equal(getLastGood("usd").updatedAt, T0 + 2_000);
});

test("cache retains only validated 24-hour extrema and expires them after a day", () => {
  const range = { high24h: 1_200, low24h: 800 };
  assert.equal(commitPrice("usd", 1_000, T0, range), true);

  let state = getAssetState("usd", T0 + 1_000);
  assert.equal(state.high24h, 1_200);
  assert.equal(state.low24h, 800);

  state = getAssetState("usd", T0 + 24 * 60 * 60 * 1000 + 1);
  assert.equal(state.high24h, null);
  assert.equal(state.low24h, null);

  assert.equal(
    commitPrice("usd", 1_000, T0, { high24h: 900, low24h: 800 }),
    true,
  );
  state = getAssetState("usd", T0);
  assert.equal(state.high24h, null);
  assert.equal(state.low24h, null);
});

test("invalid commits return false without changing state", () => {
  const baseline = getSnapshot(T0);
  const cases = [
    ["usd", 0],
    ["usd", -1],
    ["usd", 12.5],
    ["usd", Number.NaN],
    ["usd", Number.POSITIVE_INFINITY],
    ["usd", "1000"],
    ["usd", null],
    ["unknown", 1_000],
    [null, 1_000],
  ];

  for (const [id, price] of cases) {
    assert.equal(commitPrice(id, price, T0), false);
    assert.deepEqual(getSnapshot(T0), baseline);
  }

  assert.equal(recordFailure("unknown", "timeout", T0), false);
  assert.deepEqual(getSnapshot(T0), baseline);
});

test("recordFailure preserves price and updatedAt, marks stale, and commit recovers", () => {
  commitPrice("usd", 1_000, T0);
  const lastGood = getLastGood("usd");

  assert.equal(recordFailure("usd", "timeout", T0 + 1_000), true);
  assert.deepEqual(getLastGood("usd"), lastGood);

  let state = getAssetState("usd", T0 + 1_000);
  assert.equal(state.price, 1_000);
  assert.equal(state.previousPrice, 1_000);
  assert.equal(state.updatedAt, new Date(T0).toISOString());
  assert.equal(state.ageSeconds, 1);
  assert.equal(state.lastErrorCode, "timeout");
  assert.equal(state.isStale, true);
  assert.equal(state.needsRefresh, false);

  assert.equal(recordFailure("usd", 42, T0 + 2_000), true);
  state = getAssetState("usd", T0 + 2_000);
  assert.equal(state.lastErrorCode, "unknown");
  assert.equal(state.isStale, true);

  assert.equal(commitPrice("usd", 1_000, T0 + 3_000), true);
  state = getAssetState("usd", T0 + 3_000);
  assert.equal(state.price, 1_000);
  assert.equal(state.previousPrice, 1_000);
  assert.equal(state.updatedAt, new Date(T0 + 3_000).toISOString());
  assert.equal(state.lastErrorCode, null);
  assert.equal(state.isStale, false);
  assert.equal(state.needsRefresh, false);
});

test("needsRefresh starts exactly after the TTL", () => {
  commitPrice("usdt", 500, T0);
  const ttlMs = TTL_SECONDS.usdt * 1_000;

  let state = getAssetState("usdt", T0 + ttlMs);
  assert.equal(state.ageSeconds, TTL_SECONDS.usdt);
  assert.equal(state.needsRefresh, false);
  assert.equal(state.isStale, false);

  state = getAssetState("usdt", T0 + ttlMs + 1_000);
  assert.equal(state.needsRefresh, true);
  assert.equal(state.isStale, false);
});

test("isStale follows the three-times-TTL age threshold", () => {
  commitPrice("gold24k", 700, T0);
  const staleAfterMs = TTL_SECONDS.gold24k * 1_000 * 3;

  let state = getAssetState("gold24k", T0 + staleAfterMs);
  assert.equal(state.ageSeconds, TTL_SECONDS.gold24k * 3);
  assert.equal(state.lastErrorCode, null);
  assert.equal(state.isStale, false);

  state = getAssetState("gold24k", T0 + staleAfterMs + 1);
  assert.equal(state.isStale, true);
});

test("health is healthy, stale, or offline for the three known scenarios", () => {
  for (const id of ASSET_IDS) {
    commitPrice(id, 1_000, T0);
  }

  assert.equal(getHealth(T0), "healthy");

  recordFailure("usd", "timeout", T0 + 1);
  assert.equal(getHealth(T0 + 1), "stale");

  for (const id of ASSET_IDS) {
    recordFailure(id, "network", T0 + 2);
  }
  assert.equal(getHealth(T0 + 2), "offline");

  resetCacheForTests();
  assert.equal(getHealth(T0), "offline");
});

test("snapshot is a deep copy and contains no source key", () => {
  commitPrice("usd", 1_000, T0);
  const snapshot = getSnapshot(T0);

  snapshot.assets.usd.price = 99_999;
  snapshot.assets.usd.previousPrice = 88_888;
  snapshot.assets.usd.updatedAt = null;
  snapshot.assets.usd.isStale = true;
  snapshot.assets.extra = { price: 1 };
  snapshot.health = "offline";
  snapshot.generatedAt = "tampered";

  assert.deepEqual(getLastGood("usd"), {
    price: 1_000,
    updatedAt: T0,
  });
  assert.equal(getAssetState("usd", T0).previousPrice, 1_000);
  assert.equal(getHealth(T0), "stale");
  assert.equal(JSON.stringify(snapshot).includes('"source"'), false);
  assert.equal(Object.hasOwn(getSnapshot(T0).assets, "extra"), false);
});

test("currency records stay completely independent", () => {
  commitPrice("usd", 1_000, T0);
  commitPrice("usdt", 2_000, T0);

  assert.deepEqual(getLastGood("usd"), { price: 1_000, updatedAt: T0 });
  assert.deepEqual(getLastGood("usdt"), { price: 2_000, updatedAt: T0 });

  commitPrice("usd", 1_100, T0 + 1);
  assert.deepEqual(getLastGood("usdt"), { price: 2_000, updatedAt: T0 });

  recordFailure("usdt", "timeout", T0 + 2);
  assert.equal(getAssetState("usd", T0 + 2).isStale, false);
  assert.equal(getAssetState("usdt", T0 + 2).isStale, true);
  assert.equal(getAssetState("usdt", T0 + 2).lastErrorCode, "timeout");
});

test("two module instances share the same global state and locks", async () => {
  const first = await import("../lib/cache.js?copy=1");
  const second = await import("../lib/cache.js?copy=2");

  assert.notEqual(first, second);
  first.resetCacheForTests();
  assert.equal(first.commitPrice("usd", 1_000, T0), true);
  assert.deepEqual(second.getLastGood("usd"), {
    price: 1_000,
    updatedAt: T0,
  });

  const gate = deferred();
  const promise = first.singleFlight("shared-lock", () => gate.promise, {
    now: T0,
  });

  assert.equal(second.isRefreshing("shared-lock", T0), true);
  gate.resolve("ok");
  assert.equal(await promise, "ok");
  assert.equal(second.isRefreshing("shared-lock", T0), false);
});

test("1000 concurrent calls share one task and a later call runs again", async () => {
  const gate = deferred();
  let runs = 0;

  const promises = Array.from({ length: 1_000 }, () =>
    singleFlight(
      "burst",
      () => {
        runs += 1;
        return gate.promise;
      },
      { now: T0 },
    ),
  );

  assert.equal(new Set(promises).size, 1);
  await Promise.resolve();
  assert.equal(runs, 1);

  gate.resolve(42);
  const results = await Promise.all(promises);
  assert.equal(results.length, 1_000);
  assert.ok(results.every((value) => value === 42));
  assert.equal(isRefreshing("burst", T0), false);

  let laterRuns = 0;
  const later = await singleFlight(
    "burst",
    async () => {
      laterRuns += 1;
      return 7;
    },
    { now: T0 },
  );

  assert.equal(later, 7);
  assert.equal(laterRuns, 1);
  assert.equal(runs, 1);
});

test("rejections reach every waiter, release the lock, and keep working", async () => {
  const failure = new Error("task failed");
  let runs = 0;

  const first = singleFlight(
    "reject",
    async () => {
      runs += 1;
      throw failure;
    },
    { now: T0 },
  );
  const second = singleFlight(
    "reject",
    async () => {
      runs += 1;
      return 1;
    },
    { now: T0 },
  );

  assert.equal(first, second);
  const settled = await Promise.allSettled([first, second]);
  assert.equal(settled.length, 2);
  for (const result of settled) {
    assert.equal(result.status, "rejected");
    assert.equal(result.reason, failure);
  }
  assert.equal(runs, 1);
  assert.equal(isRefreshing("reject", T0), false);

  const recovered = await singleFlight(
    "reject",
    async () => {
      runs += 1;
      return "recovered";
    },
    { now: T0 },
  );

  assert.equal(recovered, "recovered");
  assert.equal(runs, 2);

  let syncPromise;
  assert.doesNotThrow(() => {
    syncPromise = singleFlight(
      "sync-throw",
      () => {
        throw new Error("sync failure");
      },
      { now: T0 },
    );
  });

  await assert.rejects(syncPromise, /sync failure/);
  assert.equal(isRefreshing("sync-throw", T0), false);
  assert.equal(
    await singleFlight("sync-throw", async () => 9, { now: T0 }),
    9,
  );
});

test("different keys run independently", async () => {
  const gateA = deferred();
  const gateB = deferred();
  let runsA = 0;
  let runsB = 0;

  const promiseA = singleFlight(
    "key-a",
    () => {
      runsA += 1;
      return gateA.promise;
    },
    { now: T0 },
  );
  const promiseB = singleFlight(
    "key-b",
    () => {
      runsB += 1;
      return gateB.promise;
    },
    { now: T0 },
  );

  assert.notEqual(promiseA, promiseB);
  await Promise.resolve();
  assert.equal(runsA, 1);
  assert.equal(runsB, 1);
  assert.equal(isRefreshing("key-a", T0), true);
  assert.equal(isRefreshing("key-b", T0), true);

  gateA.resolve("A");
  gateB.resolve("B");
  assert.deepEqual(await Promise.all([promiseA, promiseB]), ["A", "B"]);
  assert.equal(isRefreshing("key-a", T0), false);
  assert.equal(isRefreshing("key-b", T0), false);
});

test("an expired lock starts a new task and late completion cannot erase it", async () => {
  const oldGate = deferred();
  const newGate = deferred();
  let runs = 0;

  const oldPromise = singleFlight(
    "stuck",
    () => {
      runs += 1;
      return oldGate.promise;
    },
    { now: T0 },
  );

  await Promise.resolve();
  assert.equal(runs, 1);
  assert.equal(
    isRefreshing("stuck", T0 + SINGLE_FLIGHT_MAX_LOCK_MS),
    true,
  );

  const reused = singleFlight(
    "stuck",
    () => {
      runs += 1;
      return "must not run";
    },
    { now: T0 + SINGLE_FLIGHT_MAX_LOCK_MS },
  );
  assert.equal(reused, oldPromise);
  assert.equal(runs, 1);

  assert.equal(
    isRefreshing("stuck", T0 + SINGLE_FLIGHT_MAX_LOCK_MS + 1),
    false,
  );

  const newPromise = singleFlight(
    "stuck",
    () => {
      runs += 1;
      return newGate.promise;
    },
    { now: T0 + SINGLE_FLIGHT_MAX_LOCK_MS + 1 },
  );

  assert.notEqual(newPromise, oldPromise);
  await Promise.resolve();
  assert.equal(runs, 2);
  assert.equal(
    isRefreshing("stuck", T0 + SINGLE_FLIGHT_MAX_LOCK_MS + 1),
    true,
  );

  oldGate.resolve("old");
  assert.equal(await oldPromise, "old");
  assert.equal(
    isRefreshing("stuck", T0 + SINGLE_FLIGHT_MAX_LOCK_MS + 2),
    true,
  );

  const stillNew = singleFlight(
    "stuck",
    () => {
      runs += 1;
      return "must not run either";
    },
    { now: T0 + SINGLE_FLIGHT_MAX_LOCK_MS + 2 },
  );
  assert.equal(stillNew, newPromise);
  assert.equal(runs, 2);

  newGate.resolve("new");
  assert.equal(await newPromise, "new");
  assert.equal(
    isRefreshing("stuck", T0 + SINGLE_FLIGHT_MAX_LOCK_MS + 2),
    false,
  );
});

test("reset is rejected in production", () => {
  const original = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = "production";
    assert.throws(
      () => resetCacheForTests(),
      /not allowed in production/,
    );
  } finally {
    if (original === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = original;
    }
  }
});

test("cache outputs and errors contain no provider names or source field", () => {
  const forbidden = ["wal" + "lex", "tala" + "sea", "tg" + "ju"];
  const outputs = [
    JSON.stringify(getSnapshot(T0)),
    JSON.stringify(getAssetState("usd", T0)),
    JSON.stringify(getLastGood("usd")),
    getHealth(T0),
  ].map((value) => value.toLowerCase());

  for (const value of outputs) {
    for (const term of forbidden) {
      assert.equal(value.includes(term), false);
    }

    assert.equal(value.includes('"source"'), false);
  }

  let resetError;
  const original = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = "production";
    resetCacheForTests();
  } catch (error) {
    resetError = error;
  } finally {
    if (original === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = original;
    }
  }

  assert.ok(resetError instanceof Error);

  for (const term of forbidden) {
    assert.equal(resetError.message.toLowerCase().includes(term), false);
  }
});
