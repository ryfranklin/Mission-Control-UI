/**
 * Root shell for the Mission Control operator console.
 *
 * SCAFFOLD PLACEHOLDER: this proves the app builds, runs, and renders with the
 * console design tokens and the TanStack Query provider mounted. The operator
 * views — Fleet, Run station, Gate, Metrics, Planner — are added in later units
 * and will mount inside this shell.
 */
export default function App() {
  return (
    <div className="min-h-full bg-console-void p-6 text-readout">
      <header className="mx-auto flex max-w-5xl items-center justify-between border-b border-console-line pb-4">
        <div className="flex items-center gap-3">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full bg-status-go shadow-glow-telemetry"
            aria-hidden
          />
          <h1 className="text-lg font-semibold tracking-widest uppercase">
            Mission Control
          </h1>
        </div>
        <span className="mc-status border border-console-line text-readout-muted">
          Console Online
        </span>
      </header>

      <main className="mx-auto mt-6 max-w-5xl">
        <section className="mc-panel p-6">
          <p className="text-sm text-readout-muted">
            Operator control room scaffold. Views mount here in later units.
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatusTile label="GO / nominal" className="text-status-go" value="—" />
            <StatusTile label="In-flight" className="text-status-flight" value="—" />
            <StatusTile label="NO-GO / fault" className="text-status-fault" value="—" />
            <StatusTile label="Telemetry" className="text-status-telemetry" value="—" />
          </dl>
        </section>
      </main>
    </div>
  )
}

function StatusTile({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className="mc-panel bg-console-raised px-3 py-2">
      <dt className="text-[0.65rem] uppercase tracking-wider text-readout-muted">
        {label}
      </dt>
      <dd className={`mt-1 text-xl tabular-nums ${className ?? ''}`}>{value}</dd>
    </div>
  )
}
