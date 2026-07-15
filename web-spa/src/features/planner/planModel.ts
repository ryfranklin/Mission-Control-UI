import type { UnitModel } from '../../api'

/**
 * Planner console model helpers — the pure, React-free layer for the INCEPTION
 * session.
 *
 * Two concerns live here:
 *   1. A tolerant Server-Sent-Events parser for the streamed planner reply
 *      (`POST /plans/{id}/turns/stream`). The seam's OpenAPI contract types that
 *      stream as an untyped `text/event-stream`, so rather than assume one frame
 *      shape we decode defensively: SSE framing, then a best-effort token
 *      extraction that copes with raw-text, JSON-token, and delta-envelope
 *      styles. Structured (non-text) frames are simply ignored here — the PLAN
 *      PANEL re-reads the authoritative aggregate from `GET /plans/{id}` after
 *      the turn settles.
 *   2. Small presentation maps for requirement state and transcript roles that
 *      pair meaning with a redundant glyph (never hue alone).
 */

// ---------------------------------------------------------------------------
// SSE framing
// ---------------------------------------------------------------------------

export interface SseEvent {
  /** Event name (`event:` field); defaults to `message`. */
  event: string
  /** Concatenated `data:` lines (joined with `\n`). */
  data: string
  /** Last `id:` field, if any. */
  id?: string
}

/**
 * A streaming SSE parser. Feed it decoded text chunks with {@link SseParser.push};
 * it buffers partial frames across chunk boundaries and returns whole events as
 * they complete. Call {@link SseParser.flush} once the socket closes to emit any
 * trailing frame that arrived without a terminating blank line.
 */
export interface SseParser {
  push(chunk: string): SseEvent[]
  flush(): SseEvent[]
}

export function createSseParser(): SseParser {
  let buffer = ''

  const drain = (final: boolean): SseEvent[] => {
    const events: SseEvent[] = []
    // Frames are separated by a blank line (\n\n after CRLF normalisation).
    let idx: number
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const ev = parseFrame(raw)
      if (ev) events.push(ev)
    }
    if (final && buffer.trim() !== '') {
      const ev = parseFrame(buffer)
      if (ev) events.push(ev)
    }
    if (final) buffer = ''
    return events
  }

  return {
    push(chunk) {
      buffer += chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      return drain(false)
    },
    flush() {
      return drain(true)
    },
  }
}

function parseFrame(raw: string): SseEvent | null {
  let event = 'message'
  let id: string | undefined
  const data: string[] = []
  let sawField = false

  for (const line of raw.split('\n')) {
    if (line === '' || line.startsWith(':')) continue // blank / comment
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    // Per spec a single leading space after the colon is stripped.
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    switch (field) {
      case 'event':
        event = value || 'message'
        sawField = true
        break
      case 'data':
        data.push(value)
        sawField = true
        break
      case 'id':
        id = value
        sawField = true
        break
      default:
        break // ignore unknown fields (e.g. retry)
    }
  }

  if (!sawField) return null
  return { event, data: data.join('\n'), id }
}

// ---------------------------------------------------------------------------
// Token extraction
// ---------------------------------------------------------------------------

export interface StreamSignal {
  /** Natural-language text to append to the running reply. */
  text: string
  /** The stream declared itself finished via this frame. */
  done: boolean
  /** A fault the seam reported mid-stream, else null. */
  error: string | null
}

const DONE_EVENTS = new Set(['done', 'end', 'complete', 'completed', 'final', 'close', 'eof'])
const ERROR_EVENTS = new Set(['error', 'fault', 'exception'])
const TEXT_KEYS = ['delta', 'token', 'text', 'content', 'chunk', 'value', 'reply', 'message']
const DONE_TYPES = new Set(['done', 'end', 'complete', 'completed', 'final', 'stop', 'message_stop'])

/**
 * Interpret one SSE frame as a fragment of the planner's reply. Tolerant by
 * design: an OpenAI-style `[DONE]`, a named `event: end`, a `{done:true}` flag,
 * a bare-text `data:`, or a JSON token envelope all resolve correctly.
 */
