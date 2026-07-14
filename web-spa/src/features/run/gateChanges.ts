/**
 * The gate change-set model — the single place that turns the seam's free-form
 * `GET /runs/{id}/changes` payload into the console's structured view: the files
 * a burn would touch (with line counts), the actual unified diff split per file,
 * and the persistence phase (pending at the gate vs. applied once landed).
 *
 * The seam types this endpoint as an open JSON object, so we parse DEFENSIVELY
 * across the plausible field names and NEVER invent structure — anything we
 * cannot map is preserved on `raw` for a JSON fallback. Pure functions only:
 * this decides nothing and renders nothing.
 */

import type { RunChanges } from '../../api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Whether the change set is the live gate material or the persisted, landed diff. */
export type GatePhase = 'pending' | 'applied'

export interface GateFileChange {
  path: string
  /** Added / removed line counts (payload counts, else derived from the hunk). */
  added: number | null
  removed: number | null
  status: string | null
  /** Unified-diff lines for this file (hunk headers + context/add/remove), if any. */
  hunk: string[] | null
}

export interface GateChangeSet {
  /** Persistence phase from the payload; null for older runs that omit it. */
  phase: GatePhase | null
  files: GateFileChange[]
  totalAdded: number
  totalRemoved: number
  /** True when there is nothing to show (no files and no patch). */
  isEmpty: boolean
  /** True when the patch was capped for size (a truncation note is warranted). */
  patchTruncated: boolean
  /** The `git --stat` summary line block, when the payload carried one. */
  stat: string | null
  /** True when the payload had SOME shape but no recognizable file/patch data. */
  hasUnknownShape: boolean
  raw: RunChanges | undefined
}

// Cap the patch we parse/render so a monster diff never blows up the panel.
const PATCH_CAP = 60_000

