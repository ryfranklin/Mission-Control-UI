import { useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { QueryState } from '../../components/QueryState'
import { isTerminal } from '../../lib/status'
import { CostTicker } from './CostTicker'
import { GateDiff } from './GateDiff'
import { GatePanel } from './GatePanel'
import { LiveTimeline } from './LiveTimeline'
import { RunDetailHeader } from './RunDetailHeader'
import { deriveBurnSummary, deriveNodeAnnotations, isAwaitingGate } from './runModel'
import { SequenceRail } from './SequenceRail'
import { runKey, useRun, useRunActions, useRunChanges } from './useRun'
import { useRunEvents } from './useRunEvents'

/**
 * RUN STATION — the per-run hero view: lifecycle rail, live SSE telemetry,
 * priced cost ticker, run detail, and the gate command panel. Reached from a
 * Fleet station card via the `#/runs/{id}` hash route.
 *
 * The view is a thin composition: `useRun` owns the detail header, `useRunEvents`
 * owns the durable SSE feed, and `useRunActions` transmits the operator's gate
 * decision. When the SSE feed settles (terminal frame) we invalidate the run
 * detail so the header reflects the reconciled status promptly.
 */
export function RunStationView({ runId, onExit }: { runId: string; onExit: () => void }) {
  const runQuery = useRun(runId)
  const feed = useRunEvents(runId)
  const actions = useRunActions(runId)
  const qc = useQueryClient()

  const run = runQuery.data
  const terminal = feed.terminal
  const detailTerminal = isTerminal(run?.status)

  // Settle the header when the stream reaches its terminal frame.
  useEffect(() => {
    if (terminal && !detailTerminal) {
      void qc.invalidateQueries({ queryKey: runKey(runId) })
    }
  }, [terminal, detailTerminal, qc, runId])

  const awaitingGate = isAwaitingGate(run?.status, feed.railPhases, terminal)
  const inFlight = !!run && !detailTerminal && terminal == null
  const live = feed.connection === 'open' || feed.connection === 'connecting'

  // Per-node outcome annotations + the compact burn summary, both derived from
  // the same event feed that lights the rail (no extra I/O).
  const annotations = useMemo(
    () => deriveNodeAnnotations(feed.transitions, feed.railPhases),
    [feed.transitions, feed.railPhases],
  )
  const burnSummary = useMemo(
    () => deriveBurnSummary(annotations, feed.transitions),
    [annotations, feed.transitions],
  )

  // Fetch the change set both at the gate (live decision material) and once a
  // burn has landed (the seam persists the applied diff). Skip settled sims —
  // they have no diff, so we avoid a needless 404.
  const isSim = run?.task_type?.trim().toLowerCase() === 'sim'
  const changesEnabled = awaitingGate || (detailTerminal && !isSim)
  const changesQuery = useRunChanges(runId, changesEnabled)

  // Show the panel at the gate always; post-landing only when a diff exists.
  const hasChangeData =
    !!changesQuery.data &&
    (Array.isArray(changesQuery.data)
      ? changesQuery.data.length > 0
      : Object.keys(changesQuery.data).length > 0)
  const showGateDiff = awaitingGate || (detailTerminal && hasChangeData)

  return (
    <section aria-label="Run station" className="flex flex-col gap-4">
      <nav className="flex items-center gap-2 text-[0.6rem] uppercase tracking-wider text-readout-muted">
        <a href="#/fleet" onClick={onExit} className="hover:text-readout">
          ◂ Fleet
        </a>
        <span aria-hidden className="text-readout-dim">
          /
        </span>
        <span className="truncate font-mono text-readout" title={runId}>
          {runId}
        </span>
      </nav>

      <QueryState
        isLoading={runQuery.isLoading}
        error={runQuery.error}
        isEmpty={!run}
        emptyLabel="Run not found"
      >
        {run && (
          <>
            <RunDetailHeader run={run} connection={feed.connection} />
            <SequenceRail
              phases={feed.railPhases}
              annotations={annotations}
              summary={burnSummary}
              transitions={feed.transitions}
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
              <LiveTimeline transitions={feed.transitions} live={live && !terminal} />

              <div className="flex flex-col gap-4">
                <CostTicker
                  accruedCost={feed.accruedCost}
                  tokenTally={feed.tokenTally}
                  terminal={terminal}
                  liveStatus={run.status}
                  reconciledCost={run.cost_usd}
                />
                <GatePanel awaitingGate={awaitingGate} inFlight={inFlight} actions={actions} />
                {showGateDiff && (
                  <GateDiff
                    changes={changesQuery.data}
                    isLoading={changesQuery.isLoading}
                    error={changesQuery.error}
                    atGate={awaitingGate}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </QueryState>
    </section>
  )
}
