/**
 * Mission Control console design tokens.
 *
 * NASA/SpaceX flight-console palette: near-black panels with saturated status
 * accents read at a glance under low light. Semantic names map to operator
 * meaning, not raw hues, so later views (Fleet, Run station, Gate, Metrics,
 * Planner) speak in intent — `text-status-go`, `border-panel-line`, etc.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Structural surfaces — near-black console panels.
        console: {
          void: '#05070a', // deepest backdrop, behind panels
          panel: '#0b0f14', // primary panel fill
          raised: '#121820', // raised card / header
          line: '#1e2833', // hairline borders / dividers
        },
        panel: {
          line: '#1e2833',
        },
        // Foreground text tiers.
        readout: {
          DEFAULT: '#c9d5e1', // primary readout text
          muted: '#6b7c8f', // secondary / labels
          dim: '#3d4a58', // disabled / inactive
        },
        // Semantic status accents — the console's language.
        status: {
          go: '#2fe57a', // green — GO / nominal / approved
          flight: '#ffb020', // amber — in-flight / UNRECONCILED / pending
          fault: '#ff3b47', // red — NO-GO / fault / rejected
          telemetry: '#22d3ee', // cyan — live telemetry / streaming
        },
      },
      fontFamily: {
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'JetBrains Mono',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      fontFeatureSettings: {
        // tabular, lining figures for aligned telemetry columns
        tabular: '"tnum" 1, "lnum" 1',
      },
      boxShadow: {
        // subtle inner bezel for panels
        panel: 'inset 0 0 0 1px rgba(255,255,255,0.02)',
        'glow-telemetry': '0 0 12px rgba(34,211,238,0.35)',
      },
    },
  },
  plugins: [],
}
