"use client";

import { useGoldPrices } from "@/app/hooks/useGoldPrices";
import AssetRow from "@/components/AssetRow";

export default function AssetRows() {
  const { data } = useGoldPrices();
  const assets = Object.entries(data?.assets ?? {});

  if (assets.length === 0) {
    return null;
  }

  return (
    <section aria-label="سایر دارایی‌ها" className="mt-row-gap space-y-row-gap">
      {assets.map(([assetId, asset]) => (
        <AssetRow key={assetId} asset={asset} />
      ))}
    </section>
  );
}
