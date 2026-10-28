import assert from "node:assert/strict";
import test from "node:test";

import { ASSET_IDS } from "../utils/constants.js";
import { fetchPrices } from "../utils/pricesClient.js";

function createPayload(status = "healthy") {
  return {
    updatedAt: "2026-10-26T12:00:00.000Z",
    status,
    currency: "تومان",
    assets: Object.fromEntries(
      ASSET_IDS.map((id) => [
        id,
        {
          id,
          title: id,
          unit: id.startsWith("gold") ? "گرم" : "واحد",
          price: status === "offline" ? null : 1_000,
          previousPrice: status === "offline" ? null : 990,
          ...(status === "offline" ? {} : { changePercent: 1.01 }),
          isStale: status !== "healthy",
        },
      ]),
    ),
  };
}

async function withFetch(mockFetch, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;

  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("fetchPrices requests the no-store prices endpoint and returns valid data", async () => {
  const payload = createPayload();

  await withFetch(async (url, options) => {
    assert.equal(url, "/api/prices");
    assert.deepEqual(options, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return Response.json(payload);
  }, async () => {
    assert.deepEqual(await fetchPrices(), payload);
  });
});

test("fetchPrices accepts a complete offline payload returned with 503", async () => {
  const payload = createPayload("offline");

  await withFetch(
    async () => Response.json(payload, { status: 503 }),
    async () => {
      assert.deepEqual(await fetchPrices(), payload);
    },
  );
});

test("fetchPrices accepts optional valid 24-hour extrema", async () => {
  const payload = createPayload();
  for (const asset of Object.values(payload.assets)) {
    asset.high24h = 1_100;
    asset.low24h = 900;
  }

  await withFetch(
    async () => Response.json(payload),
    async () => {
      assert.deepEqual(await fetchPrices(), payload);
    },
  );
});

test("fetchPrices accepts payloads without an upstream percentage", async () => {
  const payload = createPayload();
  for (const asset of Object.values(payload.assets)) {
    delete asset.changePercent;
  }

  await withFetch(
    async () => Response.json(payload),
    async () => {
      assert.deepEqual(await fetchPrices(), payload);
    },
  );
});

test("fetchPrices rejects a malformed upstream percentage", async () => {
  const payload = createPayload();
  payload.assets.gold18k.changePercent = "1.25";

  await withFetch(
    async () => Response.json(payload),
    async () => {
      await assert.rejects(fetchPrices(), /invalid response/i);
    },
  );
});

test("fetchPrices rejects incomplete or inconsistent 24-hour extrema", async () => {
  const payload = createPayload();
  payload.assets.usd.high24h = 1_100;

  await withFetch(
    async () => Response.json(payload),
    async () => {
      await assert.rejects(fetchPrices(), /invalid response/);
    },
  );
});

test("fetchPrices rejects other unsuccessful responses", async () => {
  await withFetch(
    async () => new Response(null, { status: 500 }),
    async () => {
      await assert.rejects(fetchPrices(), /temporarily unavailable/);
    },
  );
});

test("fetchPrices rejects malformed API payloads", async () => {
  await withFetch(
    async () => Response.json({ status: "offline" }, { status: 503 }),
    async () => {
      await assert.rejects(fetchPrices(), /invalid response/);
    },
  );
});
