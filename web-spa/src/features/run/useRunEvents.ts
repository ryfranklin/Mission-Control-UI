import { useEffect, useMemo, useRef, useState } from 'react'

import { seamUrl } from '../../api'
import {
  accrueCost,
  deriveRailPhases,
  normalizeFrame,
  type NodePhase,
  type TerminalState,
  type TimelineItem,
} from './runModel'

/**
 * Live SSE feed for a single run (`GET /runs/{id}/events`), consumed with the
 * browser-native {@link EventSource} — NOT `fetch`, NOT the typed client — so
 * we inherit the platform's GET + automatic reconnect + `Last-Event-ID`
 * handling for free.
 *
 * DURABLE REPLAY: on a fresh load the browser opens with no `Last-Event-ID`
 * and the seam replays the run's history from event id 0; on a mid-stream drop
 * the browser reconnects sending the last id it saw and the seam resumes. In
 * BOTH cases every frame is keyed by its event id in a Map, so a replayed frame
 * idempotently overwrites rather than double-rendering. The timeline is
 * therefore complete after a refresh, not merely live-tailed.
 *
 * The stream self-settles: on the terminal frame we close the connection and
 * expose the reconciled {status, cost_usd}.
 */

export type FeedConnection = 'connecting' | 'open' | 'closed' | 'error'

export interface RunEventsSnapshot {
  /** Every frame, ordered — node transitions and the terminal frame. */
  items: TimelineItem[]
  /** Node-transition frames only (what the timeline renders). */
  transitions: TimelineItem[]
  /** Rail node id → illumination phase. */
  railPhases: Record<string, NodePhase>
  /** Accrued per-step cost (pre-terminal, UNRECONCILED). */
  accruedCost: number | null
  /** Settled state once the terminal frame arrives, else null. */
  terminal: TerminalState | null
  connection: FeedConnection
}

// Named events the seam may use. Unnamed frames arrive via `onmessage` and are
// classified from their payload (see normalizeFrame).
const NAMED_EVENTS = [
  'node_transition',
  'terminal',
  'run_complete',
  'run_completed',
  'complete',
  'completed',
  'final',
  'end',
]

export function useRunEvents(runId: string, enabled = true): RunEventsSnapshot {
  // The source of truth: frames keyed by event id (the dedup key). Held in a
  // ref so replayed ids overwrite in place across reconnects without churn.
  const framesRef = useRef<Map<string, TimelineItem>>(new Map())
  const arrivalRef = useRef(0)
  const [version, setVersion] = useState(0)
  const [connection, setConnection] = useState<FeedConnection>('connecting')

  useEffect(() => {
    if (!enabled || !runId) return

    // Fresh subscription ⇒ rebuild cleanly from the replayed history.
    framesRef.current = new Map()
    arrivalRef.current = 0
    setVersion((v) => v + 1)
    setConnection('connecting')

    const es = new EventSource(seamUrl(`/runs/${encodeURIComponent(runId)}/events`))
    let disposed = false

    const ingest = (eventName: string) => (ev: MessageEvent) => {
      if (disposed) return
      const id = ev.lastEventId && ev.lastEventId !== '' ? ev.lastEventId : `${eventName}:${arrivalRef.current}`
      const item = normalizeFrame(eventName, String(ev.data ?? ''), id, arrivalRef.current++)
      if (!item) return
      // Idempotent by id — a replayed frame updates, never duplicates.
      framesRef.current.set(item.id, item)
      setVersion((v) => v + 1)
      if (item.kind === 'terminal') {
        es.close()
        setConnection('closed')
      }
    }

    for (const name of NAMED_EVENTS) es.addEventListener(name, ingest(name))
    es.onmessage = ingest('message')
    es.onopen = () => {
      if (!disposed) setConnection('open')
    }
    es.onerror = () => {
      if (disposed) return
      // CLOSED ⇒ the browser gave up (or we closed on terminal); otherwise it is
      // auto-reconnecting and will replay/resume — surface that as connecting.
      setConnection(es.readyState === EventSource.CLOSED ? 'error' : 'connecting')
    }

    return () => {
      disposed = true
      es.close()
    }
  }, [runId, enabled])

  return useMemo<RunEventsSnapshot>(() => {
    void version // recompute whenever a frame lands
    const items = Array.from(framesRef.current.values()).sort(
      (a, b) => a.seq - b.seq || a.arrival - b.arrival,
    )
    const transitions = items.filter((it) => it.kind === 'node_transition')
    const terminal = items.find((it) => it.kind === 'terminal') ?? null
    const terminalState: TerminalState | null =
      terminal && terminal.status
        ? { status: terminal.status, costUsd: terminal.costUsd }
        : null
    return {
      items,
      transitions,
      railPhases: deriveRailPhases(transitions, terminalState),
      accruedCost: accrueCost(items),
      terminal: terminalState,
      connection,
    }
  }, [version, connection])
}
