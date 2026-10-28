import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MAX_RESPONSE_BYTES,
  SOURCE_URLS,
} from "../utils/constants.server.js";
import {
  fetchWithTimeout,
  fetchText,
  parseOptionalPercent,
  parsePrice,
  readTextLimited,
  ScraperError,
  toTomanInteger,
} from "../lib/scrapers/http.js";
import {
  fetchWallex,
  parseWallexPayload,
} from "../lib/scrapers/wallex.js";
import {
  fetchTalasea,
  parseTalaseaHtml,
  parseTalaseaJson,
} from "../lib/scrapers/talasea.js";
import {
  fetchTgju,
  parseTgjuHtml,
  scrapeTgjuDollar,
  scrapeTgjuEuro,
  scrapeTgjuSilver,
  scrapeTgjuCoin,
  scrapeTgjuBahar,
} from "../lib/scrapers/tgju.js";
import { SCRAPER_REGISTRY } from "../lib/scrapers/index.js";

const FIXED_NOW = new Date("2026-10-23T10:00:00.000Z");
const FIXED_ISO = FIXED_NOW.toISOString();

function fixture(name) {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

function mockResponse(body, { status = 200, url, headers = {} } = {}) {
  const response = new Response(body, { status, headers });

  if (url) {
    Object.defineProperty(response, "url", { value: url });
  }

  return response;
}

function createFetch(responses) {
  const queue = [...responses];
  const calls = [];

  const fetchImpl = async (url, init) => {
    calls.push({ url, init });

    if (queue.length === 0) {
      throw new Error("Unexpected request in test.");
    }

    const next = queue.shift();
    if (next instanceof Error) {
      throw next;
    }

    return next;
  };

  fetchImpl.calls = calls;
  return fetchImpl;
}

test("parsePrice normalizes Persian/Arabic digits and separators", () => {
  for (const value of [
    "۸٬۶۰۰٬۰۰۰",
    "8,600,000",
    "  8600000  ",
    "٨٦٠٠٠٠٠",
  ]) {
    assert.equal(parsePrice(value), 8_600_000);
  }

  assert.equal(parsePrice("6450000.7"), 6_450_001);
  assert.equal(parsePrice("۶۴۵۰۰۰۰٫۷"), 6_450_001);
});

test("parsePrice rejects invalid and non-positive values", () => {
  for (const value of ["abc", "0", "-5", ""]) {
    assert.throws(
      () => parsePrice(value),
      (error) => error instanceof ScraperError && error.code === "parse",
    );
  }
});

test("parseOptionalPercent handles signed Persian and ASCII percentages", () => {
  assert.equal(parseOptionalPercent("۱٫۲۵٪"), 1.25);
  assert.equal(parseOptionalPercent("-0.75%"), -0.75);
  assert.equal(parseOptionalPercent("not a percent"), null);
});

test("toTomanInteger converts rial with floor and toman with round", () => {
  assert.equal(toTomanInteger(86_000_000, "rial"), 8_600_000);
  assert.equal(toTomanInteger("۸۶٬۰۰۰٬۰۰۰", "rial"), 8_600_000);
  assert.equal(toTomanInteger(8_600_000.7, "toman"), 8_600_001);
  assert.throws(
    () => toTomanInteger(0, "toman"),
    (error) => error.code === "parse",
  );
  assert.throws(
    () => toTomanInteger(1, "unknown"),
    (error) => error.code === "config",
  );
});

test("wallex parser reads the requested symbol and returns an integer", () => {
  const payload = JSON.parse(fixture("wallex.json"));

  assert.equal(parseWallexPayload(payload), 273_102);
  assert.throws(
    () => parseWallexPayload({ result: { symbols: {} } }),
    (error) => error.code === "parse",
  );
});

test("fetchWallex returns the integer tether price and an ISO timestamp", async () => {
  const fetchImpl = createFetch([
    mockResponse(fixture("wallex.json"), { url: SOURCE_URLS.wallex }),
  ]);

  const result = await fetchWallex({ fetchImpl, now: FIXED_NOW });

  assert.deepEqual(result.prices, { usdt: 273_102 });
  assert.deepEqual(result.changePercent, { usdt: 0 });
  assert.equal(result.fetchedAt, FIXED_ISO);
  assert.ok(Number.isInteger(result.prices.usdt));
  assert.equal(fetchImpl.calls.length, 1);
});

test("fetchWallex exposes validated 24-hour extrema when upstream provides them", async () => {
  const payload = JSON.parse(fixture("wallex.json"));
  payload.result.symbols.USDTTMN.stats["24h_highPrice"] =
    "280000.0000000000000000";
  payload.result.symbols.USDTTMN.stats["24h_lowPrice"] =
    "260000.0000000000000000";
  payload.result.symbols.USDTTMN.stats["24h_ch"] = -1.25;
  const fetchImpl = createFetch([
    mockResponse(JSON.stringify(payload), { url: SOURCE_URLS.wallex }),
  ]);

  const result = await fetchWallex({ fetchImpl, now: FIXED_NOW });

  assert.deepEqual(result.ranges, {
    usdt: { high24h: 280_000, low24h: 260_000 },
  });
  assert.deepEqual(result.changePercent, { usdt: -1.25 });
});

test("talasea JSON path returns a toman integer per gram", () => {
  const payload = JSON.parse(fixture("talasea.json"));

  assert.equal(parseTalaseaJson(payload), 26_900_000);
});

test("fetchTalasea prefers JSON and reports via=json", async () => {
  const fetchImpl = createFetch([
    mockResponse(fixture("talasea.json"), { url: SOURCE_URLS.talaseaJson }),
    mockResponse(
      `<table><tr><td>بالاترین قیمت روز</td><td><span>270,000,000</span></td></tr><tr><td>پایین ترین قیمت روز</td><td><span>260,000,000</span></td></tr><tr><td>درصد تغییر نسبت به روز گذشته</td><td>1.42%</td></tr></table>`,
      { url: SOURCE_URLS.gold18Html },
    ),
  ]);

  const result = await fetchTalasea({ fetchImpl, now: FIXED_NOW });

  assert.deepEqual(result.prices, { gold18k: 26_900_000 });
  assert.deepEqual(result.ranges, {
    gold18k: { high24h: 27_000_000, low24h: 26_000_000 },
  });
  assert.deepEqual(result.changePercent, { gold18k: 1.42 });
  assert.equal(result.fetchedAt, FIXED_ISO);
  assert.equal(result.meta.via, "json");
  assert.ok(Number.isInteger(result.prices.gold18k));
  assert.equal(fetchImpl.calls.length, 2);
});

test("fetchTalasea exposes optional validated 24-hour extrema", async () => {
  const payload = JSON.parse(fixture("talasea.json"));
  payload.data[0].high24h = 27_500_000;
  payload.data[0].low24h = 26_000_000;
  const fetchImpl = createFetch([
    mockResponse(JSON.stringify(payload), { url: SOURCE_URLS.talaseaJson }),
    mockResponse(
      '<span data-col="info.last_trade.last_change_percentage">-0.75</span>',
      { url: SOURCE_URLS.gold18Html },
    ),
  ]);

  const result = await fetchTalasea({ fetchImpl, now: FIXED_NOW });

  assert.deepEqual(result.ranges, {
    gold18k: { high24h: 27_500_000, low24h: 26_000_000 },
  });
  assert.deepEqual(result.changePercent, { gold18k: -0.75 });
});

test("fetchTalasea falls back to DOM when JSON is invalid", async () => {
  const fetchImpl = createFetch([
    mockResponse("{broken json", { url: SOURCE_URLS.talaseaJson }),
    mockResponse(fixture("talasea.html"), {
      url: "https://www.tgju.org/profile/geram18",
    }),
  ]);

  const result = await fetchTalasea({
    fetchImpl,
    now: FIXED_NOW,
    domUrl: "https://www.tgju.org/profile/geram18",
    domSelectors: ["[data-gold18]"],
    domUnit: "toman",
  });

  assert.deepEqual(result.prices, { gold18k: 26_900_000 });
  assert.equal(result.meta.via, "dom");
  assert.equal(fetchImpl.calls.length, 2);
});

test("fetchTalasea uses the configured 18-karat HTML fallback and unit", async () => {
  const fetchImpl = createFetch([
    mockResponse("{broken json", { url: SOURCE_URLS.talaseaJson }),
    mockResponse(
      '<span data-col="info.last_trade.PDrCotVal">269,000,000</span><table><tr><td>بالاترین قیمت روز</td><td>270,000,000</td></tr><tr><td>پایین ترین قیمت روز</td><td>260,000,000</td></tr></table>',
      {
      url: SOURCE_URLS.gold18Html,
      },
    ),
  ]);

  const result = await fetchTalasea({ fetchImpl, now: FIXED_NOW });

  assert.deepEqual(result.prices, { gold18k: 26_900_000 });
  assert.deepEqual(result.ranges, {
    gold18k: { high24h: 27_000_000, low24h: 26_000_000 },
  });
  assert.deepEqual(result.changePercent, { gold18k: 0 });
  assert.equal(result.meta.via, "dom");
  assert.equal(fetchImpl.calls[1].url, SOURCE_URLS.gold18Html);
  assert.equal(fetchImpl.calls.length, 2);
});

test("fetchTalasea reports the last path error with the first error as cause", async () => {
  const fetchImpl = createFetch([
    mockResponse("{broken json", { url: SOURCE_URLS.talaseaJson }),
    mockResponse("<html><body>no price</body></html>", {
      url: "https://www.tgju.org/profile/geram18",
    }),
  ]);

  await assert.rejects(
    fetchTalasea({
      fetchImpl,
      now: FIXED_NOW,
      domUrl: "https://www.tgju.org/profile/geram18",
      domSelectors: ["[data-gold18]"],
      domUnit: "toman",
    }),
    (error) => {
      assert.equal(error.code, "parse");
      assert.ok(error.cause instanceof ScraperError);
      assert.equal(error.cause.code, "parse");
      return true;
    },
  );
});

test("fetchTalasea does not fall back on blocked responses", async () => {
  const fetchImpl = createFetch([
    mockResponse("blocked", {
      status: 403,
      url: SOURCE_URLS.talaseaJson,
    }),
  ]);

  await assert.rejects(
    fetchTalasea({ fetchImpl, now: FIXED_NOW }),
    (error) => {
      assert.equal(error.code, "blocked");
      assert.equal(error.status, 403);
      return true;
    },
  );

  assert.equal(fetchImpl.calls.length, 1);
});

test("fetchTalasea rethrows original JSON error when DOM fallback is unconfigured", async () => {
  const fetchImpl = createFetch([
    mockResponse("broken", {
      status: 500,
      url: SOURCE_URLS.talaseaJson,
    }),
  ]);

  await assert.rejects(
    fetchTalasea({ fetchImpl, now: FIXED_NOW, domUrl: "", domSelectors: [] }),
    (error) => {
      assert.equal(error.code, "http");
      assert.equal(error.status, 500);
      assert.equal(error.cause, undefined);
      return true;
    },
  );

  assert.equal(fetchImpl.calls.length, 1);
});

test("parseTalaseaHtml rejects an empty verified selector list", () => {
  assert.throws(
    () => parseTalaseaHtml(fixture("talasea.html")),
    (error) => error.code === "parse",
  );
});

test("tgju parser uses the primary selector", () => {
  assert.equal(parseTgjuHtml(fixture("tgju.html")), 86_000_000);
});

test("tgju parser falls back to the next selector", () => {
  assert.equal(parseTgjuHtml(fixture("tgju-alt.html")), 86_000_000);
});

test("tgju parser throws parse when no selector matches", () => {
  assert.throws(
    () => parseTgjuHtml("<html><body>nothing</body></html>"),
    (error) => error.code === "parse",
  );
});

test("fetchTgju converts rial to toman and returns an integer", async () => {
  const fetchImpl = createFetch([
    mockResponse(fixture("tgju.html"), { url: SOURCE_URLS.tgju }),
  ]);

  const result = await fetchTgju({ fetchImpl, now: FIXED_NOW });

  assert.deepEqual(result.prices, { gold24k: 8_600_000 });
  assert.deepEqual(result.changePercent, { gold24k: 0 });
  assert.equal(result.fetchedAt, FIXED_ISO);
  assert.ok(Number.isInteger(result.prices.gold24k));
  assert.equal(fetchImpl.calls.length, 1);
});

test("fetchTgju extracts 24-hour extrema only when the HTML has both values", async () => {
  const html = `
    <span data-col="info.last_trade.PDrCotVal">86,000,000</span>
    <span data-col="info.last_trade.last_change_percentage">-1.25</span>
    <table>
      <tr><td>بالاترین قیمت روز</td><td><span>90,000,000</span></td></tr>
      <tr><td>پایین ترین قیمت روز</td><td><span>80,000,000</span></td></tr>
    </table>
  `;
  const fetchImpl = createFetch([
    mockResponse(html, { url: SOURCE_URLS.tgju }),
  ]);

  const result = await fetchTgju({ fetchImpl, now: FIXED_NOW });

  assert.deepEqual(result.ranges, {
    gold24k: { high24h: 9_000_000, low24h: 8_000_000 },
  });
  assert.deepEqual(result.changePercent, { gold24k: -1.25 });
});

test("scrapeTgjuDollar converts quote and extrema from rial to toman", async () => {
  const html = `
    <span data-col="info.last_trade.PDrCotVal">2,710,000</span>
    <span data-col="info.last_trade.last_change_percentage">-0.45</span>
    <table>
      <tr><td>بالاترین قیمت روز</td><td><span>2,800,000</span></td></tr>
      <tr><td>پایین ترین قیمت روز</td><td><span>2,600,000</span></td></tr>
    </table>
  `;
  const fetchImpl = createFetch([
    mockResponse(html, { url: SOURCE_URLS.tgjuDollar }),
  ]);

  const result = await scrapeTgjuDollar({ fetchImpl, now: FIXED_NOW });

  assert.deepEqual(result.prices, { usd: 271_000 });
  assert.deepEqual(result.ranges, {
    usd: { high24h: 280_000, low24h: 260_000 },
  });
  assert.deepEqual(result.changePercent, { usd: -0.45 });
  assert.equal(fetchImpl.calls[0].url, SOURCE_URLS.tgjuDollar);
});

test("scrapeTgjuEuro converts quote and extrema from rial to toman", async () => {
  const html = `
    <span data-col="info.last_trade.PDrCotVal">2,998,700</span>
    <span data-col="info.last_trade.last_change_percentage">0.27</span>
    <table>
      <tr><td>بالاترین قیمت روز</td><td><span>3,012,800</span></td></tr>
      <tr><td>پایین ترین قیمت روز</td><td><span>2,990,400</span></td></tr>
    </table>
  `;
  const fetchImpl = createFetch([
    mockResponse(html, { url: SOURCE_URLS.tgjuEuro }),
  ]);

  const result = await scrapeTgjuEuro({ fetchImpl, now: FIXED_NOW });

  assert.deepEqual(result.prices, { euro: 299_870 });
  assert.deepEqual(result.ranges, {
    euro: { high24h: 301_280, low24h: 299_040 },
  });
  assert.deepEqual(result.changePercent, { euro: 0.27 });
  assert.equal(fetchImpl.calls[0].url, SOURCE_URLS.tgjuEuro);
});

test("scrapeTgjuCoin converts rial quote and daily range to toman", async () => {
  const html = `
    <span data-col="info.last_trade.PDrCotVal">2,673,400,000</span>
    <span data-col="info.last_trade.last_change_percentage">0.52</span>
    <table>
      <tr><td>بالاترین قیمت روز</td><td>2,680,400,000</td></tr>
      <tr><td>پایین ترین قیمت روز</td><td>2,672,300,000</td></tr>
    </table>
  `;
  const fetchImpl = createFetch([
    mockResponse(html, { url: SOURCE_URLS.tgjuCoin }),
  ]);

  const result = await scrapeTgjuCoin({ fetchImpl, now: FIXED_NOW });

  assert.deepEqual(result.prices, { coin: 267_340_000 });
  assert.deepEqual(result.ranges, {
    coin: { high24h: 268_040_000, low24h: 267_230_000 },
  });
  assert.deepEqual(result.changePercent, { coin: 0.52 });
  assert.equal(fetchImpl.calls[0].url, SOURCE_URLS.tgjuCoin);
});

test("scrapeTgjuBahar converts rial quote and daily range to toman", async () => {
  const html = `
    <span data-col="info.price">2,501,400,000</span>
    <span data-col="info.change_percent">0.38</span>
    <span data-col="info.high">2,510,000,000</span>
    <span data-col="info.low">2,495,000,000</span>
  `;
  const fetchImpl = createFetch([
    mockResponse(html, { url: SOURCE_URLS.tgjuBahar }),
  ]);

  const result = await scrapeTgjuBahar({ fetchImpl, now: FIXED_NOW });

  assert.deepEqual(result.prices, { bahar: 250_140_000 });
  assert.deepEqual(result.ranges, {
    bahar: { high24h: 251_000_000, low24h: 249_500_000 },
  });
  assert.deepEqual(result.changePercent, { bahar: 0.38 });
  assert.equal(fetchImpl.calls[0].url, SOURCE_URLS.tgjuBahar);
});

test("scrapeTgjuSilver converts prices and parses suffix-signed percentages", async () => {
  assert.equal(
    SCRAPER_REGISTRY.find((group) => group.id === "silver")?.fetch,
    scrapeTgjuSilver,
  );
  const html = `
    <span class="value" data-col="info.price">598,200</span>
    <span data-col="info.change_percent">1.25-</span>
    <span data-col="info.high">605,000</span>
    <span data-col="info.low">592,000</span>
  `;
  const fetchImpl = createFetch([
    mockResponse(html, { url: SOURCE_URLS.tgjuSilver }),
  ]);

  const result = await scrapeTgjuSilver({ fetchImpl, now: FIXED_NOW });

  assert.deepEqual(result.prices, { silver: 59_820 });
  assert.deepEqual(result.ranges, {
    silver: { high24h: 60_500, low24h: 59_200 },
  });
  assert.deepEqual(result.changePercent, { silver: -1.25 });
  assert.equal(fetchImpl.calls[0].url, SOURCE_URLS.tgjuSilver);
});

test("fetchWithTimeout rejects an empty URL with config", async () => {
  await assert.rejects(
    fetchWithTimeout(""),
    (error) => error.code === "config",
  );
});

test("fetchWithTimeout rejects non-HTTPS URLs with config", async () => {
  await assert.rejects(
    fetchWithTimeout("http://example.com/data"),
    (error) => error.code === "config",
  );
});

test("fetchWithTimeout converts a hanging request to timeout", async () => {
  const hangingFetch = (url, { signal }) =>
    new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });

  await assert.rejects(
    fetchWithTimeout("https://example.com/data", {
      fetchImpl: hangingFetch,
      timeoutMs: 10,
    }),
    (error) => error.code === "timeout",
  );
});

