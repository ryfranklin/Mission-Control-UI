import { formatMoney, formatNumber, humanizeKey } from '../../lib/format'
import { isCostKey } from '../../lib/metrics'

/**
 * A single rollup figure tile. Monospace tabular value so digits don't jitter
 * between scopes; cost-named keys render as `$`.
 */
export function Figure({ metricKey, value }: { metricKey: string; value: number }) {
  const isCost = isCostKey(metricKey)
  const display = isCost
    ? formatMoney(value)
    : Number.isInteger(value)
      ? formatNumber(value)
      : formatNumber(value, 2)
  return (
    <div className="mc-panel bg-console-raised px-3 py-2">
      <dt className="truncate text-[0.6rem] uppercase tracking-wider text-readout-muted" title={humanizeKey(metricKey)}>
        {humanizeKey(metricKey)}
      </dt>
      <dd className={`mt-1 text-xl tabular-nums ${isCost ? 'text-status-go' : 'text-readout'}`}>
        {display}
      </dd>
    </div>
  )
}
