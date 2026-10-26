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
  const directionColor =
    direction === "up"
      ? "text-up"
      : direction === "down"
        ? "text-down"
        : "text-muted";
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
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-4 sm:gap-6 sm:px-6 sm:py-row-y">
        <h3 className="min-w-0 text-right font-semibold text-text sm:text-lg">
          {title}
        </h3>

        <div className="text-center">
          <p className="tala-row-price tala-numeric whitespace-nowrap font-bold text-text">
            {formatToman(price)}
          </p>
          <p className="mt-1 text-xs text-muted sm:text-sm">
            {asset?.unit === "گرم" ? "تومان / گرم" : "تومان"}
          </p>
        </div>

        {hasPrice && hasFiniteChange && (
          <p
            className={`inline-flex min-w-20 items-center justify-center gap-1 rounded-pill bg-surface-2 px-3 py-1.5 text-sm font-semibold tala-numeric ${directionColor}`}
            aria-label={`تغییر قیمت ${formatPercent(changePercent)}`}
          >
            {directionSymbol(direction) && (
              <span aria-hidden="true">{directionSymbol(direction)}</span>
            )}
            <span>{formatPercent(changePercent)}</span>
          </p>
        )}
      </div>

      {isStale && (
        <p className="mx-3 mb-3 rounded-control border border-dashed border-warn px-3 py-2 text-right text-sm text-warn sm:mx-4">
          {STALE_MESSAGE}
        </p>
      )}
    </article>
  );
}