test("fetchWithTimeout rejects redirects to another host as blocked", async () => {
  const fetchImpl = createFetch([
    mockResponse("ok", { url: "https://evil.example/data" }),
  ]);

  await assert.rejects(
    fetchWithTimeout("https://api.wallex.ir/v1/markets", {
      fetchImpl,
      expectedHost: "api.wallex.ir",
    }),
    (error) => error.code === "blocked",
  );
});

test("fetchWithTimeout validates each redirect before following it", async () => {
  const fetchImpl = createFetch([
    mockResponse("", {
      status: 302,
      url: "https://api.wallex.ir/v1/markets",
      headers: { location: "https://evil.example/collect" },
    }),
  ]);

  await assert.rejects(
    fetchWithTimeout("https://api.wallex.ir/v1/markets", {
      fetchImpl,
      expectedHost: "api.wallex.ir",
    }),
    (error) => error.code === "blocked",
  );

  assert.equal(fetchImpl.calls.length, 1);
});

test("fetchWithTimeout stops redirect loops", async () => {
  const url = "https://api.wallex.ir/v1/markets";
  const fetchImpl = createFetch([
    mockResponse("", {
      status: 307,
      url,
      headers: { location: url },
    }),
  ]);

  await assert.rejects(
    fetchWithTimeout(url, {
      fetchImpl,
      expectedHost: "api.wallex.ir",
    }),
    (error) => error.code === "blocked",
  );

  assert.equal(fetchImpl.calls.length, 1);
});

