/**
 * Supported asset identifiers in display order.
 * @type {string[]}
 */
export const ASSET_IDS = ["gold18k", "gold24k", "usd", "usdt"];

/**
 * Public metadata for every supported asset.
 * @type {Record<string, { id: string, title: string, unit: string }>}
 */
export const ASSETS = {
  gold18k: {
    id: "gold18k",
    title: "طلای ۱۸ عیار",
    unit: "گرم",
  },
  gold24k: {
    id: "gold24k",
    title: "طلای ۲۴ عیار",
    unit: "گرم",
  },
  usd: {
    id: "usd",
    title: "دلار",
    unit: "واحد",
  },
  usdt: {
    id: "usdt",
    title: "تتر (USDT)",
    unit: "واحد",
  },
};

/**
 * Currency label used across the dashboard.
 * @type {string}
 */
export const CURRENCY_LABEL = "تومان";

/**
 * Cache lifetime in seconds for each asset.
 * @type {Record<string, number>}
 */
export const TTL_SECONDS = {
  gold18k: 14,
  gold24k: 14,
  usd: 14,
  usdt: 14,
};

/**
 * Maximum acceptable relative price change within the outlier window.
 * @type {number}
 */
export const OUTLIER_MAX_CHANGE = 0.15;

/**
 * Time window used when checking for abnormal price changes.
 * @type {number}
 */
export const OUTLIER_WINDOW_SECONDS = 60;

/**
 * Maximum duration of a single scraper request.
 * @type {number}
 */
export const SCRAPER_TIMEOUT_MS = 5000;

/**
 * Age multiplier after which cached data is considered stale.
 * @type {number}
 */
export const STALE_TTL_MULTIPLIER = 3;

/**
 * Maximum lifetime of a single-flight lock in milliseconds.
 * @type {number}
 */
export const SINGLE_FLIGHT_MAX_LOCK_MS = 15000;

/**
 * Minimum delay between retries after a failed group fetch.
 * @type {number}
 */
export const MIN_RETRY_INTERVAL_MS = 5000;

/**
 * Consecutive failures required to open a group's circuit breaker.
 * @type {number}
 */
export const BREAKER_FAILURE_THRESHOLD = 3;

/**
 * Time a circuit breaker stays open before one half-open trial.
 * @type {number}
 */
export const BREAKER_COOLDOWN_MS = 60000;

/**
 * Maximum time a request with an empty cache waits for a cold fetch.
 * @type {number}
 */
export const COLD_START_MAX_WAIT_MS = 7000;

/**
 * Hard deadline for one group fetch. Must stay below the single-flight lock.
 * @type {number}
 */
export const GROUP_DEADLINE_MS = 12000;

/**
 * Client-side price refetch interval.
 * @type {number}
 */
export const CLIENT_REFETCH_INTERVAL_MS = 15000;

/**
 * Time before client-side price data is considered stale.
 * @type {number}
 */
export const CLIENT_STALE_TIME_MS = 10000;

/**
 * Duration of the price-change flash animation.
 * @type {number}
 */
export const FLASH_DURATION_MS = 1500;

/**
 * Seconds for the Retry-After header on fallback responses.
 * @type {number}
 */
export const RETRY_AFTER_SECONDS = 5;

/**
 * Maximum number of redirects to follow for scraper requests.
 * @type {number}
 */
export const MAX_REDIRECTS = 3;
