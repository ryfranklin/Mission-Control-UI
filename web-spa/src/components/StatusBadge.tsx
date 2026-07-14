import { statusPresentation, TONE_TEXT, TONE_BORDER } from '../lib/status'

/**
 * A status pill that pairs a semantic accent color with a redundant glyph and
 * a text label — status is never conveyed by hue alone (accessibility rule).
 */
export function StatusBadge({ status }: { status: string | null | undefined }) {
  const { tone, glyph, label } = statusPresentation(status)
  return (
    <span
      className={`mc-status border ${TONE_BORDER[tone]} ${TONE_TEXT[tone]}`}
      role="status"
    >
      <span aria-hidden className="text-[0.7em] leading-none">
        {glyph}
      </span>
      <span>{label}</span>
    </span>
  )
}