test("fetchText applies its timeout to response body reading", async () => {
  const fetchImpl = async () =>
    new Response(
      new ReadableStream({
        pull() {
          return new Promise(() => {});
        },
      }),
      { status: 200 },
    );

  await assert.rejects(
    fetchText("https://api.wallex.ir/v1/markets", {
      fetchImpl,
      expectedHost: "api.wallex.ir",
      timeoutMs: 10,
    }),
    (error) => error.code === "timeout",
  );
});

test("fetchWithTimeout maps 403/429 to blocked and other errors to http", async () => {
  const blockedFetch = createFetch([
    mockResponse("no", { status: 403, url: "https://example.com/data" }),
  ]);
  await assert.rejects(
    fetchWithTimeout("https://example.com/data", { fetchImpl: blockedFetch }),
    (error) => error.code === "blocked" && error.status === 403,
  );

  const httpFetch = createFetch([
    mockResponse("boom", { status: 500, url: "https://example.com/data" }),
  ]);
  await assert.rejects(
    fetchWithTimeout("https://example.com/data", { fetchImpl: httpFetch }),
    (error) => error.code === "http" && error.status === 500,
  );
});

test("readTextLimited rejects declared oversized bodies", async () => {
  const response = mockResponse("small", {
    headers: { "content-length": String(MAX_RESPONSE_BYTES + 1) },
  });

  await assert.rejects(
    readTextLimited(response),
    (error) => error.code === "too-large",
  );
});

test("readTextLimited rejects streamed oversized bodies", async () => {
  const response = new Response("x".repeat(MAX_RESPONSE_BYTES + 1));

  await assert.rejects(
    readTextLimited(response),
    (error) => error.code === "too-large",
  );
});

test("error messages stay neutral and never contain provider names or URLs", () => {
  const messages = [
    new ScraperError("Source request timed out.", "timeout").message,
    new ScraperError("Source rejected the request.", "blocked").message,
    new ScraperError("Source returned invalid JSON.", "parse").message,
    new ScraperError("Source response is too large.", "too-large").message,
    new ScraperError("Price must be a positive number.", "parse").message,
  ];

  for (const message of messages) {
    assert.doesNotMatch(message, /wallex|talasea|tgju|https?:\/\//i);
  }
});
