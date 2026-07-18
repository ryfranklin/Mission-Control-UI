import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * DETAIL DRAWER — a right-side consolidated panel that slides in over the
 * console when the operator clicks a graph node (the Flight Sequence rail, the
 * Planner's unit DAG). Portalled to `document.body` so it escapes any
 * transformed/overflow-clipped graph container, dims the board behind it, and
 * closes on Escape or backdrop click.
 *
 * Accessibility: `role="dialog"` + `aria-modal`, focus moves to the close
 * control on open and is restored to the trigger on close.
 */
export function DetailDrawer({
  open,
  onClose,
  title,
  eyebrow,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  /** Small uppercased label above the title (e.g. the node id / hint). */
  eyebrow?: string
  children: React.ReactNode
}) {
  // Keep the panel mounted through its exit transition, then unmount.
  const [render, setRender] = useState(open)
  const [shown, setShown] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) {
      setRender(true)
      const raf = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(raf)
    }
    setShown(false)
    const t = setTimeout(() => setRender(false), 200) // matches duration-200
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const restore = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      restore?.focus?.()
    }
  }, [open, onClose])

  if (!render) return null

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden
        onClick={onClose}
        className={`absolute inset-0 bg-console-void/70 transition-opacity duration-200 ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-console-line bg-console-panel shadow-panel transition-transform duration-200 ease-out ${
          shown ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-console-line px-5 py-4">
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[0.55rem] uppercase tracking-widest text-readout-dim">{eyebrow}</p>
            )}
            <h2 className="truncate text-base text-readout" title={title}>
              {title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close detail"
            className="shrink-0 rounded border border-console-line px-2 py-0.5 text-[0.6rem] uppercase tracking-wider text-readout-muted transition-colors hover:border-status-telemetry/50 hover:text-readout focus:outline-none focus-visible:border-status-telemetry"
          >
            Esc ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/** A labelled field in a drawer — matches the run/fleet detail readout style. */
export function DrawerField({
  label,
  children,
  title,
}: {
  label: string
  children: React.ReactNode
  title?: string
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.55rem] uppercase tracking-wider text-readout-muted">{label}</dt>
      <dd className="break-words text-sm text-readout" title={title}>
        {children}
      </dd>
    </div>
  )
}

/** A titled section divider within a drawer body. */
export function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 border-t border-console-line pt-4">
      <h3 className="mb-2 text-[0.55rem] uppercase tracking-widest text-readout-muted">{title}</h3>
      {children}
    </section>
  )
}
