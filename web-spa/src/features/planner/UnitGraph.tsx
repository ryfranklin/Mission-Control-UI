import type { UnitModel } from '../../api'
import { statusPresentation, taskTypeLabel, TONE_BORDER, TONE_TEXT, TONE_HEX } from '../../lib/status'
import { buildUnitGraph, type UnitGraphNode } from './planModel'

/**
 * UNIT DEPENDENCY GRAPH — a prototype DAG view of the work-list, drawn from the
 * plan's `units[].depends_on`. Units flow left→right along their longest
 * dependency chain; edges (dep → unit) are drawn behind the nodes on an SVG
 * layer while the nodes themselves are HTML so they inherit the console's
 * status vocabulary (border tone + glyph, never hue alone).
 *
 * Render-only. Because `depends_on` is an untyped `unknown[]` in the seam
 * contract, any ref we can't resolve to a unit is dropped from the graph and
 * reported in the footer — the DAG is only as complete as the data allows.
 */

// Grid geometry (px). Node pitch = size + gap.
const NODE_W = 176
const NODE_H = 56
const COL_GAP = 64
const ROW_GAP = 18
const PAD = 10

const colX = (level: number) => PAD + level * (NODE_W + COL_GAP)
const rowY = (row: number) => PAD + row * (NODE_H + ROW_GAP)

export function UnitGraph({ units }: { units: UnitModel[] }) {
  const graph = buildUnitGraph(units)
  if (graph.nodes.length === 0) return null

  const width = PAD * 2 + graph.cols * NODE_W + Math.max(0, graph.cols - 1) * COL_GAP
  const height = PAD * 2 + graph.rows * NODE_H + Math.max(0, graph.rows - 1) * ROW_GAP

  // Seq → placement, so edges can find their endpoints.
  const place = new Map<number, UnitGraphNode>(graph.nodes.map((n) => [n.seq, n]))

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
              return (
                <path
                  key={`${e.from}-${e.to}`}
                  d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={TONE_HEX.neutral}
                  strokeWidth={1.25}
                  strokeOpacity={0.7}
                  markerEnd="url(#unit-dep-arrow)"
                />
              )
            })}
          </svg>
          {graph.nodes.map((n) => (
            <UnitNode key={n.seq} node={n} />
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
    </div>
  )
}

function UnitNode({ node }: { node: UnitGraphNode }) {
  const pres = statusPresentation(node.status)
  return (
    <div
      className={`absolute flex flex-col justify-center gap-1 rounded border bg-console-raised/70 px-2 py-1 ${TONE_BORDER[pres.tone]}`}
      style={{ left: colX(node.level), top: rowY(node.row), width: NODE_W, height: NODE_H }}
      title={`${node.title} — ${pres.label}`}
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
    </div>
  )
}
