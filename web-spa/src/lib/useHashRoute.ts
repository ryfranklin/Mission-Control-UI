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

/** The raw hash path (everything after `#/`), e.g. `runs/abc`. */
function readHashPath(): string {
  return window.location.hash.replace(/^#\/?/, '')
}

/**
 * Subscribe to the raw hash path — the same hash router as {@link useHashRoute},
 * exposed unparsed so a view can match nested routes like `runs/{id}` that fall
 * outside the flat top-level enum. Not a second router: one `hashchange`
 * source, shared with the nav.
 */
export function useHashPath(): string {
  const [path, setPath] = useState<string>(readHashPath)

  useEffect(() => {
    const onChange = () => setPath(readHashPath())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return path
}
