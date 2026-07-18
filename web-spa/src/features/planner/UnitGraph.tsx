import { useState } from 'react'

import type { ChildRunModel, UnitModel } from '../../api'
import { DetailDrawer, DrawerField, DrawerSection } from '../../components/DetailDrawer'
import { StatusBadge } from '../../components/StatusBadge'
import { statusPresentation, taskTypeLabel, TONE_BORDER, TONE_TEXT, TONE_HEX } from '../../lib/status'
import { CostReadout } from '../fleet/CostReadout'
import { buildUnitGraph, type UnitGraphNode } from './planModel'

/**
 * UNIT DEPENDENCY GRAPH — a DAG view of the work-list, drawn from the plan's
 * `units[].depends_on`. Units flow left→right along their longest dependency
 * chain; edges (dep → unit) are drawn behind the nodes on an SVG layer while the
 * nodes themselves are HTML so they inherit the console's status vocabulary
 * (border tone + glyph, never hue alone).
 *
 * Clicking a node opens a consolidated side drawer for that unit — status, task
 * type, phase, its dependencies + dependents, and (once finalized) the burn it
 * dispatched. Render-only: because `depends_on` is an untyped `unknown[]` in the
 * seam contract, any ref we can't resolve to a unit is dropped from the graph
 * and reported in the footer.
 */

// Grid geometry (px). Node pitch = size + gap.
const NODE_W = 176
const NODE_H = 56
const COL_GAP = 64
const ROW_GAP = 18
const PAD = 10

const colX = (level: number) => PAD + level * (NODE_W + COL_GAP)
const rowY = (row: number) => PAD + row * (NODE_H + ROW_GAP)

export function UnitGraph({
  units,
  childRuns = [],
}: {
  units: UnitModel[]
  childRuns?: ChildRunModel[]
}) {
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null)
  const graph = buildUnitGraph(units)
  if (graph.nodes.length === 0) return null

  const width = PAD * 2 + graph.cols * NODE_W + Math.max(0, graph.cols - 1) * COL_GAP
  const height = PAD * 2 + graph.rows * NODE_H + Math.max(0, graph.rows - 1) * ROW_GAP

  // Seq → placement, so edges can find their endpoints.
  const place = new Map<number, UnitGraphNode>(graph.nodes.map((n) => [n.seq, n]))
  const unitBySeq = new Map<number, UnitModel>(units.map((u) => [u.seq, u]))

  const selected = selectedSeq != null ? unitBySeq.get(selectedSeq) : undefined
  const selectedNode = selectedSeq != null ? place.get(selectedSeq) : undefined
  const dependents =
    selectedSeq != null ? graph.edges.filter((e) => e.from === selectedSeq).map((e) => e.to) : []
  const childRun = selectedSeq != null ? childRuns.find((r) => r.unit_seq === selectedSeq) : undefined

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <div className="relative" style={{ width, height }}>
          <svg
            className="pointer-events-none absolute inset-0"
            width={width}
            height={height}
            aria-hidden
          >
            <defs>
              <marker
                id="unit-dep-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill={TONE_HEX.neutral} />
              </marker>
            </defs>
            {graph.edges.map((e) => {
              const from = place.get(e.from)
              const to = place.get(e.to)
              if (!from || !to) return null
              const x1 = colX(from.level) + NODE_W
              const y1 = rowY(from.row) + NODE_H / 2
              const x2 = colX(to.level)
              const y2 = rowY(to.row) + NODE_H / 2
              const dx = Math.max(24, (x2 - x1) / 2)
              const active = e.from === selectedSeq || e.to === selectedSeq
              return (
                <path
                  key={`${e.from}-${e.to}`}
                  d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={active ? TONE_HEX.telemetry : TONE_HEX.neutral}
                  strokeWidth={active ? 1.75 : 1.25}
                  strokeOpacity={active ? 0.95 : 0.7}
                  markerEnd="url(#unit-dep-arrow)"
                />
              )
            })}
          </svg>
          {graph.nodes.map((n) => (
            <UnitNode
              key={n.seq}
              node={n}
              selected={n.seq === selectedSeq}
              onSelect={setSelectedSeq}
            />
          ))}
        </div>
      </div>
      {graph.droppedDeps > 0 && (
        <p className="text-[0.55rem] uppercase tracking-wider text-status-flight">
          ▲ {graph.droppedDeps} dependency ref{graph.droppedDeps === 1 ? '' : 's'} unresolved —
          non-numeric or unknown unit. DAG may be incomplete until the seam types{' '}
          <code className="text-readout-muted">depends_on</code>.
        </p>
      )}

      <DetailDrawer
        open={selected != null}
        onClose={() => setSelectedSeq(null)}
        eyebrow={selected ? `Unit ${String(selected.seq).padStart(2, '0')}` : undefined}
        title={selected?.title ?? ''}
      >
        {selected && selectedNode && (
          <UnitDetail
            unit={selected}
            deps={selectedNode.deps}
            dependents={dependents}
            unitBySeq={unitBySeq}
            childRun={childRun}
            onSelectSeq={setSelectedSeq}
          />
        )}
      </DetailDrawer>
    </div>
  )
}

