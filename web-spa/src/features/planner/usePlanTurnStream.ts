import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError, streamPlanTurn } from '../../api'
import { createSseParser, extractSignal } from './planModel'

/**
 * Streams one operator turn to the planner and surfaces the assistant's reply
 * token-by-token.
 *
 * `POST /plans/{id}/turns/stream` carries a request body, so the browser's
 * native `EventSource` (GET-only) can't consume it — unlike the Run station's
 * SSE feed. Instead the typed client's {@link streamPlanTurn} hands back the raw
 * streaming `Response`; here we read `response.body` as a `ReadableStream`,
 * decode it incrementally, and parse SSE frames as they land so the terminal
 * transcript fills in real time.
 *
 * When the stream settles cleanly we call `onSettled` (which re-reads the plan
 * aggregate so the PLAN PANEL reflects new requirements/units/stage) and THEN
 * drop the live turn — the now-persisted turns from that refresh take over, so
 * the reply never flickers or doubles.
 */

export type StreamPhase = 'streaming' | 'settling' | 'error'

export interface LiveTurn {
  /** The operator's transmitted message (echoed immediately). */
  operator: string
  /** The assistant reply accreted so far. */
  reply: string
  phase: StreamPhase
  error: string | null
}

export interface PlanTurnStream {
  /** The in-flight/failed turn, or null when idle (persisted turns own the log). */
  live: LiveTurn | null
  /** True while a turn is transmitting or its post-turn refresh is in flight. */
  busy: boolean
  /** Transmit an operator turn. No-op while already busy. */
  send: (content: string) => void
  /** Dismiss a failed live turn. */
  reset: () => void
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return `Seam responded ${err.status} ${err.statusText}`
  if (err instanceof Error) return err.message
  return 'Unknown error contacting the seam'
}

export function usePlanTurnStream(
  planId: string,
  onSettled: () => Promise<unknown> | void,
): PlanTurnStream {
  const [live, setLive] = useState<LiveTurn | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const busyRef = useRef(false)

  const send = useCallback(
    (content: string) => {
      const trimmed = content.trim()
      if (!trimmed || busyRef.current) return
      busyRef.current = true

      const ac = new AbortController()
      abortRef.current = ac
      setLive({ operator: trimmed, reply: '', phase: 'streaming', error: null })

      void (async () => {
        let acc = ''
        let faulted: string | null = null
        try {
          const response = await streamPlanTurn(planId, { content: trimmed }, { signal: ac.signal })
          const body = response.body
          if (!body) throw new Error('Planner stream returned no body')

          const reader = body.getReader()
          const decoder = new TextDecoder()
          const parser = createSseParser()

          const consume = (raw: string) => {
            for (const ev of parser.push(raw)) {
              const sig = extractSignal(ev)
              if (sig.error) faulted = sig.error
              if (sig.text) {
                acc += sig.text
                setLive((t) => (t ? { ...t, reply: acc } : t))
              }
            }
          }

          for (;;) {
            const { value, done } = await reader.read()
            if (done) break
            consume(decoder.decode(value, { stream: true }))
          }
          // Emit any trailing frame not terminated by a blank line.
          for (const ev of parser.flush()) {
            const sig = extractSignal(ev)
            if (sig.error) faulted = sig.error
            if (sig.text) {
              acc += sig.text
              setLive((t) => (t ? { ...t, reply: acc } : t))
            }
          }

          if (ac.signal.aborted) return

          if (faulted) {
            setLive((t) => (t ? { ...t, phase: 'error', error: faulted } : t))
            return
          }

          // Settle: refresh the plan aggregate, then hand off to persisted turns.
          setLive((t) => (t ? { ...t, phase: 'settling' } : t))
          await onSettled()
          if (!ac.signal.aborted) setLive(null)
        } catch (err) {
          if (ac.signal.aborted) return
          const message = errorMessage(err)
          setLive((t) =>
            t
              ? { ...t, phase: 'error', error: message }
              : { operator: trimmed, reply: acc, phase: 'error', error: message },
          )
        } finally {
          if (abortRef.current === ac) {
            abortRef.current = null
            busyRef.current = false
          }
        }
      })()
    },
    [planId, onSettled],
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    busyRef.current = false
    setLive(null)
  }, [])

  // Abort any in-flight stream on unmount / plan change.
  useEffect(
    () => () => {
      abortRef.current?.abort()
      abortRef.current = null
      busyRef.current = false
    },
    [planId],
  )

  const busy = live?.phase === 'streaming' || live?.phase === 'settling'
  return { live, busy: !!busy, send, reset }
}
