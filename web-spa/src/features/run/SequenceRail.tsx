import { Fragment } from 'react'

import {
  PHASE_GLYPH,
  PHASE_LABEL,
  RAIL_NODES,
  SCRUB_NODE,
  type NodePhase,
} from './runModel'

/**
 * SEQUENCE RAIL — the run's lifecycle as a row of milestone nodes that
 * illuminate as SSE frames arrive: pending (dim), active (cyan, pulsing LED),
 * done (green), fault (red). The off-nominal `scrub` node hangs below the
 * nominal chain and only lights when the run takes the abort path.
 *
 * Accessibility: every node pairs its accent color with a phase glyph and a
 * text phase label, so state never rides on hue alone.
 */

const PHASE_STYLE: Record<
  NodePhase,
  { led: string; ring: string; label: string; text: string; pulse: boolean }
> = {
  pending: {
    led: 'bg-readout-dim',
    ring: 'border-console-line',
    label: 'text-readout-dim',
    text: 'text-readout-muted',
    pulse: false,
  },
  active: {
    led: 'bg-status-telemetry shadow-glow-telemetry',
    ring: 'border-status-telemetry',
    label: 'text-status-telemetry',
    text: 'text-readout',
    pulse: true,
  },
  done: {
    led: 'bg-status-go',
    ring: 'border-status-go/60',
    label: 'text-status-go',
    text: 'text-readout',
    pulse: false,
  },
  fault: {
    led: 'bg-status-fault',
    ring: 'border-status-fault/70',
    label: 'text-status-fault',
    text: 'text-readout',
    pulse: false,
  },
}

function RailNode({
  label,
  hint,
  phase,
}: {
  label: string
  hint: string
  phase: NodePhase
}) {
  const s = PHASE_STYLE[phase]
  return (
    <li className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full border bg-console-void ${s.ring}`}
      >
        <span
          aria-hidden
          className={`inline-block h-2.5 w-2.5 rounded-full ${s.led} ${
            s.pulse ? 'animate-pulse motion-reduce:animate-none' : ''
          }`}
        />
      </span>
      <span className={`truncate text-[0.7rem] font-semibold uppercase tracking-wider ${s.text}`}>
        {label}
      </span>
      <span className="truncate text-[0.55rem] uppercase tracking-wider text-readout-dim">
        {hint}
      </span>
      <span className={`inline-flex items-center gap-1 text-[0.55rem] uppercase tracking-wider ${s.label}`}>
        <span aria-hidden>{PHASE_GLYPH[phase]}</span>
        {PHASE_LABEL[phase]}
      </span>
    </li>
  )
}

/** Connector segment between two nominal nodes; goes green once flow has passed. */
function Connector({ done }: { done: boolean }) {
  return (
    <li aria-hidden className="mt-4 hidden h-px flex-1 sm:block">
      <span className={`block h-px w-full ${done ? 'bg-status-go/50' : 'bg-console-line'}`} />
    </li>
  )
}

export function SequenceRail({ phases }: { phases: Record<string, NodePhase> }) {
  const scrubPhase = phases[SCRUB_NODE.id] ?? 'pending'
  const scrubEngaged = scrubPhase !== 'pending'

  return (
    <section aria-label="Flight sequence" className="mc-panel p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-[0.65rem] uppercase tracking-widest text-readout-muted">
          Flight Sequence
        </h2>
        <span className="text-[0.55rem] uppercase tracking-wider text-readout-dim">
          dispatch → burn → gate → apply → teardown
        </span>
      </header>

      <ol className="flex items-start gap-1">
        {RAIL_NODES.map((n, i) => {
          const phase = phases[n.id] ?? 'pending'
          return (
            <Fragment key={n.id}>
              <RailNode label={n.label} hint={n.hint} phase={phase} />
              {i < RAIL_NODES.length - 1 && <Connector done={phase === 'done'} />}
            </Fragment>
          )
        })}
      </ol>

      <div className="mt-3 flex items-center gap-2 border-t border-console-line pt-3">
        <span className="text-[0.55rem] uppercase tracking-wider text-readout-dim">
          Off-nominal
        </span>
        <div className={scrubEngaged ? '' : 'opacity-50'}>
          <RailNode label={SCRUB_NODE.label} hint={SCRUB_NODE.hint} phase={scrubPhase} />
        </div>
      </div>
    </section>
  )
}
