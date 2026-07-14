import { useState } from 'react'

import { ApiError, type OpenPlanRequest, type PlanDetail } from '../../api'
import { useOpenPlan } from './usePlanner'

/**
 * NEW FLIGHT PLAN — open an INCEPTION session.
 *
 * The fields below are exactly those the generated `OpenPlanRequest` schema
 * defines (target, mode, methodology, cloud_target, workstream, remote_dest,
 * allow_secrets); nothing is invented. Optional/blank fields are omitted from
 * the body so the seam applies its own instance defaults. `mode` is required and
 * enumerated (greenfield / brownfield) per the schema description; the seam
 * remains the authority on validation — this form only renders and transmits.
 */

const MODES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'brownfield', label: 'Brownfield · existing repo' },
  { value: 'greenfield', label: 'Greenfield · new project' },
]

function trimOrNull(v: string): string | null {
  const t = v.trim()
  return t === '' ? null : t
}

export function PlanCreateForm({ onOpened }: { onOpened: (plan: PlanDetail) => void }) {
  const [target, setTarget] = useState('')
  const [mode, setMode] = useState('brownfield')
  const [methodology, setMethodology] = useState('')
  const [cloudTarget, setCloudTarget] = useState('')
  const [workstream, setWorkstream] = useState('')
  const [remoteDest, setRemoteDest] = useState('')
  const [allowSecrets, setAllowSecrets] = useState(false)

  const open = useOpenPlan()

  const greenfield = mode === 'greenfield'

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (open.isPending) return
    const body: OpenPlanRequest = {
      mode,
      allow_secrets: allowSecrets,
      target: trimOrNull(target),
      methodology: trimOrNull(methodology),
      cloud_target: trimOrNull(cloudTarget),
      workstream: trimOrNull(workstream),
      remote_dest: trimOrNull(remoteDest),
    }
    open.mutate(body, { onSuccess: (plan) => onOpened(plan) })
  }

  return (
    <form onSubmit={submit} className="mc-panel flex flex-col gap-4 p-4" aria-label="New Flight Plan">
      <header className="flex items-center gap-2 border-b border-console-line pb-2">
        <span aria-hidden className="text-status-telemetry">
          ◈
        </span>
        <h2 className="text-[0.7rem] uppercase tracking-widest text-readout">New Flight Plan</h2>
        <span className="ml-auto text-[0.55rem] uppercase tracking-wider text-readout-dim">
          Inception
        </span>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Target" hint="Path to the target repository">
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="/path/to/repo"
            spellCheck={false}
            className={INPUT}
          />
        </Field>

        <label className="flex flex-col gap-1">
          <span className={LABEL}>
            Mode <span className="text-status-fault">*</span>
          </span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className={`${INPUT} uppercase`}
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value} className="bg-console-panel">
                {m.label}
              </option>
            ))}
          </select>
          <span className={HINT}>Greenfield or brownfield</span>
        </label>

        <Field label="Methodology" hint="Overrides instance default">
          <input
            type="text"
            value={methodology}
            onChange={(e) => setMethodology(e.target.value)}
            placeholder="aidlc"
            spellCheck={false}
            className={INPUT}
          />
        </Field>

        <Field label="Cloud Target" hint="Overrides instance default">
          <input
            type="text"
            value={cloudTarget}
            onChange={(e) => setCloudTarget(e.target.value)}
            placeholder="aws"
            spellCheck={false}
            className={INPUT}
          />
        </Field>

        <Field label="Workstream" hint="Build reconciles through mc/ws/<name>">
          <input
            type="text"
            value={workstream}
            onChange={(e) => setWorkstream(e.target.value)}
            placeholder="optional"
            spellCheck={false}
            className={INPUT}
          />
        </Field>

        <Field
          label="Remote Dest"
          hint={greenfield ? 'Required for a greenfield build' : 'Greenfield: remote to bootstrap'}
        >
          <input
            type="text"
            value={remoteDest}
            onChange={(e) => setRemoteDest(e.target.value)}
            placeholder={greenfield ? 'git@host:org/repo.git' : '—'}
            spellCheck={false}
            required={greenfield}
            className={INPUT}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={allowSecrets}
          onChange={(e) => setAllowSecrets(e.target.checked)}
          className="h-3.5 w-3.5 accent-status-flight"
        />
        <span className={LABEL}>Allow secrets</span>
        <span className={HINT}>Override the egress content guard (audited)</span>
      </label>

      {open.isError && (
        <p role="alert" className="text-xs text-status-fault">
          ▲ {openErrorMessage(open.error)}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-console-line pt-3">
        <span className="mr-auto text-[0.55rem] uppercase tracking-wider text-readout-dim">
          {greenfield && !remoteDest.trim() ? 'Remote dest required for greenfield' : ' '}
        </span>
        <button
          type="submit"
          disabled={open.isPending}
          className="rounded border border-status-go/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-status-go transition-colors enabled:hover:bg-status-go/10 disabled:opacity-40"
        >
          {open.isPending ? '◆ Opening…' : 'Open Session ▸'}
        </button>
      </div>
    </form>
  )
}

const INPUT =
  'rounded border border-console-line bg-console-raised px-2 py-1.5 text-xs text-readout outline-none placeholder:text-readout-dim focus:border-status-telemetry'
const LABEL = 'text-[0.6rem] uppercase tracking-wider text-readout-muted'
const HINT = 'text-[0.55rem] tracking-wide text-readout-dim'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={LABEL}>{label}</span>
      {children}
      <span className={HINT}>{hint}</span>
    </label>
  )
}

function openErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `Seam rejected the plan (${error.status} ${error.statusText})`
  }
  if (error instanceof Error) return error.message
  return 'Could not open the planning session'
}