// ---------------------------------------------------------------------------
// Defensive readers
// ---------------------------------------------------------------------------

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** A number from either a numeric or a numeric-string field (counts arrive as either). */
function num(rec: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = rec[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
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

// ---------------------------------------------------------------------------
// Patch parsing — split a unified diff into per-file hunks.
// ---------------------------------------------------------------------------

/** Strip a `a/` or `b/` prefix and any trailing `\t<timestamp>` from a diff path. */
function cleanDiffPath(raw: string): string {
  let p = raw.split('\t')[0].trim()
  if (p === '/dev/null') return p
  if (p.startsWith('a/') || p.startsWith('b/')) p = p.slice(2)
  return p
}

/** The `b/` (new) path from a `diff --git a/x b/y` header, best-effort. */
function gitHeaderPath(line: string): string | null {
  const m = line.match(/^diff --git\s+(?:"?a\/.*?"?)\s+"?b\/(.+?)"?$/)
  if (m) return m[1]
  // Fallback: last whitespace-separated token, prefix-stripped.
  const parts = line.split(/\s+/)
  const last = parts[parts.length - 1]
  return last ? cleanDiffPath(last) : null
}

interface PatchFile {
  path: string
  lines: string[]
}

/**
 * Parse a unified diff into `{path, lines}` sections. Handles both git-style
 * patches (`diff --git` headers) and bare unified diffs (`--- `/`+++ ` pairs).
 * Metadata lines (index/mode/rename) are dropped; the retained `lines` are the
 * hunk headers and content lines a diff view renders.
 */
function parsePatch(patch: string): PatchFile[] {
  const rows = patch.split('\n')
  const files: PatchFile[] = []
  let cur: PatchFile | null = null

  for (let i = 0; i < rows.length; i++) {
    const line = rows[i]

    if (line.startsWith('diff --git ')) {
      cur = { path: gitHeaderPath(line) ?? '', lines: [] }
      files.push(cur)
      continue
    }

    // A `--- ` immediately followed by `+++ ` begins a file in a bare diff.
    if (line.startsWith('--- ')) {
      const next = rows[i + 1] ?? ''
      if (next.startsWith('+++ ')) {
        const plus = cleanDiffPath(next.slice(4))
        const path = plus === '/dev/null' ? cleanDiffPath(line.slice(4)) : plus
        // Reuse the section a `diff --git` header just opened; else open one.
        if (!cur || cur.lines.length > 0) {
          cur = { path, lines: [] }
          files.push(cur)
        } else {
          cur.path = path
        }
        i++ // consume the +++ line
        continue
      }
      // Lone `---` inside a git section: use it to fill a missing path, then drop.
      if (cur && !cur.path) cur.path = cleanDiffPath(line.slice(4))
      continue
    }

    if (line.startsWith('+++ ')) {
      const path = cleanDiffPath(line.slice(4))
      if (cur && (!cur.path || cur.path === '/dev/null') && path !== '/dev/null') cur.path = path
      continue
    }

    // Drop git metadata that isn't part of the visible hunk.
    if (
      line.startsWith('index ') ||
      line.startsWith('new file mode') ||
      line.startsWith('deleted file mode') ||
      line.startsWith('old mode') ||
      line.startsWith('new mode') ||
      line.startsWith('similarity index') ||
      line.startsWith('dissimilarity index') ||
      line.startsWith('rename ') ||
      line.startsWith('copy ')
    ) {
      continue
    }

    if (!cur) continue
    cur.lines.push(line)
  }

  return files.filter((f) => f.lines.some((l) => l.trim() !== ''))
}

/** Count added/removed lines within a parsed hunk (metadata already stripped). */
function countHunk(lines: string[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const l of lines) {
    if (l.startsWith('+')) added++
    else if (l.startsWith('-')) removed++
  }
  return { added, removed }
}

/** Normalise a path for matching payload files against patch sections. */
function pathKey(p: string): string {
  return cleanDiffPath(p).toLowerCase()
}

// ---------------------------------------------------------------------------
// File-list parsing
// ---------------------------------------------------------------------------

function extractFileList(root: Record<string, unknown>): {
  path: string
  added: number | null
  removed: number | null
  status: string | null
}[] {
  const rawList =
    (Array.isArray(root.files) && root.files) ||
    (Array.isArray(root.changes) && root.changes) ||
    (Array.isArray(root.diffs) && root.diffs) ||
    []
  const out: { path: string; added: number | null; removed: number | null; status: string | null }[] = []
  for (const entry of rawList as unknown[]) {
    if (typeof entry === 'string') {
      out.push({ path: entry, added: null, removed: null, status: null })
      continue
    }
    const rec = asRecord(entry)
    if (!rec) continue
    const path = str(rec, ['path', 'file', 'filename', 'name'])
    if (!path) continue
    out.push({
      path,
      added: num(rec, ['added', 'additions', 'insertions', 'add', 'lines_added']),
      removed: num(rec, ['removed', 'deletions', 'deleted', 'removals', 'del', 'lines_removed']),
      status: str(rec, ['status', 'change_type', 'type', 'kind']),
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function parseGateChanges(changes: RunChanges | undefined): GateChangeSet {
  const empty: GateChangeSet = {
    phase: null,
    files: [],
    totalAdded: 0,
    totalRemoved: 0,
    isEmpty: true,
    patchTruncated: false,
    stat: null,
    hasUnknownShape: false,
    raw: changes,
  }
  if (changes == null) return empty
  // The endpoint may return a bare array of files rather than an object.
  const root = Array.isArray(changes)
    ? ({ files: changes } as Record<string, unknown>)
    : asRecord(changes)
  if (!root) return empty

  const phaseRaw = str(root, ['phase', 'state', 'status'])?.toLowerCase() ?? null
  const phase: GatePhase | null =
    phaseRaw === 'applied' || phaseRaw === 'landed' || phaseRaw === 'pushed'
      ? 'applied'
      : phaseRaw === 'pending' || phaseRaw === 'staged' || phaseRaw === 'proposed'
        ? 'pending'
        : null

  const stat = str(root, ['stat', 'diffstat', 'summary_stat'])

  // Parse the patch (capped) into per-file hunks, keyed by normalised path.
  const patchRaw = str(root, ['patch', 'diff', 'unified_diff', 'patch_text'])
  const patchTruncated = !!patchRaw && patchRaw.length > PATCH_CAP
  const patch = patchRaw ? patchRaw.slice(0, PATCH_CAP) : null
  const patchFiles = patch ? parsePatch(patch) : []
  const hunkByPath = new Map<string, string[]>()
  for (const pf of patchFiles) {
    if (pf.path) hunkByPath.set(pathKey(pf.path), pf.lines)
  }

  // Build the file list from the payload, attaching each file's hunk from the
  // patch. When the payload has no file list, synthesise it from the patch.
  const listed = extractFileList(root)
  let files: GateFileChange[]
  if (listed.length > 0) {
    files = listed.map((f) => {
      const hunk = hunkByPath.get(pathKey(f.path)) ?? null
      const derived = hunk ? countHunk(hunk) : null
      return {
        path: f.path,
        added: f.added ?? derived?.added ?? null,
        removed: f.removed ?? derived?.removed ?? null,
        status: f.status,
        hunk,
      }
    })
  } else {
    files = patchFiles.map((pf) => {
      const c = countHunk(pf.lines)
      return { path: pf.path || '(unknown)', added: c.added, removed: c.removed, status: null, hunk: pf.lines }
    })
  }

  const totalAdded = files.reduce((s, f) => s + (f.added ?? 0), 0)
  const totalRemoved = files.reduce((s, f) => s + (f.removed ?? 0), 0)

  const isEmpty = files.length === 0 && !patch
  // The payload had keys but nothing we could structure — warrants a raw view.
  const hasUnknownShape = isEmpty && Object.keys(root).length > 0

  return {
    phase,
    files,
    totalAdded,
    totalRemoved,
    isEmpty,
    patchTruncated,
    stat,
    hasUnknownShape,
    raw: changes,
  }
}

/** Per-line classification for the diff view (paired with a gutter glyph). */
export type DiffLineKind = 'add' | 'remove' | 'hunk' | 'meta' | 'context'

export function classifyDiffLine(line: string): DiffLineKind {
  if (line.startsWith('@@')) return 'hunk'
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'remove'
  if (line.startsWith('\\')) return 'meta' // "\ No newline at end of file"
  return 'context'
}
