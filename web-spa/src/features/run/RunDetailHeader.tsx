import type { RunDetail } from '../../api'
import { Markdown } from '../../components/Markdown'
import { StatusBadge } from '../../components/StatusBadge'
import { formatElapsed, formatTimestamp, parseTimestamp } from '../../lib/format'
import { statusPresentation, taskTypeLabel } from '../../lib/status'
import { useNow } from '../../lib/useNow'
import type { FeedConnection } from './useRunEvents'

/**
 * RUN DETAIL header — target, task type (sim/burn), status, and a live T+
 * elapsed clock driven by the shared {@link useNow} tick. The clock only ticks
 * while the run is in flight; once terminal it freezes on the final duration.
 */

const CONNECTION_LABEL: Record<FeedConnection, { text: string; tone: string; glyph: string }> = {
  connecting: { text: 'Acquiring', tone: 'text-status-flight', glyph: '◆' },
  open: { text: 'Live', tone: 'text-status-telemetry', glyph: '◆' },
  closed: { text: 'Settled', tone: 'text-status-go', glyph: '●' },
  error: { text: 'Signal lost', tone: 'text-status-fault', glyph: '▲' },
}

function Field({ label, children, title }: { label: string; children: React.ReactNode; title?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.55rem] uppercase tracking-wider text-readout-muted">{label}</p>
      <p className="truncate text-sm text-readout" title={title}>
        {children}
      </p>
    </div>
  )
}

export function RunDetailHeader({
  run,
  connection,
}: {
  run: RunDetail
  connection: FeedConnection
}) {
  const { terminal } = statusPresentation(run.status)
  const start = parseTimestamp(run.started_at) ?? parseTimestamp(run.created_at)
  const end = parseTimestamp(run.ended_at)
  const now = useNow(!terminal)
  const elapsedMs = start == null ? null : (terminal && end != null ? end : now) - start

  const conn = CONNECTION_LABEL[connection]

  return (
    <section aria-label="Run detail" className="mc-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <StatusBadge status={run.status} />
          <span className="rounded border border-console-line px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wider text-readout-muted">
            {taskTypeLabel(run.task_type)}
          </span>
          <span
            className={`inline-flex items-center gap-1 text-[0.6rem] uppercase tracking-wider ${conn.tone}`}
            title="SSE feed status"
          >
            <span aria-hidden>{conn.glyph}</span>
            {conn.text}
          </span>
        </div>
        <div className="text-right">
          <p className="text-[0.55rem] uppercase tracking-wider text-readout-muted">
            {terminal ? 'Duration' : 'Mission Elapsed'}
          </p>
          <p
            className={`text-2xl tabular-nums ${terminal ? 'text-readout' : 'text-status-telemetry'}`}
          >
            {elapsedMs == null ? 'T+ --:--:--' : formatElapsed(elapsedMs)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Target" title={run.target ?? undefined}>
          {run.target ?? '—'}
        </Field>
        <Field label="Task">{taskTypeLabel(run.task_type)}</Field>
        <Field label="Started" title={formatTimestamp(run.started_at ?? run.created_at)}>
          {formatTimestamp(run.started_at ?? run.created_at)}
        </Field>
        <Field label="Run ID" title={run.run_id}>
          <span className="font-mono text-xs">{run.run_id}</span>
        </Field>
      </div>

      {run.detail && (
        <div className="mt-3 border-t border-console-line pt-3">
          <p className="mb-1.5 text-[0.55rem] uppercase tracking-wider text-readout-muted">
            Report
          </p>
          <Markdown>{run.detail}</Markdown>
        </div>
      )}
    </section>
  )
}
