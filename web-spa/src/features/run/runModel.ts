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
  /** Total tokens when the frame reports one outright. */
  tokens: number | null
  /** Per-step token breakdown (Anthropic usage vocabulary). */
  inputTokens: number | null
  outputTokens: number | null
  cacheCreationTokens: number | null
  cacheReadTokens: number | null
  /** Working context window size at this step, in tokens. */
  contextSizeTokens: number | null
  costUsd: number | null
  latencyMs: number | null
  model: string | null
}

export type ItemKind = 'node_transition' | 'step_metric' | 'terminal' | 'other'

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
  // `step_metric` frames nest the usage payload under `event`; unwrap it so the
  // token/cost fields are read from there rather than the empty envelope.
  const t =
    asRecord(rec.telemetry) ??
    asRecord(rec.metrics) ??
    asRecord(rec.usage) ??
    asRecord(rec.event) ??
    rec
  const tokens = firstNumber(t, ['tokens', 'total_tokens', 'token_count', 'tok'])
  const inputTokens = firstNumber(t, ['input_tokens', 'prompt_tokens', 'tokens_in'])
  const outputTokens = firstNumber(t, ['output_tokens', 'completion_tokens', 'tokens_out'])
  const cacheCreationTokens = firstNumber(t, [
    'cache_creation_tokens',
    'cache_creation_input_tokens',
    'cache_write_tokens',
  ])
  const cacheReadTokens = firstNumber(t, [
    'cache_read_tokens',
    'cache_read_input_tokens',
    'cached_tokens',
  ])
  const contextSizeTokens = firstNumber(t, ['context_size_tokens', 'context_size', 'context_tokens'])
  const costUsd = firstNumber(t, ['cost_usd', 'cost', 'usd', 'price_usd'])
  const latencyMs = firstNumber(t, ['latency_ms', 'latency', 'elapsed_ms', 'duration_ms'])
  const model = firstString(t, ['model', 'model_id', 'engine'])
  if (
    tokens == null &&
    inputTokens == null &&
    outputTokens == null &&
    cacheCreationTokens == null &&
    cacheReadTokens == null &&
    contextSizeTokens == null &&
    costUsd == null &&
    latencyMs == null &&
    model == null
  ) {
    return null
  }
  return {
    tokens,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    contextSizeTokens,
    costUsd,
    latencyMs,
    model,
  }
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

  // A `step_metric` frame carries per-step token telemetry nested under `event`.
  // It is the ONLY frame with per-step tokens, so it feeds both the timeline's
  // telemetry rows and the cost ticker's token tally. Tokens are actuals; its
  // cost accrues pre-terminal but the reconciled mission cost still comes from
  // the terminal frame (CostTicker prefers terminal.costUsd when settled).
  const isStepMetric = name === 'step_metric' || typeField === 'step_metric'
  if (isStepMetric) {
    const eventRec = asRecord(rec.event) ?? rec
    const metricNodeRaw = firstString(eventRec, ['node', 'step', 'stage', 'node_id']) ?? rawNode
    const metricNode = normalizeNode(metricNodeRaw)
    const stepId = firstString(eventRec, ['step_id', 'id'])
    return {
      id,
      seq,
      arrival,
      kind: 'step_metric',
      node: metricNode,
      rawNode: metricNodeRaw,
      nodeLabel: metricNode
        ? nodeLabel(metricNode)
        : stepId
          ? `Step ${stepId}`
          : 'Step Telemetry',
      phase: null,
      detail,
      telemetry: extractTelemetry(rec),
      status: null,
      costUsd: null,
      at: at ?? parseTimestamp(firstString(eventRec, ['at', 'ts', 'timestamp', 'time'])),
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

/**
 * A running token tally across the run's telemetry frames. Unlike cost these
 * are ACTUALS — the sum of input + output tokens observed so far, plus the most
 * recent context-window size — so they render plainly (not gated by cost
 * reconciliation). `seen` is false until at least one token figure lands, so
 * callers can distinguish "no tokens yet" from a genuine zero.
 */
export interface TokenTally {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  latestContextSize: number | null
  seen: boolean
}

export function accrueTokens(items: TimelineItem[]): TokenTally {
  let inputTokens = 0
  let outputTokens = 0
  let latestContextSize: number | null = null
  let seen = false
  // `items` arrive in seq order, so the last context size we see is the latest.
  for (const it of items) {
    const t = it.telemetry
    if (!t) continue
    if (t.inputTokens != null) {
      inputTokens += t.inputTokens
      seen = true
    }
    if (t.outputTokens != null) {
      outputTokens += t.outputTokens
      seen = true
    }
    if (t.contextSizeTokens != null) {
      latestContextSize = t.contextSizeTokens
      seen = true
    }
  }
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, latestContextSize, seen }
}

// ---------------------------------------------------------------------------
// Per-node outcome annotations — the burn detail lit onto the sequence rail.
// ---------------------------------------------------------------------------

/**
 * A rail node's derived outcome, read from the `node_transition` frames that
 * touched it: a short outcome token (GO / NO-GO / PUSHED / a branch name…), the
 * latest free-form note the seam sent, and the elapsed time spent in the node
 * where the frame timestamps let us derive it. Honest by construction — the
 * note is always the raw detail; the token only summarises what was observed.
 */
export interface NodeAnnotation {
  outcome: string | null
  note: string | null
  elapsedMs: number | null
}

/** A branch/worktree ref from a free-form detail line, best-effort. */
function extractBranch(text: string): string | null {
  // Conventional branch shapes first (`burn-…`, `feat/…`) — the real ref name,
  // even when it trails a keyword like "worktree branch".
  const conv = text.match(/\b((?:burn|run|feat|feature|fix|chore|hotfix|release)[-/][\w./-]+)/i)
  if (conv) return conv[1]
  // Otherwise the token following a branch/worktree/ref keyword, if it looks
  // like a ref (not just another prose word we don't recognise).
  const kw = text.match(/\b(?:branch|worktree|ref)\s+(?:is\s+|named\s+|=\s*)?["'`]?([\w][\w./-]+)["'`]?/i)
  if (kw && kw[1].toLowerCase() !== 'branch') return kw[1]
  const ticked = text.match(/`([\w][\w./-]{2,})`/)
  if (ticked) return ticked[1]
  return null
}

/** A push disposition (apply_burn) from a free-form detail line. */
function extractPush(text: string): string | null {
  const t = text.toLowerCase()
  if (/\breject/.test(t)) return 'REJECTED'
  if (/\bskip/.test(t)) return 'SKIPPED'
  if (/\bpush(ed|ing)?\b/.test(t)) return 'PUSHED'
  if (/\bno[\s-]?go\b/.test(t)) return 'NO-GO'
  return null
}

function firstAt(items: TimelineItem[]): number | null {
  let min: number | null = null
  for (const it of items) if (it.at != null && (min == null || it.at < min)) min = it.at
  return min
}

function lastAt(items: TimelineItem[]): number | null {
  let max: number | null = null
  for (const it of items) if (it.at != null && (max == null || it.at > max)) max = it.at
  return max
}

function latestNote(items: TimelineItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) if (items[i].detail) return items[i].detail
  return null
}

/** A short uppercase outcome from a node's phase, when nothing more specific fits. */
function phaseOutcome(phase: NodePhase | undefined): string | null {
  if (phase === 'done') return 'DONE'
  if (phase === 'fault') return 'FAULT'
  if (phase === 'active') return 'ACTIVE'
  return null
}

/**
 * Derive each rail node's outcome annotation from the ordered transitions.
 * Semantics per node follow the flight sequence: dispatch → worktree branch,
 * gate → GO / NO-GO, apply_burn → push disposition, teardown → outcome.
 * Elapsed is derived from frame timestamps: a node's start to the next node's
 * start (or its own last frame), only when the timestamps support it.
 */
export function deriveNodeAnnotations(
  transitions: TimelineItem[],
  railPhases: Record<string, NodePhase>,
): Record<string, NodeAnnotation> {
  const nodeTransitions = transitions.filter((t) => t.kind === 'node_transition' && t.node)
  const byNode: Record<string, TimelineItem[]> = {}
  for (const t of nodeTransitions) (byNode[t.node as string] ??= []).push(t)

  // Ordered starts, so per-node elapsed can span to the next node's first frame.
  const orderedStarts = RAIL_NODES.map((n) => firstAt(byNode[n.id] ?? [])).map((v) => v)

  const out: Record<string, NodeAnnotation> = {}
  for (const n of ALL_NODES) {
    const items = byNode[n.id] ?? []
    const phase = railPhases[n.id]
    const note = latestNote(items)
    const noteText = items.map((it) => it.detail ?? '').join(' — ')

    let outcome: string | null = null
    if (n.id === 'gate') {
      if (phase === 'done') outcome = 'GO'
      else if (phase === 'fault') outcome = 'NO-GO'
      else if (noteText) outcome = extractPush(noteText) === 'NO-GO' ? 'NO-GO' : null
    } else if (n.id === 'apply_burn') {
      outcome = extractPush(noteText) ?? phaseOutcome(phase)
    } else if (n.id === 'dispatch') {
      outcome = extractBranch(noteText)
    } else {
      outcome = phaseOutcome(phase)
    }

    // Elapsed: this node's start → next node's start, else its own span.
    let elapsedMs: number | null = null
    const railIdx = RAIL_INDEX[n.id]
    const start = firstAt(items)
    if (start != null) {
      let nextStart: number | null = null
      if (railIdx != null) {
        for (let j = railIdx + 1; j < orderedStarts.length; j++) {
          const s = orderedStarts[j]
          if (s != null && s >= start) {
            nextStart = s
            break
          }
        }
      }
      const end = nextStart ?? lastAt(items)
      if (end != null && end > start) elapsedMs = end - start
    }

    out[n.id] = { outcome, note, elapsedMs }
  }
  return out
}

/** A compact one-line burn summary: branch · decision · push status. */
export interface BurnSummary {
  branch: string | null
  decision: 'GO' | 'NO-GO' | null
  push: string | null
  hasAny: boolean
}

export function deriveBurnSummary(
  annotations: Record<string, NodeAnnotation>,
  transitions: TimelineItem[],
): BurnSummary {
  const allText = transitions
    .filter((t) => t.kind === 'node_transition')
    .map((t) => t.detail ?? '')
    .join(' — ')

  const branch = annotations.dispatch?.outcome ?? extractBranch(allText)
  const gate = annotations.gate?.outcome
  const decision: BurnSummary['decision'] = gate === 'GO' || gate === 'NO-GO' ? gate : null
  const push = annotations.apply_burn?.outcome ?? null
  return {
    branch,
    decision,
    push,
    hasAny: branch != null || decision != null || push != null,
  }
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
