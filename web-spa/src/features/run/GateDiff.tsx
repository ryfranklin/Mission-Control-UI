import { useState } from 'react'

import { ApiError, type RunChanges } from '../../api'
import { formatNumber } from '../../lib/format'
import {
  classifyDiffLine,
  parseGateChanges,
  type DiffLineKind,
  type GateChangeSet,
  type GateFileChange,
} from './gateChanges'

/**
 * The go/no-go CHANGE SET (`GET /runs/{id}/changes`) — the burn's file list,
 * line counts, and the ACTUAL unified diff, shown as the gate-decision material
 * and (once the seam persists it) as the APPLIED record after the burn lands.
 *
 * Three payload states are handled: pending (live, at the gate), applied
 * (persisted after landing), and none (404 / sim / no-change → clean empty
 * state). Parsing lives in {@link parseGateChanges}; this file only renders.
 */

// Per-file change-type marker — color paired with a glyph (never hue alone).
const STATUS_STYLE: Record<string, { text: string; glyph: string }> = {
  added: { text: 'text-status-go', glyph: '+' },
  create: { text: 'text-status-go', glyph: '+' },
  created: { text: 'text-status-go', glyph: '+' },
  modified: { text: 'text-status-flight', glyph: '~' },
  changed: { text: 'text-status-flight', glyph: '~' },
  deleted: { text: 'text-status-fault', glyph: '−' },
  removed: { text: 'text-status-fault', glyph: '−' },
  renamed: { text: 'text-status-telemetry', glyph: '→' },
}

function statusStyle(status: string | null): { text: string; glyph: string } {
  return STATUS_STYLE[status?.toLowerCase() ?? ''] ?? { text: 'text-readout-muted', glyph: '•' }
}

// Diff-line color paired with a gutter glyph (accessibility: never hue alone).
const LINE_STYLE: Record<DiffLineKind, { text: string; gutter: string; row: string }> = {
  add: { text: 'text-status-go', gutter: '+', row: 'bg-status-go/[0.07]' },
  remove: { text: 'text-status-fault', gutter: '−', row: 'bg-status-fault/[0.07]' },
  hunk: { text: 'text-status-telemetry', gutter: '@', row: 'bg-status-telemetry/[0.06]' },
  meta: { text: 'text-readout-dim', gutter: '\\', row: '' },
  context: { text: 'text-readout', gutter: ' ', row: '' },
}

// Cap rendered lines per file so one giant hunk can't blow up the DOM.
const MAX_HUNK_LINES = 500

export function GateDiff({
  changes,
  isLoading,
  error,
  atGate,
}: {
  changes: RunChanges | undefined
  isLoading: boolean
  error: unknown
  /** True while the run is parked at the gate (drives labelling for older runs). */
  atGate: boolean
}) {
  // A 404 ("no pending changes") is an EMPTY state, not a load fault.
  const notFound = error instanceof ApiError && error.status === 404
  const realError = error && !notFound

  const model = parseGateChanges(changes)
  const phase = model.phase ?? (atGate ? 'pending' : 'applied')
  const applied = phase === 'applied'

  return (
    <section aria-label="Gate change set" className="mc-panel flex min-h-0 flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-console-line px-4 py-2">
        <h2 className="flex items-center gap-2 text-[0.65rem] uppercase tracking-widest text-readout-muted">
          Change Set
          <span aria-hidden className="text-readout-dim">
            ·
          </span>
          {applied ? (
            <span className="inline-flex items-center gap-1 rounded border border-status-go/50 px-1.5 py-0.5 text-[0.55rem] tracking-wider text-status-go">
              <span aria-hidden>●</span> Applied
            </span>
          ) : (
            <span className="text-readout-muted">Gate Review</span>
          )}
        </h2>
        {!model.isEmpty && (
          <span className="flex items-center gap-3 text-[0.6rem] tabular-nums">
            <span className="text-readout-muted">{model.files.length} files</span>
            <span className="text-status-go">+{formatNumber(model.totalAdded)}</span>
            <span className="text-status-fault">−{formatNumber(model.totalRemoved)}</span>
          </span>
        )}
      </header>

      <div className="max-h-96 flex-1 overflow-y-auto px-4 py-2">
        {realError ? (
          <p className="py-6 text-center text-xs uppercase tracking-wider text-status-fault">
            ▲ Could not load change set
          </p>
        ) : isLoading ? (
          <p className="py-6 text-center text-xs uppercase tracking-wider text-status-flight">
            ◆ Acquiring change set…
          </p>
        ) : model.isEmpty ? (
          <EmptyState model={model} atGate={atGate} />
        ) : (
          <Body model={model} />
        )}
      </div>
    </section>
  )
}

