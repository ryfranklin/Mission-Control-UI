/**
 * Root shell for the Mission Control operator console.
 *
 * Hosts the top-level navigation and mounts the operator views. This unit
 * lands Fleet (the default landing view) and Metrics; the Run station, Gate,
 * and Planner console mount here in later units.
 */
import { lazy, Suspense } from 'react'

import { FleetView } from './features/fleet/FleetView'
import { useHashPath, useHashRoute } from './lib/useHashRoute'

// Metrics pulls in the charting lib — lazy-load it so the default Fleet landing
// bundle stays lean and the charts arrive only when that view is opened.
const MetricsView = lazy(() =>
  import('./features/metrics/MetricsView').then((m) => ({ default: m.MetricsView })),
)

// The Run station carries the live SSE machinery — lazy-load it so it arrives
// only when an operator drills into a specific run.
const RunStationView = lazy(() =>
  import('./features/run/RunStationView').then((m) => ({ default: m.RunStationView })),
)

// The Planner console (plan list/create) and its streaming session hero are
// lazy-loaded — the SSE-over-fetch streaming machinery only arrives when an
// operator opens the Planner.
const PlannerView = lazy(() =>
  import('./features/planner/PlannerView').then((m) => ({ default: m.PlannerView })),
)
const PlanConsoleView = lazy(() =>
  import('./features/planner/PlanConsoleView').then((m) => ({ default: m.PlanConsoleView })),
)

/** Match the nested run-station route `#/runs/{id}` off the shared hash router. */
function matchRun(path: string): string | null {
  const m = /^runs\/(.+)$/.exec(path)
  return m ? decodeURIComponent(m[1]) : null
}

/** Match the nested plan-console route `#/plans/{id}` off the shared hash router. */
function matchPlan(path: string): string | null {
  const m = /^plans\/(.+)$/.exec(path)
  return m ? decodeURIComponent(m[1]) : null
}

function PanelFallback({ label }: { label: string }) {
  return (
    <div className="mc-panel p-10 text-center text-sm uppercase tracking-wider text-status-flight">
      ◆ {label}
    </div>
  )
}

const VIEWS = ['fleet', 'metrics', 'planner'] as const
type View = (typeof VIEWS)[number]

const NAV: Array<{ key: View; label: string; caption: string }> = [
  { key: 'fleet', label: 'Fleet', caption: 'Flight Director board' },
  { key: 'metrics', label: 'Metrics', caption: 'Controller rollups' },
  { key: 'planner', label: 'Planner', caption: 'Inception · Flight Plans' },
]

export default function App() {
  const [view, navigate] = useHashRoute<View>(VIEWS, 'fleet')
  const path = useHashPath()
  const runId = matchRun(path)
  const planId = matchPlan(path)

  // The active nav key: no view is active while drilled into a run station; the
  // Planner tab stays lit while inside a plan console.
  const activeKey: View | null = runId ? null : planId ? 'planner' : view

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
              const active = item.key === activeKey
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
        {runId ? (
          <Suspense fallback={<PanelFallback label="Opening run station…" />}>
            <RunStationView runId={runId} onExit={() => navigate('fleet')} />
          </Suspense>
        ) : planId ? (
          <Suspense fallback={<PanelFallback label="Opening plan console…" />}>
            <PlanConsoleView planId={planId} onExit={() => navigate('planner')} />
          </Suspense>
        ) : view === 'fleet' ? (
          <FleetView />
        ) : view === 'metrics' ? (
          <Suspense fallback={<PanelFallback label="Loading metrics…" />}>
            <MetricsView />
          </Suspense>
        ) : (
          <Suspense fallback={<PanelFallback label="Loading planner…" />}>
            <PlannerView onOpen={(id) => navigate(`plans/${encodeURIComponent(id)}` as View)} />
          </Suspense>
        )}
      </main>
    </div>
  )
}
