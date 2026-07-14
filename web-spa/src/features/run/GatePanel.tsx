import { useEffect, useRef, useState } from 'react'

import { ApiError } from '../../api'
import type { RunAction, useRunActions } from './useRun'

/**
 * GATE COMMAND PANEL — the operator's transmit controls. This UI is a thin
 * client: it never DECIDES the gate, it only sends the operator's choice
 * (approve / reject / scrub / cancel) to the seam.
 *
 *  - GO  (approve) and NO-GO (reject) appear only while the run is parked at the
 *    gate — the only moment those verbs are meaningful.
 *  - SCRUB is a GUARDED control: it must be deliberately ARMED (arm → confirm)
 *    before it can fire, and auto-disarms after a few seconds, so an abort can
 *    never be a single accidental click.
 *  - CANCEL aborts an in-flight run via its endpoint.
 */

type Mutation = ReturnType<typeof useRunActions>

const ARM_WINDOW_MS = 5000

export function GatePanel({
  awaitingGate,
  inFlight,
  actions,
}: {
  awaitingGate: boolean
  inFlight: boolean
  actions: Mutation
}) {
  const pending = actions.isPending ? (actions.variables as RunAction) : null
  const busy = actions.isPending
  const send = (action: RunAction) => actions.mutate(action)

  return (
    <section aria-label="Gate command" className="mc-panel p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-[0.65rem] uppercase tracking-widest text-readout-muted">
          Flight Director · Command
        </h2>
        <span className="text-[0.55rem] uppercase tracking-wider text-readout-dim">
          transmit only
        </span>
      </header>

      {awaitingGate ? (
        <div className="grid grid-cols-2 gap-3">
          <CommandButton
            label="GO"
            sublabel="approve"
            tone="go"
            glyph="●"
            disabled={busy}
            loading={pending === 'approve'}
            onClick={() => send('approve')}
          />
          <CommandButton
            label="NO-GO"
            sublabel="reject"
            tone="fault"
            glyph="▲"
            disabled={busy}
            loading={pending === 'reject'}
            onClick={() => send('reject')}
          />
        </div>
      ) : (
        <p className="rounded border border-console-line bg-console-void px-3 py-2 text-center text-[0.6rem] uppercase tracking-wider text-readout-muted">
          {inFlight ? 'Run not at gate — go/no-go unavailable' : 'Run settled — no commands'}
        </p>
      )}

      {inFlight && (
        <div className="mt-3 flex flex-col gap-2 border-t border-console-line pt-3">
          <ArmedScrub
            disabled={busy}
            loading={pending === 'scrub'}
            onFire={() => send('scrub')}
          />
          <CommandButton
            label="CANCEL"
            sublabel="stand down run"
            tone="neutral"
            glyph="○"
            disabled={busy}
            loading={pending === 'cancel'}
            onClick={() => send('cancel')}
            compact
          />
        </div>
      )}

      {actions.isError && (
        <p role="alert" className="mt-3 text-[0.6rem] uppercase tracking-wider text-status-fault">
          ▲ Command rejected — {errorText(actions.error)}
        </p>
      )}
    </section>
  )
}

const TONE_CLASS: Record<string, string> = {
  go: 'border-status-go/60 text-status-go hover:bg-status-go/10',
  fault: 'border-status-fault/60 text-status-fault hover:bg-status-fault/10',
  flight: 'border-status-flight/60 text-status-flight hover:bg-status-flight/10',
  neutral: 'border-console-line text-readout-muted hover:bg-console-raised',
}

function CommandButton({
  label,
  sublabel,
  tone,
  glyph,
  disabled,
  loading,
  onClick,
  compact,
}: {
  label: string
  sublabel: string
  tone: keyof typeof TONE_CLASS
  glyph: string
  disabled?: boolean
  loading?: boolean
  onClick: () => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex ${
        compact ? 'flex-row items-center justify-center gap-2' : 'flex-col items-center'
      } rounded border bg-console-void px-3 py-2 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${TONE_CLASS[tone]}`}
    >
      <span className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider">
        <span aria-hidden>{loading ? '◆' : glyph}</span>
        {label}
      </span>
      <span className="text-[0.55rem] uppercase tracking-wider text-readout-muted">
        {loading ? 'transmitting…' : sublabel}
      </span>
    </button>
  )
}

/**
 * The two-step scrub: click ARM to open a brief confirm window, then CONFIRM to
 * fire. The window auto-closes so an armed control never lingers.
 */
function ArmedScrub({
  disabled,
  loading,
  onFire,
}: {
  disabled?: boolean
  loading?: boolean
  onFire: () => void
}) {
  const [armed, setArmed] = useState(false)
  const timerRef = useRef<number | null>(null)

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const arm = () => {
    setArmed(true)
    clearTimer()
    timerRef.current = window.setTimeout(() => setArmed(false), ARM_WINDOW_MS)
  }
  const disarm = () => {
    setArmed(false)
    clearTimer()
  }
  const fire = () => {
    disarm()
    onFire()
  }

  useEffect(() => clearTimer, [])

  if (!armed) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={arm}
        className="flex items-center justify-center gap-2 rounded border border-status-fault/40 bg-console-void px-3 py-2 text-xs font-bold uppercase tracking-wider text-status-fault transition-colors hover:bg-status-fault/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span aria-hidden>▲</span>
        {loading ? 'Scrubbing…' : 'Arm Scrub'}
      </button>
    )
  }

  return (
    <div
      role="group"
      aria-label="Scrub armed — confirm or disarm"
      className="flex items-stretch gap-2 rounded border border-status-fault bg-status-fault/10 p-1"
    >
      <button
        type="button"
        disabled={disabled}
        onClick={fire}
        className="flex flex-1 items-center justify-center gap-1.5 rounded bg-status-fault px-3 py-2 text-xs font-bold uppercase tracking-wider text-console-void animate-pulse motion-reduce:animate-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span aria-hidden>▲</span>
        Confirm Scrub
      </button>
      <button
        type="button"
        onClick={disarm}
        className="rounded border border-console-line px-2 py-2 text-[0.6rem] uppercase tracking-wider text-readout-muted hover:text-readout"
      >
        Disarm
      </button>
    </div>
  )
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) return `seam ${error.status}`
  if (error instanceof Error) return error.message
  return 'unknown fault'
}
