import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { QueryState } from '../../components/QueryState'
import { isTerminal } from '../../lib/status'
import { PlanPanel } from './PlanPanel'
import { Transcript } from './Transcript'
import { planKey, usePlan } from './usePlanner'
import { usePlanTurnStream } from './usePlanTurnStream'

/**
 * PLAN CONSOLE — the hero. An INCEPTION session as a streamed, terminal-styled
 * conversation beside the live Flight Plan.
 *
 * `usePlan` owns the plan aggregate; `usePlanTurnStream` transmits an operator
 * turn and streams the Flight Director's reply token-by-token. When a turn
 * settles the stream hook awaits a plan refresh (below) so the PLAN PANEL
 * reflects the new requirements/units/stage before the live turn is retired.
 */
export function PlanConsoleView({ planId, onExit }: { planId: string; onExit: () => void }) {
  const qc = useQueryClient()
  const planQuery = usePlan(planId)
  const plan = planQuery.data

  const refreshPlan = useCallback(
    () => qc.invalidateQueries({ queryKey: planKey(planId) }),
    [qc, planId],
  )
  const stream = usePlanTurnStream(planId, refreshPlan)

  // Turns are closed once the plan has reached a terminal status.
  const closed = isTerminal(plan?.status)

  return (
    <section aria-label="Plan console" className="flex flex-col gap-4">
      <nav className="flex items-center gap-2 text-[0.6rem] uppercase tracking-wider text-readout-muted">
        <a href="#/planner" onClick={onExit} className="hover:text-readout">
          ◂ Planner
        </a>
        <span aria-hidden className="text-readout-dim">
          /
        </span>
        <span className="truncate font-mono text-readout" title={planId}>
          {planId}
        </span>
      </nav>

      <QueryState
        isLoading={planQuery.isLoading}
        error={planQuery.error}
        isEmpty={!plan}
        emptyLabel="Plan not found"
      >
        {plan && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-start">
            <div className="flex flex-col gap-3">
              <Transcript
                turns={plan.turns ?? []}
                live={stream.live}
                connected={!planQuery.isError}
              />
              <TurnComposer
                onSend={stream.send}
                busy={stream.busy}
                closed={closed}
                onRetryDismiss={stream.live?.phase === 'error' ? stream.reset : undefined}
              />
            </div>

            <PlanPanel plan={plan} planId={planId} />
          </div>
        )}
      </QueryState>
    </section>
  )
}

function TurnComposer({
  onSend,
  busy,
  closed,
  onRetryDismiss,
}: {
  onSend: (content: string) => void
  busy: boolean
  closed: boolean
  onRetryDismiss?: () => void
}) {
  const [value, setValue] = useState('')
  const disabled = busy || closed
  const canSend = value.trim() !== '' && !disabled

  const submit = () => {
    if (!canSend) return
    onSend(value)
    setValue('')
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter transmits; Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="mc-panel flex flex-col gap-2 p-3">
      {onRetryDismiss && (
        <button
          type="button"
          onClick={onRetryDismiss}
          className="self-start text-[0.55rem] uppercase tracking-wider text-status-fault hover:text-readout"
        >
          ✕ Clear fault
        </button>
      )}
      <div className="flex items-end gap-2">
        <span aria-hidden className="pb-2 text-status-telemetry">
          ▸
        </span>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          disabled={disabled}
          spellCheck
          aria-label="Operator turn"
          placeholder={
            closed
              ? 'Session closed — plan has reached a terminal state'
              : busy
                ? 'Awaiting Flight Director…'
                : 'Transmit a turn to the Flight Director…  (Enter to send · Shift+Enter for newline)'
          }
          className="min-h-[3rem] flex-1 resize-y rounded border border-console-line bg-console-raised px-2 py-1.5 font-mono text-xs text-readout outline-none placeholder:text-readout-dim focus:border-status-telemetry disabled:opacity-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          className="shrink-0 rounded border border-status-telemetry/60 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-status-telemetry transition-colors enabled:hover:bg-status-telemetry/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? '◆ Live' : 'Transmit ▸'}
        </button>
      </div>
    </div>
  )
}
