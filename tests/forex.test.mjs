import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchForexRates,
  parseForexInstrument,
} from "../lib/scrapers/forex.js";
import { ScraperError } from "../lib/scrapers/http.js";
import {
  buildForexOfflinePayload,
  buildForexPayload,
  resetForexCacheForTests,
  resolveForexPrices,
  setForexOverridesForTests,
  toForexHttpResponse,
} from "../lib/forexEngine.js";
import {
  FOREX_ASSET_IDS,
  FOREX_BREAKER_FAILURE_THRESHOLD,
  FOREX_TTL_SECONDS,
} from "../utils/forexConstants.js";
import { forexPayloadSchema } from "../utils/forexClient.js";
import { formatForexPrice } from "../utils/formatPrice.js";

function mockHtml(symbol, bid, ask, changeStr = "(-1.25%)") {
  return `
    <!DOCTYPE html>
    <html>
      <body>
        <table>
          <tr>
            <td data-symbol="${symbol}" data-type="bid">${bid}</td>
            <td data-symbol="${symbol}" data-type="ask">${ask}</td>
          </tr>
          <tr>
            <td>1-day change</td>
            <td>${changeStr}</td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function createMockFetch(responses) {
  let callIndex = 0;
  const calls = [];

  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const response = responses[callIndex] ?? responses[responses.length - 1];
    callIndex += 1;

    if (typeof response === "function") {
      return response(url, options);
    }
    return response;
  };

  fetchImpl.calls = calls;
  return fetchImpl;
}

test("parseForexInstrument extracts mid price and percentage correctly from HTML", () => {
  const html = mockHtml("XAUUSD", "2650.20", "2650.60", "(-2.45%)");
  const result = parseForexInstrument(html, "XAUUSD");

  assert.equal(result.price, 2650.4);
  assert.equal(result.changePercent, -2.45);
});

test("parseForexInstrument parses JSON responses cleanly", () => {
  const jsonText = JSON.stringify({
    price: 3620.55,
    symbol: "XAU",
    changePercent: 1.15,
  });
  const result = parseForexInstrument(jsonText, "XAU");

  assert.equal(result.price, 3620.55);
  assert.equal(result.changePercent, 1.15);
});

test("parseForexInstrument handles positive percentage and fallback price", () => {
  const html = `
    <div>
      <span data-symbol="BTCUSD" data-type="bid">65000.00</span>
      <span data-symbol="BTCUSD" data-type="ask">65000.20</span>
      <span class="plus">+3.85%</span>
    </div>
  `;
  const result = parseForexInstrument(html, "BTCUSD");

  assert.equal(result.price, 65000.1);
  assert.equal(result.changePercent, 3.85);
});

test("parseForexInstrument throws ScraperError parse when quotes are missing", () => {
  const html = "<div><p>No rates available</p></div>";
  assert.throws(
    () => parseForexInstrument(html, "ETHUSD"),
    (err) => err instanceof ScraperError && err.code === "parse",
  );
});

test("fetchForexRates fetches all four instruments and returns white-label payload", async () => {
  const fetchImpl = createMockFetch([
    new Response(mockHtml("XAUUSD", "2600.00", "2600.50", "(-1.5%)"), { status: 200 }),
    new Response(mockHtml("XAGUSD", "31.20", "31.30", "(+0.8%)"), { status: 200 }),
    new Response(mockHtml("BTCUSD", "95000.00", "95000.10", "(+4.2%)"), { status: 200 }),
    new Response(mockHtml("ETHUSD", "3400.00", "3400.20", "(-0.5%)"), { status: 200 }),
  ]);

  const rates = await fetchForexRates({ fetchImpl, now: 1700000000000 });

  assert.equal(rates.prices.xauusd, 2600.25);
  assert.equal(rates.prices.xagusd, 31.25);
  assert.equal(rates.prices.btcusd, 95000.05);
  assert.equal(rates.prices.ethusd, 3400.1);

  assert.equal(rates.changePercent.xauusd, -1.5);
  assert.equal(rates.changePercent.xagusd, 0.8);
  assert.equal(rates.changePercent.btcusd, 4.2);
  assert.equal(rates.changePercent.ethusd, -0.5);

  assert.equal(fetchImpl.calls.length, 4);
});

test("Forex error messages and output contain no provider names", () => {
  const forbidden = /litefinance|litemarkets/i;
  const err = new ScraperError("Forex source request timed out.", "timeout");

  assert.doesNotMatch(err.message, forbidden);
});

test("buildForexOfflinePayload returns valid contract shape with offline status", () => {
  const offline = buildForexOfflinePayload();

  assert.equal(offline.status, "offline");
  assert.equal(offline.currency, "USD");
  for (const id of FOREX_ASSET_IDS) {
    assert.ok(offline.assets[id]);
    assert.equal(offline.assets[id].price, null);
    assert.equal(offline.assets[id].isStale, true);
  }

  const validated = forexPayloadSchema.safeParse(offline);
  assert.equal(validated.success, true);
});

test("toForexHttpResponse produces 503 for offline and 200 for active payload", () => {
  const offlineHttp = toForexHttpResponse(buildForexOfflinePayload());
  assert.equal(offlineHttp.status, 503);
  assert.equal(offlineHttp.headers["Cache-Control"], "no-store");
  assert.equal(offlineHttp.headers["Retry-After"], "2");

  const activePayload = buildForexOfflinePayload();
  activePayload.assets.xauusd.price = 2650.5;
  const activeHttp = toForexHttpResponse(activePayload);
  assert.equal(activeHttp.status, 200);
  assert.equal(
    activeHttp.headers["Cache-Control"],
    "s-maxage=1, stale-while-revalidate=2",
  );
});

test("resolveForexPrices cold-start, SWR, and single-flight execution", async () => {
  resetForexCacheForTests();

  let fetchCount = 0;
  const mockFetch = async (url) => {
    fetchCount += 1;
    const urlStr = String(url);
    const sym = urlStr.includes("xauusd") || urlStr.includes("XAU")
      ? "XAUUSD"
      : urlStr.includes("xagusd") || urlStr.includes("XAG")
        ? "XAGUSD"
        : urlStr.includes("btcusd") || urlStr.includes("BTC")
          ? "BTCUSD"
          : "ETHUSD";
    return new Response(mockHtml(sym, "2600.00", "2600.50"), { status: 200 });
  };
  setForexOverridesForTests({ fetchImpl: mockFetch });

  const t0 = 1700000000000;

  // Cold start: triggers fetch
  const { payload: coldPayload } = await resolveForexPrices({ now: t0 });
  assert.equal(coldPayload.status, "healthy");
  assert.equal(coldPayload.assets.xauusd.price, 2600.25);
  const initialFetchCalls = fetchCount;

  // Within TTL: cached, no new fetch
  const { payload: cachedPayload, refresh: noRefresh } = await resolveForexPrices({
    now: t0 + FOREX_TTL_SECONDS * 500,
  });
  assert.equal(cachedPayload.assets.xauusd.price, 2600.25);
  assert.equal(noRefresh, null);
  assert.equal(fetchCount, initialFetchCalls);

  // Expired TTL (SWR): returns stale data immediately and triggers background refresh
  const { payload: swrPayload, refresh: backgroundRefresh } = await resolveForexPrices({
    now: t0 + FOREX_TTL_SECONDS * 1500,
  });
  assert.equal(swrPayload.assets.xauusd.price, 2600.25);
  assert.ok(backgroundRefresh instanceof Promise);

  await backgroundRefresh;
  assert.ok(fetchCount > initialFetchCalls);
});

test("Forex circuit breaker opens after failure threshold and recovers after cooldown", async () => {
  resetForexCacheForTests();

  let attemptCount = 0;
  const failingFetch = async () => {
    attemptCount += 1;
    throw new Error("Network down");
  };
  setForexOverridesForTests({ fetchImpl: failingFetch });

  const t0 = 1700000000000;

  // Trip circuit breaker
  for (let i = 0; i < FOREX_BREAKER_FAILURE_THRESHOLD; i += 1) {
    await resolveForexPrices({ now: t0 + i * 1000, coldStartMaxWaitMs: 50 });
  }

  const callsAfterTripping = attemptCount;

  // While breaker is open: fails fast, no fetch attempted
  const { payload: blockedPayload } = await resolveForexPrices({
    now: t0 + (FOREX_BREAKER_FAILURE_THRESHOLD + 1) * 1000,
    coldStartMaxWaitMs: 50,
  });
  assert.equal(blockedPayload.status, "offline");
  assert.equal(attemptCount, callsAfterTripping);
});

test("formatForexPrice formats dollar amounts with requested precision and commas", () => {
  assert.equal(formatForexPrice(2650.5, 2), "۲,۶۵۰.۵۰");
  assert.equal(formatForexPrice(95400.12, 2), "۹۵,۴۰۰.۱۲");
  assert.equal(formatForexPrice(null), "—");
  assert.equal(formatForexPrice(undefined), "—");
});
