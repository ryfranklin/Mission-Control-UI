/**
 * The console's status vocabulary.
 *
 * The seam types `status` as a free-form string, so this module is the single
 * place that maps those strings to operator meaning: a semantic tone, a glyph,
 * and — critically — whether a run has reached a TERMINAL state.
 *
 * Cost-honesty (non-negotiable): a run's cost is only "reconciled" once it is
 * terminal. Anything not provably terminal is treated as in-flight, so the
 * default for an unknown status is NON-terminal — we would rather show
 * UNRECONCILED than imply a settled figure that might still move.
 */

export type StatusTone = 'go' | 'flight' | 'fault' | 'telemetry' | 'neutral'

/** Terminal statuses — the run has settled and its cost is reconciled. */
const TERMINAL = new Set([
  'succeeded',
  'success',
  'completed',
  'complete',
  'done',
  'finished',
  'failed',
  'failure',
  'error',
  'errored',
  'cancelled',
  'canceled',
  'scrubbed',
  'rejected',
  'aborted',
  'timeout',
  'timed_out',
  'no_go',
  'nogo',
])

/** Statuses that resolved cleanly — GO / green. */
const GO = new Set([
  'succeeded',
  'success',
  'completed',
  'complete',
  'done',
  'finished',
  'approved',
  'go',
  'reconciled',
])

/** Statuses that resolved as a fault / NO-GO — red. */
const FAULT = new Set([
  'failed',
  'failure',
  'error',
  'errored',
  'rejected',
  'cancelled',
  'canceled',
  'scrubbed',
  'aborted',
  'timeout',
  'timed_out',
  'no_go',
  'nogo',
])

function normalize(status: string): string {
  return status.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

/** True only for statuses we can prove have settled. Unknown ⇒ false. */
export function isTerminal(status: string | null | undefined): boolean {
  if (!status) return false
  return TERMINAL.has(normalize(status))
}

export interface StatusPresentation {
  tone: StatusTone
  /** Non-color redundant marker, so status never rides on hue alone. */
  glyph: string
  /** Uppercased label for the badge. */
  label: string
  terminal: boolean
}

/**
 * Map a raw status string to how the console should render it. Tone AND glyph
 * are both carried so the badge satisfies the "never hue alone" rule.
 */
export function statusPresentation(status: string | null | undefined): StatusPresentation {
  const raw = status?.trim() || 'unknown'
  const norm = normalize(raw)
  const terminal = TERMINAL.has(norm)

  let tone: StatusTone
  let glyph: string
  if (GO.has(norm)) {
    tone = 'go'
    glyph = '●' // filled — GO / nominal
  } else if (FAULT.has(norm)) {
    tone = 'fault'
    glyph = '▲' // warning triangle — NO-GO / fault
  } else if (norm === 'unknown') {
    tone = 'neutral'
    glyph = '○'
  } else {
    // Not resolved and not clearly a fault ⇒ in-flight.
    tone = 'flight'
    glyph = '◆' // diamond — in-flight / burning
  }

  return { tone, glyph, label: raw.toUpperCase(), terminal }
}

/** Tailwind text-color class per tone (structural map, not inline hex). */
export const TONE_TEXT: Record<StatusTone, string> = {
  go: 'text-status-go',
  flight: 'text-status-flight',
  fault: 'text-status-fault',
  telemetry: 'text-status-telemetry',
  neutral: 'text-readout-muted',
}

/** Tailwind border-color class per tone. */
export const TONE_BORDER: Record<StatusTone, string> = {
  go: 'border-status-go/50',
  flight: 'border-status-flight/50',
  fault: 'border-status-fault/50',
  telemetry: 'border-status-telemetry/50',
  neutral: 'border-console-line',
}

/** Raw hex per tone, for the charting lib which needs a color value. */
export const TONE_HEX: Record<StatusTone, string> = {
  go: '#2fe57a',
  flight: '#ffb020',
  fault: '#ff3b47',
  telemetry: '#22d3ee',
  neutral: '#6b7c8f',
}

/**
 * Normalize a task type to the console's `sim` / `burn` vocabulary. Anything
 * unrecognized is passed through uppercased so we never hide reality.
 */
export function taskTypeLabel(taskType: string | null | undefined): string {
  const t = taskType?.trim().toLowerCase()
  if (t === 'sim') return 'SIM'
  if (t === 'burn') return 'BURN'
  return taskType?.trim().toUpperCase() || '—'
}
