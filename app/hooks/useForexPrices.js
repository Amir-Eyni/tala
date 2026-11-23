"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  FOREX_CLIENT_REFETCH_INTERVAL_MS,
  FOREX_CLIENT_STALE_TIME_MS,
} from "@/utils/forexConstants";
import { fetchForexPrices } from "@/utils/forexClient";

export const FOREX_PRICES_QUERY_KEY = Object.freeze(["forex-prices"]);

export function useForexPrices({ enabled = true } = {}) {
  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: FOREX_PRICES_QUERY_KEY,
    queryFn: fetchForexPrices,
    refetchInterval: FOREX_CLIENT_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    staleTime: FOREX_CLIENT_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    enabled,
  });

  return { data, isLoading, isFetching, isError };
}
