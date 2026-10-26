import "server-only";

import {
  MAX_REDIRECTS,
  SCRAPER_TIMEOUT_MS,
} from "../../utils/constants.js";
import {
  BROWSER_USER_AGENT,
  MAX_RESPONSE_BYTES,
} from "../../utils/constants.server.js";

const PERSIAN_ZERO = 0x06f0;
const ARABIC_ZERO = 0x0660;
const ALLOWED_CODES = new Set([
  "config",
  "timeout",
  "http",
  "blocked",
  "parse",
  "network",
  "too-large",
]);

/**
 * Error raised by the scraping layer.
 *
 * Messages are deliberately generic: they never contain provider names or
 * full URLs.
 */
export class ScraperError extends Error {
  /**
   * @param {string} message - Neutral, human-readable message.
   * @param {"config" | "timeout" | "http" | "blocked" | "parse" | "network" | "too-large"} code - Stable error code.
   * @param {{ status?: number, cause?: unknown }} [options] - HTTP status and optional cause.
   */
  constructor(message, code, options = {}) {
    const { status, cause } = options;
    super(message, cause === undefined ? undefined : { cause });

    this.name = "ScraperError";
    this.code = ALLOWED_CODES.has(code) ? code : "network";

    if (typeof status === "number") {
      this.status = status;
    }
  }
}

/**
 * Browser-like headers used for every outbound request.
 * @type {Readonly<Record<string, string>>}
 */
export const BROWSER_HEADERS = Object.freeze({
  "User-Agent": BROWSER_USER_AGENT,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
});

/**
 * Normalize Persian and Arabic digits to ASCII digits.
 *
 * @param {string} value - Input text.
 * @returns {string} Text containing only ASCII digits.
 */
function normalizeDigits(value) {
  return value
    .replace(/[۰-۹]/g, (digit) =>
      String(digit.charCodeAt(0) - PERSIAN_ZERO),
    )
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - ARABIC_ZERO));
}

/**
 * Check whether a response host is the expected host or one of its subdomains.
 *
 * @param {string} host - Hostname from response.url.
 * @param {string} expectedHost - Allowed hostname.
 * @returns {boolean}
 */
function isAllowedHost(host, expectedHost) {
  const normalizedHost = host.toLowerCase();
  const normalizedExpected = expectedHost.toLowerCase();

  return (
    normalizedHost === normalizedExpected ||
    normalizedHost.endsWith(`.${normalizedExpected}`)
  );
}


/**
 * Fetch text from a URL.
 *
 * @param {string} url - Absolute HTTPS URL.
 * @param {{ headers?: HeadersInit, timeoutMs?: number, fetchImpl?: typeof fetch, expectedHost?: string }} [options]
 * @returns {Promise<string>}
 */
export async function fetchText(url, options = {}) {
  return fetchAndRead(url, options, readTextLimited);
}

/**
 * Fetch and parse JSON from a URL.
 *
 * @param {string} url - Absolute HTTPS URL.
 * @param {{ headers?: HeadersInit, timeoutMs?: number, fetchImpl?: typeof fetch, expectedHost?: string }} [options]
 * @returns {Promise<unknown>}
 */
export async function fetchJson(url, options = {}) {
  return fetchAndRead(url, options, readJsonLimited);
}

