import "server-only";

import {
  fetchTgju,
  scrapeTgjuDollar,
  scrapeTgjuEuro,
  scrapeTgjuSilver,
  scrapeTgjuCoin,
  scrapeTgjuBahar,
} from "./tgju.js";
import { fetchTalasea } from "./talasea.js";
import { fetchWallex } from "./wallex.js";

/**
 * Neutral scraper registry. Provider details stay inside this directory.
 * @type {ReadonlyArray<{ id: "fx" | "usd" | "gold18" | "coin" | "bahar" | "gold24" | "euro" | "silver", assets: readonly string[], fetch: Function }>}
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
    id: "bahar",
    assets: Object.freeze(["bahar"]),
    fetch: scrapeTgjuBahar,
  }),
  Object.freeze({
    id: "gold24",
    assets: Object.freeze(["gold24k"]),
    fetch: fetchTgju,
  }),
  Object.freeze({
    id: "silver",
    assets: Object.freeze(["silver"]),
    fetch: scrapeTgjuSilver,
  }),
  Object.freeze({
    id: "euro",
    assets: Object.freeze(["euro"]),
    fetch: scrapeTgjuEuro,
  }),
]);
