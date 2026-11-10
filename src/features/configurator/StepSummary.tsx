import { useMemo, type ReactNode } from 'react'
import { Badge, Callout, Card, Field, Input } from '@/components/ui'
import { generateProject, pmcOf, controlName, resolveAccessories } from '@/core/generator'
import { machineById } from '@/data/machineTypes'
import { mopById } from '@/data/mopPresets'
import { DRAFT_NOTICE } from '@/lib/utils'
import { useWizard } from './store'
import { StepHeader } from './parts'

export function useProjectPreview() {
  const config = useWizard((s) => s.config)
  return useMemo(() => generateProject(config, { id: 'preview', now: 0 }), [config])
}

export function StepSummary({ onGo }: { onGo: (step: number) => void }) {
  const { config, update } = useWizard()
  const p = useProjectPreview()
  const { list } = useMemo(() => resolveAccessories(config.accessories), [config.accessories])
  const nX = p.symbols.filter((s) => s.address.startsWith('X')).length
  const nY = p.symbols.filter((s) => s.address.startsWith('Y')).length
  const mcodes = p.symbols.filter((s) => s.group === 'M-code decode' && /^M\d+$/.test(s.symbol)).map((s) => s.symbol)
  const notes = p.warnings.slice(2)
  const nAl = p.messages.filter((m) => m.kind === 'alarm').length
  const nOp = p.messages.length - nAl
  const aBytes = p.messages.reduce((m, x) => Math.max(m, Number(x.address.slice(1).split('.')[0]) + 1), 0)

  const rows: [string, ReactNode, number][] = [
    ['Control', controlName(config), 0],
    ['PMC type', pmcOf(config).name, 0],
    ['Machine', `${machineById(config.machineId).name} · axes ${config.axes.join(' ') || '—'}${config.paths > 1 ? ` · ${config.paths} paths` : ''}`, 1],
    ['Options', `${list.length} selected${config.customDevices.length ? ` + ${config.customDevices.length} custom device${config.customDevices.length > 1 ? 's' : ''}` : ''}`, 2],
    ['I/O cards', `${config.modules.length} I/O Module${config.modules.length > 1 ? 's' : ''} · ${Object.keys(config.pinMap ?? {}).length} pins assigned${config.modules.some((m) => m.mopId) ? ` · MOP ${config.modules.filter((m) => m.mopId).map((m) => mopById(m.mopId)?.name).join(', ')}` : ''}`, 4],
    ['I/O', `${nX} inputs (X) · ${nY} outputs (Y)`, 5],
    ['Messages', p.messages.length ? `${nAl} alarm${nAl === 1 ? '' : 's'} (1001…) · ${nOp} operator (2001…) · A0–A${aBytes - 1}` : 'None', 2],
  ]

  return (
    <div>
      <StepHeader title="Summary" text="Name your project and generate the ladder. You can open it in the viewer straight away." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <Field label="Project name (Title)">
              <Input value={config.name} onChange={(e) => update((c) => ({ ...c, name: e.target.value }))} placeholder={`${machineById(config.machineId).name} — ${controlName(config)}`} />
            </Field>
            <Field label="Machine builder">
              <Input value={config.builder ?? ''} onChange={(e) => update((c) => ({ ...c, builder: e.target.value }))} placeholder="Optional" />
            </Field>
            <Field label="Memo">
              <Input value={config.memo ?? ''} onChange={(e) => update((c) => ({ ...c, memo: e.target.value }))} placeholder="Optional — machine number, customer…" />
            </Field>
          </Card>
          <Card className="divide-y divide-border">
            {rows.map(([k, v, step]) => (
              <button key={k} onClick={() => onGo(step)} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-2">
                <span className="text-sm text-muted">{k}</span>
                <span className="min-w-0 truncate text-right text-sm font-medium">{v}</span>
              </button>
            ))}
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="p-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              {[['Nets', p.stats.nets], ['Symbols', p.symbols.length], ['Messages', p.messages.length]].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-surface-2 py-3"><p className="tabular text-xl font-semibold">{v}</p><p className="text-xs text-muted">{k}</p></div>
              ))}
            </div>
            {mcodes.length > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 text-xs font-semibold text-muted">M-codes handled</p>
                <div className="flex flex-wrap gap-1">{mcodes.map((m) => <Badge key={m} tone="accent">{m}</Badge>)}</div>
              </div>
            )}
          </Card>
          {notes.length > 0 && (
            <Callout tone="warning" title={`${notes.length} note${notes.length > 1 ? 's' : ''} to check`}>
              <ul className="mt-1 list-disc space-y-1 pl-4">{notes.map((w) => <li key={w}>{w}</li>)}</ul>
            </Callout>
          )}
          <Callout tone="warning" title="Draft">{DRAFT_NOTICE}</Callout>
        </div>
      </div>
    </div>
  )
}
