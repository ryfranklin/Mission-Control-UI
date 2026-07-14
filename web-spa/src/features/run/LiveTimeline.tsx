import { useLayoutEffect, useRef } from 'react'

import {
  formatLatency,
  formatMoney,
  formatNumber,
  formatTimestamp,
  formatTokens,
} from '../../lib/format'
import { PHASE_GLYPH, type NodePhase, type StepTelemetry, type TimelineItem } from './runModel'

/**
 * LIVE SSE TIMELINE — every `node_transition` frame as a scrolling log line
 * with priced per-step telemetry (tokens, cost, latency, model) where present.
 * Newest lands at the bottom; the panel auto-scrolls to follow the tail unless
 * the operator has scrolled up to read history.
 */

const PHASE_ACCENT: Record<NodePhase, { text: string; border: string }> = {
  pending: { text: 'text-readout-muted', border: 'border-console-line' },
  active: { text: 'text-status-telemetry', border: 'border-status-telemetry/60' },
  done: { text: 'text-status-go', border: 'border-status-go/50' },
  fault: { text: 'text-status-fault', border: 'border-status-fault/60' },
}

interface Cell {
  label: string
  value: string
  /** Screen-reader text so a figure never rides its glyph/color alone. */
  aria?: string
  /** Native tooltip for detail that doesn't fit inline (e.g. cache breakdown). */
  title?: string
  accent?: string
}

/** The `in <input> / out <output> tok` breakdown cell, when either side lands. */
function tokenCell(t: StepTelemetry): Cell | null {
  const parts: string[] = []
  const aria: string[] = []
  if (t.inputTokens != null) {
    parts.push(`in ${formatTokens(t.inputTokens)}`)
    aria.push(`${formatNumber(t.inputTokens)} input tokens`)
  }
  if (t.outputTokens != null) {
    parts.push(`out ${formatTokens(t.outputTokens)}`)
    aria.push(`${formatNumber(t.outputTokens)} output tokens`)
  }
  if (parts.length) {
    return { label: 'tok', value: `${parts.join(' / ')} tok`, aria: aria.join(', ') }
  }
  // No split, but a total was reported — surface that rather than nothing.
  if (t.tokens != null) {
    return { label: 'tok', value: `${formatTokens(t.tokens)} tok`, aria: `${formatNumber(t.tokens)} tokens` }
  }
  return null
}

function Telemetry({ item }: { item: TimelineItem }) {
  const t = item.telemetry
  if (!t) return null
  const cells: Cell[] = []
  if (t.model) cells.push({ label: 'model', value: t.model })

  const tok = tokenCell(t)
  if (tok) cells.push(tok)

  if (t.contextSizeTokens != null) {
    cells.push({
      label: 'ctx',
      value: formatTokens(t.contextSizeTokens),
      aria: `context size ${formatNumber(t.contextSizeTokens)} tokens`,
    })
  }

  if (t.cacheReadTokens != null || t.cacheCreationTokens != null) {
    // Read is the load-bearing figure inline; creation rides the tooltip.
    const read = t.cacheReadTokens ?? 0
    const tip = [
      t.cacheCreationTokens != null ? `cache creation ${formatNumber(t.cacheCreationTokens)} tok` : null,
      t.cacheReadTokens != null ? `cache read ${formatNumber(t.cacheReadTokens)} tok` : null,
    ]
      .filter(Boolean)
      .join(' · ')
    cells.push({
      label: 'cache',
      value: `${formatTokens(read)} tok`,
      aria: tip,
      title: tip,
    })
  }

  if (t.latencyMs != null) cells.push({ label: 'lat', value: formatLatency(t.latencyMs) })
  if (t.costUsd != null)
    cells.push({ label: 'cost', value: formatMoney(t.costUsd), accent: 'text-status-flight' })
  if (!cells.length) return null

  return (
    <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
      {cells.map((c) => (
        <div key={c.label} className="flex items-baseline gap-1" title={c.title}>
          <dt className="text-[0.55rem] uppercase tracking-wider text-readout-dim">{c.label}</dt>
          <dd
            className={`text-xs tabular-nums ${c.accent ?? 'text-readout'}`}
            aria-label={c.aria}
          >
            {c.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const phase = item.phase ?? 'pending'
  const accent = PHASE_ACCENT[phase]
  return (
    <li className={`border-l-2 py-2 pl-3 ${accent.border}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-baseline gap-1.5">
          <span aria-hidden className={`text-[0.7em] ${accent.text}`}>
            {PHASE_GLYPH[phase]}
          </span>
          <span className="text-sm font-semibold text-readout">{item.nodeLabel}</span>
          {item.phase && (
            <span className={`text-[0.6rem] uppercase tracking-wider ${accent.text}`}>
              {item.phase}
            </span>
          )}
        </span>
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
      <Telemetry item={item} />
    </li>
  )
}

/** HH:MM:SS of the wall clock the frame carried — tabular so it never jitters. */
function clockOnly(ms: number): string {
  const d = new Date(ms)
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':')
}

export function LiveTimeline({
  transitions,
  live,
}: {
  transitions: TimelineItem[]
  live: boolean
}) {
  const scrollRef = useRef<HTMLOListElement>(null)
  const stickRef = useRef(true)

  // Track whether the operator is pinned to the tail (within a small threshold).
  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [transitions.length])

  return (
    <section aria-label="Live event timeline" className="mc-panel flex min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-console-line px-4 py-2">
        <h2 className="text-[0.65rem] uppercase tracking-widest text-readout-muted">
          Live Telemetry
        </h2>
        <span className="flex items-center gap-1.5 text-[0.55rem] uppercase tracking-wider text-readout-muted">
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              live
                ? 'bg-status-telemetry shadow-glow-telemetry animate-pulse motion-reduce:animate-none'
                : 'bg-readout-dim'
            }`}
          />
          {live ? 'Streaming' : 'Settled'} · {transitions.length} events
        </span>
      </header>

      {transitions.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-10 text-center">
          <p className="text-xs uppercase tracking-wider text-readout-muted">
            ○ Awaiting first telemetry frame
          </p>
        </div>
      ) : (
        <ol
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 space-y-1 overflow-y-auto px-4 py-3"
        >
          {transitions.map((item) => (
            <TimelineRow key={item.id} item={item} />
          ))}
        </ol>
      )}
    </section>
  )
}
