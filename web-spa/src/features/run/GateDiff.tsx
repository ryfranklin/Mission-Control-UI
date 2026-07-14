import type { RunChanges } from '../../api'
import { formatNumber } from '../../lib/format'

/**
 * The go/no-go change set (`GET /runs/{id}/changes`) shown at the gate — the
 * files the burn would touch and their line counts, so the operator sees what
 * they are approving. The seam types this endpoint as a free-form JSON object,
 * so we parse DEFENSIVELY across the plausible field names and fall back to a
 * raw JSON view rather than hiding anything we cannot structure.
 */

interface FileChange {
  path: string
  additions: number | null
  deletions: number | null
  status: string | null
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function num(rec: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = rec[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return null
}

function str(rec: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = rec[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

function extractFiles(changes: RunChanges): FileChange[] {
  const raw: unknown = changes
  if (Array.isArray(raw)) return normalizeList(raw)
  const root = asRecord(changes)
  if (!root) return []
  const rawList =
    (Array.isArray(root.files) && root.files) ||
    (Array.isArray(root.changes) && root.changes) ||
    (Array.isArray(root.diffs) && root.diffs) ||
    []
  return normalizeList(rawList)
}

function normalizeList(rawList: unknown[]): FileChange[] {
  const files: FileChange[] = []
  for (const entry of rawList as unknown[]) {
    if (typeof entry === 'string') {
      files.push({ path: entry, additions: null, deletions: null, status: null })
      continue
    }
    const rec = asRecord(entry)
    if (!rec) continue
    const path = str(rec, ['path', 'file', 'filename', 'name'])
    if (!path) continue
    files.push({
      path,
      additions: num(rec, ['additions', 'added', 'insertions', 'add']),
      deletions: num(rec, ['deletions', 'deleted', 'removals', 'del']),
      status: str(rec, ['status', 'change_type', 'type', 'kind']),
    })
  }
  return files
}

const STATUS_STYLE: Record<string, { text: string; glyph: string }> = {
  added: { text: 'text-status-go', glyph: '+' },
  create: { text: 'text-status-go', glyph: '+' },
  modified: { text: 'text-status-flight', glyph: '~' },
  changed: { text: 'text-status-flight', glyph: '~' },
  deleted: { text: 'text-status-fault', glyph: '−' },
  removed: { text: 'text-status-fault', glyph: '−' },
  renamed: { text: 'text-status-telemetry', glyph: '→' },
}

function statusStyle(status: string | null): { text: string; glyph: string } {
  const key = status?.toLowerCase() ?? ''
  return STATUS_STYLE[key] ?? { text: 'text-readout-muted', glyph: '•' }
}

export function GateDiff({
  changes,
  isLoading,
  error,
}: {
  changes: RunChanges | undefined
  isLoading: boolean
  error: unknown
}) {
  const files = changes ? extractFiles(changes) : []
  const totalAdd = files.reduce((s, f) => s + (f.additions ?? 0), 0)
  const totalDel = files.reduce((s, f) => s + (f.deletions ?? 0), 0)

  return (
    <section aria-label="Gate change set" className="mc-panel flex min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-console-line px-4 py-2">
        <h2 className="text-[0.65rem] uppercase tracking-widest text-readout-muted">
          Change Set · Gate Review
        </h2>
        <span className="flex items-center gap-3 text-[0.6rem] tabular-nums">
          <span className="text-readout-muted">{files.length} files</span>
          <span className="text-status-go">+{formatNumber(totalAdd)}</span>
          <span className="text-status-fault">−{formatNumber(totalDel)}</span>
        </span>
      </header>

      <div className="max-h-64 flex-1 overflow-y-auto px-4 py-2">
        {error ? (
          <p className="py-6 text-center text-xs uppercase tracking-wider text-status-fault">
            ▲ Could not load change set
          </p>
        ) : isLoading ? (
          <p className="py-6 text-center text-xs uppercase tracking-wider text-status-flight">
            ◆ Acquiring change set…
          </p>
        ) : files.length === 0 ? (
          <RawFallback changes={changes} />
        ) : (
          <ul className="space-y-1">
            {files.map((f, i) => {
              const s = statusStyle(f.status)
              return (
                <li key={`${f.path}-${i}`} className="flex items-baseline gap-2 text-xs">
                  <span aria-hidden className={`w-3 shrink-0 text-center ${s.text}`}>
                    {s.glyph}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-readout" title={f.path}>
                    {f.path}
                  </span>
                  {f.status && (
                    <span className={`shrink-0 text-[0.55rem] uppercase tracking-wider ${s.text}`}>
                      {f.status}
                    </span>
                  )}
                  <span className="shrink-0 tabular-nums text-status-go">
                    {f.additions != null ? `+${f.additions}` : ''}
                  </span>
                  <span className="shrink-0 tabular-nums text-status-fault">
                    {f.deletions != null ? `−${f.deletions}` : ''}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

/** When the change set has no recognizable file list, show the raw JSON. */
function RawFallback({ changes }: { changes: RunChanges | undefined }) {
  if (!changes || (asRecord(changes) && Object.keys(changes as object).length === 0)) {
    return (
      <p className="py-6 text-center text-xs uppercase tracking-wider text-readout-muted">
        ○ No changes reported
      </p>
    )
  }
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[0.65rem] text-readout-muted">
      {JSON.stringify(changes, null, 2)}
    </pre>
  )
}
