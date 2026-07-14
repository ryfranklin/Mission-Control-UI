import { useEffect, useState } from 'react'

/**
 * A ticking clock: returns `Date.now()` and re-renders every `intervalMs`
 * while `active` is true. Used to advance the T+ elapsed readout on in-flight
 * runs without coupling that to data refetches. When `active` is false (e.g.
 * every run on screen is terminal) the interval is not installed at all.
 */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [active, intervalMs])

  return now
}
