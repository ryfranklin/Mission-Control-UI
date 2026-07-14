import { CostReadout } from '../fleet/CostReadout'
import type { TerminalState } from './runModel'

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
  terminal,
  liveStatus,
}: {
  accruedCost: number | null
  terminal: TerminalState | null
  /** The run's current (non-terminal) status, for the in-flight readout. */
  liveStatus: string | null | undefined
}) {
  const settled = terminal != null
  const costUsd = settled ? terminal.costUsd : accruedCost
  // CostReadout keys the amber/green decision off isTerminal(status): pass the
  // settled status only when terminal, else force the in-flight branch.
  const status = settled ? terminal.status : liveStatus ?? 'in_flight'

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
    </section>
  )
}
