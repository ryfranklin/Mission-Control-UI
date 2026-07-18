import { Fragment, useState } from 'react'

import { DetailDrawer, DrawerField, DrawerSection } from '../../components/DetailDrawer'
import { formatDuration, formatTimestamp } from '../../lib/format'
import { TelemetryReadout } from './LiveTimeline'
import {
  PHASE_GLYPH,
  PHASE_LABEL,
  RAIL_NODES,
  SCRUB_NODE,
  type BurnSummary,
  type NodeAnnotation,
  type NodePhase,
  type TimelineItem,
} from './runModel'

const NODE_DEFS = [...RAIL_NODES, SCRUB_NODE]

/**
 * SEQUENCE RAIL — the run's lifecycle as a row of milestone nodes that
 * illuminate as SSE frames arrive: pending (dim), active (cyan, pulsing LED),
 * done (green), fault (red). The off-nominal `scrub` node hangs below the
 * nominal chain and only lights when the run takes the abort path.
 *
 * Each node is annotated with its derived OUTCOME (dispatch → worktree branch,
 * gate → GO/NO-GO, apply_burn → push status, teardown → outcome), the seam's
 * latest note, and the elapsed time spent in the node. A compact BURN SUMMARY
 * strip distils branch · decision · push status.
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
  id,
  label,
  hint,
  phase,
  annotation,
  onSelect,
}: {
  id: string
  label: string
  hint: string
  phase: NodePhase
  annotation?: NodeAnnotation
  onSelect: (id: string) => void
}) {
  const s = PHASE_STYLE[phase]
  return (
    <li className="flex min-w-0 flex-1">
      <button
        type="button"
        onClick={() => onSelect(id)}
        aria-haspopup="dialog"
        title={`Open ${label} detail`}
        className="flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded p-1 text-center transition-colors hover:bg-console-raised focus:outline-none focus-visible:ring-1 focus-visible:ring-status-telemetry"
      >
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
        <span
          className={`inline-flex items-center gap-1 text-[0.55rem] uppercase tracking-wider ${s.label}`}
        >
          <span aria-hidden>{PHASE_GLYPH[phase]}</span>
          {PHASE_LABEL[phase]}
        </span>
        {annotation?.outcome && (
          <span
            className={`max-w-full truncate rounded border border-console-line px-1 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wider ${s.label}`}
            title={annotation.note ?? annotation.outcome}
          >
            {annotation.outcome}
          </span>
        )}
        {annotation?.elapsedMs != null && (
          <span className="text-[0.55rem] tabular-nums text-readout-dim" title="Elapsed in node">
            {formatDuration(annotation.elapsedMs)}
          </span>
        )}
        {annotation?.note && (
          <span
            className="line-clamp-2 max-w-full text-[0.55rem] leading-tight text-readout-muted"
            title={annotation.note}
          >
            {annotation.note}
          </span>
        )}
      </button>
    </li>
  )
}

/** HH:MM:SS of the wall clock a frame carried. */
function clockOnly(ms: number): string {
  const d = new Date(ms)
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':')
}

/** The consolidated per-node view: phase, derived outcome, and every telemetry
 *  frame the seam emitted for this lifecycle node. */
