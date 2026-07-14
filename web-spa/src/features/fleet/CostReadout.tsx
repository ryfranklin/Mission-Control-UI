import { formatMoney } from '../../lib/format'
import { isTerminal } from '../../lib/status'

/**
 * The cost-honesty readout (non-negotiable rule).
 *
 * A run's cost is only trustworthy once the run is TERMINAL:
 *   - pre-terminal  → amber "UNRECONCILED", with the accrued figure shown as a
 *     provisional `~$…` so it never reads as a settled, final amount;
 *   - terminal      → a green, reconciled dollar figure.
 *
 * We never imply $0 = free: a zero pre-terminal cost still renders as
 * UNRECONCILED, never as `$0.00`.
 */
export function CostReadout({
  costUsd,
  status,
}: {
  costUsd: number | null | undefined
  status: string | null | undefined
}) {
  const cost = typeof costUsd === 'number' && Number.isFinite(costUsd) ? costUsd : null

  if (isTerminal(status)) {
    return (
      <div className="flex items-baseline gap-1.5">
        <span aria-hidden className="text-[0.7em] text-status-go">
          ●
        </span>
        <span className="text-lg tabular-nums text-status-go" title="Reconciled cost">
          {formatMoney(cost)}
        </span>
        <span className="text-[0.6rem] uppercase tracking-wider text-readout-muted">
          reconciled
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-baseline gap-1.5">
      <span aria-hidden className="text-[0.7em] text-status-flight">
        ◆
      </span>
      <span
        className="text-sm uppercase tracking-wider text-status-flight"
        title="Cost not yet reconciled — run is still in flight"
      >
        Unreconciled
      </span>
      {cost !== null && (
        <span className="text-xs tabular-nums text-status-flight/80" aria-label="provisional cost">
          ~{formatMoney(cost)}
        </span>
      )}
    </div>
  )
}
