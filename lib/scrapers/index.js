import "server-only";

import { fetchTgju } from "./tgju.js";
import { fetchTalasea } from "./talasea.js";
import { fetchWallex } from "./wallex.js";

/**
 * Neutral scraper registry. Provider details stay inside this directory.
 * @type {ReadonlyArray<{ id: "fx" | "gold18" | "gold24", assets: readonly string[], fetch: Function }>}
 */
export const SCRAPER_REGISTRY = Object.freeze([
  Object.freeze({
    id: "fx",
    assets: Object.freeze(["usdt", "usd"]),
    fetch: fetchWallex,
  }),
  Object.freeze({
    id: "gold18",
    assets: Object.freeze(["gold18k"]),
    fetch: fetchTalasea,
  }),
  Object.freeze({
    id: "gold24",
    assets: Object.freeze(["gold24k"]),
    fetch: fetchTgju,
  }),
]);
