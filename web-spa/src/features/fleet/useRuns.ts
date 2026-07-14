import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { listRuns, type ListRunsQuery } from '../../api'

/** How often the fleet board re-polls the seam. */
export const FLEET_POLL_MS = 4000

/**
 * The live fleet list (`GET /runs`), POLLED every ~4s — the fleet is a polled
 * surface by decision, not SSE. `keepPreviousData` holds the last board on
 * screen across a refetch or a filter change so cards don't flash to a spinner.
 */
export function useRuns(query: ListRunsQuery) {
  return useQuery({
    queryKey: ['runs', query],
    queryFn: ({ signal }) => listRuns(query, { signal }),
    refetchInterval: FLEET_POLL_MS,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  })
}
