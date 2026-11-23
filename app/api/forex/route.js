import { after, connection, NextResponse } from "next/server";

import {
  buildForexOfflinePayload,
  resolveForexPrices,
  toForexHttpResponse,
} from "@/lib/forexEngine";
import { FOREX_RETRY_AFTER_SECONDS } from "@/utils/forexConstants";

function scheduleBackground(task) {
  try {
    if (typeof after === "function") {
      after(task);
      return;
    }
  } catch {
    // Fallback if after() is called outside request scope (e.g. tests)
  }
  void Promise.resolve().then(task).catch(() => {});
}

function buildSafeOfflineResponse() {
  try {
    const { status, headers, body } = toForexHttpResponse(buildForexOfflinePayload());
    return NextResponse.json(body, { status, headers });
  } catch {
    return NextResponse.json(
      { error: "Forex service temporarily unavailable." },
      {
        status: 503,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Retry-After": String(FOREX_RETRY_AFTER_SECONDS),
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }
}

/**
 * Return the current white-label Forex price payload.
 *
 * @returns {Promise<NextResponse>} JSON response.
 */
export async function GET() {
  try {
    await connection();

    const { payload, refresh } = await resolveForexPrices();

    if (refresh) {
      scheduleBackground(() => refresh.catch(() => {}));
    }

    const { status, headers, body } = toForexHttpResponse(payload);

    return NextResponse.json(body, { status, headers });
  } catch {
    return buildSafeOfflineResponse();
  }
}
