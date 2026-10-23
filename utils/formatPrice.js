const DASH = "—";
const TOMAN_UNIT = "تومان";
const PERSIAN_THOUSANDS_SEPARATOR = /\u066C/g;

const tomanFormatter = new Intl.NumberFormat("fa-IR", {
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("fa-IR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const timeFormatter = new Intl.DateTimeFormat("fa-IR", {
  timeZone: "Asia/Tehran",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * Check whether a value is a valid, non-negative price.
 *
 * @param {unknown} value - Value to validate.
 * @returns {boolean} True when the value is a finite, non-negative number.
 */
function isValidPrice(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Format a toman value with Persian digits and comma thousands separators.
 *
 * @param {number} value - Price in toman.
 * @returns {string} Formatted price, or an em dash for invalid input.
 */
export function formatToman(value) {
  if (!isValidPrice(value)) {
    return DASH;
  }

  const normalizedValue = value === 0 ? 0 : value;

  return tomanFormatter
    .format(normalizedValue)
    .replace(PERSIAN_THOUSANDS_SEPARATOR, ",");
}

/**
 * Format a toman value together with its currency unit.
 *
 * @param {number} value - Price in toman.
 * @returns {string} Formatted price followed by the toman label.
 */
export function formatTomanWithUnit(value) {
  return `${formatToman(value)} ${TOMAN_UNIT}`;
}

/**
 * Calculate the absolute and percentage change between two prices.
 *
 * @param {number} current - Current price.
 * @param {number} previous - Previous price.
 * @returns {{ amount: number, percent: number, direction: "up" | "down" | "flat" }}
 *   The price difference, rounded percentage change, and direction.
 */
export function calcChange(current, previous) {
  if (
    !isValidPrice(current) ||
    !isValidPrice(previous) ||
    previous === 0
  ) {
    return { amount: 0, percent: 0, direction: "flat" };
  }

  const amount = current - previous;
  if (!Number.isFinite(amount)) {
    return { amount: 0, percent: 0, direction: "flat" };
  }

  const percent = Number(((amount / previous) * 100).toFixed(2)) || 0;
  const direction = percent > 0 ? "up" : percent < 0 ? "down" : "flat";

  return { amount, percent, direction };
}

/**
 * Format a percentage with Persian digits, two decimals, and a percent sign.
 *
 * @param {number} percent - Percentage value to display.
 * @returns {string} Formatted absolute percentage, or an em dash for invalid input.
 */
export function formatPercent(percent) {
  if (typeof percent !== "number" || !Number.isFinite(percent)) {
    return DASH;
  }

  return `${percentFormatter.format(Math.abs(percent))}٪`;
}

/**
 * Return the visual direction symbol for a price change.
 *
 * @param {"up" | "down" | "flat" | string} direction - Change direction.
 * @returns {string} Up/down arrow, or an empty string for flat/unknown values.
 */
export function directionSymbol(direction) {
  if (direction === "up") {
    return "▲";
  }

  if (direction === "down") {
    return "▼";
  }

  return "";
}

/**
 * Format a date as Tehran local time with Persian digits.
 *
 * @param {Date | string | number} date - Date object or ISO date string/number.
 * @returns {string} Formatted time in HH:mm:ss format, or an em dash for invalid input.
 */
export function formatTime(date) {
  if (
    !(date instanceof Date) &&
    typeof date !== "string" &&
    typeof date !== "number"
  ) {
    return DASH;
  }

  const value = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(value.getTime())) {
    return DASH;
  }

  return timeFormatter.format(value);
}
