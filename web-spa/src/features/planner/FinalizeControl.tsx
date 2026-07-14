import { ApiError } from '../../api'
import { useFinalizePlan } from './usePlanner'

/**
 * FINALIZE — the go/no-go command that commits the Flight Plan.
 *
 * Enabled ONLY when the seam reports the plan `ready`; otherwise it is a hard
 * NO-GO. Finalizing dispatches every unit as a gated burn onto the fleet — the
 * Fleet board and Run stations take over from there (each burn stops at its own
 * gate for operator go/no-go). On success the mutation invalidates the plan,
 * plan list, and runs ledger so those surfaces reflect the new burns.
 */
export function FinalizeControl({
  planId,
  ready,
  unitCount,
}: {
  planId: string
  ready: boolean
  unitCount: number
}) {
  const finalize = useFinalizePlan(planId)
  const disabled = !ready || finalize.isPending

  return (
    <section
      aria-label="Finalize"
      className={`mc-panel flex flex-col gap-3 border-l-2 p-4 ${
        ready ? 'border-status-go/60' : 'border-console-line'
      }`}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className={ready ? 'text-status-go' : 'text-readout-muted'}>
          {ready ? '●' : '○'}
        </span>
        <h3 className="text-[0.65rem] uppercase tracking-widest text-readout">Finalize Flight Plan</h3>
      </div>

      <p className="text-[0.7rem] leading-relaxed text-readout-muted">
        Dispatches{' '}
        <span className="tabular-nums text-readout">
          {unitCount} unit{unitCount === 1 ? '' : 's'}
        </span>{' '}
        as gated burns onto the fleet. Each burn holds at its own go/no-go gate —
        monitor and approve them from the Fleet board and Run stations.
      </p>

      {finalize.isError && (
        <p role="alert" className="text-xs text-status-fault">
          ▲ {finalizeErrorMessage(finalize.error)}
        </p>
      )}

      {finalize.isSuccess ? (
        <p className="flex items-center gap-2 text-xs text-status-go">
          <span aria-hidden>●</span> Dispatched —{' '}
          <a href="#/fleet" className="underline hover:text-readout">
            open Fleet board ▸
          </a>
        </p>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => finalize.mutate()}
          className="rounded border border-status-go/60 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-status-go transition-colors enabled:hover:bg-status-go/10 disabled:cursor-not-allowed disabled:border-console-line disabled:text-readout-dim"
          title={ready ? 'Dispatch the plan' : 'No-go — plan is not ready to finalize'}
        >
          {finalize.isPending
            ? '◆ Dispatching…'
            : ready
              ? 'GO · Finalize & Dispatch ▸'
              : 'NO-GO · Not ready'}
        </button>
      )}
    </section>
  )
}

function finalizeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `Seam refused finalize (${error.status} ${error.statusText})`
  }
  if (error instanceof Error) return error.message
  return 'Could not finalize the plan'
}
