"use client";

import { useEffect, useRef, useState } from "react";

import { useGoldPrices } from "@/app/hooks/useGoldPrices";
import Skeleton from "@/components/Skeleton";
import { formatToman } from "@/utils/formatPrice";

const TRACKED_ASSETS = [
  { id: "coin", title: "سکه تمام امامی" },
  { id: "bahar", title: "سکه بهار آزادی" },
  { id: "gold18k", title: "طلای ۱۸ عیار" },
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
  const { data, isLoading } = useGoldPrices();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const closeButtonRef = useRef(null);
  const assets = data?.assets ?? {};
  const isInitialLoading = isLoading && !data;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [isOpen]);

  return (
    <section className="mt-8">
      <button
        className="flex w-full items-center gap-4 rounded-hero border border-line bg-surface p-5 text-right transition hover:border-brand/60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand sm:p-6"
        onClick={() => setIsOpen(true)}
        ref={triggerRef}
        type="button"
      >
        <svg
          aria-hidden="true"
          className="size-6 shrink-0 text-brand"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M4 19.25h16M6.5 16v-4m5 4V6m5 10v-7"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          <path
            d="m5.5 9 5-4 5 2 4-3"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
        <span>
          <span className="block text-lg font-bold text-brand sm:text-xl">
            بیشترین و کمترین قیمت ۲۴ ساعته
          </span>
          <span className="mt-1 block text-sm text-muted">
            بازه روزانه دارایی‌ها را مشاهده کنید.
          </span>
        </span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <section
            aria-labelledby="min-max-tracker-title"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-2xl sm:p-6"
            role="dialog"
          >
            <header className="mb-5 flex items-center justify-between gap-4 border-b border-line pb-4">
              <h2
                className="text-lg font-bold text-brand sm:text-xl"
                id="min-max-tracker-title"
              >
                بیشترین و کمترین قیمت ۲۴ ساعته
              </h2>
              <button
                aria-label="بستن آمار قیمت ۲۴ ساعته"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-control text-muted transition hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                onClick={() => setIsOpen(false)}
                ref={closeButtonRef}
                type="button"
              >
                <svg
                  aria-hidden="true"
                  className="size-5"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="m6 6 12 12M18 6 6 18"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="2"
                  />
                </svg>
              </button>
            </header>

            <div
              aria-busy={isInitialLoading}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              {TRACKED_ASSETS.map(({ id, title }) => {
                const asset = assets[id];
                const high24h = isValidPrice(asset?.high24h)
                  ? asset.high24h
                  : null;
                const low24h = isValidPrice(asset?.low24h)
                  ? asset.low24h
                  : null;
                const isLoadingHigh = isInitialLoading && high24h === null;
                const isLoadingLow = isInitialLoading && low24h === null;

                return (
                  <article
                    className="rounded-xl border border-line bg-surface p-4 text-right"
                    key={id}
                  >
                    <h3 className="font-semibold text-text">{title}</h3>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-up">
                        ▲ بیشترین
                      </span>
                      <span className="font-bold text-text tala-numeric">
                        {isLoadingHigh ? (
                          <Skeleton className="inline-block h-4 w-24 align-middle" />
                        ) : (
                          <>
                            {formatToman(high24h)}
                            <span className="mr-1 text-xs font-medium text-muted">
                              تومان
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-down">
                        ▼ کمترین
                      </span>
                      <span className="font-bold text-text tala-numeric">
                        {isLoadingLow ? (
                          <Skeleton className="inline-block h-4 w-24 align-middle" />
                        ) : (
                          <>
                            {formatToman(low24h)}
                            <span className="mr-1 text-xs font-medium text-muted">
                              تومان
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
