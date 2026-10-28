import "server-only";

import {
  fetchTgju,
  scrapeTgjuDollar,
  scrapeTgjuEuro,
  scrapeTgjuSilver,
  scrapeTgjuCoin,
} from "./tgju.js";
import { fetchTalasea } from "./talasea.js";
import { fetchWallex } from "./wallex.js";
import { scrapeNoghreseaSilver } from "./noghresea.js";

async function fetchSilverWithFallback(options) {
  try {
    return await scrapeNoghreseaSilver(options);
  } catch {
    console.warn("[silver-scraper] primary source failed; using backup");
    return await scrapeTgjuSilver(options);
  }
}

/**
 * Neutral scraper registry. Provider details stay inside this directory.
 * @type {ReadonlyArray<{ id: "fx" | "usd" | "gold18" | "coin" | "gold24" | "euro" | "silver", assets: readonly string[], fetch: Function }>}
 */
export const SCRAPER_REGISTRY = Object.freeze([
  Object.freeze({
    id: "fx",
    assets: Object.freeze(["usdt"]),
    fetch: fetchWallex,
  }),
  Object.freeze({
    id: "usd",
    assets: Object.freeze(["usd"]),
    fetch: scrapeTgjuDollar,
  }),
  Object.freeze({
    id: "gold18",
    assets: Object.freeze(["gold18k"]),
    fetch: fetchTalasea,
  }),
  Object.freeze({
    id: "coin",
    assets: Object.freeze(["coin"]),
    fetch: scrapeTgjuCoin,
  }),
  Object.freeze({
    id: "gold24",
    assets: Object.freeze(["gold24k"]),
    fetch: fetchTgju,
  }),
  Object.freeze({
    id: "silver",
    assets: Object.freeze(["silver"]),
    fetch: fetchSilverWithFallback,
  }),
  Object.freeze({
    id: "euro",
    assets: Object.freeze(["euro"]),
    fetch: scrapeTgjuEuro,
  }),
]);
