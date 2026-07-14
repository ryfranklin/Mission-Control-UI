import { useLayoutEffect, useRef, useState } from 'react'

import type { TurnModel } from '../../api'
import { formatTimestamp } from '../../lib/format'
import {
  roleLabel,
  transcriptSide,
  type TranscriptSide,
} from './planModel'
import type { LiveTurn } from './usePlanTurnStream'

/**
 * PLAN SESSION TRANSCRIPT — the INCEPTION conversation as a mission-control
 * terminal: monospace, append-only, a blinking cursor while the Flight Director
 * is transmitting. Persisted turns render first; the live (streaming) turn is
 * appended and then handed off to the persisted log once the turn settles.
 */

const SIDE_ACCENT: Record<TranscriptSide, { text: string; prompt: string }> = {
  operator: { text: 'text-status-telemetry', prompt: '▸' },
  director: { text: 'text-status-go', prompt: '◇' },
}

function TurnBlock({
  side,
  content,
  at,
  streaming,
}: {
  side: TranscriptSide
  content: string
  at?: string | null
  streaming?: boolean
}) {
  const accent = SIDE_ACCENT[side]
  return (
    <div className="py-1.5">
      <div className="flex items-baseline gap-2">
        <span aria-hidden className={`text-xs ${accent.text}`}>
          {accent.prompt}
        </span>
        <span className={`text-[0.6rem] font-semibold uppercase tracking-widest ${accent.text}`}>
          {roleLabel(side)}
        </span>
        {at && (
          <span className="ml-auto text-[0.55rem] tabular-nums text-readout-dim">
            {formatTimestamp(at)}
          </span>
        )}
      </div>
      <p className="mt-0.5 whitespace-pre-wrap break-words pl-5 text-xs leading-relaxed text-readout">
        {content}
        {streaming && (
          <span
            aria-hidden
            className="ml-0.5 inline-block h-3.5 w-2 translate-y-0.5 animate-pulse bg-status-telemetry align-baseline motion-reduce:animate-none"
          />
        )}
      </p>
    </div>
  )
}

export function Transcript({
  turns,
  live,
  connected,
}: {
  turns: TurnModel[]
  live: LiveTurn | null
  /** True when the seam base URL is same-origin/reachable (header lamp only). */
  connected: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [autoScroll, setAutoScroll] = useState(true)

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    setAutoScroll(stick.current)
  }

  // The dependency: total rendered length grows as tokens arrive.
  const tick = turns.length + (live ? live.reply.length : 0) + (live?.phase ?? '').length
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [tick])

  const streaming = live?.phase === 'streaming'
  const empty = turns.length === 0 && !live

  return (
    <section
      aria-label="Plan session transcript"
      className="mc-panel flex min-h-[24rem] flex-col lg:min-h-0"
    >
      <header className="flex items-center justify-between border-b border-console-line px-4 py-2">
        <h2 className="text-[0.65rem] uppercase tracking-widest text-readout-muted">
          Inception · Terminal
        </h2>
        <span className="flex items-center gap-1.5 text-[0.55rem] uppercase tracking-wider text-readout-muted">
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              streaming
                ? 'bg-status-telemetry shadow-glow-telemetry animate-pulse motion-reduce:animate-none'
                : connected
                  ? 'bg-status-go'
                  : 'bg-readout-dim'
            }`}
          />
          {streaming ? 'Streaming' : live?.phase === 'settling' ? 'Refreshing' : 'Standby'}
        </span>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 divide-y divide-console-line/50 overflow-y-auto px-4 py-3"
      >
        {empty ? (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <p className="text-xs uppercase tracking-wider text-readout-muted">
              ○ Transmit the first turn to begin INCEPTION
            </p>
          </div>
        ) : (
          <>
            {turns.map((turn) => (
              <TurnBlock
                key={turn.seq}
                side={transcriptSide(turn.role)}
                content={turn.content}
                at={turn.created_at}
              />
            ))}
            {live && (
              <>
                <TurnBlock side="operator" content={live.operator} />
                <TurnBlock
                  side="director"
                  content={live.reply || (live.phase === 'error' ? '' : '…')}
                  streaming={live.phase === 'streaming'}
                />
                {live.phase === 'error' && (
                  <p role="alert" className="pl-5 text-xs text-status-fault">
                    ▲ Transmission fault — {live.error}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>

      {!autoScroll && (
        <button
          type="button"
          onClick={() => {
            const el = scrollRef.current
            if (el) el.scrollTop = el.scrollHeight
            stick.current = true
            setAutoScroll(true)
          }}
          className="border-t border-console-line py-1 text-[0.55rem] uppercase tracking-wider text-status-telemetry hover:bg-console-raised"
        >
          ▾ Jump to latest
        </button>
      )}
    </section>
  )
}