export function extractSignal(ev: SseEvent): StreamSignal {
  const name = ev.event.toLowerCase()
  if (ERROR_EVENTS.has(name)) {
    return { text: '', done: true, error: ev.data.trim() || 'Planner stream fault' }
  }

  const trimmed = ev.data.trim()
  if (trimmed === '[DONE]' || trimmed === 'DONE') {
    return { text: '', done: true, error: null }
  }

  const nameIsDone = DONE_EVENTS.has(name)

  if (trimmed === '') {
    return { text: '', done: nameIsDone, error: null }
  }

  // Try to read the payload as JSON; fall back to treating it as raw text.
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { text: ev.data, done: nameIsDone, error: null }
  }

  if (typeof parsed === 'string') {
    return { text: parsed, done: nameIsDone, error: null }
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>
    const err = obj.error ?? obj.err
    if (typeof err === 'string' && err) {
      return { text: '', done: true, error: err }
    }
    const type = typeof obj.type === 'string' ? obj.type.toLowerCase() : ''
    const flaggedDone =
      obj.done === true || obj.final === true || obj.stop === true || DONE_TYPES.has(type)
    return { text: pickText(obj), done: nameIsDone || flaggedDone, error: null }
  }

  return { text: '', done: nameIsDone, error: null }
}

/** Dig a text fragment out of a token envelope, tolerating common nestings. */
function pickText(obj: Record<string, unknown>, depth = 0): string {
  if (depth > 4) return ''
  for (const key of TEXT_KEYS) {
    const v = obj[key]
    if (typeof v === 'string') return v
    if (v && typeof v === 'object') {
      const nested = pickText(v as Record<string, unknown>, depth + 1)
      if (nested) return nested
    }
  }
  // OpenAI-style: choices[].delta.content
  const choices = obj.choices
  if (Array.isArray(choices) && choices.length && choices[0] && typeof choices[0] === 'object') {
    const nested = pickText(choices[0] as Record<string, unknown>, depth + 1)
    if (nested) return nested
  }
  return ''
}

// ---------------------------------------------------------------------------
// Transcript roles
// ---------------------------------------------------------------------------

export type TranscriptSide = 'operator' | 'director'

const OPERATOR_ROLES = new Set(['user', 'operator', 'human', 'controller', 'flight_director', 'you'])

/**
 * Which side of the transcript a turn sits on. The operator (Controller) drives
 * the session; the planner replies as the Flight Director drafting the Flight
 * Plan. Unknown roles default to the director side (the assistant).
 */
