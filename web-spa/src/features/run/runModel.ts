/**
 * The Run Station's domain model — the single place that turns the seam's
 * free-form SSE frames into the console's lifecycle vocabulary.
 *
 * The seam types `GET /runs/{id}/events` payloads as `unknown` in the OpenAPI
 * contract (each frame is JSON, shape not pinned), so this module parses
 * DEFENSIVELY: it reads a spread of plausible field names, normalises node and
 * phase strings into the fixed rail vocabulary, and never invents state it did
 * not observe. Rendering and streaming live elsewhere — this file decides
 * nothing and touches no I/O.
 *
 * Lifecycle rail (nominal): dispatch → run_worker → gate → apply_burn → teardown
 * Off-nominal: scrub (the abort path).
 */

import { parseTimestamp } from '../../lib/format'

// ---------------------------------------------------------------------------
// Node phase — how a single rail node is lit.
// ---------------------------------------------------------------------------

/** A rail node's illumination state. Paired with a glyph so it never rides hue. */
export type NodePhase = 'pending' | 'active' | 'done' | 'fault'

/** Redundant, non-color marker per phase (accessibility: never hue alone). */
export const PHASE_GLYPH: Record<NodePhase, string> = {
  pending: '○', // hollow — not yet reached
  active: '◆', // diamond — burning / live
  done: '●', // filled — complete
  fault: '▲', // triangle — fault / aborted
}

export const PHASE_LABEL: Record<NodePhase, string> = {
  pending: 'PENDING',
  active: 'ACTIVE',
  done: 'DONE',
  fault: 'FAULT',
}

// ---------------------------------------------------------------------------
// The rail — fixed lifecycle nodes plus the off-nominal scrub node.
// ---------------------------------------------------------------------------

export interface RailNodeDef {
  id: string
  label: string
  hint: string
  /** Normalised aliases the seam might use for this node. */
  match: string[]
}

/** The nominal flight sequence, in order. */
export const RAIL_NODES: RailNodeDef[] = [
  { id: 'dispatch', label: 'Dispatch', hint: 'Controller hand-off', match: ['dispatch', 'queued', 'launch'] },
  { id: 'run_worker', label: 'Run Worker', hint: 'sim / burn worker', match: ['run_worker', 'worker', 'sim'] },
  { id: 'gate', label: 'Gate', hint: 'go / no-go', match: ['gate', 'go_no_go', 'gonogo', 'review'] },
  { id: 'apply_burn', label: 'Apply Burn', hint: 'commit the burn', match: ['apply_burn', 'apply', 'commit'] },
  { id: 'teardown', label: 'Teardown', hint: 'stand down', match: ['teardown', 'cleanup', 'standdown'] },
]

/** The scrub node sits off the nominal rail — the abort path. */
export const SCRUB_NODE: RailNodeDef = {
  id: 'scrub',
  label: 'Scrub',
  hint: 'abort path',
  match: ['scrub', 'abort', 'rollback'],
}

const ALL_NODES: RailNodeDef[] = [...RAIL_NODES, SCRUB_NODE]
const RAIL_INDEX: Record<string, number> = Object.fromEntries(RAIL_NODES.map((n, i) => [n.id, i]))

// ---------------------------------------------------------------------------
// Normalised timeline item — the console's view of one SSE frame.
// ---------------------------------------------------------------------------

export interface StepTelemetry {
  tokens: number | null
  costUsd: number | null
  latencyMs: number | null
  model: string | null
}

export type ItemKind = 'node_transition' | 'terminal' | 'other'

export interface TimelineItem {
  /** Event id — the dedup key. Native `Last-Event-ID` value for this frame. */
  id: string
  /** Sort order: numeric event id when parseable, else arrival index. */
  seq: number
  /** Stable tiebreak for equal `seq`. */
  arrival: number
  kind: ItemKind
  /** Normalised rail node id (dispatch/run_worker/…/scrub), when known. */
  node: string | null
  /** The node string exactly as the seam sent it (never hidden). */
  rawNode: string | null
  /** Node label for display. */
  nodeLabel: string
  phase: NodePhase | null
  /** Free-form detail line, when present. */
  detail: string | null
  telemetry: StepTelemetry | null
  /** Terminal frames only: settled status + reconciled cost. */
  status: string | null
  costUsd: number | null
  /** Event timestamp in epoch ms, when the frame carried one. */
  at: number | null
}

// ---------------------------------------------------------------------------
// Defensive field readers over an unknown JSON payload.
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function firstString(rec: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = rec[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

function firstNumber(rec: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = rec[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  }
  return null
}

/** Lowercase + collapse separators, so `Run-Worker`/`run worker` → `run_worker`. */
function normalizeToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s/-]+/g, '_').replace(/_+/g, '_')
}

