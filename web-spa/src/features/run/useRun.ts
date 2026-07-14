import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  approveRun,
  cancelRun,
  getRun,
  getRunChanges,
  rejectRun,
  scrubRun,
  type RunChanges,
  type RunDetail,
} from '../../api'
import { isTerminal } from '../../lib/status'

/** Query key for a single run's detail — shared so actions can invalidate it. */
export const runKey = (runId: string) => ['run', runId] as const
export const runChangesKey = (runId: string) => ['run-changes', runId] as const

/** How often run detail re-polls while the run is still in flight. */
const RUN_POLL_MS = 4000

/**
 * `GET /runs/{id}` — the run station header source. Polls while the run is
 * non-terminal (so status/elapsed stay live even between SSE frames) and stops
 * once it settles. The SSE terminal frame also invalidates this key, so the
 * final state lands promptly rather than on the next poll tick.
 */
export function useRun(runId: string, enabled = true) {
  return useQuery({
    queryKey: runKey(runId),
    queryFn: ({ signal }) => getRun(runId, { signal }),
    enabled: enabled && !!runId,
    refetchInterval: (query) => (isTerminal(query.state.data?.status) ? false : RUN_POLL_MS),
    refetchIntervalInBackground: false,
  })
}

/**
 * `GET /runs/{id}/changes` — the go/no-go change set (files + counts) shown at
 * the gate. Only fetched when the run is awaiting the gate, since it is
 * meaningless before the diff exists.
 */
export function useRunChanges(runId: string, enabled: boolean) {
  return useQuery<RunChanges>({
    queryKey: runChangesKey(runId),
    queryFn: ({ signal }) => getRunChanges(runId, { signal }),
    enabled: enabled && !!runId,
    staleTime: 5_000,
  })
}

export type RunAction = 'approve' | 'reject' | 'scrub' | 'cancel'

/**
 * The gate command mutations: approve (GO), reject (NO-GO), scrub, cancel.
 *
 * The UI is a thin client — it only TRANSMITS the operator's decision; the seam
 * resolves the run asynchronously. After any action we invalidate the run
 * detail, its change set, and the fleet list so every surface reflects the new
 * state without a manual refresh.
 */
export function useRunActions(runId: string) {
  const qc = useQueryClient()

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: runKey(runId) })
    void qc.invalidateQueries({ queryKey: runChangesKey(runId) })
    void qc.invalidateQueries({ queryKey: ['runs'] }) // fleet board
  }

  const settle = (data: { status?: string } | undefined) => {
    // Optimistically fold the accepted transition's status into the cache so
    // the header reflects it immediately, then invalidate to reconcile.
    if (data?.status) {
      qc.setQueryData<RunDetail>(runKey(runId), (prev) =>
        prev ? { ...prev, status: data.status as string } : prev,
      )
    }
    invalidate()
  }

  return useMutation({
    mutationFn: (action: RunAction) => {
      switch (action) {
        case 'approve':
          return approveRun(runId)
        case 'reject':
          return rejectRun(runId)
        case 'scrub':
          return scrubRun(runId)
        case 'cancel':
          return cancelRun(runId)
      }
    },
    onSuccess: (data) => settle(data),
  })
}
