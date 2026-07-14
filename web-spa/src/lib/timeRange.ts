/**
 * Time-window presets shared by the Fleet time-filter and the Metrics scope.
 *
 * A preset resolves to an ISO `from`/`to` pair at read time (relative to
 * `Date.now()`), so it stays fresh across refetches. `all` clears the window.
 */
export type RangeKey = '1h' | '24h' | '7d' | '30d' | 'all'

export const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: '1h', label: '1H' },
  { key: '24h', label: '24H' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: 'all', label: 'ALL' },
]

const WINDOW_MS: Record<Exclude<RangeKey, 'all'>, number> = {
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 604_800_000,
  '30d': 2_592_000_000,
}

export interface ResolvedRange {
  from?: string
  to?: string
}

/** Resolve a preset to concrete ISO bounds. `all` returns an empty window. */
export function resolveRange(key: RangeKey, now = Date.now()): ResolvedRange {
  if (key === 'all') return {}
  return {
    from: new Date(now - WINDOW_MS[key]).toISOString(),
    to: new Date(now).toISOString(),
  }
}
