/**
 * Root shell for the Mission Control operator console.
 *
 * Hosts the top-level navigation and mounts the operator views. This unit
 * lands Fleet (the default landing view) and Metrics; the Run station, Gate,
 * and Planner console mount here in later units.
 */
import { lazy, Suspense } from 'react'

import { FleetView } from './features/fleet/FleetView'
import { useHashRoute } from './lib/useHashRoute'

// Metrics pulls in the charting lib — lazy-load it so the default Fleet landing
// bundle stays lean and the charts arrive only when that view is opened.
const MetricsView = lazy(() =>
  import('./features/metrics/MetricsView').then((m) => ({ default: m.MetricsView })),
)

const VIEWS = ['fleet', 'metrics'] as const
type View = (typeof VIEWS)[number]

const NAV: Array<{ key: View; label: string; caption: string }> = [
  { key: 'fleet', label: 'Fleet', caption: 'Flight Director board' },
  { key: 'metrics', label: 'Metrics', caption: 'Controller rollups' },
]

export default function App() {
  const [view, navigate] = useHashRoute<View>(VIEWS, 'fleet')

  return (
    <div className="min-h-full bg-console-void text-readout">
      <header className="sticky top-0 z-10 border-b border-console-line bg-console-void/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <div className="flex items-center gap-3">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full bg-status-go shadow-glow-telemetry"
              aria-hidden
            />
            <h1 className="text-lg font-semibold uppercase tracking-widest">Mission Control</h1>
          </div>

          <nav aria-label="Views" className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = item.key === view
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => navigate(item.key)}
                  className={`group flex flex-col rounded px-3 py-1 text-left transition-colors ${
                    active
                      ? 'bg-console-raised'
                      : 'hover:bg-console-panel'
                  }`}
                >
                  <span
                    className={`text-sm uppercase tracking-wider ${
                      active ? 'text-readout' : 'text-readout-muted group-hover:text-readout'
                    }`}
                  >
                    {item.label}
                  </span>
                  <span className="text-[0.55rem] uppercase tracking-wider text-readout-dim">
                    {item.caption}
                  </span>
                </button>
              )
            })}
          </nav>

          <span className="mc-status ml-auto border border-console-line text-readout-muted">
            <span aria-hidden className="text-status-go">
              ●
            </span>
            Console Online
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {view === 'fleet' ? (
          <FleetView />
        ) : (
          <Suspense
            fallback={
              <div className="mc-panel p-10 text-center text-sm uppercase tracking-wider text-status-flight">
                ◆ Loading metrics…
              </div>
            }
          >
            <MetricsView />
          </Suspense>
        )}
      </main>
    </div>
  )
}
