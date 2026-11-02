"use client";

import { useGoldPrices } from "@/app/hooks/useGoldPrices";
import { formatTime } from "@/utils/formatPrice";
import Skeleton from "@/components/Skeleton";

export default function StatusFooter() {
  const { data, isLoading, isError } = useGoldPrices();
  const isInitialLoading = isLoading && !data;
  const isHealthy = !isInitialLoading && !isError && data?.status === "healthy";
  const isErrorState = !isInitialLoading && (isError || data?.status === "offline");
  const indicatorClass = isInitialLoading
    ? "bg-brand animate-live-pulse"
    : isHealthy
      ? "bg-up"
      : isErrorState
        ? "bg-down"
        : "bg-warn";
  const statusLabel = isInitialLoading
    ? "در حال اتصال"
    : isHealthy
      ? "اتصال سالم"
      : isErrorState
        ? "قطعی موقت"
        : "دادهٔ قدیمی یا در دسترس نیست";
  const updatedAt = data?.updatedAt ? formatTime(data.updatedAt) : "—";

  return (
    <footer className="mt-8 border-t border-line py-5 text-sm text-muted">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`size-2.5 shrink-0 rounded-full ${indicatorClass}`}
          />
          <span>وضعیت اتصال به شبکه‌های مرجع:</span>
          <span
            className={
              isInitialLoading
                ? "font-semibold text-muted"
                : isHealthy
                  ? "font-semibold text-up"
                  : isErrorState
                    ? "font-semibold text-down"
                    : "font-semibold text-warn"
            }
            role="status"
          >
            {statusLabel}
          </span>
        </div>
        <p className="tala-numeric">
          آخرین به‌روزرسانی کلی:{" "}
          {isInitialLoading ? (
            <Skeleton className="inline-block h-4 w-16 align-middle" />
          ) : (
            updatedAt
          )}
        </p>
      </div>
    </footer>
  );
}
