/**
 * Defensive readers for the `GET /metrics` payload.
 *
 * The seam types the rollup fields (`per_run`, `quality_trend`,
 * `runs_summary`, …) as free-form JSON objects — the analytics shape is owned
 * by the service, not the SPA. Rather than invent a contract the client can't
 * guarantee, we read them structurally: coerce numbers safely, pick a
 * value-ish field per row, and skip anything we can't interpret. The client
 * renders what it can and never fabricates figures.
 */

/** A record of unknown values — the shape the seam hands us for rollup rows. */
export type UnknownRecord = Record<string, unknown>

export function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Coerce a JSON value to a finite number, or null. Accepts numeric strings. */
export function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Coerce to a display string, or null. */
export function asLabel(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return null
}

/** All numeric [key, value] pairs of a record, in insertion order. */
export function numericEntries(obj: unknown): Array<[string, number]> {
  if (!isRecord(obj)) return []
  const out: Array<[string, number]> = []
  for (const [k, v] of Object.entries(obj)) {
    const n = asNumber(v)
    if (n !== null) out.push([k, n])
  }
  return out
}

/** True when a metric key names a monetary quantity (render as `$`). */
export function isCostKey(key: string): boolean {
  return /(cost|usd|price|spend|dollar)/i.test(key)
}

/** True when a metric key names a token quantity (render with the token unit). */
export function isTokenKey(key: string): boolean {
  return /(token|(^|[_-])tok([_-]|s?$)|context_size|ctx)/i.test(key)
}

/**
 * Pull a single value out of a row, preferring keys whose name matches one of
 * `prefer` (case-insensitive substring), else falling back to the last numeric
 * field. Returns null when the row carries no usable number.
 */
export function pickMetric(row: unknown, prefer: string[]): number | null {
  const nums = numericEntries(row)
  if (nums.length === 0) return null
  for (const needle of prefer) {
    const hit = nums.find(([k]) => k.toLowerCase().includes(needle.toLowerCase()))
    if (hit) return hit[1]
  }
  return nums[nums.length - 1][1]
}

/**
 * Pick a label for a row (an x-axis tick / row heading), preferring keys in
 * `prefer`, else the first string-ish field, else the row index.
 */
export function pickLabel(row: unknown, prefer: string[], index: number): string {
  if (isRecord(row)) {
    for (const needle of prefer) {
      const hit = Object.entries(row).find(([k]) =>
        k.toLowerCase().includes(needle.toLowerCase()),
      )
      const label = hit ? asLabel(hit[1]) : null
      if (label) return label
    }
    for (const v of Object.values(row)) {
      if (typeof v === 'string' && v.trim() !== '') return v
    }
  }
  return `#${index + 1}`
}

export interface SeriesPoint {
  index: number
  label: string
  value: number
}

/**
 * Turn an array of unknown rows into a numeric series for a sparkline. Rows
 * without a usable number are dropped. `preferValue`/`preferLabel` steer which
 * field becomes y / the tick label.
 */
export function toSeries(
  rows: unknown,
  preferValue: string[],
  preferLabel: string[],
): SeriesPoint[] {
  if (!Array.isArray(rows)) return []
  const out: SeriesPoint[] = []
  rows.forEach((row, i) => {
    const value = pickMetric(row, preferValue)
    if (value === null) return
    out.push({ index: out.length, label: pickLabel(row, preferLabel, i), value })
  })
  return out
}
