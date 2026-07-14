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