function NodeDetail({
  phase,
  annotation,
  items,
}: {
  phase: NodePhase
  annotation?: NodeAnnotation
  items: TimelineItem[]
}) {
  const s = PHASE_STYLE[phase]
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <DrawerField label="Phase">
          <span className={`inline-flex items-center gap-1 ${s.label}`}>
            <span aria-hidden>{PHASE_GLYPH[phase]}</span>
            {PHASE_LABEL[phase]}
          </span>
        </DrawerField>
        <DrawerField label="Outcome">
          <span className={annotation?.outcome ? s.label : 'text-readout-muted'}>
            {annotation?.outcome ?? '—'}
          </span>
        </DrawerField>
        {annotation?.elapsedMs != null && (
          <DrawerField label="Elapsed in node">{formatDuration(annotation.elapsedMs)}</DrawerField>
        )}
      </dl>

      {annotation?.note && (
        <DrawerSection title="Note">
          <p className="text-xs text-readout-muted">{annotation.note}</p>
        </DrawerSection>
      )}

      <DrawerSection title={`Telemetry frames · ${items.length}`}>
        {items.length === 0 ? (
          <p className="text-[0.7rem] uppercase tracking-wider text-readout-dim">
            ○ No frames for this node yet
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.id} className={`border-l-2 pl-3 ${s.ring}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-readout">{item.phase ?? '—'}</span>
                  {item.at != null && (
                    <span
                      className="shrink-0 text-[0.6rem] tabular-nums text-readout-dim"
                      title={formatTimestamp(new Date(item.at).toISOString())}
                    >
                      {clockOnly(item.at)}
                    </span>
                  )}
                </div>
                {item.detail && <p className="mt-0.5 text-xs text-readout-muted">{item.detail}</p>}
                <TelemetryReadout item={item} />
              </li>
            ))}
          </ol>
        )}
      </DrawerSection>
    </>
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

/** BURN SUMMARY — branch · decision · push status, distilled to one strip. */
function BurnSummaryStrip({ summary }: { summary: BurnSummary }) {
  const decisionTone =
    summary.decision === 'GO'
      ? 'text-status-go'
      : summary.decision === 'NO-GO'
        ? 'text-status-fault'
        : 'text-readout-muted'
  const pushTone =
    summary.push === 'PUSHED'
      ? 'text-status-go'
      : summary.push === 'REJECTED' || summary.push === 'NO-GO'
        ? 'text-status-fault'
        : summary.push === 'SKIPPED'
          ? 'text-status-flight'
          : 'text-readout-muted'

  return (
    <dl className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-console-line pt-3 text-[0.6rem]">
      <span className="uppercase tracking-widest text-readout-dim">Burn Summary</span>
      <div className="flex items-baseline gap-1.5">
        <dt className="uppercase tracking-wider text-readout-muted">Branch</dt>
        <dd className="max-w-[16rem] truncate font-mono text-readout" title={summary.branch ?? undefined}>
          {summary.branch ?? '—'}
        </dd>
      </div>
      <div className="flex items-baseline gap-1.5">
        <dt className="uppercase tracking-wider text-readout-muted">Decision</dt>
        <dd className={`font-semibold uppercase tracking-wider ${decisionTone}`}>
          {summary.decision ?? '—'}
        </dd>
      </div>
      <div className="flex items-baseline gap-1.5">
        <dt className="uppercase tracking-wider text-readout-muted">Push</dt>
        <dd className={`font-semibold uppercase tracking-wider ${pushTone}`}>{summary.push ?? '—'}</dd>
      </div>
    </dl>
  )
}

export function SequenceRail({
  phases,
  annotations,
  summary,
  transitions = [],
}: {
  phases: Record<string, NodePhase>
  annotations?: Record<string, NodeAnnotation>
  summary?: BurnSummary
  transitions?: TimelineItem[]
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const scrubPhase = phases[SCRUB_NODE.id] ?? 'pending'
  const scrubEngaged = scrubPhase !== 'pending'

  const selectedDef = selected ? NODE_DEFS.find((n) => n.id === selected) : undefined

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
              <RailNode
                id={n.id}
                label={n.label}
                hint={n.hint}
                phase={phase}
                annotation={annotations?.[n.id]}
                onSelect={setSelected}
              />
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
          <RailNode
            id={SCRUB_NODE.id}
            label={SCRUB_NODE.label}
            hint={SCRUB_NODE.hint}
            phase={scrubPhase}
            annotation={annotations?.[SCRUB_NODE.id]}
            onSelect={setSelected}
          />
        </div>
      </div>

      {summary?.hasAny && <BurnSummaryStrip summary={summary} />}

      <DetailDrawer
        open={selectedDef != null}
        onClose={() => setSelected(null)}
        eyebrow={selectedDef?.hint}
        title={selectedDef?.label ?? ''}
      >
        {selectedDef && (
          <NodeDetail
            phase={phases[selectedDef.id] ?? 'pending'}
            annotation={annotations?.[selectedDef.id]}
            items={transitions.filter((t) => t.node === selectedDef.id)}
          />
        )}
      </DetailDrawer>
    </section>
  )
}
