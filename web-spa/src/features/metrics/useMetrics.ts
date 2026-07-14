import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { getMetrics, type MetricsQuery } from '../../api'

/**
 * Cost/quality rollups (`GET /metrics`), scoped by target + time window. Not a
 * live board — refreshed on focus/stale rather than a tight poll. Previous data
 * is kept across a scope change so figures don't blank out mid-adjust.
 */
export function useMetrics(query: MetricsQuery) {
  return useQuery({
    queryKey: ['metrics', query],
    queryFn: ({ signal }) => getMetrics(query, { signal }),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}
