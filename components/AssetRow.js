"use client";

import { useEffect, useRef, useState } from "react";

import { FLASH_DURATION_MS } from "@/utils/constants";
import {
  directionSymbol,
  formatPercent,
  formatToman,
} from "@/utils/formatPrice";

const STALE_MESSAGE = "آخرین قیمت معتبر. منبع فعلاً پاسخ نمی‌دهد.";

export default function AssetRow({ asset }) {
  const price = asset?.price ?? null;
  const hasPrice =
    typeof price === "number" && Number.isFinite(price) && price >= 0;
  const previousPriceRef = useRef(price);
  const [flashDirection, setFlashDirection] = useState(null);
  const hasFiniteChange =
    typeof asset?.changePercent === "number" &&
    Number.isFinite(asset.changePercent);
  const changePercent = hasFiniteChange ? asset.changePercent : null;
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
  const isStale = asset?.isStale === true;
  const title = asset?.id === "usd" ? "دلار" : asset?.title;

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
      FLASH_DURATION_MS,
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
      className={`overflow-hidden rounded-row border bg-surface ${
        isStale ? "border-dashed border-warn" : "border-line"
      } ${flashClass}`}
    >
      <div className="px-4 py-4 sm:px-4 lg:px-3 xl:px-4">
        <h3 className="min-w-0 truncate text-right font-semibold text-text sm:text-lg lg:text-base xl:text-lg">
          {title}
        </h3>

        <div className="mt-3 flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0 text-right">
            <p className="tala-numeric whitespace-nowrap text-base font-bold text-text sm:text-lg lg:text-base xl:text-lg">
              {formatToman(price)}
            </p>
            <p className="mt-1 text-xs text-muted">
              {asset?.unit === "گرم" ? "تومان / گرم" : "تومان"}
            </p>
          </div>

          {hasPrice && hasFiniteChange && (
            <p
              className={`inline-flex shrink-0 items-center justify-center gap-1 rounded-pill px-2 py-1.5 text-xs font-semibold tala-numeric sm:px-3 sm:text-sm ${changeBadgeColor}`}
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
        <p className="mx-3 mb-3 rounded-control border border-dashed border-warn px-3 py-2 text-right text-sm text-warn sm:mx-4">
          {STALE_MESSAGE}
        </p>
      )}
    </article>
  );
}
