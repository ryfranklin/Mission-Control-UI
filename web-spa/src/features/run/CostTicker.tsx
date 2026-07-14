import { formatNumber, formatTokens } from '../../lib/format'
import { isTerminal } from '../../lib/status'
import { CostReadout } from '../fleet/CostReadout'
import type { TerminalState, TokenTally } from './runModel'

/**
 * LIVE COST TICKER — accrues from per-step telemetry while the run is in flight
 * and settles on the terminal frame.
 *
 * Cost-honesty (non-negotiable): pre-terminal the figure is amber UNRECONCILED
 * (it may still move); only the terminal frame's reconciled `cost_usd` turns it
 * green and settled. Both states are delegated to the shared {@link CostReadout}
 * so this view can never accidentally diverge from the fleet's honesty rule —
 * we hand it the terminal status only when settled, otherwise a non-terminal
 * status so it renders UNRECONCILED.
 */
export function CostTicker({
  accruedCost,
  tokenTally,
  terminal,
  liveStatus,
  reconciledCost,
}: {
  accruedCost: number | null
  tokenTally: TokenTally
  terminal: TerminalState | null
  /** The run's current status — settled or in-flight — for the readout. */
  liveStatus: string | null | undefined
  /** The run's persisted `cost_usd`, the reconciled figure for a landed burn. */
  reconciledCost: number | null | undefined
}) {
  // A burn settles either via the SSE terminal frame OR because its status is
  // already terminal (e.g. a landed `applied` run whose stream carried no
  // terminal frame). Cost-honesty is preserved: a genuinely in-flight run
  // (running/queued/awaiting_gate) is not terminal, so it stays UNRECONCILED.
  const settled = terminal != null || isTerminal(liveStatus)
  // Prefer the terminal frame's reconciled cost, else the run's persisted
  // cost_usd; only fall back to the accrued (provisional) figure in flight.
  const costUsd = settled ? terminal?.costUsd ?? reconciledCost ?? null : accruedCost
  // CostReadout keys the amber/green decision off isTerminal(status): pass a
  // settled status when settled, else force the in-flight branch.
  const status = settled ? terminal?.status ?? liveStatus ?? 'settled' : liveStatus ?? 'in_flight'

  return (
    <section aria-label="Cost ticker" className="mc-panel p-4">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-[0.65rem] uppercase tracking-widest text-readout-muted">Mission Cost</h2>
        <span className="text-[0.55rem] uppercase tracking-wider text-readout-dim">
          {settled ? 'reconciled' : 'accruing'}
        </span>
      </header>
      <div className="text-2xl">
        <CostReadout costUsd={costUsd} status={status} />
      </div>
      {!settled && (
        <p className="mt-1 text-[0.6rem] uppercase tracking-wider text-status-flight/80">
          Provisional — settles at terminal
        </p>
      )}
      <TokenTallyReadout tally={tokenTally} />
    </section>
  )
}

/**
 * TOKEN TALLY — actual input + output tokens observed, plus the latest context
 * size. These are ACTUALS, not an estimate, so unlike cost they are NOT gated
 * by reconciliation: they render plainly whether the run is in flight or
 * settled. Cyan is the console's live-telemetry accent; labels/aria carry the
 * meaning so the figure never rides color alone.
 */
function TokenTallyReadout({ tally }: { tally: TokenTally }) {
  return (
    <dl
      aria-label="Token usage"
      className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-console-line pt-2"
    >
      <div className="flex items-baseline gap-1.5">
        <dt className="text-[0.55rem] uppercase tracking-wider text-readout-dim">tokens</dt>
        <dd
          className="text-sm tabular-nums text-status-telemetry"
          aria-label={
            tally.seen
              ? `${formatNumber(tally.inputTokens)} input plus ${formatNumber(
                  tally.outputTokens,
                )} output tokens`
              : 'No token usage yet'
          }
        >
          {tally.seen
            ? `in ${formatTokens(tally.inputTokens)} / out ${formatTokens(tally.outputTokens)}`
            : '—'}
        </dd>
      </div>
      <div className="flex items-baseline gap-1.5">
        <dt className="text-[0.55rem] uppercase tracking-wider text-readout-dim">ctx</dt>
        <dd
          className="text-sm tabular-nums text-readout"
          aria-label={
            tally.latestContextSize != null
              ? `context size ${formatNumber(tally.latestContextSize)} tokens`
              : 'Context size not reported'
          }
        >
          {formatTokens(tally.latestContextSize)}
        </dd>
      </div>
    </dl>
  )
}
