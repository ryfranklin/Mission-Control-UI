import type { ReactNode } from 'react'

import { ApiError } from '../api'

/**
 * Uniform loading / error / empty framing for a data panel, so every view
 * fails and empties the same way. `children` renders only on a settled,
 * non-empty result.
 */
interface QueryStateProps {
  isLoading: boolean
  error: unknown
  isEmpty?: boolean
  emptyLabel?: string
  children: ReactNode
}

export function QueryState({
  isLoading,
  error,
  isEmpty,
  emptyLabel = 'No data',
  children,
}: QueryStateProps) {
  if (error) {
    return <Notice tone="fault" glyph="▲" title="Telemetry fault" detail={errorMessage(error)} />
  }
  if (isLoading) {
    return <Notice tone="flight" glyph="◆" title="Acquiring signal…" detail="Contacting seam" />
  }
  if (isEmpty) {
    return <Notice tone="neutral" glyph="○" title={emptyLabel} detail="Nothing to display" />
  }
  return <>{children}</>
}

function Notice({
  tone,
  glyph,
  title,
  detail,
}: {
  tone: 'fault' | 'flight' | 'neutral'
  glyph: string
  title: string
  detail: string
}) {
  const color =
    tone === 'fault'
      ? 'text-status-fault'
      : tone === 'flight'
        ? 'text-status-flight'
        : 'text-readout-muted'
  return (
    <div className="mc-panel flex flex-col items-center justify-center gap-1 p-10 text-center">
      <span aria-hidden className={`text-xl ${color}`}>
        {glyph}
      </span>
      <p className={`text-sm uppercase tracking-wider ${color}`}>{title}</p>
      <p className="text-xs text-readout-muted">{detail}</p>
    </div>
  )
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `Seam responded ${error.status} ${error.statusText}`
  }
  if (error instanceof Error) return error.message
  return 'Unknown error contacting the seam'
}
