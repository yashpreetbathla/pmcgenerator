import { useMemo, useState } from 'react'
import { Cpu } from 'lucide-react'
import { Badge, Card, Field, Input, Select } from '@/components/ui'
import { CONTROLS, CONTROL_FAMILIES, CUSTOM_CONTROL_ID, PMC_TYPES, TYPICAL_NOTE, controlById, pmcById, type PmcTypeSpec } from '@/data/controls'
import { applyControl, controlName, pmcOf } from '@/core/generator'
import { useWizard } from './store'
import { Choice, SearchBox, StepHeader } from './parts'

const size = (p: PmcTypeSpec, l: string) => p.areas.filter((a) => a.letter === l && !(l === 'R' && a.start >= 9000))
const range = (p: PmcTypeSpec, l: string) => size(p, l).map((a) => `${l}${a.start}–${l}${a.start + a.size - 1}`).join(', ')

export function PmcFacts({ pmc }: { pmc: PmcTypeSpec }) {
  const facts: [string, string][] = [
    ['Levels', String(pmc.levels)],
    ['Steps', pmc.steps.toLocaleString('en-US')],
    ['X / Y', range(pmc, 'X')],
    ['R', range(pmc, 'R')],
    ['E', range(pmc, 'E') || '—'],
    ['A (messages)', `${(size(pmc, 'A')[0]?.size ?? 0) * 8} bits`],
    ['D', range(pmc, 'D')],
    ['K', range(pmc, 'K')],
    ['TMRB / DIFU', `${pmc.tmrb} / ${pmc.difu}`],
  ]
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
      {facts.map(([k, v]) => (
        <div key={k} className="min-w-0"><dt className="text-xs text-muted">{k}</dt><dd className="tabular truncate font-medium" title={v}>{v}</dd></div>
      ))}
    </dl>
  )
}

export function StepControl() {
  const { config, update } = useWizard()
  const [q, setQ] = useState('')
  const isCustom = config.controlId === CUSTOM_CONTROL_ID
  const ctl = controlById(config.controlId)
  const pmc = pmcOf(config)
  const pmcChoices = isCustom ? PMC_TYPES : (ctl?.pmc.map((id) => pmcById(id)!).filter(Boolean) ?? PMC_TYPES)

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase()
    const hit = CONTROLS.filter((c) => !s || `${c.name} ${c.family} ${c.pmc.map((p) => pmcById(p)?.name).join(' ')}`.toLowerCase().includes(s))
    return CONTROL_FAMILIES.map((f) => ({ family: f, items: hit.filter((c) => c.family === f) })).filter((g) => g.items.length)
  }, [q])

  return (
    <div>
      <StepHeader title="Control & PMC type" text="Pick the FANUC CNC. The PMC type sets the memory map (R, D, A, X/Y) used for addresses." />

      <Card className="mb-5 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-fanuc/25"><Cpu className="size-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">Selected</p>
            <p className="truncate font-semibold">{controlName(config)}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {isCustom && (
            <Field label="Control name">
              <Input value={config.customControlName ?? ''} onChange={(e) => update((c) => ({ ...c, customControlName: e.target.value }))} placeholder="e.g. FANUC 0i-TF (retrofit)" />
            </Field>
          )}
          <Field label="PMC type" hint={pmc.note}>
            <Select value={config.pmcId} onChange={(e) => update((c) => ({ ...c, pmcId: e.target.value }))}>
              {pmcChoices.length > 0 && pmcChoices.length < PMC_TYPES.length && (
                <optgroup label={`Recommended for ${ctl?.name ?? 'this control'}`}>
                  {pmcChoices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </optgroup>
              )}
              <optgroup label={pmcChoices.length < PMC_TYPES.length ? 'All other PMC types (verify compatibility)' : 'All PMC types'}>
                {PMC_TYPES.filter((p) => pmcChoices.length === PMC_TYPES.length || !pmcChoices.includes(p)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </optgroup>
            </Select>
          </Field>
        </div>
        <div className="mt-4 border-t border-border pt-3"><PmcFacts pmc={pmc} /></div>
        <p className="mt-3 text-xs text-muted">{TYPICAL_NOTE}</p>
      </Card>

      <div className="sticky top-14 z-10 -mx-1 mb-3 bg-bg/95 px-1 py-2 backdrop-blur">
        <SearchBox value={q} onChange={setQ} placeholder="Search controls — 0i-TF, 30i, PMC-SB7…" />
      </div>

      <div className="space-y-5">
        <Choice selected={isCustom} onClick={() => update((c) => applyControl(c, CUSTOM_CONTROL_ID))}>
          <span className="font-medium">Custom control</span>
          <span className="block text-sm text-muted">Any FANUC control — type its name and choose any PMC type.</span>
        </Choice>
        {groups.map((g) => (
          <section key={g.family}>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{g.family}</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((c) => (
                <Choice key={c.id} selected={config.controlId === c.id} onClick={() => update((cfg) => applyControl(cfg, c.id))}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{c.name}</span>
                    <Badge tone={c.series === 'T' ? 'accent' : c.series === 'M' ? 'success' : 'neutral'}>{c.series === 'TM' ? 'T/M' : c.series}</Badge>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">{c.pmc.map((p) => pmcById(p)?.name).join(' · ')}</span>
                </Choice>
              ))}
            </div>
          </section>
        ))}
        {!groups.length && <p className="py-8 text-center text-sm text-muted">No control matches “{q}”. Use Custom control.</p>}
      </div>
    </div>
  )
}
