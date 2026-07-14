import { formatMoney, formatNumber, formatTokens, humanizeKey } from '../../lib/format'
import { isCostKey, isTokenKey } from '../../lib/metrics'

/**
 * A single rollup figure tile. Monospace tabular value so digits don't jitter
 * between scopes; cost-named keys render as `$` (reconciled-green), token-named
 * keys render with the compact token unit (cyan telemetry accent). The exact
 * grouped figure rides an aria-label/tooltip so an abbreviated `58.9k` never
 * hides precision from a screen reader.
 */
export function Figure({ metricKey, value }: { metricKey: string; value: number }) {
  const isCost = isCostKey(metricKey)
  const isToken = !isCost && isTokenKey(metricKey)
  const label = humanizeKey(metricKey)

  const display = isCost
    ? formatMoney(value)
    : isToken
      ? formatTokens(value)
      : Number.isInteger(value)
        ? formatNumber(value)
        : formatNumber(value, 2)

  const accent = isCost ? 'text-status-go' : isToken ? 'text-status-telemetry' : 'text-readout'
  const aria = isToken ? `${label}: ${formatNumber(value)} tokens` : `${label}: ${display}`

  return (
    <div className="mc-panel bg-console-raised px-3 py-2">
      <dt className="truncate text-[0.6rem] uppercase tracking-wider text-readout-muted" title={label}>
        {label}
      </dt>
      <dd
        className={`mt-1 text-xl tabular-nums ${accent}`}
        aria-label={aria}
        title={isToken ? `${formatNumber(value)} tokens` : undefined}
      >
        {display}
      </dd>
    </div>
  )
}
