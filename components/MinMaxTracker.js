"use client";

import { useGoldPrices } from "@/app/hooks/useGoldPrices";
import { formatToman } from "@/utils/formatPrice";

const TRACKED_ASSETS = [
  { id: "gold18k", title: "طلای ۱۸ عیار" },
  { id: "coin", title: "سکه تمام امامی" },
  { id: "gold24k", title: "طلای ۲۴ عیار" },
  { id: "silver", title: "نقره" },
  { id: "usdt", title: "تتر" },
  { id: "euro", title: "یورو" },
  { id: "usd", title: "دلار" },
];

function isValidPrice(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export default function MinMaxTracker() {
  const { data } = useGoldPrices();
  const assets = data?.assets ?? {};

  return (
    <section
      aria-labelledby="min-max-tracker-title"
      className="mt-8"
    >
      <div className="mb-4 text-right">
        <h2
          className="text-lg font-bold text-brand sm:text-xl"
          id="min-max-tracker-title"
        >
          بیشترین و کمترین قیمت ۲۴ ساعته
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TRACKED_ASSETS.map(({ id, title }) => {
          const asset = assets[id];
          const high24h = isValidPrice(asset?.high24h)
            ? asset.high24h
            : null;
          const low24h = isValidPrice(asset?.low24h)
            ? asset.low24h
            : null;

          return (
            <article
              className="rounded-row border border-line bg-surface p-4 text-right"
              key={id}
            >
              <h3 className="font-semibold text-text">{title}</h3>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-up">
                  ▲ بیشترین
                </span>
                <span className="font-bold text-text tala-numeric">
                  {formatToman(high24h)}
                  <span className="mr-1 text-xs font-medium text-muted">
                    تومان
                  </span>
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-down">
                  ▼ کمترین
                </span>
                <span className="font-bold text-text tala-numeric">
                  {formatToman(low24h)}
                  <span className="mr-1 text-xs font-medium text-muted">
                    تومان
                  </span>
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
