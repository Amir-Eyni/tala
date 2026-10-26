"use client";

import { useGoldPrices } from "@/app/hooks/useGoldPrices";
import { formatTime } from "@/utils/formatPrice";

export default function LiveHeader() {
  const { data, isFetching, isError } = useGoldPrices();
  const status = data?.status;
  const isStale = status === "stale" || status === "offline";
  const isHealthy = !isError && !isStale && status === "healthy";
  const isUnavailable = !isHealthy;

  const indicatorColor = isError
    ? "bg-red-500"
    : isUnavailable
      ? "bg-yellow-500"
      : "bg-up";

  const statusLabel = isError
    ? "قطعی موقت"
    : isUnavailable
      ? "قطعی موقت"
      : "زنده";

  const updatedAt = data?.updatedAt ? formatTime(data.updatedAt) : "—";

  return (
    <header className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-right">
        <h1 className="text-xl font-bold text-text sm:text-2xl">
          نرخ لحظه‌ای طلا و ارز
        </h1>
        <p
          className="mt-1 text-sm text-muted tala-numeric"
          aria-live="polite"
        >
          آخرین به‌روزرسانی: {updatedAt}
        </p>
      </div>

      <div className="flex items-center gap-2 self-start text-sm sm:self-auto">
        <span
          aria-hidden="true"
          className={`size-2.5 rounded-full ${indicatorColor} ${
            isHealthy ? "animate-live-pulse" : ""
          }`}
        />
        <span
          className={
            isError
              ? "font-semibold text-red-500"
              : isUnavailable
                ? "font-semibold text-yellow-500"
                : "font-semibold text-up"
          }
        >
          {statusLabel}
        </span>

        {isFetching && isHealthy && (
          <>
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-muted border-t-brand"
            />
            <span className="text-muted" role="status">
              در حال به‌روزرسانی...
            </span>
          </>
        )}

        {isUnavailable && !isError && (
          <span className="text-muted" role="status">
            {data
              ? "آخرین داده معتبر در حال نمایش است"
              : "در انتظار دریافت داده"}
          </span>
        )}

        {isError && (
          <span className="text-red-500" role="status">
            دریافت داده ناموفق بود
          </span>
        )}
      </div>
    </header>
  );
}