/** Map an arbitrary node string to a rail node id, or null if unrecognised. */
export function normalizeNode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const norm = normalizeToken(raw)
  // Exact id match first — the seam sends canonical ids per the lifecycle spec.
  for (const n of ALL_NODES) if (n.id === norm) return n.id
  // Fall back to alias containment (tolerates prefixes/suffixes like `gate_wait`).
  for (const n of ALL_NODES) {
    if (n.match.some((alias) => norm === alias || norm.includes(alias))) return n.id
  }
  return null
}

/** Map an arbitrary phase/state string to a rail phase, or null. */
export function normalizePhase(raw: string | null | undefined): NodePhase | null {
  if (!raw) return null
  const n = normalizeToken(raw)
  if (['active', 'running', 'run', 'started', 'start', 'in_progress', 'busy', 'live'].includes(n)) {
    return 'active'
  }
  if (
    ['done', 'complete', 'completed', 'succeeded', 'success', 'ok', 'finished', 'passed'].includes(n)
  ) {
    return 'done'
  }
  if (
    ['fault', 'failed', 'failure', 'error', 'errored', 'no_go', 'nogo', 'rejected', 'scrubbed', 'aborted', 'cancelled', 'canceled'].includes(
      n,
    )
  ) {
    return 'fault'
  }
  if (['pending', 'queued', 'waiting', 'idle', 'not_started'].includes(n)) return 'pending'
  return null
}

const TERMINAL_EVENT_NAMES = new Set([
  'terminal',
  'run_complete',
  'run_completed',
  'complete',
  'completed',
  'final',
  'finished',
  'end',
  'done',
  'settled',
])

const FAULT_TERMINAL = new Set([
  'failed',
  'failure',
  'error',
  'errored',
  'rejected',
  'cancelled',
  'canceled',
  'scrubbed',
  'aborted',
  'no_go',
  'nogo',
  'timeout',
  'timed_out',
])

/** True when a terminal status resolved as a fault / NO-GO (red). */
export function isFaultStatus(status: string | null | undefined): boolean {
  return status ? FAULT_TERMINAL.has(normalizeToken(status)) : false
}

const SCRUB_TERMINAL = new Set(['scrubbed', 'rejected', 'no_go', 'nogo', 'cancelled', 'canceled', 'aborted'])

function extractTelemetry(rec: Record<string, unknown>): StepTelemetry | null {
  const t = asRecord(rec.telemetry) ?? asRecord(rec.metrics) ?? asRecord(rec.usage) ?? rec
  const tokens = firstNumber(t, ['tokens', 'total_tokens', 'token_count', 'tok'])
  const costUsd = firstNumber(t, ['cost_usd', 'cost', 'usd', 'price_usd'])
  const latencyMs = firstNumber(t, ['latency_ms', 'latency', 'elapsed_ms', 'duration_ms'])
  const model = firstString(t, ['model', 'model_id', 'engine'])
  if (tokens == null && costUsd == null && latencyMs == null && model == null) return null
  return { tokens, costUsd, latencyMs, model }
}

/**
 * Normalise one SSE frame into a {@link TimelineItem}.
 *
 * @param eventName the SSE `event:` field ('node_transition', a terminal name,
 *   or 'message' for the default unnamed event)
 * @param data      the raw `data:` payload string (JSON)
 * @param id        the frame's `Last-Event-ID` (the dedup key)
 * @param arrival   monotonic arrival index for stable ordering
 */
