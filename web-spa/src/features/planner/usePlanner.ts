import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  finalizePlan,
  getPlan,
  listPlans,
  openPlan,
  type ListPlansQuery,
  type OpenPlanRequest,
} from '../../api'

/**
 * TanStack Query bindings for the Planner console. One `queryClient`, one fetch
 * layer (the typed API client) — this module only assembles keys + cache policy.
 */

/** How often the plan list re-polls so dispatched-burn progress surfaces. */
export const PLANS_POLL_MS = 8000

const PLANS_ROOT = 'plans'
export const plansKey = (query: ListPlansQuery) => [PLANS_ROOT, query] as const
export const planKey = (planId: string) => ['plan', planId] as const

/**
 * The plan list (`GET /plans`). Gently polled — a plan's stage/status advances
 * as its finalized units burn — with `keepPreviousData` so the board holds
 * across refetches and filter changes rather than flashing to a spinner.
 */
export function usePlans(query: ListPlansQuery) {
  return useQuery({
    queryKey: plansKey(query),
    queryFn: ({ signal }) => listPlans(query, { signal }),
    refetchInterval: PLANS_POLL_MS,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  })
}

/**
 * A single plan aggregate (`GET /plans/{id}`) — the transcript + live PLAN
 * PANEL. NOT polled: the plan mutates only in response to operator turns and
 * finalize, both of which invalidate this key explicitly.
 */
export function usePlan(planId: string) {
  return useQuery({
    queryKey: planKey(planId),
    queryFn: ({ signal }) => getPlan(planId, { signal }),
    enabled: !!planId,
  })
}

/** `POST /plans` — open a new INCEPTION session. Invalidates the plan list. */
export function useOpenPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: OpenPlanRequest) => openPlan(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [PLANS_ROOT] })
    },
  })
}

/**
 * `POST /plans/{id}/finalize` — dispatch the Flight Plan's units as gated
 * burns. On success we seed the fresh detail, then invalidate the plan, the
 * plan list, AND the runs ledger — the Fleet/Run-station surfaces now take over
 * showing those burns.
 */
export function useFinalizePlan(planId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => finalizePlan(planId),
    onSuccess: (data) => {
      qc.setQueryData(planKey(planId), data)
      void qc.invalidateQueries({ queryKey: [PLANS_ROOT] })
      void qc.invalidateQueries({ queryKey: ['runs'] })
      void qc.invalidateQueries({ queryKey: planKey(planId) })
    },
  })
}
