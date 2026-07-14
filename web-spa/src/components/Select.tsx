/**
 * A labelled native select styled for the console. Native `<select>` keeps
 * keyboard + screen-reader behavior for free.
 */
interface SelectProps {
  label: string
  value: string
  options: ReadonlyArray<{ value: string; label: string }>
  onChange: (value: string) => void
}

export function Select({ label, value, options, onChange }: SelectProps) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[0.6rem] uppercase tracking-wider text-readout-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-console-line bg-console-raised px-2 py-1 text-xs uppercase tracking-wider text-readout outline-none focus:border-status-telemetry"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-console-panel">
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}
