/**
 * Formatting primitives for the console readout.
 *
 * Every number the operator reads is rendered through here so digits stay
 * monospace/tabular and units are consistent. Pure functions only — no React,
 * no side effects, no clock reads baked in (callers pass `now`).
 */

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** A dollar figure, e.g. `$1,204.50`. Non-finite input renders as `$—`. */
export function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '$—'
  return USD.format(value)
}

/** A bare fixed-precision figure with grouping, e.g. `1,204.50`. */
export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/**
 * A compact token count for the telemetry readout. Small values stay grouped
 * and exact (`1028` → `1,028`); large ones abbreviate so the figure never
 * overruns a cell (`58900` → `58.9k`, `1_200_000` → `1.2M`). Non-finite input
 * renders as `—`. Pair with `tabular-nums` at the call site so digits don't
 * jitter as the count climbs — matching the cost/clock treatment.
 */
export function formatTokens(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs < 10_000) return formatNumber(Math.round(value))
  if (abs < 1_000_000) return `${(value / 1_000).toFixed(1)}k`
  return `${(value / 1_000_000).toFixed(1)}M`
}

/**
 * A mission-elapsed clock: `T+HH:MM:SS`, growing a `Dd ` prefix past 24h.
 * `ms` below zero (clock skew) clamps to zero so the readout never runs
 * backwards.
 */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const hms = [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':')
  return days > 0 ? `T+${days}d ${hms}` : `T+${hms}`
}

/** Parse an ISO-ish timestamp to epoch ms, or null if absent/unparseable. */
export function parseTimestamp(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

const DATETIME = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

/** Human-readable absolute timestamp for tooltips/detail lines. */
export function formatTimestamp(iso: string | null | undefined): string {
  const t = parseTimestamp(iso)
  return t == null ? '—' : DATETIME.format(t)
}

/**
 * A latency reading from milliseconds: `820ms` under a second, `1.24s` above.
 * Non-finite input renders as `—`.
 */
export function formatLatency(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

/** Turn a snake_case metric key into a Title Case label. */
export function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}
