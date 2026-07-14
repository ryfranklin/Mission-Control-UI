/**
 * A compact segmented toggle for console filters (time range, sort key, …).
 * Generic over the option value so callers stay type-safe.
 */
interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: ReadonlyArray<{ key: T; label: string }>
  onChange: (value: T) => void
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.6rem] uppercase tracking-wider text-readout-muted">
        {label}
      </span>
      <div
        role="group"
        aria-label={label}
        className="inline-flex overflow-hidden rounded border border-console-line"
      >
        {options.map((opt) => {
          const active = opt.key === value
          return (
            <button
              key={opt.key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(opt.key)}
              className={`px-2.5 py-1 text-xs uppercase tracking-wider transition-colors ${
                active
                  ? 'bg-console-raised text-readout'
                  : 'text-readout-muted hover:text-readout'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
