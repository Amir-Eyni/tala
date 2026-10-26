"use client";

import { useGoldPrices } from "@/app/hooks/useGoldPrices";
import {
  directionSymbol,
  formatPercent,
  formatToman,
} from "@/utils/formatPrice";

export default function HeroCard() {
  const { data } = useGoldPrices();
  const gold = data?.assets?.gold18k;
  const hasPrice =
    typeof gold?.price === "number" &&
    Number.isFinite(gold.price) &&
    gold.price >= 0;
  const hasChange =
    typeof gold?.changePercent === "number" && Number.isFinite(gold.changePercent);
  const changePercent = hasChange ? gold.changePercent : null;
  const direction =
    hasChange && changePercent > 0
      ? "up"
      : hasChange && changePercent < 0
        ? "down"
        : "flat";
  const changeColor =
    direction === "up"
      ? "text-up"
      : direction === "down"
        ? "text-down"
        : "text-muted";
  const isStale = gold?.isStale === true;

  return (
    <section
      aria-labelledby="hero-gold-title"
      className={`mt-6 overflow-hidden rounded-hero border bg-surface p-6 text-center shadow-lg shadow-black/10 sm:p-10 ${
        isStale ? "border-dashed border-warn" : "border-line"
      }`}
    >
      <h2
        className="text-lg font-bold text-brand sm:text-xl"
        id="hero-gold-title"
      >
        طلای ۱۸ عیار
      </h2>

      <div className="mt-5 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
        <p className="tala-numeric text-hero font-bold text-text">
          {formatToman(gold?.price)}
        </p>
        <span className="text-base font-medium text-muted">تومان</span>
      </div>

      {hasPrice && hasChange && (
        <p
          className={`mt-4 inline-flex items-center gap-2 rounded-pill bg-surface-2 px-4 py-2 font-semibold tala-numeric ${changeColor}`}
          aria-label={`تغییر قیمت ${formatPercent(changePercent)}`}
        >
          {directionSymbol(direction) && (
            <span aria-hidden="true">{directionSymbol(direction)}</span>
          )}
          <span>{formatPercent(changePercent)}</span>
        </p>
      )}

      {isStale && (
        <p className="mt-5 border-t border-dashed border-warn/60 pt-4 text-sm text-warn">
          آخرین قیمت معتبر. منبع فعلاً پاسخ نمی‌دهد.
        </p>
      )}
    </section>
  );
}