async function fetchAndRead(url, options, readResponse) {
  const timeoutMs =
    Number.isFinite(options?.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : SCRAPER_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new ScraperError("Source request timed out.", "timeout"));
    }, timeoutMs);
  });

  try {
    const requestPromise = (async () => {
      const response = await fetchWithTimeout(url, {
        ...options,
        signal: controller.signal,
        timeoutMs,
      });
      return readResponse(response);
    })();

    return await Promise.race([requestPromise, timeoutPromise]);
  } catch (error) {
    if (timedOut) {
      throw new ScraperError("Source request timed out.", "timeout", {
        cause: error,
      });
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch a URL once with a hard timeout, size limits and redirect protection.
 *
 * @param {string} url - Absolute HTTPS URL.
 * @param {{ headers?: HeadersInit, timeoutMs?: number, fetchImpl?: typeof fetch, expectedHost?: string }} [options] - Request options.
 * @returns {Promise<Response>} Successful response.
 * @throws {ScraperError} On configuration, timeout, HTTP, redirect or network errors.
 */
export async function fetchWithTimeout(url, options = {}) {
  const {
    headers,
    timeoutMs = SCRAPER_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
    expectedHost,
    signal,
  } = options;

  if (typeof url !== "string" || url.trim() === "") {
    throw new ScraperError("Source URL is not configured.", "config");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new ScraperError("Source URL is not valid.", "config");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new ScraperError("Source URL must use HTTPS.", "config");
  }

  if (typeof fetchImpl !== "function") {
    throw new ScraperError("Source transport is not configured.", "config");
  }

  const allowedHost = expectedHost || parsedUrl.hostname;
  if (
    parsedUrl.username ||
    parsedUrl.password ||
    !isAllowedHost(parsedUrl.hostname, allowedHost)
  ) {
    throw new ScraperError("Source URL uses an unapproved host.", "blocked");
  }

  const controller = new AbortController();
  let timedOut = false;
  const effectiveTimeout =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : SCRAPER_TIMEOUT_MS;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, effectiveTimeout);

  const requestHeaders = new Headers(BROWSER_HEADERS);
  if (headers) {
    new Headers(headers).forEach((value, key) => {
      requestHeaders.set(key, value);
    });
  }

  let requestUrl = parsedUrl;
  const visitedUrls = new Set();
  let redirectCount = 0;

  try {
    while (true) {
      const currentUrl = requestUrl.toString();
      if (visitedUrls.has(currentUrl)) {
        throw new ScraperError("Source redirect loop was detected.", "blocked");
      }
      visitedUrls.add(currentUrl);

      const response = await fetchImpl(currentUrl, {
        cache: "no-store",
        redirect: "manual",
        headers: requestHeaders,
        signal: signal || controller.signal,
      });

      if (!response || typeof response.status !== "number") {
        throw new ScraperError("Source returned an invalid response.", "network");
      }

      const responseUrl = new URL(response.url || currentUrl, currentUrl);
      if (
        responseUrl.protocol !== "https:" ||
        responseUrl.username ||
        responseUrl.password ||
        !isAllowedHost(responseUrl.hostname, allowedHost)
      ) {
        throw new ScraperError(
          "Source redirected to an unapproved host.",
          "blocked",
          { status: response.status },
        );
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers?.get?.("location");
        if (!location || redirectCount >= MAX_REDIRECTS) {
          throw new ScraperError(
            "Source exceeded the redirect limit.",
            "blocked",
            { status: response.status },
          );
        }

        let nextUrl;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch {
          throw new ScraperError(
            "Source redirected to an invalid URL.",
            "blocked",
            { status: response.status },
          );
        }

        if (
          nextUrl.protocol !== "https:" ||
          nextUrl.username ||
          nextUrl.password ||
          !isAllowedHost(nextUrl.hostname, allowedHost)
        ) {
          throw new ScraperError(
            "Source redirected to an unapproved host.",
            "blocked",
            { status: response.status },
          );
        }

        redirectCount += 1;
        requestUrl = nextUrl;
        continue;
      }

      if (response.status === 403 || response.status === 429) {
        throw new ScraperError("Source rejected the request.", "blocked", {
          status: response.status,
        });
      }

      if (!response.ok) {
        throw new ScraperError("Source returned an unsuccessful status.", "http", {
          status: response.status,
        });
      }

      return response;
    }
  } catch (error) {
    if (error instanceof ScraperError) {
      throw error;
    }

    if (timedOut || error?.name === "AbortError") {
      throw new ScraperError("Source request timed out.", "timeout", {
        cause: error,
      });
    }

    throw new ScraperError("Source request failed.", "network", {
      cause: error,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Read a response body while enforcing MAX_RESPONSE_BYTES.
 *
 * @param {Response} response - Response to read.
 * @returns {Promise<string>} Decoded UTF-8 body.
 * @throws {ScraperError} On oversized or unreadable bodies.
 */
export async function readTextLimited(response) {
  if (!response) {
    throw new ScraperError("Source response is missing.", "network");
  }

  const declaredLength = Number(
    response.headers?.get?.("content-length") ?? Number.NaN,
  );
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new ScraperError("Source response is too large.", "too-large");
  }

  try {
    if (response.body && typeof response.body.getReader === "function") {
      const reader = response.body.getReader();
      const chunks = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        totalBytes += value.byteLength;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          await reader.cancel().catch(() => {});
          throw new ScraperError("Source response is too large.", "too-large");
        }

        chunks.push(value);
      }

      const merged = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }

      return new TextDecoder().decode(merged);
    }

    if (typeof response.arrayBuffer === "function") {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_RESPONSE_BYTES) {
        throw new ScraperError("Source response is too large.", "too-large");
      }

      return new TextDecoder().decode(buffer);
    }

    if (typeof response.text === "function") {
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
        throw new ScraperError("Source response is too large.", "too-large");
      }

      return text;
    }
  } catch (error) {
    if (error instanceof ScraperError) {
      throw error;
    }

    throw new ScraperError("Source response could not be read.", "network", {
      cause: error,
    });
  }

  throw new ScraperError("Source response could not be read.", "network");
}

