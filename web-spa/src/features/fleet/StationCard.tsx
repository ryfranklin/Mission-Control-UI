import type { RunDetail } from '../../api'
import { StatusBadge } from '../../components/StatusBadge'
import { formatElapsed, formatTimestamp, parseTimestamp } from '../../lib/format'
import { statusPresentation, taskTypeLabel, TONE_BORDER } from '../../lib/status'
import { CostReadout } from './CostReadout'

/**
 * A single active-run "station card": status, target, task type (sim/burn),
 * the cost-honest readout, and a T+ elapsed clock. `now` is passed in from the
 * board so every card's clock ticks off one shared timer.
 */
export function StationCard({ run, now }: { run: RunDetail; now: number }) {
  const { tone, terminal } = statusPresentation(run.status)
  const start = parseTimestamp(run.started_at) ?? parseTimestamp(run.created_at)
  const end = parseTimestamp(run.ended_at)
  const elapsedMs = start == null ? null : (terminal && end != null ? end : now) - start

  return (
    <article
      className={`mc-panel flex flex-col gap-3 border-l-2 p-4 ${TONE_BORDER[tone]}`}
      aria-label={`Run ${run.run_id}`}
    >
      <header className="flex items-start justify-between gap-2">
        <StatusBadge status={run.status} />
        <span className="rounded border border-console-line px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wider text-readout-muted">
          {taskTypeLabel(run.task_type)}
        </span>
      </header>

      <div className="min-w-0">
        <p className="text-[0.6rem] uppercase tracking-wider text-readout-muted">Target</p>
        <p className="truncate text-sm text-readout" title={run.target ?? undefined}>
          {run.target ?? '—'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[0.6rem] uppercase tracking-wider text-readout-muted">Cost</p>
          <CostReadout costUsd={run.cost_usd} status={run.status} />
        </div>
        <div>
          <p className="text-[0.6rem] uppercase tracking-wider text-readout-muted">
            {terminal ? 'Duration' : 'Elapsed'}
          </p>
          <p
            className={`text-lg tabular-nums ${
              terminal ? 'text-readout' : 'text-status-telemetry'
            }`}
            title={`Started ${formatTimestamp(run.started_at ?? run.created_at)}`}
          >
            {elapsedMs == null ? 'T+ --:--:--' : formatElapsed(elapsedMs)}
          </p>
        </div>
      </div>

      <footer className="flex items-center justify-between border-t border-console-line pt-2">
        <span className="truncate font-mono text-[0.65rem] text-readout-muted" title={run.run_id}>
          {run.run_id}
        </span>
        {/* Run station is a later unit — placeholder affordance, not yet wired. */}
        <span
          aria-disabled
          title="Run station — available in a later unit"
          className="cursor-not-allowed select-none whitespace-nowrap text-[0.6rem] uppercase tracking-wider text-readout-dim"
        >
          Station ▸
        </span>
      </footer>
    </article>
  )
}