function UnitNode({
  node,
  selected,
  onSelect,
}: {
  node: UnitGraphNode
  selected: boolean
  onSelect: (seq: number) => void
}) {
  const pres = statusPresentation(node.status)
  return (
    <button
      type="button"
      onClick={() => onSelect(node.seq)}
      aria-haspopup="dialog"
      title={`${node.title} — ${pres.label}`}
      className={`absolute flex flex-col justify-center gap-1 rounded border bg-console-raised/70 px-2 py-1 text-left transition-colors hover:bg-console-raised focus:outline-none focus-visible:ring-1 focus-visible:ring-status-telemetry ${
        selected ? 'ring-1 ring-status-telemetry' : ''
      } ${TONE_BORDER[pres.tone]}`}
      style={{ left: colX(node.level), top: rowY(node.row), width: NODE_W, height: NODE_H }}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="text-[0.6rem] tabular-nums text-readout-dim">
          {String(node.seq).padStart(2, '0')}
        </span>
        <span className="min-w-0 flex-1 truncate text-[0.7rem] text-readout">{node.title}</span>
        <span aria-hidden className={`text-[0.6em] ${TONE_TEXT[pres.tone]}`}>
          {pres.glyph}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded border border-console-line px-1 text-[0.5rem] uppercase tracking-wider text-readout-muted">
          {taskTypeLabel(node.taskType)}
        </span>
        {node.phase && (
          <span className="truncate text-[0.5rem] uppercase tracking-wider text-readout-dim">
            {node.phase}
          </span>
        )}
      </div>
    </button>
  )
}

/** The consolidated per-unit view shown in the drawer. */
function UnitDetail({
  unit,
  deps,
  dependents,
  unitBySeq,
  childRun,
  onSelectSeq,
}: {
  unit: UnitModel
  deps: number[]
  dependents: number[]
  unitBySeq: Map<number, UnitModel>
  childRun?: ChildRunModel
  onSelectSeq: (seq: number) => void
}) {
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <DrawerField label="Status">
          <StatusBadge status={unit.status} />
        </DrawerField>
        <DrawerField label="Task type">{taskTypeLabel(unit.task_type)}</DrawerField>
        <DrawerField label="Phase">{unit.phase || '—'}</DrawerField>
        {unit.stage_slug && <DrawerField label="Stage">{unit.stage_slug}</DrawerField>}
      </dl>

      <DrawerSection title={`Depends on · ${deps.length}`}>
        <UnitRefList seqs={deps} unitBySeq={unitBySeq} onSelectSeq={onSelectSeq} emptyLabel="No dependencies — this unit can start immediately" />
      </DrawerSection>

      <DrawerSection title={`Blocks · ${dependents.length}`}>
        <UnitRefList seqs={dependents} unitBySeq={unitBySeq} onSelectSeq={onSelectSeq} emptyLabel="Nothing depends on this unit" />
      </DrawerSection>

      <DrawerSection title="Dispatched burn">
        {childRun ? (
          <a
            href={`#/runs/${encodeURIComponent(childRun.run_id)}`}
            className="flex items-center gap-2 rounded border border-console-line/70 bg-console-raised/40 p-2 transition-colors hover:border-status-telemetry/50"
            title="Open run station"
          >
            <span className="rounded border border-console-line px-1 text-[0.55rem] uppercase tracking-wider text-readout-muted">
              {taskTypeLabel(childRun.task_type)}
            </span>
            <StatusBadge status={childRun.status} />
            <span className="ml-auto">
              <CostReadout costUsd={childRun.cost_usd} status={childRun.status} />
            </span>
            <span aria-hidden className="text-[0.6rem] text-status-telemetry">
              ▸
            </span>
          </a>
        ) : (
          <p className="text-[0.7rem] uppercase tracking-wider text-readout-dim">
            ○ Not yet dispatched — finalize the plan to dispatch this unit
          </p>
        )}
      </DrawerSection>
    </>
  )
}

/** A list of unit refs; each row jumps the drawer to that unit. */
function UnitRefList({
  seqs,
  unitBySeq,
  onSelectSeq,
  emptyLabel,
}: {
  seqs: number[]
  unitBySeq: Map<number, UnitModel>
  onSelectSeq: (seq: number) => void
  emptyLabel: string
}) {
  if (seqs.length === 0) {
    return <p className="text-[0.7rem] uppercase tracking-wider text-readout-dim">○ {emptyLabel}</p>
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {seqs.map((seq) => {
        const u = unitBySeq.get(seq)
        return (
          <li key={seq}>
            <button
              type="button"
              onClick={() => onSelectSeq(seq)}
              className="flex w-full items-baseline gap-2 rounded border border-console-line/70 bg-console-raised/40 p-1.5 text-left transition-colors hover:border-status-telemetry/50"
            >
              <span className="text-[0.6rem] tabular-nums text-readout-dim">
                {String(seq).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-readout">
                {u?.title ?? `Unit ${seq}`}
              </span>
              <span aria-hidden className="text-[0.6rem] text-status-telemetry">
                ▸
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