/**
 * Read and parse a JSON response with the shared size limit.
 *
 * @param {Response} response - Response to read.
 * @returns {Promise<unknown>} Parsed JSON value.
 * @throws {ScraperError} On oversized bodies or invalid JSON.
 */
export async function readJsonLimited(response) {
  const text = await readTextLimited(response);

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ScraperError("Source returned invalid JSON.", "parse", {
      cause: error,
    });
  }
}

/**
 * Parse a price string or number into a positive integer.
 *
 * Persian/Arabic digits, thousands separators and surrounding text are
 * normalized. Decimals are rounded.
 *
 * @param {string | number} input - Raw price.
 * @returns {number} Positive integer price.
 * @throws {ScraperError} With code "parse" when no positive number is found.
 */
export function parsePrice(input) {
  let value;

  if (typeof input === "number") {
    value = input;
  } else if (typeof input === "string") {
    const normalized = normalizeDigits(input)
      .replace(/\u066b/g, ".")
      .replace(/[,\u066c\u060c\s]/g, "");
    const match = normalized.match(/-?\d+(?:\.\d+)?/);

    if (!match) {
      throw new ScraperError("Price is not a number.", "parse");
    }

    value = Number(match[0]);
  } else {
    throw new ScraperError("Price is not a number.", "parse");
  }

  const rounded = Math.round(value);
  if (!Number.isFinite(value) || value <= 0 || rounded <= 0) {
    throw new ScraperError("Price must be a positive number.", "parse");
  }

  return rounded;
}

/**
 * Parse an optional positive price without failing the primary scrape.
 *
 * @param {unknown} input - Optional price value.
 * @param {"toman" | "rial"} unit - Source currency unit.
 * @returns {number | null} Positive integer toman value, or null if unavailable/invalid.
 */
export function parseOptionalPrice(input, unit = "toman") {
  if (input === undefined || input === null || input === "") {
    return null;
  }

  try {
    return toTomanInteger(parsePrice(input), unit);
  } catch (error) {
    if (error instanceof ScraperError && error.code === "parse") {
      return null;
    }

    throw error;
  }
}

/**
 * Convert a source price to a positive integer toman value.
 *
 * @param {number | string} value - Raw source price.
 * @param {"toman" | "rial"} unit - Source unit.
 * @returns {number} Positive integer toman price.
 * @throws {ScraperError} On unsupported units or invalid prices.
 */
export function toTomanInteger(value, unit) {
  const numericValue =
    typeof value === "number"
      ? value
      : Number(
          normalizeDigits(String(value))
            .replace(/\u066b/g, ".")
            .replace(/[,\u066c\u060c\s]/g, ""),
        );

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw new ScraperError("Price must be a positive number.", "parse");
  }

  let toman;
  if (unit === "rial") {
    toman = Math.floor(numericValue / 10);
  } else if (unit === "toman") {
    toman = Math.round(numericValue);
  } else {
    throw new ScraperError("Price unit is not supported.", "config");
  }

  if (!Number.isFinite(toman) || toman <= 0) {
    throw new ScraperError("Price must be a positive number.", "parse");
  }

  return toman;
}

/**
 * Resolve a timestamp option to an ISO string.
 *
 * @param {Date | string | number | (() => Date | string | number)} [now] - Timestamp source.
 * @returns {string} ISO timestamp.
 */
export function toIsoTimestamp(now = new Date()) {
  const value = typeof now === "function" ? now() : now;
  const date =
    value instanceof Date
      ? value
      : new Date(value ?? Date.now());

  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
}
