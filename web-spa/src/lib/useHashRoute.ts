import { useCallback, useEffect, useState } from 'react'

/**
 * A dependency-free hash router for the console's top-level views.
 *
 * Hash routing (`#/fleet`, `#/metrics`) keeps every view a shareable,
 * reloadable URL while staying robust under FastAPI StaticFiles in prod — no
 * server catch-all is required. `fallback` is the default landing view (Fleet).
 */
export function useHashRoute<T extends string>(routes: readonly T[], fallback: T): [T, (v: T) => void] {
  const read = useCallback((): T => {
    const raw = window.location.hash.replace(/^#\/?/, '')
    return (routes as readonly string[]).includes(raw) ? (raw as T) : fallback
  }, [routes, fallback])

  const [route, setRoute] = useState<T>(read)

  useEffect(() => {
    const onChange = () => setRoute(read())
    window.addEventListener('hashchange', onChange)
    // Normalize an empty/invalid hash to the fallback on first mount.
    if (!window.location.hash) window.location.replace(`#/${fallback}`)
    return () => window.removeEventListener('hashchange', onChange)
  }, [read, fallback])

  const navigate = useCallback((v: T) => {
    window.location.hash = `#/${v}`
  }, [])

  return [route, navigate]
}
