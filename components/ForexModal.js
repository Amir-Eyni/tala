"use client";

import { useEffect, useRef, useState } from "react";

import { useForexPrices } from "@/app/hooks/useForexPrices";
import {
  directionSymbol,
  formatForexPrice,
  formatPercent,
  formatTime,
} from "@/utils/formatPrice";
import {
  FOREX_ASSET_IDS,
  FOREX_ASSETS,
  FOREX_FLASH_DURATION_MS,
} from "@/utils/forexConstants";

function ForexCard({ assetConfig, assetData }) {
  const price = assetData?.price ?? null;
  const hasPrice = typeof price === "number" && Number.isFinite(price) && price > 0;
  const previousPriceRef = useRef(price);
  const [flashDirection, setFlashDirection] = useState(null);

  const hasFiniteChange =
    typeof assetData?.changePercent === "number" &&
    Number.isFinite(assetData.changePercent);
  const changePercent = hasFiniteChange ? assetData.changePercent : null;

  const direction =
    hasFiniteChange && changePercent > 0
      ? "up"
      : hasFiniteChange && changePercent < 0
        ? "down"
        : "flat";

  const changeBadgeColor =
    direction === "up"
      ? "bg-surface-2 text-up"
      : direction === "down"
        ? "bg-surface-2 text-down"
        : "bg-surface-2 text-text";

  const isStale = assetData?.isStale === true;

  useEffect(() => {
    const previousPrice = previousPriceRef.current;
    previousPriceRef.current = price;

    if (
      typeof price !== "number" ||
      typeof previousPrice !== "number" ||
      price === previousPrice
    ) {
      setFlashDirection(null);
      return undefined;
    }

    const nextDirection = price > previousPrice ? "up" : "down";
    setFlashDirection(nextDirection);

    const timeoutId = setTimeout(
      () => setFlashDirection(null),
      FOREX_FLASH_DURATION_MS,
    );

    return () => clearTimeout(timeoutId);
  }, [price]);

  const flashClass =
    flashDirection === "up"
      ? "tala-flash-up"
      : flashDirection === "down"
        ? "tala-flash-down"
        : "";

  return (
    <article
      className={`overflow-hidden rounded-row border bg-surface transition-colors ${
        isStale ? "border-dashed border-warn" : "border-line"
      } ${flashClass}`}
    >
      <div className="p-4 text-right sm:p-5">
        <div className="flex items-center justify-between">
          <span className="rounded-control bg-surface-2 px-2 py-0.5 text-xs font-semibold text-brand tala-numeric">
            {assetConfig.symbol}
          </span>
          <h3 className="font-semibold text-text sm:text-base">
            {assetConfig.title}
          </h3>
        </div>

        <div className="mt-3.5 flex items-end justify-between gap-2">
          <div className="min-w-0 text-right">
            <p className="tala-numeric whitespace-nowrap text-lg font-bold text-text tabular-nums sm:text-xl">
              {formatForexPrice(price, assetConfig.digits ?? 2)}
            </p>
            <p className="mt-1 text-xs text-muted">
              دلار آمریکا ({assetConfig.unit})
            </p>
          </div>

          {hasPrice && hasFiniteChange && (
            <p
              className={`inline-flex shrink-0 items-center justify-center gap-1 rounded-pill px-2.5 py-1 text-xs font-semibold tala-numeric ${changeBadgeColor}`}
              aria-label={`تغییر قیمت ${formatPercent(changePercent)}`}
            >
              {directionSymbol(direction) && (
                <span aria-hidden="true">{directionSymbol(direction)}</span>
              )}
              <span>{formatPercent(changePercent)}</span>
            </p>
          )}
        </div>
      </div>

      {isStale && (
        <p className="mx-3 mb-3 rounded-control border border-dashed border-warn px-3 py-1.5 text-right text-xs text-warn sm:mx-4">
          آخرین قیمت معتبر. منبع فعلاً پاسخ نمی‌دهد.
        </p>
      )}
    </article>
  );
}

function ForexSkeletonCard({ assetConfig }) {
  return (
    <div className="overflow-hidden rounded-row border border-line bg-surface p-4 sm:p-5 text-right">
      <div className="flex items-center justify-between">
        <div className="h-5 w-16 rounded bg-line/60 animate-pulse" />
        <div className="h-5 w-24 rounded bg-line/60 animate-pulse" />
      </div>
      <div className="mt-3.5 flex items-end justify-between">
        <div>
          <div className="h-7 w-28 rounded bg-line/60 animate-pulse" />
          <div className="mt-2 h-3.5 w-16 rounded bg-line/40 animate-pulse" />
        </div>
        <div className="h-6 w-14 rounded-pill bg-line/50 animate-pulse" />
      </div>
    </div>
  );
}

export default function ForexModal({ isOpen, onClose }) {
  const { data, isLoading, isFetching, isError } = useForexPrices({
    enabled: isOpen,
  });

  const status = data?.status;
  const isStale = status === "stale" || status === "offline";
  const isHealthy = !isError && !isStale && status === "healthy";

  const indicatorColor = isError
    ? "bg-red-500"
    : isStale
      ? "bg-yellow-500"
      : "bg-up";

  const statusLabel = isError
    ? "قطع ارتباط"
    : isStale
      ? "قطعی موقت"
      : "زنده";

  const updatedAt = data?.updatedAt ? formatTime(data.updatedAt) : "—";

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="forex-modal-title"
        aria-modal="true"
        className="w-full max-w-2xl rounded-hero border border-line bg-surface p-5 text-right shadow-2xl sm:p-6"
        role="dialog"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-4">
          <button
            aria-label="بستن پنجره"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-control border border-line text-muted transition hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            onClick={onClose}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <span
                aria-hidden="true"
                className={`size-2.5 rounded-full ${indicatorColor} ${
                  isHealthy ? "animate-live-pulse" : ""
                }`}
              />
              <span className="font-semibold text-text">{statusLabel}</span>
              {updatedAt !== "—" && (
                <span className="hidden tala-numeric sm:inline">({updatedAt})</span>
              )}
            </div>
            <h2
              className="text-lg font-bold text-text sm:text-xl"
              id="forex-modal-title"
            >
              بازار فارکس
            </h2>
          </div>
        </div>

        {/* Subtitle / Note */}
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span className="tala-numeric">
            {isFetching && isHealthy ? "در حال به‌روزرسانی قیمت‌ها..." : "نرخ‌های لحظه‌ای بازار جهانی"}
          </span>
          <span>واحد قیمت: دلار آمریکا ($)</span>
        </div>

        {/* Cards Grid */}
        <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4">
          {FOREX_ASSET_IDS.map((id) => {
            const assetConfig = FOREX_ASSETS[id];
            const assetData = data?.assets?.[id];

            if (isLoading && !data) {
              return <ForexSkeletonCard key={id} assetConfig={assetConfig} />;
            }

            return (
              <ForexCard
                key={id}
                assetConfig={assetConfig}
                assetData={assetData}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
