/**
 * Forex instruments and market configuration.
 */

export const FOREX_ASSETS = Object.freeze({
  xauusd: {
    id: "xauusd",
    symbol: "XAU/USD",
    title: "انس جهانی طلا",
    displayTitle: "انس جهانی طلا (XAU/USD)",
    unit: "$",
    digits: 2,
  },
  xagusd: {
    id: "xagusd",
    symbol: "XAG/USD",
    title: "انس جهانی نقره",
    displayTitle: "انس جهانی نقره (XAG/USD)",
    unit: "$",
    digits: 2,
  },
  btcusd: {
    id: "btcusd",
    symbol: "BTC/USD",
    title: "بیت‌کوین",
    displayTitle: "بیت‌کوین (BTC/USD)",
    unit: "$",
    digits: 2,
  },
  ethusd: {
    id: "ethusd",
    symbol: "ETH/USD",
    title: "اتریوم",
    displayTitle: "اتریوم (ETH/USD)",
    unit: "$",
    digits: 2,
  },
});

export const FOREX_ASSET_IDS = Object.freeze([
  "xauusd",
  "xagusd",
  "btcusd",
  "ethusd",
]);

export const FOREX_CURRENCY_LABEL = "USD";
export const FOREX_TTL_SECONDS = 1.5;
export const FOREX_STALE_TTL_MULTIPLIER = 3;
export const FOREX_CLIENT_REFETCH_INTERVAL_MS = 2000;
export const FOREX_CLIENT_STALE_TIME_MS = 1500;
export const FOREX_BREAKER_FAILURE_THRESHOLD = 3;
export const FOREX_BREAKER_COOLDOWN_MS = 30000;
export const FOREX_SINGLE_FLIGHT_MAX_LOCK_MS = 10000;
export const FOREX_COLD_START_MAX_WAIT_MS = 5000;
export const FOREX_DEADLINE_MS = 8000;
export const FOREX_RETRY_AFTER_SECONDS = 2;
export const FOREX_FLASH_DURATION_MS = 1500;
