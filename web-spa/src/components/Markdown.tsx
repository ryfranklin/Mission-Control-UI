import { memo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Console-styled markdown renderer for operator REPORT text (a run's `detail`
 * field), which the seam authors as GitHub-flavoured markdown. We render it as
 * clean typography — headings, lists, tables, inline/blocks of code — rather
 * than leaking raw `##`/`**`/`` ` `` at the operator.
 *
 * Deliberately thin: no HTML passthrough (react-markdown ignores raw HTML by
 * default, so untrusted report text can't inject markup), and every element is
 * mapped to a Tailwind class in the near-black console palette. Pure render —
 * it decides nothing.
 */

const COMPONENTS: Components = {
  h1: ({ children }) => (
    <h3 className="mt-3 mb-1 text-sm font-semibold uppercase tracking-wider text-readout first:mt-0">
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h4 className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wider text-readout first:mt-0">
      {children}
    </h4>
  ),
  h3: ({ children }) => (
    <h5 className="mt-2 mb-1 text-xs font-semibold uppercase tracking-wider text-readout-muted first:mt-0">
      {children}
    </h5>
  ),
  h4: ({ children }) => (
    <h6 className="mt-2 mb-1 text-[0.7rem] font-semibold uppercase tracking-wider text-readout-muted first:mt-0">
      {children}
    </h6>
  ),
  p: ({ children }) => <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-status-telemetry underline decoration-status-telemetry/40 underline-offset-2 hover:decoration-status-telemetry"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="my-1.5 ml-4 list-disc space-y-0.5 marker:text-readout-dim">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1.5 ml-4 list-decimal space-y-0.5 marker:text-readout-dim">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-readout">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-readout-dim line-through">{children}</del>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-console-line pl-3 text-readout-muted">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-console-line" />,
  code: ({ className, children }) => {
    // Fenced blocks arrive with a `language-*` class; inline code has none.
    const isBlock = /\blanguage-/.test(className ?? '')
    if (isBlock) {
      return (
        <code className="font-mono text-[0.72rem] leading-relaxed text-status-telemetry">
          {children}
        </code>
      )
    }
    return (
      <code className="rounded bg-console-raised px-1 py-0.5 font-mono text-[0.85em] text-status-telemetry">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded border border-console-line bg-console-void p-2.5">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-left tabular-nums">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="text-readout-muted">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-console-line px-2 py-1 text-[0.6rem] font-semibold uppercase tracking-wider">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-console-line/60 px-2 py-1 align-top">{children}</td>
  ),
}

export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="text-xs text-readout-muted [word-break:break-word]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  )
})