export function normalizeFrame(
  eventName: string,
  data: string,
  id: string,
  arrival: number,
): TimelineItem | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    // A bare, non-JSON keepalive/comment line — nothing to render.
    return null
  }
  const rec = asRecord(parsed)
  if (!rec) return null

  const name = normalizeToken(eventName || 'message')
  const typeField = normalizeToken(firstString(rec, ['type', 'event', 'kind']) ?? '')

  const rawNode = firstString(rec, ['node', 'step', 'stage', 'name', 'phase_name', 'node_id'])
  const node = normalizeNode(rawNode)
  const statusStr = firstString(rec, ['status', 'final_status', 'result', 'state'])

  const isTerminal =
    TERMINAL_EVENT_NAMES.has(name) ||
    TERMINAL_EVENT_NAMES.has(typeField) ||
    rec.terminal === true ||
    // An unnamed frame with a settled status and cost but no node reads terminal.
    (rawNode == null && statusStr != null && firstNumber(rec, ['cost_usd', 'cost']) != null)

  const seqNum = Number(id)
  const seq = Number.isFinite(seqNum) ? seqNum : arrival
  const at = parseTimestamp(firstString(rec, ['at', 'ts', 'timestamp', 'time', 'created_at']))
  const detail = firstString(rec, ['detail', 'message', 'note', 'summary', 'text'])

  if (isTerminal) {
    return {
      id,
      seq,
      arrival,
      kind: 'terminal',
      node,
      rawNode,
      nodeLabel: 'Terminal',
      phase: null,
      detail,
      telemetry: extractTelemetry(rec),
      status: statusStr,
      costUsd: firstNumber(rec, ['cost_usd', 'cost', 'usd', 'total_cost_usd']),
      at,
    }
  }

  const isTransition = name === 'node_transition' || typeField === 'node_transition' || node != null
  if (!isTransition) return null

  return {
    id,
    seq,
    arrival,
    kind: 'node_transition',
    node,
    rawNode,
    nodeLabel: node ? nodeLabel(node) : rawNode ?? 'Step',
    phase: normalizePhase(firstString(rec, ['phase', 'state', 'status', 'transition'])),
    detail,
    telemetry: extractTelemetry(rec),
    status: null,
    costUsd: null,
    at,
  }
}

/** Human label for a rail node id. */
export function nodeLabel(id: string): string {
  return ALL_NODES.find((n) => n.id === id)?.label ?? id
}

// ---------------------------------------------------------------------------
// Derived state — rail illumination + accrued cost.
// ---------------------------------------------------------------------------

export interface TerminalState {
  status: string
  costUsd: number | null
}

/**
 * Derive each rail node's phase from the ordered transitions. We only promote
 * state we can justify: a node whose flow the run has demonstrably moved past
 * settles to `done`; nodes never reported stay `pending` (dim) rather than
 * inventing completion. On a terminal frame, any still-active node settles —
 * `done` on a clean finish, `fault` on a NO-GO / scrub.
 */
export function deriveRailPhases(
  transitions: TimelineItem[],
  terminal: TerminalState | null,
): Record<string, NodePhase> {
  const phases: Record<string, NodePhase> = {}
  for (const n of ALL_NODES) phases[n.id] = 'pending'

  let maxIdx = -1
  for (const t of transitions) {
    if (!t.node || !t.phase) continue
    phases[t.node] = t.phase
    const idx = RAIL_INDEX[t.node]
    if (idx != null && idx > maxIdx) maxIdx = idx
  }

  // Flow moved past an earlier node ⇒ it finished (unless it faulted).
  RAIL_NODES.forEach((n, i) => {
    if (i < maxIdx && phases[n.id] === 'active') phases[n.id] = 'done'
  })

  if (terminal) {
    const fault = isFaultStatus(terminal.status)
    for (const n of RAIL_NODES) {
      if (phases[n.id] === 'active') phases[n.id] = fault ? 'fault' : 'done'
    }
    // Light the scrub node when the run resolved down the abort path.
    if (SCRUB_TERMINAL.has(normalizeToken(terminal.status)) && phases.scrub === 'pending') {
      phases.scrub = 'fault'
    }
  }

  return phases
}

/** Sum of per-step telemetry cost across all frames — the accruing ticker. */
export function accrueCost(items: TimelineItem[]): number | null {
  let sum = 0
  let seen = false
  for (const it of items) {
    const c = it.telemetry?.costUsd
    if (typeof c === 'number' && Number.isFinite(c)) {
      sum += c
      seen = true
    }
  }
  return seen ? sum : null
}

// ---------------------------------------------------------------------------
// Gate-awaiting detection.
// ---------------------------------------------------------------------------

const AWAITING_GATE = new Set([
  'awaiting_gate',
  'awaiting_go_no_go',
  'awaiting_approval',
  'awaiting_decision',
  'gate',
  'go_no_go',
  'gonogo',
  'pending_gate',
  'pending_approval',
  'blocked',
  'held',
  'paused',
  'review',
  'awaiting_review',
])

/**
 * Is the run parked at the gate, waiting on the operator's go/no-go?
 *
 * Render-only signal: it decides WHEN to surface the command panel, never what
 * the operator should choose. Driven by the run's status first, with the live
 * rail (gate node active, run not terminal) as a corroborating fallback.
 */
export function isAwaitingGate(
  status: string | null | undefined,
  railPhases: Record<string, NodePhase> | null,
  terminal: TerminalState | null,
): boolean {
  if (terminal) return false
  if (status && AWAITING_GATE.has(normalizeToken(status))) return true
  return railPhases?.gate === 'active'
}
