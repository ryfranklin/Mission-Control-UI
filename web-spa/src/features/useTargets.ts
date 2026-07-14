import { useQuery } from '@tanstack/react-query'

import { listTargets } from '../api'

/**
 * Known deploy targets (`GET /targets`) — feeds the target filter on both the
 * Fleet and Metrics views. Targets change rarely, so this is cached longer
 * than the live fleet poll.
 */
export function useTargets() {
  return useQuery({
    queryKey: ['targets'],
    queryFn: ({ signal }) => listTargets({ signal }),
    staleTime: 60_000,
    select: (data) => data.targets,
  })
}
