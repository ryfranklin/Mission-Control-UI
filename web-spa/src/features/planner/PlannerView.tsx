import { useMemo, useState } from 'react'

import type { ListPlansQuery, PlanSummary } from '../../api'
import { QueryState } from '../../components/QueryState'
import { StatusBadge } from '../../components/StatusBadge'
import { formatTimestamp, parseTimestamp } from '../../lib/format'
import { PlanCreateForm } from './PlanCreateForm'
import { PLANS_POLL_MS, usePlans } from './usePlanner'

const PAGE_SIZE = 20

/**
 * PLANNER — the Flight Plan roster plus the NEW-PLAN control.
 *
 * Lists plans (`GET /plans`, gently polled) and opens the INCEPTION session for
 * a new one. Selecting a plan navigates into the console hero via the shared
 * hash router (`#/plans/{id}`) — no second router.
 */
export function PlannerView({ onOpen }: { onOpen: (planId: string) => void }) {
  const [offset, setOffset] = useState(0)

  // The seam's `order` is a sort DIRECTION (`asc`|`desc`), not a UI label; its
  // default (`desc`) is already newest-first, i.e. "recent". Sending `recent`
  // 422s, so we ask for `desc` explicitly.
  const query: ListPlansQuery = useMemo(
    () => ({ limit: PAGE_SIZE, offset, order: 'desc' }),
    [offset],
  )

  const plansQuery = usePlans(query)
  const plans = plansQuery.data?.plans ?? []
  const total = plansQuery.data?.total ?? 0

  const page = Math.floor(offset / PAGE_SIZE) + 1
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <section aria-label="Planner" className="flex flex-col gap-4">
      <PlanCreateForm onOpened={(plan) => onOpen(plan.id)} />

      <div className="flex items-center justify-between px-1">
        <h2 className="text-[0.7rem] uppercase tracking-widest text-readout-muted">Flight Plans</h2>
        <span className="flex items-center gap-2 text-[0.6rem] uppercase tracking-wider text-readout-muted">
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              plansQuery.isFetching ? 'bg-status-telemetry shadow-glow-telemetry' : 'bg-readout-dim'
            }`}
          />
          Live · {(PLANS_POLL_MS / 1000).toFixed(0)}s poll
        </span>
      </div>

      <QueryState
        isLoading={plansQuery.isLoading}
        error={plansQuery.error}
        isEmpty={plans.length === 0}
        emptyLabel="No flight plans"
      >
        <ul className="flex flex-col gap-2">
          {plans.map((plan) => (
            <PlanRow key={plan.id} plan={plan} onOpen={onOpen} />
          ))}
        </ul>
      </QueryState>

      <div className="flex items-center justify-between text-xs text-readout-muted">
        <span className="tabular-nums">
          {plans.length} shown · {total} total
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded border border-console-line px-2 py-1 uppercase tracking-wider disabled:opacity-40 enabled:hover:text-readout"
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          >
            ◂ Prev
          </button>
          <span className="tabular-nums">
            {page} / {pageCount}
          </span>
          <button
            type="button"
            className="rounded border border-console-line px-2 py-1 uppercase tracking-wider disabled:opacity-40 enabled:hover:text-readout"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
          >
            Next ▸
          </button>
        </div>
      </div>
    </section>
  )
}

function PlanRow({ plan, onOpen }: { plan: PlanSummary; onOpen: (id: string) => void }) {
  const created = parseTimestamp(plan.created_at)
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(plan.id)}
        className="mc-panel flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-3 text-left transition-colors hover:border-status-telemetry/50"
      >
        <StatusBadge status={plan.status} />
        {plan.stage && (
          <span className="rounded border border-console-line px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wider text-status-telemetry">
            {plan.stage}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-readout" title={plan.target ?? undefined}>
            {plan.target ?? '— no target —'}
          </span>
          <span className="block truncate font-mono text-[0.6rem] text-readout-dim" title={plan.id}>
            {plan.id}
          </span>
        </span>
        <Meta label="Mode" value={plan.mode} />
        <Meta label="Methodology" value={plan.methodology} />
        <Meta label="Cloud" value={plan.cloud_target} />
        <span
          className="hidden text-[0.6rem] tabular-nums text-readout-dim sm:block"
          title={created ? formatTimestamp(plan.created_at) : undefined}
        >
          {created ? formatTimestamp(plan.created_at) : '—'}
        </span>
        <span className="text-[0.6rem] uppercase tracking-wider text-status-telemetry">Open ▸</span>
      </button>
    </li>
  )
}

function Meta({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <span className="hidden flex-col md:flex">
      <span className="text-[0.5rem] uppercase tracking-wider text-readout-dim">{label}</span>
      <span className="text-[0.7rem] uppercase tracking-wider text-readout-muted">
        {value?.trim() || '—'}
      </span>
    </span>
  )
}
