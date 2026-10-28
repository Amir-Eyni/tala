"use client";

import { useGoldPrices } from "@/app/hooks/useGoldPrices";
import { formatTime } from "@/utils/formatPrice";
import InstallPrompt from "@/components/InstallPrompt";
import ThemeToggle from "@/components/ThemeToggle";

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
    <header className="flex w-full flex-row items-start justify-between gap-2 border-b border-line pb-5 sm:items-center">
      <div className="min-w-0 flex-1 text-right">
        <h1 className="text-lg font-bold text-text sm:text-2xl">
          نرخ لحظه‌ای طلا و ارز
        </h1>
        <p
          className="mt-1 text-sm text-muted tala-numeric"
          aria-live="polite"
        >
          آخرین به‌روزرسانی: {updatedAt}
        </p>
      </div>

      <div className="flex shrink-0 flex-nowrap items-center gap-2 text-sm sm:gap-3">
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
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
                className="hidden size-4 animate-spin rounded-full border-2 border-muted border-t-brand sm:inline-block"
              />
              <span className="hidden text-muted sm:inline" role="status">
                در حال به‌روزرسانی...
              </span>
            </>
          )}

          {isUnavailable && !isError && (
            <span className="hidden text-muted sm:inline" role="status">
              {data
                ? "آخرین داده معتبر در حال نمایش است"
                : "در انتظار دریافت داده"}
            </span>
          )}

          {isError && (
            <span className="hidden text-red-500 sm:inline" role="status">
              دریافت داده ناموفق بود
            </span>
          )}
        </div>
        <ThemeToggle />
        <InstallPrompt />
      </div>
    </header>
  );
}
