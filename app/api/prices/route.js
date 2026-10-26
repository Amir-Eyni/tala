import { connection, NextResponse } from "next/server";

import { buildOfflinePayload, resolvePrices } from "@/lib/priceEngine";
import { toHttpResponse } from "@/lib/pricesResponse";

/**
 * Return the current white-label price payload.
 *
 * @returns {Promise<NextResponse>} JSON response.
 */
export async function GET() {
  try {
    await connection();

    let { payload, refresh } = await resolvePrices();

    if (refresh) {
      await refresh;
      ({ payload } = await resolvePrices());
    }

    const { status, headers, body } = toHttpResponse(payload);

    return NextResponse.json(body, { status, headers });
  } catch {
    try {
      const { status, headers, body } = toHttpResponse(buildOfflinePayload());
      return NextResponse.json(body, { status, headers });
    } catch {
      return NextResponse.json(
        { status: "offline" },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }
  }
}
