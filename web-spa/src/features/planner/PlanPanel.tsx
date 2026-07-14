import type {
  ChildRunModel,
  CriterionModel,
  PlanDetail,
  RequirementModel,
  UnitModel,
} from '../../api'
import { StatusBadge } from '../../components/StatusBadge'
import { CostReadout } from '../fleet/CostReadout'
import { formatMoney } from '../../lib/format'
import { taskTypeLabel } from '../../lib/status'
import { dependsLabel, requirementState, type StatePresentation } from './planModel'
import { FinalizeControl } from './FinalizeControl'

/**
 * PLAN PANEL — the live Flight Plan beside the transcript. Reads the plan
 * aggregate (`GET /plans/{id}`) and renders its stage, requirements, work-list
 * units (with dependencies + status), the readiness gate, the Finalize command,
 * and — once finalized — the burns it dispatched. Render-only: every decision is
 * the seam's; `ready` gates Finalize.
 */

const STATE_TEXT: Record<StatePresentation['tone'], string> = {
  go: 'text-status-go',
  flight: 'text-status-flight',
  fault: 'text-status-fault',
  neutral: 'text-readout-muted',
}

export function PlanPanel({ plan, planId }: { plan: PlanDetail; planId: string }) {
  const requirements = plan.requirements ?? []
  const units = plan.units ?? []
  const readiness = plan.readiness ?? []
  const childRuns = plan.child_runs ?? []

  return (
    <aside aria-label="Flight plan" className="flex flex-col gap-4">
      <div className="mc-panel flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={plan.status} />
          {plan.stage && (
            <span className="rounded border border-status-telemetry/50 px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wider text-status-telemetry">
              {plan.stage}
            </span>
          )}
          <span
            className={`ml-auto rounded border px-1.5 py-0.5 text-[0.55rem] uppercase tracking-wider ${
              plan.ready
                ? 'border-status-go/50 text-status-go'
                : 'border-console-line text-readout-muted'
            }`}
          >
            {plan.ready ? '● GO for finalize' : '◆ No-go'}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          <Meta label="Target" value={plan.target} full />
          <Meta label="Mode" value={plan.mode} />
          <Meta label="Methodology" value={plan.methodology} />
          <Meta label="Cloud" value={plan.cloud_target} />
          <Meta label="Workstream" value={plan.workstream} />
          {plan.remote_dest && <Meta label="Remote Dest" value={plan.remote_dest} full />}
        </dl>
      </div>

      <Section title="Requirements" count={requirements.length}>
        {requirements.length === 0 ? (
          <Empty label="No requirements captured yet" />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {requirements.map((req) => (
              <RequirementRow key={req.key} req={req} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Units" count={units.length} caption="Construction work-list">
        {units.length === 0 ? (
          <Empty label="No units decomposed yet" />
        ) : (
          <ol className="flex flex-col gap-2">
            {units.map((unit) => (
              <UnitRow key={unit.seq} unit={unit} />
            ))}
          </ol>
        )}
      </Section>

      <Section title="Readiness" count={readiness.length} caption="Go / no-go gate">
        {readiness.length === 0 ? (
          <Empty label="Readiness not yet evaluated" />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {readiness.map((c) => (
              <CriterionRow key={c.key} criterion={c} />
            ))}
          </ul>
        )}
      </Section>

      <FinalizeControl planId={planId} ready={plan.ready} unitCount={units.length} />

      {childRuns.length > 0 && (
        <Section
          title="Dispatched Burns"
          count={childRuns.length}
          caption={`Build cost ${formatMoney(plan.build_cost)}`}
        >
          <ul className="flex flex-col gap-2">
            {childRuns.map((run) => (
              <ChildRunRow key={run.run_id} run={run} />
            ))}
          </ul>
        </Section>
      )}
    </aside>
  )
}

function Section({
  title,
  count,
  caption,
  children,
}: {
  title: string
  count: number
  caption?: string
  children: React.ReactNode
}) {
  return (
    <section className="mc-panel flex flex-col">
      <header className="flex items-center gap-2 border-b border-console-line px-4 py-2">
        <h3 className="text-[0.65rem] uppercase tracking-widest text-readout-muted">{title}</h3>
        <span className="rounded bg-console-raised px-1.5 text-[0.55rem] tabular-nums text-readout-muted">
          {count}
        </span>
        {caption && (
          <span className="ml-auto text-[0.55rem] uppercase tracking-wider text-readout-dim">
            {caption}
          </span>
        )}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  )
}

function Empty({ label }: { label: string }) {
  return <p className="text-[0.7rem] uppercase tracking-wider text-readout-dim">○ {label}</p>
}

function Meta({
  label,
  value,
  full,
}: {
  label: string
  value: string | null | undefined
  full?: boolean
}) {
  return (
    <div className={full ? 'col-span-2 min-w-0' : 'min-w-0'}>
      <dt className="text-[0.55rem] uppercase tracking-wider text-readout-dim">{label}</dt>
      <dd className="truncate text-xs text-readout" title={value ?? undefined}>
        {value?.trim() || '—'}
      </dd>
    </div>
  )
}

function RequirementRow({ req }: { req: RequirementModel }) {
  const state = requirementState(req.state)
  return (
    <li className="flex items-baseline gap-2">
      <span aria-hidden className={`text-[0.7em] ${STATE_TEXT[state.tone]}`} title={state.label}>
        {state.glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-[0.6rem] uppercase tracking-wider text-readout-muted">{req.key}</span>
        <span className="block break-words text-xs text-readout">{req.value ?? '—'}</span>
      </span>
      <span className={`shrink-0 text-[0.55rem] uppercase tracking-wider ${STATE_TEXT[state.tone]}`}>
        {state.label}
      </span>
    </li>
  )
}

function UnitRow({ unit }: { unit: UnitModel }) {
  const deps = dependsLabel(unit.depends_on)
  return (
    <li className="rounded border border-console-line/70 bg-console-raised/40 p-2">
      <div className="flex items-baseline gap-2">
        <span className="text-[0.6rem] tabular-nums text-readout-dim">
          {String(unit.seq).padStart(2, '0')}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-readout" title={unit.title}>
          {unit.title}
        </span>
        <StatusBadge status={unit.status} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6">
        {unit.phase && (
          <span className="text-[0.55rem] uppercase tracking-wider text-readout-muted">
            {unit.phase}
          </span>
        )}
        <span className="rounded border border-console-line px-1 text-[0.55rem] uppercase tracking-wider text-readout-muted">
          {taskTypeLabel(unit.task_type)}
        </span>
        {deps.length > 0 ? (
          <span className="text-[0.55rem] uppercase tracking-wider text-readout-dim">
            <span aria-hidden>⤳ </span>depends on{' '}
            <span className="tabular-nums text-status-flight">{deps.join(' · ')}</span>
          </span>
        ) : (
          <span className="text-[0.55rem] uppercase tracking-wider text-readout-dim">
            ⤳ no dependencies
          </span>
        )}
      </div>
    </li>
  )
}

function CriterionRow({ criterion }: { criterion: CriterionModel }) {
  const met = criterion.met
  return (
    <li className="flex items-baseline gap-2">
      <span
        aria-hidden
        className={`text-[0.7em] ${met ? 'text-status-go' : 'text-readout-muted'}`}
      >
        {met ? '☑' : '☐'}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`text-xs ${met ? 'text-readout' : 'text-readout-muted'}`}>
          {criterion.label || criterion.key}
        </span>
        {criterion.detail && (
          <span className="block text-[0.6rem] text-readout-dim">{criterion.detail}</span>
        )}
      </span>
      <span
        className={`shrink-0 text-[0.55rem] uppercase tracking-wider ${
          met ? 'text-status-go' : 'text-readout-muted'
        }`}
      >
        {met ? 'GO' : 'PENDING'}
      </span>
    </li>
  )
}

function ChildRunRow({ run }: { run: ChildRunModel }) {
  return (
    <li>
      <a
        href={`#/runs/${encodeURIComponent(run.run_id)}`}
        className="flex items-center gap-2 rounded border border-console-line/70 bg-console-raised/40 p-2 transition-colors hover:border-status-telemetry/50"
        title="Open run station"
      >
        {run.unit_seq != null && (
          <span className="text-[0.6rem] tabular-nums text-readout-dim">
            U{String(run.unit_seq).padStart(2, '0')}
          </span>
        )}
        <span className="rounded border border-console-line px-1 text-[0.55rem] uppercase tracking-wider text-readout-muted">
          {taskTypeLabel(run.task_type)}
        </span>
        <StatusBadge status={run.status} />
        <span className="ml-auto">
          <CostReadout costUsd={run.cost_usd} status={run.status} />
        </span>
        <span aria-hidden className="text-[0.6rem] text-status-telemetry">
          ▸
        </span>
      </a>
    </li>
  )
}
