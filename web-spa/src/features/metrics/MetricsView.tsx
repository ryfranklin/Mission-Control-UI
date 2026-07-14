import { useMemo, useState, type ReactNode } from 'react'

import type { MetricsQuery } from '../../api'
import { QueryState } from '../../components/QueryState'
import { Segmented } from '../../components/Segmented'
import { Select } from '../../components/Select'
import { Sparkline } from '../../components/Sparkline'
import { formatMoney, formatNumber, humanizeKey } from '../../lib/format'
import {
  isCostKey,
  isRecord,
  numericEntries,
  pickLabel,
  toSeries,
  type SeriesPoint,
} from '../../lib/metrics'
import { taskTypeLabel } from '../../lib/status'
import { RANGE_OPTIONS, resolveRange, type RangeKey } from '../../lib/timeRange'
import { useTargets } from '../useTargets'
import { Figure } from './Figure'
import { useMetrics } from './useMetrics'

/**
 * METRICS — scoped cost/quality rollups with trend sparklines.
 *
 * Scope (target + time window) is pushed to the seam via the `/metrics` query
 * params. The rollup payload is free-form JSON, so every field is read
 * defensively (see lib/metrics): we render the numbers we can interpret and
 * quietly skip the rest — the client never fabricates a figure.
 */
export function MetricsView() {
  const [target, setTarget] = useState('all')
  const [range, setRange] = useState<RangeKey>('7d')

  const targetsQuery = useTargets()

  const query: MetricsQuery = useMemo(() => {
    const { from, to } = resolveRange(range)
    return {
      ...(target !== 'all' ? { target } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }
  }, [target, range])

  const metricsQuery = useMetrics(query)
  const data = metricsQuery.data

  const rollup = isRecord(data?.runs_summary) ? data.runs_summary : undefined
  const rollupEntries = numericEntries(rollup)
  const telemetryEntries = numericEntries(data?.telemetry_rollup)
  const judgeEntries = numericEntries(data?.worker_vs_judge)

  const qualitySeries = toSeries(
    data?.quality_trend,
    ['quality', 'score', 'avg', 'mean', 'value'],
    ['date', 'bucket', 'day', 'ts', 'time', 'label'],
  )
  const costSeries = toSeries(
    data?.per_run,
    ['cost', 'usd', 'spend'],
    ['run', 'id', 'created', 'ts', 'label'],
  )

  const targetOptions = [
    { value: 'all', label: 'All targets' },
    ...(targetsQuery.data ?? []).map((t) => ({ value: t, label: t })),
  ]

  const nothing =
    rollupEntries.length === 0 &&
    telemetryEntries.length === 0 &&
    judgeEntries.length === 0 &&
    qualitySeries.length === 0 &&
    costSeries.length === 0

  return (
    <section aria-label="Metrics" className="flex flex-col gap-4">
      <div className="mc-panel flex flex-wrap items-center gap-x-5 gap-y-3 p-3">
        <Select label="Target" value={target} options={targetOptions} onChange={setTarget} />
        <Segmented label="Window" value={range} options={RANGE_OPTIONS} onChange={setRange} />
        <span className="ml-auto text-[0.6rem] uppercase tracking-wider text-readout-muted">
          Scope · {target === 'all' ? 'all targets' : target} ·{' '}
          {RANGE_OPTIONS.find((o) => o.key === range)?.label}
        </span>
      </div>

      <QueryState
        isLoading={metricsQuery.isLoading}
        error={metricsQuery.error}
        isEmpty={nothing}
        emptyLabel="No metrics in scope"
      >
        <div className="flex flex-col gap-4">
          {rollupEntries.length > 0 && (
            <Panel title="Scoped rollup" subtitle="Exact aggregate over the runs registry">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {rollupEntries.map(([k, v]) => (
                  <Figure key={k} metricKey={k} value={v} />
                ))}
              </dl>
            </Panel>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TrendPanel
              title="Quality trend"
              tone="telemetry"
              series={qualitySeries}
              formatValue={(v) => formatNumber(v, 2)}
            />
            <TrendPanel
              title="Cost trend"
              subtitle="Per-run reconciled cost"
              tone="go"
              series={costSeries}
              formatValue={formatMoney}
            />
          </div>

          {Array.isArray(data?.by_task_type) && data.by_task_type.length > 0 && (
            <Panel title="By task type" subtitle="sim vs burn">
              <TaskTypeTable rows={data.by_task_type} />
            </Panel>
          )}

          {(telemetryEntries.length > 0 || judgeEntries.length > 0) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {telemetryEntries.length > 0 && (
                <Panel title="Telemetry rollup">
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {telemetryEntries.map(([k, v]) => (
                      <Figure key={k} metricKey={k} value={v} />
                    ))}
                  </dl>
                </Panel>
              )}
              {judgeEntries.length > 0 && (
                <Panel title="Worker vs judge">
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {judgeEntries.map(([k, v]) => (
                      <Figure key={k} metricKey={k} value={v} />
                    ))}
                  </dl>
                </Panel>
              )}
            </div>
          )}
        </div>
      </QueryState>
    </section>
  )
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section className="mc-panel p-4">
      <header className="mb-3 flex items-baseline justify-between border-b border-console-line pb-2">
        <h2 className="text-sm uppercase tracking-widest text-readout">{title}</h2>
        {subtitle && (
          <span className="text-[0.6rem] uppercase tracking-wider text-readout-muted">
            {subtitle}
          </span>
        )}
      </header>
      {children}
    </section>
  )
}

function TrendPanel({
  title,
  subtitle,
  tone,
  series,
  formatValue,
}: {
  title: string
  subtitle?: string
  tone: 'telemetry' | 'go'
  series: SeriesPoint[]
  formatValue: (v: number) => string
}) {
  // Cost trend is reconciled-green; the quality trend rides the cyan telemetry
  // accent (live telemetry in the console's color language).
  const chartTone = tone === 'go' ? 'go' : 'telemetry'
  const latest = series.length > 0 ? series[series.length - 1].value : null
  return (
    <Panel title={title} subtitle={subtitle}>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-2xl tabular-nums text-readout">
          {latest == null ? '—' : formatValue(latest)}
        </span>
        <span className="text-[0.6rem] uppercase tracking-wider text-readout-muted">latest</span>
      </div>
      <Sparkline data={series} tone={chartTone} formatValue={formatValue} height={64} />
    </Panel>
  )
}

function TaskTypeTable({ rows }: { rows: unknown[] }) {
  // Collect the union of numeric columns across rows for a stable table shape.
  const columns = useMemo(() => {
    const seen: string[] = []
    for (const row of rows) {
      for (const [k] of numericEntries(row)) if (!seen.includes(k)) seen.push(k)
    }
    return seen
  }, [rows])

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-[0.6rem] uppercase tracking-wider text-readout-muted">
            <th className="py-1 pr-4 font-normal">Task</th>
            {columns.map((c) => (
              <th key={c} className="py-1 pr-4 text-right font-normal">
                {humanizeKey(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const nums = new Map(numericEntries(row))
            const label = pickLabel(row, ['task', 'type', 'name'], i)
            return (
              <tr key={i} className="border-t border-console-line">
                <td className="py-1.5 pr-4 uppercase tracking-wider text-readout">
                  {taskTypeLabel(label)}
                </td>
                {columns.map((c) => {
                  const v = nums.get(c)
                  return (
                    <td key={c} className="py-1.5 pr-4 text-right tabular-nums text-readout">
                      {v == null
                        ? '—'
                        : isCostKey(c)
                          ? formatMoney(v)
                          : Number.isInteger(v)
                            ? formatNumber(v)
                            : formatNumber(v, 2)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
