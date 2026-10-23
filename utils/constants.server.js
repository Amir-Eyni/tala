import "server-only";

/**
 * Server-only data source configuration.
 *
 * Only this file and lib/scrapers/ may reference upstream provider names.
 * Any URL that could not be verified with a live request stays empty so the
 * corresponding scraper fails with ScraperError.code === "config".
 *
 * @type {{ wallex: string, talaseaJson: string, talasea: string, tgju: string }}
 */
export const SOURCE_URLS = {
  // Verified live: JSON market list, HTTP 200.
  wallex: "https://api.wallex.ir/v1/markets",
  // Verified live: JSON level prices, HTTP 200.
  talaseaJson: "https://alibaba-gateway.talasea.ir/level/prices",
  // Not verified: the public HTML page answers with an ArvanCloud cookie
  // challenge (HTTP 307 redirecting to itself). Do not bypass it.
  talasea: "",
  // Verified live: HTML page, HTTP 200.
  tgju: "https://www.tgju.org/profile/geram24/today",
};

/**
 * Allowed response host per source. A redirect to any other host (or a
 * subdomain of it) is rejected with ScraperError.code === "blocked".
 *
 * @type {{ wallex: string, talaseaJson: string, talasea: string, tgju: string }}
 */
export const EXPECTED_HOSTS = {
  wallex: "api.wallex.ir",
  talaseaJson: "alibaba-gateway.talasea.ir",
  talasea: "talasea.ir",
  tgju: "www.tgju.org",
};

/**
 * Real desktop Chrome user agent. Shared by all outbound requests.
 * @type {string}
 */
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

/**
 * Hard cap for a single response body.
 * @type {number}
 */
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/**
 * Symbol of the toman-quoted tether market.
 * @type {string}
 */
export const WALLEX_SYMBOL = "USDTTMN";

/**
 * Stable identifier for the 18-karat gold instrument in the JSON feed.
 * @type {string}
 */
export const TALASEA_GOLD18_SYMBOL = "GOLD18/IRT";

/**
 * Path to the accepted price inside the JSON feed: data[].baseUnitPrice.
 * The matching array item is selected by TALASEA_GOLD18_SYMBOL.
 * @type {string[]}
 */
export const TALASEA_JSON_PATH = ["data", "baseUnitPrice"];

/**
 * Unit reported by the JSON feed for baseUnitPrice.
 * Verified live: priceCurrency "TOMAN", unitCode "GRAM".
 * @type {"toman" | "rial"}
 */
export const TALASEA_UNIT = "toman";

/**
 * Verified DOM selectors for the HTML fallback, ordered by preference.
 * Empty because the live HTML page is behind a cookie challenge and no
 * selector could be verified. fetch() therefore returns "config".
 * @type {string[]}
 */
export const TALASEA_SELECTORS = [];

/**
 * Unit reported by the verified TGJU page.
 * Verified live: 362,971,000 for gram 24k, i.e. rial per gram.
 * @type {"toman" | "rial"}
 */
export const TGJU_UNIT = "rial";

/**
 * Selectors for the 24-karat gram price, ordered by preference.
 * Verified live against the page HTML: the first selector matched three
 * nodes, all with the same price; no nth-child selector is needed.
 * @type {string[]}
 */
export const TGJU_SELECTORS = [
  '[data-col="info.last_trade.PDrCotVal"]',
  ".top-mobile-block .price",
  ".price",
];