export function transcriptSide(role: string | null | undefined): TranscriptSide {
  const r = (role ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  return OPERATOR_ROLES.has(r) ? 'operator' : 'director'
}

export function roleLabel(side: TranscriptSide): string {
  return side === 'operator' ? 'CONTROLLER' : 'FLIGHT DIRECTOR'
}

// ---------------------------------------------------------------------------
// Requirement state presentation
// ---------------------------------------------------------------------------

export interface StatePresentation {
  tone: 'go' | 'flight' | 'fault' | 'neutral'
  glyph: string
  label: string
}

const REQ_GO = new Set(['set', 'gathered', 'confirmed', 'done', 'captured', 'ready', 'resolved'])
const REQ_PENDING = new Set(['pending', 'open', 'todo', 'needed', 'gathering', 'proposed', 'draft'])
const REQ_FAULT = new Set(['missing', 'blocked', 'conflict', 'rejected'])

/** Map a requirement's free-form `state` to a tone + redundant glyph + label. */
export function requirementState(state: string | null | undefined): StatePresentation {
  const raw = (state ?? '').trim()
  const norm = raw.toLowerCase().replace(/[\s-]+/g, '_')
  if (REQ_GO.has(norm)) return { tone: 'go', glyph: '●', label: raw.toUpperCase() }
  if (REQ_FAULT.has(norm)) return { tone: 'fault', glyph: '▲', label: raw.toUpperCase() }
  if (REQ_PENDING.has(norm)) return { tone: 'flight', glyph: '◆', label: raw.toUpperCase() }
  return { tone: 'neutral', glyph: '○', label: raw ? raw.toUpperCase() : '—' }
}

/** Render a unit's `depends_on` list (typed `unknown[]`) as readable seq refs. */
export function dependsLabel(dependsOn: unknown[] | null | undefined): string[] {
  if (!Array.isArray(dependsOn)) return []
  return dependsOn.map((d) => {
    if (typeof d === 'number') return `#${d}`
    const s = String(d).trim()
    return /^\d+$/.test(s) ? `#${s}` : s
  })
}

// ---------------------------------------------------------------------------
// Unit dependency graph (DAG) layout
// ---------------------------------------------------------------------------

/**
 * Pull the numeric unit-seq references out of a `depends_on` list. The seam
 * types the field `unknown[]`, so entries arrive as numbers, numeric strings,
 * or (until the backend enrichment lands) opaque non-numeric identifiers we
 * cannot place on the graph. Only the numeric refs survive here.
 */
export function dependsSeqs(dependsOn: unknown[] | null | undefined): number[] {
  if (!Array.isArray(dependsOn)) return []
  const out: number[] = []
  for (const d of dependsOn) {
    if (typeof d === 'number' && Number.isFinite(d)) {
      out.push(d)
      continue
    }
    const s = String(d).trim()
    if (/^\d+$/.test(s)) out.push(Number(s))
  }
  return out
}

/** One placed node in the {@link UnitGraph}. */
export interface UnitGraphNode {
  seq: number
  title: string
  status: string
  taskType: string
  phase: string
  /** Column index — the longest dependency chain reaching this unit. */
  level: number
  /** Row index within the column, ordered by seq. */
  row: number
  /** Resolved in-graph dependencies (unit seqs that exist as nodes). */
  deps: number[]
}

/** A directed edge dep → unit in the {@link UnitGraph}. */
export interface UnitGraphEdge {
  from: number
  to: number
}

/** A laid-out dependency graph, ready for the renderer to place on a grid. */
export interface UnitGraph {
  nodes: UnitGraphNode[]
  edges: UnitGraphEdge[]
  /** Number of columns (levels) in the layout. */
  cols: number
  /** Widest column's row count. */
  rows: number
  /**
   * Dependency refs we could NOT resolve to a node — non-numeric identifiers,
   * self-references, or seqs pointing at a unit that isn't in the list. Surfaced
   * so the renderer can be honest that the DAG may be incomplete (the backend
   * `depends_on` field is untyped; see the planner schema-gap note).
   */
  droppedDeps: number
}

/**
 * Lay out the work-list units as a left-to-right dependency DAG. Each unit's
 * column is its longest dependency chain (so an edge always points rightward),
 * and rows within a column are seq-ordered. Cycles — which a well-formed plan
 * won't contain, but which we can't assume from an untyped field — are broken
 * defensively so the layout always terminates.
 */
export function buildUnitGraph(units: readonly UnitModel[] | null | undefined): UnitGraph {
  const list = units ?? []
  const bySeq = new Map<number, UnitModel>(list.map((u) => [u.seq, u]))

  // Resolve each unit's dependencies to in-graph seqs, counting what we drop.
  const deps = new Map<number, number[]>()
  let droppedDeps = 0
  for (const u of list) {
    const declared = Array.isArray(u.depends_on) ? u.depends_on.length : 0
    const resolved = dependsSeqs(u.depends_on).filter((s) => bySeq.has(s) && s !== u.seq)
    // De-dupe in case the same ref appears twice.
    const unique = Array.from(new Set(resolved))
    droppedDeps += declared - unique.length
    deps.set(u.seq, unique)
  }

  // Column = longest path from a root, memoized with a cycle guard.
  const level = new Map<number, number>()
  const onStack = new Set<number>()
  const levelOf = (seq: number): number => {
    const cached = level.get(seq)
    if (cached !== undefined) return cached
    if (onStack.has(seq)) return 0 // cycle — break it rather than loop forever
    onStack.add(seq)
    let lv = 0
    for (const d of deps.get(seq) ?? []) lv = Math.max(lv, levelOf(d) + 1)
    onStack.delete(seq)
    level.set(seq, lv)
    return lv
  }
  for (const u of list) levelOf(u.seq)

  // Bucket units into columns, seq-ordered within each.
  const byLevel = new Map<number, UnitModel[]>()
  for (const u of list) {
    const lv = level.get(u.seq) ?? 0
    const bucket = byLevel.get(lv) ?? []
    bucket.push(u)
    byLevel.set(lv, bucket)
  }

  const nodes: UnitGraphNode[] = []
  let rows = 0
  const cols = byLevel.size === 0 ? 0 : Math.max(...byLevel.keys()) + 1
  for (let lv = 0; lv < cols; lv++) {
    const bucket = (byLevel.get(lv) ?? []).sort((a, b) => a.seq - b.seq)
    rows = Math.max(rows, bucket.length)
    bucket.forEach((u, row) => {
      nodes.push({
        seq: u.seq,
        title: u.title,
        status: u.status,
        taskType: u.task_type,
        phase: u.phase,
        level: lv,
        row,
        deps: deps.get(u.seq) ?? [],
      })
    })
  }

  const edges: UnitGraphEdge[] = []
  for (const n of nodes) for (const from of n.deps) edges.push({ from, to: n.seq })

  return { nodes, edges, cols, rows, droppedDeps }
}
