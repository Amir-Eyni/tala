"use client";

import { useGoldPrices } from "@/app/hooks/useGoldPrices";
import AssetRow from "@/components/AssetRow";
import Skeleton from "@/components/Skeleton";
import { ASSET_IDS, ASSETS } from "@/utils/constants";

function AssetRowSkeleton({ title, unit }) {
  return (
    <article className="overflow-hidden rounded-row border border-line bg-surface">
      <div className="px-4 py-4 sm:px-4 lg:px-3 xl:px-4">
        <h3 className="min-w-0 truncate text-right font-semibold text-text sm:text-lg lg:text-base xl:text-lg">
          {title}
        </h3>

        <div className="mt-3 flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0 text-right">
            <Skeleton className="h-6 w-36 sm:h-7 sm:w-44" />
            <p className="mt-1 text-xs text-muted">
              {unit === "گرم" ? "تومان / گرم" : "تومان"}
            </p>
          </div>

          <Skeleton className="h-7 w-16 rounded-pill" />
        </div>
      </div>
    </article>
  );
}

export default function AssetRows() {
  const { data, isLoading, isError } = useGoldPrices();
  const assets = Object.entries(data?.assets ?? {});
  const isInitialLoading = isLoading && assets.length === 0;

  if (isInitialLoading) {
    return (
      <section
        aria-busy="true"
        aria-label="دارایی‌ها"
        className="mt-row-gap grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        <span className="sr-only" role="status">
          در حال دریافت قیمت‌ها…
        </span>
        {ASSET_IDS.map((id) => (
          <AssetRowSkeleton key={id} {...ASSETS[id]} />
        ))}
      </section>
    );
  }

  if (assets.length === 0) {
    return (
      <section
        aria-label="دارایی‌ها"
        className="mt-row-gap rounded-row border border-dashed border-line bg-surface p-5 text-right"
      >
        <p className="text-sm text-muted" role="status">
          {isError
            ? "دریافت قیمت‌ها ناموفق بود. به‌زودی دوباره تلاش می‌شود."
            : "قیمتی برای نمایش وجود ندارد."}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="دارایی‌ها"
      className="mt-row-gap grid grid-cols-1 gap-4 md:grid-cols-2"
    >
      {assets.map(([assetId, asset]) => (
        <AssetRow key={assetId} asset={asset} />
      ))}
    </section>
  );
}
