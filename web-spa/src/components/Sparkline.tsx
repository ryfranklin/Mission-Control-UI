import { memo } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts'

import type { SeriesPoint } from '../lib/metrics'
import type { StatusTone } from '../lib/status'
import { TONE_HEX } from '../lib/status'

interface SparklineProps {
  data: SeriesPoint[]
  tone?: StatusTone
  /** How to render a point's value inside the hover tooltip. */
  formatValue?: (value: number) => string
  height?: number
}

/**
 * A compact trend sparkline (axis-less area chart) for the Metrics view.
 * Telemetry-cyan by default. Renders a placeholder when there is no series so
 * an empty rollup reads as "no data", not a broken chart.
 */
function SparklineImpl({ data, tone = 'flight', formatValue, height = 48 }: SparklineProps) {
  const color = TONE_HEX[tone]

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[0.65rem] uppercase tracking-wider text-readout-dim"
        style={{ height }}
      >
        No telemetry
      </div>
    )
  }

  const gradientId = `spark-${tone}`

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Tooltip
          cursor={{ stroke: color, strokeOpacity: 0.4 }}
          contentStyle={{
            background: '#0b0f14',
            border: '1px solid #1e2833',
            borderRadius: 6,
            fontSize: 11,
            fontFamily: 'ui-monospace, monospace',
            color: '#c9d5e1',
          }}
          labelStyle={{ color: '#6b7c8f' }}
          formatter={(value: number | string) => [
            formatValue ? formatValue(Number(value)) : String(value),
            '',
          ]}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export const Sparkline = memo(SparklineImpl)