function Body({ model }: { model: GateChangeSet }) {
  return (
    <>
      {model.stat && (
        <pre className="mb-2 overflow-x-auto whitespace-pre rounded border border-console-line bg-console-void p-2 text-[0.65rem] leading-relaxed text-readout-muted">
          {model.stat}
        </pre>
      )}
      <ul className="space-y-1">
        {model.files.map((f, i) => (
          <FileRow key={`${f.path}-${i}`} file={f} />
        ))}
      </ul>
      {model.patchTruncated && (
        <p className="mt-2 text-[0.6rem] uppercase tracking-wider text-status-flight">
          ◆ Diff truncated — showing first 60 KB
        </p>
      )}
    </>
  )
}

function FileRow({ file }: { file: GateFileChange }) {
  const [open, setOpen] = useState(false)
  const s = statusStyle(file.status)
  const expandable = !!file.hunk && file.hunk.length > 0

  const summary = (
    <>
      <span aria-hidden className={`w-3 shrink-0 text-center ${s.text}`}>
        {expandable ? (open ? '▾' : '▸') : s.glyph}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-readout" title={file.path}>
        {file.path}
      </span>
      {file.status && (
        <span className={`shrink-0 text-[0.55rem] uppercase tracking-wider ${s.text}`}>
          {file.status}
        </span>
      )}
      <span className="shrink-0 tabular-nums text-status-go">
        {file.added != null ? `+${file.added}` : ''}
      </span>
      <span className="shrink-0 tabular-nums text-status-fault">
        {file.removed != null ? `−${file.removed}` : ''}
      </span>
    </>
  )

  return (
    <li>
      {expandable ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-console-raised/60"
        >
          {summary}
        </button>
      ) : (
        <div className="flex items-baseline gap-2 px-1 py-0.5 text-xs">{summary}</div>
      )}
      {expandable && open && <DiffHunk lines={file.hunk as string[]} />}
    </li>
  )
}

function DiffHunk({ lines }: { lines: string[] }) {
  const capped = lines.length > MAX_HUNK_LINES
  const shown = capped ? lines.slice(0, MAX_HUNK_LINES) : lines
  return (
    <div className="my-1 overflow-x-auto rounded border border-console-line bg-console-void">
      <pre className="min-w-full text-[0.68rem] leading-[1.35]">
        {shown.map((line, i) => {
          const kind = classifyDiffLine(line)
          const st = LINE_STYLE[kind]
          return (
            <div key={i} className={`flex ${st.row}`}>
              <span
                aria-hidden
                className={`w-5 shrink-0 select-none border-r border-console-line/60 px-1 text-center ${st.text}`}
              >
                {st.gutter}
              </span>
              <code className={`whitespace-pre px-2 ${st.text}`}>{stripLeadingMarker(line, kind) || ' '}</code>
            </div>
          )
        })}
      </pre>
      {capped && (
        <p className="border-t border-console-line px-2 py-1 text-[0.6rem] uppercase tracking-wider text-status-flight">
          ◆ Hunk truncated — {formatNumber(lines.length - MAX_HUNK_LINES)} more lines
        </p>
      )}
    </div>
  )
}

/** Drop the leading +/- marker (the gutter carries it) but keep hunk headers whole. */
function stripLeadingMarker(line: string, kind: DiffLineKind): string {
  if (kind === 'add' || kind === 'remove') return line.slice(1)
  if (kind === 'context' && line.startsWith(' ')) return line.slice(1)
  return line
}

function EmptyState({ model, atGate }: { model: GateChangeSet; atGate: boolean }) {
  if (model.hasUnknownShape) {
    return (
      <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[0.65rem] text-readout-muted">
        {JSON.stringify(model.raw, null, 2)}
      </pre>
    )
  }
  return (
    <p className="py-6 text-center text-xs uppercase tracking-wider text-readout-muted">
      ○ {atGate ? 'No pending changes' : 'No change set recorded'}
    </p>
  )
}
