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
  gold18k: 45,
  gold24k: 60,
  usd: 15,
  usdt: 15,
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
 * Client-side price refetch interval.
 * @type {number}
 */
export const CLIENT_REFETCH_INTERVAL_MS = 15000;

/**
 * Duration of the price-change flash animation.
 * @type {number}
 */
export const FLASH_DURATION_MS = 1500;
