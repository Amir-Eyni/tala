import { after, connection, NextResponse } from "next/server";

import { buildOfflinePayload, resolvePrices } from "@/lib/priceEngine";
import { toHttpResponse } from "@/lib/pricesResponse";
import {
  ASSET_IDS,
  ASSETS,
  CURRENCY_LABEL,
  RETRY_AFTER_SECONDS,
} from "@/utils/constants";

function scheduleBackground(task) {
  try {
    if (typeof after === "function") {
      after(task);
      return;
    }
  } catch {
    // Fallback if after() is called outside request scope (e.g. tests or environments without waitUntil)
  }
  void Promise.resolve().then(task).catch(() => {});
}

function buildSafeOfflineResponse() {
  try {
    const { status, headers, body } = toHttpResponse(buildOfflinePayload());
    return NextResponse.json(body, { status, headers });
  } catch {
    const assets = {};
    for (const id of ASSET_IDS) {
      assets[id] = {
        id,
        title: ASSETS[id]?.title ?? id,
        unit: ASSETS[id]?.unit ?? "",
        price: null,
        previousPrice: null,
        isStale: true,
      };
    }
    const body = {
      updatedAt: null,
      status: "offline",
      currency: CURRENCY_LABEL,
      assets,
    };
    return NextResponse.json(body, {
      status: 503,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": String(RETRY_AFTER_SECONDS),
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}

/**
 * Return the current white-label price payload.
 *
 * @returns {Promise<NextResponse>} JSON response.
 */
export async function GET() {
  try {
    await connection();

    const { payload, refresh } = await resolvePrices();

    if (refresh) {
      scheduleBackground(() => refresh.catch(() => {}));
    }

    const { status, headers, body } = toHttpResponse(payload);

    return NextResponse.json(body, { status, headers });
  } catch {
    return buildSafeOfflineResponse();
  }
}
