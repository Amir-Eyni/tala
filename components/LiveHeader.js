"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { useGoldPrices } from "@/app/hooks/useGoldPrices";
import { formatTime } from "@/utils/formatPrice";
import InstallPrompt from "@/components/InstallPrompt";
import Skeleton from "@/components/Skeleton";
import ThemeToggle from "@/components/ThemeToggle";

const ForexModal = dynamic(() => import("@/components/ForexModal"), {
  ssr: false,
});

export default function LiveHeader() {
  const [isForexOpen, setIsForexOpen] = useState(false);
  const { data, isLoading, isFetching, isError } = useGoldPrices();
  const status = data?.status;
  const isInitialLoading = isLoading && !data;
  const isStale = status === "stale" || status === "offline";
  const isHealthy = !isInitialLoading && !isError && !isStale && status === "healthy";
  const isUnavailable = !isInitialLoading && !isHealthy;

  const indicatorColor = isInitialLoading
    ? "bg-brand"
    : isError
      ? "bg-red-500"
      : isUnavailable
        ? "bg-yellow-500"
        : "bg-up";

  const statusLabel = isInitialLoading
    ? "در حال اتصال"
    : isError
      ? "قطعی موقت"
      : isUnavailable
        ? "قطعی موقت"
        : "زنده";

  const updatedAt = data?.updatedAt ? formatTime(data.updatedAt) : "—";

  return (
    <>
      <header className="flex w-full flex-row items-center justify-between gap-2 border-b border-line pb-5 sm:gap-4">
        {/* Title block (Right in RTL) */}
        <div className="min-w-0 flex-1 text-right">
          <h1 className="text-base font-bold text-text sm:text-2xl">
            نرخ لحظه‌ای طلا و ارز
          </h1>
          <p
            className="mt-1 text-xs text-muted tala-numeric sm:text-sm"
            aria-live="polite"
          >
            آخرین به‌روزرسانی:{" "}
            {isInitialLoading ? (
              <Skeleton className="inline-block h-4 w-16 align-middle" />
            ) : (
              updatedAt
            )}
          </p>
        </div>

        {/* Forex button in middle space */}
        <div className="flex shrink-0 items-center justify-center">
          <button
            aria-label="نمایش نرخ‌های بازار فارکس"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-brand/50 bg-brand/10 px-2.5 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:px-3 sm:text-sm"
            onClick={() => setIsForexOpen(true)}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="9" />
              <path
                strokeLinecap="round"
                d="M3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"
              />
            </svg>
            <span>بازار فارکس</span>
          </button>
        </div>

        {/* Status indicator and actions (Left in RTL) */}
        <div className="flex shrink-0 flex-nowrap items-center gap-2 text-sm sm:gap-3">
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <span
              aria-hidden="true"
              className={`size-2.5 rounded-full ${indicatorColor} ${
                isHealthy || isInitialLoading ? "animate-live-pulse" : ""
              }`}
            />
            <span
              className={
                isInitialLoading
                  ? "font-semibold text-muted"
                  : isError
                    ? "font-semibold text-red-500"
                    : isUnavailable
                      ? "font-semibold text-yellow-500"
                      : "font-semibold text-up"
              }
            >
              {statusLabel}
            </span>

            {isInitialLoading && (
              <span className="hidden text-muted lg:inline" role="status">
                در حال دریافت داده…
              </span>
            )}

            {isFetching && isHealthy && (
              <>
                <span
                  aria-hidden="true"
                  className="hidden size-4 animate-spin rounded-full border-2 border-muted border-t-brand lg:inline-block"
                />
                <span className="hidden text-muted lg:inline" role="status">
                  در حال به‌روزرسانی...
                </span>
              </>
            )}

            {isUnavailable && !isError && !isInitialLoading && (
              <span className="hidden text-muted lg:inline" role="status">
                {data
                  ? "آخرین داده معتبر در حال نمایش است"
                  : "در انتظار دریافت داده"}
              </span>
            )}

            {isError && (
              <span className="hidden text-red-500 lg:inline" role="status">
                دریافت داده ناموفق بود
              </span>
            )}
          </div>
          <ThemeToggle />
          <InstallPrompt />
        </div>
      </header>

      <ForexModal
        isOpen={isForexOpen}
        onClose={() => setIsForexOpen(false)}
      />
    </>
  );
}
