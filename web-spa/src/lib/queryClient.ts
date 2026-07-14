import { QueryClient } from '@tanstack/react-query'

/**
 * Shared TanStack Query client for the operator console.
 *
 * Defaults tuned for a live mission-control surface: data goes stale quickly
 * and refetches on focus so the operator always sees current fleet state.
 * Individual views tighten these (polling intervals, SSE-driven invalidation)
 * as they are built in later units.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})
