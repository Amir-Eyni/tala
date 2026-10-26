"use client";

import {
  keepPreviousData,
  useQuery,
} from "@tanstack/react-query";

import {
  CLIENT_REFETCH_INTERVAL_MS,
  CLIENT_STALE_TIME_MS,
} from "@/utils/constants";
import { fetchPrices } from "@/utils/pricesClient";

export const GOLD_PRICES_QUERY_KEY = Object.freeze(["prices"]);

export function useGoldPrices() {
  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: GOLD_PRICES_QUERY_KEY,
    queryFn: fetchPrices,
    refetchInterval: CLIENT_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: true,
    staleTime: CLIENT_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  return { data, isLoading, isFetching, isError };
}
