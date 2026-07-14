import { useEffect, useMemo, useState } from 'react'

import type { ListRunsQuery, RunDetail } from '../../api'
import { QueryState } from '../../components/QueryState'
import { Segmented } from '../../components/Segmented'
import { Select } from '../../components/Select'
import { parseTimestamp } from '../../lib/format'
import { isTerminal } from '../../lib/status'
import { RANGE_OPTIONS, resolveRange, type RangeKey } from '../../lib/timeRange'
import { useNow } from '../../lib/useNow'
import { useTargets } from '../useTargets'
import { FLEET_POLL_MS, useRuns } from './useRuns'
import { StationCard } from './StationCard'

const PAGE_SIZE = 24

type SortKey = 'recent' | 'cost' | 'elapsed'

const SORT_OPTIONS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: 'recent', label: 'Recent' },
  { key: 'cost', label: 'Cost' },
  { key: 'elapsed', label: 'Elapsed' },
]

/**
 * FLEET — the polled board of active-run station cards.
 *
 * Server-side params drive the coarse scope (target, time window, paging); the
 * finer board view (status filter, sort) is applied client-side over the page,
 * so we never guess the seam's private `order` token or filter by a status
 * string we can't enumerate. Refresh is TanStack Query polling (~4s), not SSE.
 */
export function FleetView() {
  const [target, setTarget] = useState('all')
  const [range, setRange] = useState<RangeKey>('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sort, setSort] = useState<SortKey>('recent')
  const [offset, setOffset] = useState(0)

  const targetsQuery = useTargets()

  const query: ListRunsQuery = useMemo(() => {
    const { from, to } = resolveRange(range)
    return {
      limit: PAGE_SIZE,
      offset,
      ...(target !== 'all' ? { target } : {}),
      ...(from ? { created_from: from } : {}),
      ...(to ? { created_to: to } : {}),
    }
  }, [target, range, offset])

  const runsQuery = useRuns(query)
  const runs = runsQuery.data?.runs ?? []
  const total = runsQuery.data?.total ?? 0

  // Accumulate the distinct statuses we have seen so the status filter can
  // offer real options without a second (circular) query.
  const [seenStatuses, setSeenStatuses] = useState<string[]>([])
  useEffect(() => {
    if (!runs.length) return
    setSeenStatuses((prev) => {
      const next = new Set(prev)
      for (const r of runs) if (r.status) next.add(r.status)
      return next.size === prev.length ? prev : Array.from(next).sort()
    })
  }, [runs])

  const viewRuns = useMemo(() => sortRuns(filterByStatus(runs, statusFilter), sort), [
    runs,
    statusFilter,
    sort,
  ])

  // The T+ clocks only need to tick while something on the board is in flight.
  const anyInFlight = viewRuns.some((r) => !isTerminal(r.status))
  const now = useNow(anyInFlight)

  const resetPaging = () => setOffset(0)

  const targetOptions = [
    { value: 'all', label: 'All targets' },
    ...(targetsQuery.data ?? []).map((t) => ({ value: t, label: t })),
  ]
  const statusOptions = [
    { value: 'all', label: 'All status' },
    ...seenStatuses.map((s) => ({ value: s, label: s.toUpperCase() })),
  ]

  const page = Math.floor(offset / PAGE_SIZE) + 1
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <section aria-label="Fleet" className="flex flex-col gap-4">
      <div className="mc-panel flex flex-wrap items-center gap-x-5 gap-y-3 p-3">
        <Select
          label="Target"
          value={target}
          options={targetOptions}
          onChange={(v) => {
            setTarget(v)
            resetPaging()
          }}
        />
        <Select
          label="Status"
          value={statusFilter}
          options={statusOptions}
          onChange={setStatusFilter}
        />
        <Segmented
          label="Window"
          value={range}
          options={RANGE_OPTIONS}
          onChange={(v) => {
            setRange(v)
            resetPaging()
          }}
        />
        <Segmented label="Sort" value={sort} options={SORT_OPTIONS} onChange={setSort} />
        <span className="ml-auto flex items-center gap-2 text-[0.6rem] uppercase tracking-wider text-readout-muted">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              runsQuery.isFetching ? 'bg-status-telemetry shadow-glow-telemetry' : 'bg-readout-dim'
            }`}
            aria-hidden
          />
          Live · {(FLEET_POLL_MS / 1000).toFixed(0)}s poll
        </span>
      </div>

      <QueryState
        isLoading={runsQuery.isLoading}
        error={runsQuery.error}
        isEmpty={viewRuns.length === 0}
        emptyLabel="No runs on the board"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {viewRuns.map((run) => (
            <StationCard key={run.run_id} run={run} now={now} />
          ))}
        </div>
      </QueryState>

      <div className="flex items-center justify-between text-xs text-readout-muted">
        <span className="tabular-nums">
          {viewRuns.length} shown · {total} total
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

function filterByStatus(runs: RunDetail[], statusFilter: string): RunDetail[] {
  if (statusFilter === 'all') return runs
  return runs.filter((r) => r.status === statusFilter)
}

function sortRuns(runs: RunDetail[], sort: SortKey): RunDetail[] {
  const copy = [...runs]
  switch (sort) {
    case 'cost':
      return copy.sort((a, b) => (b.cost_usd ?? 0) - (a.cost_usd ?? 0))
    case 'elapsed':
      return copy.sort((a, b) => elapsedStart(a) - elapsedStart(b))
    case 'recent':
    default:
      return copy.sort((a, b) => createdAt(b) - createdAt(a))
  }
}

function createdAt(run: RunDetail): number {
  return parseTimestamp(run.created_at) ?? parseTimestamp(run.started_at) ?? 0
}

/** Earlier start ⇒ longer running; used to sort by elapsed (longest first). */
function elapsedStart(run: RunDetail): number {
  return parseTimestamp(run.started_at) ?? parseTimestamp(run.created_at) ?? Number.MAX_SAFE_INTEGER
}
