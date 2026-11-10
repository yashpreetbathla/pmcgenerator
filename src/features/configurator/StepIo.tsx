import { memo, useMemo, useState } from 'react'
import { Lock, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Callout, Card, Field, Input, Select, Tabs } from '@/components/ui'
import { IO_MODULE_TYPES, moduleTypeById, nextStart, type IoModuleInst, type ModuleRole } from '@/data/ioModules'
import { RESERVED_X_BYTES, pmcOf, planIo, validateIo, type IoOverride, type IoRow } from '@/core/generator'
import { cn } from '@/lib/utils'
import { useWizard } from './store'
import { NumInput, SearchBox, StepHeader } from './parts'

function ModuleRow({ m, onChange, onRemove, canRemove }: { m: IoModuleInst; onChange: (m: IoModuleInst) => void; onRemove: () => void; canRemove: boolean }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex gap-2">
        <Input value={m.name} onChange={(e) => onChange({ ...m, name: e.target.value })} aria-label="I/O Module name" className="font-medium" />
        <Button size="icon" variant="ghost" className="shrink-0 text-muted hover:text-danger" onClick={onRemove} disabled={!canRemove} aria-label="Remove I/O Module"><Trash2 /></Button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
        <Field label="Module" className="col-span-2">
          <Select value={m.typeId} onChange={(e) => { const t = moduleTypeById(e.target.value); onChange({ ...m, typeId: t.id, xBytes: t.xBytes, yBytes: t.yBytes }) }}>
            {IO_MODULE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Used for" className="col-span-2 sm:col-span-1">
          <Select value={m.role} onChange={(e) => onChange({ ...m, role: e.target.value as ModuleRole })}>
            <option value="machine">Machine side</option>
            <option value="panel">Operator panel</option>
            <option value="any">Anything</option>
          </Select>
        </Field>
        <Field label="X start"><NumInput value={m.xStart} min={0} max={9999} ariaLabel="X start byte" onCommit={(v) => onChange({ ...m, xStart: v ?? 0 })} /></Field>
        <Field label="X bytes"><NumInput value={m.xBytes} min={0} max={128} ariaLabel="X bytes" onCommit={(v) => onChange({ ...m, xBytes: v ?? 0 })} /></Field>
        <Field label="Y start / bytes" className="col-span-2 sm:col-span-1">
          <div className="flex gap-1.5">
            <NumInput value={m.yStart} min={0} max={9999} ariaLabel="Y start byte" onCommit={(v) => onChange({ ...m, yStart: v ?? 0 })} />
            <NumInput value={m.yBytes} min={0} max={128} ariaLabel="Y bytes" onCommit={(v) => onChange({ ...m, yBytes: v ?? 0 })} />
          </div>
        </Field>
      </div>
      <p className="mt-2 text-xs text-muted tabular">X{m.xStart}–X{m.xStart + m.xBytes - 1} · Y{m.yStart}–Y{m.yStart + m.yBytes - 1}</p>
    </div>
  )
}

const SignalRow = memo(function SignalRow({ row, error, onSet }: { row: IoRow; error?: string; onSet: (id: string, p: IoOverride) => void }) {
  const commit = (field: keyof IoOverride, v: string, current: string) => { if (v.trim() !== current) onSet(row.id, { [field]: v.trim() }) }
  return (
    <div className={cn('grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-b border-border px-3 py-2.5 last:border-0 sm:grid-cols-[6.5rem_10rem_minmax(0,1fr)_12rem] sm:items-center', error && 'bg-danger-soft/50')}>
      <div className="relative">
        <Input key={row.address} defaultValue={row.address} aria-label={`${row.symbol} address`} className={cn('font-mono uppercase', error && 'border-danger', row.overridden && 'border-accent')}
          onBlur={(e) => commit('address', e.target.value.toUpperCase(), row.address)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
        {row.fixed && row.address === row.fixed && <Lock className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted" aria-label="Standard fixed address" />}
      </div>
      <Input key={`s${row.symbol}`} defaultValue={row.symbol} aria-label="Symbol" maxLength={16} className="font-mono"
        onBlur={(e) => commit('symbol', e.target.value.toUpperCase(), row.symbol)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      <Input key={`c${row.comment}`} defaultValue={row.comment} aria-label="Comment" className="col-span-2 sm:col-span-1"
        onBlur={(e) => commit('comment', e.target.value, row.comment)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      <div className="col-span-2 flex min-w-0 items-center gap-1.5 sm:col-span-1">
        <span className="truncate text-xs text-muted" title={row.group}>{row.group}</span>
        {row.side === 'panel' && <Badge className="shrink-0">Panel</Badge>}
      </div>
      {error && <p className="col-span-2 text-xs font-medium text-danger sm:col-span-4">{error}</p>}
    </div>
  )
})

export function StepIo() {
  const { config, update } = useWizard()
  const [dir, setDir] = useState<'X' | 'Y'>('X')
  const [q, setQ] = useState('')
  const [onlyErr, setOnlyErr] = useState(false)
  const pmc = pmcOf(config)
  const rows = useMemo(() => planIo(config), [config])
  const errors = useMemo(() => validateIo(rows, pmc), [rows, pmc])
  const errCount = Object.keys(errors).length

  const shown = rows.filter((r) => r.dir === dir && (!onlyErr || errors[r.id]) && (!q || `${r.address} ${r.symbol} ${r.comment} ${r.group}`.toLowerCase().includes(q.toLowerCase())))
  const setOverride = (id: string, p: IoOverride) => update((c) => {
    const o = { ...c.overrides[id], ...p }
    for (const k of Object.keys(o) as (keyof IoOverride)[]) if (o[k] === '') delete o[k]
    const overrides = { ...c.overrides }
    if (Object.keys(o).length) overrides[id] = o; else delete overrides[id]
    return { ...c, overrides }
  })
  const reassign = () => {
    update((c) => ({ ...c, overrides: Object.fromEntries(Object.entries(c.overrides).map(([k, v]) => [k, { ...v, address: undefined }]).filter(([, v]) => (v as IoOverride).symbol || (v as IoOverride).comment)) }))
    toast.success('Addresses re-assigned automatically')
  }
  const setModules = (fn: (m: IoModuleInst[]) => IoModuleInst[]) => update((c) => ({ ...c, modules: fn(c.modules) }))
  const addModule = () => setModules((ms) => {
    const n = nextStart(ms)
    const t = moduleTypeById('conn-ext')
    const id = `m${ms.reduce((m, x) => Math.max(m, Number(x.id.slice(1)) || 0), 0) + 1}`
    return [...ms, { id, typeId: t.id, name: `I/O Module ${ms.length + 1}`, role: 'any', xStart: n.x, yStart: n.y, xBytes: t.xBytes, yBytes: t.yBytes }]
  })
  const nX = rows.filter((r) => r.dir === 'X').length, nY = rows.length - nX

  return (
    <div>
      <StepHeader title="I/O assignment" text="Every signal got an address automatically. Edit any address, symbol tag or comment — or leave it as is."
        right={<Button onClick={reassign}><RefreshCw />Re-assign automatically</Button>} />

      <Card className="mb-5 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">I/O Modules</h3>
            <p className="text-sm text-muted">Operator panel signals go to the panel module, sensors and valves to the machine side. X{RESERVED_X_BYTES.join(', X')} stay free for fixed CNC inputs.</p>
          </div>
          <Button size="sm" className="h-11 shrink-0 sm:h-9" onClick={addModule}><Plus />Module</Button>
        </div>
        <div className="space-y-2">
          {config.modules.map((m) => (
            <ModuleRow key={m.id} m={m} canRemove={config.modules.length > 1} onChange={(x) => setModules((ms) => ms.map((y) => (y.id === m.id ? x : y)))} onRemove={() => setModules((ms) => ms.filter((y) => y.id !== m.id))} />
          ))}
        </div>
      </Card>

      {errCount > 0 ? (
        <div className="mb-3"><Callout tone="warning" title={`${errCount} signal${errCount > 1 ? 's need' : ' needs'} attention`}>
          Duplicate or invalid addresses are highlighted. <button className="font-semibold text-accent underline" onClick={() => setOnlyErr((v) => !v)}>{onlyErr ? 'Show all' : 'Show only problems'}</button>
        </Callout></div>
      ) : (
        <div className="mb-3"><Callout title="All addresses valid">{nX} inputs and {nY} outputs, no duplicates.</Callout></div>
      )}

      <div className="sticky top-14 z-10 -mx-1 mb-2 space-y-2 bg-bg/95 px-1 py-2 backdrop-blur">
        <Tabs items={[{ value: 'X', label: 'Inputs (X)', count: nX }, { value: 'Y', label: 'Outputs (Y)', count: nY }]} value={dir} onChange={setDir} />
        <SearchBox value={q} onChange={setQ} placeholder="Search address, symbol, comment…" />
      </div>

      <Card className="overflow-hidden">
        <div className="hidden grid-cols-[6.5rem_10rem_minmax(0,1fr)_12rem] gap-2 border-b border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-muted sm:grid">
          <span>Address</span><span>Symbol</span><span>Comment</span><span>Function</span>
        </div>
        {shown.map((r) => <SignalRow key={r.id} row={r} error={errors[r.id]} onSet={setOverride} />)}
        {!shown.length && <p className="p-6 text-center text-sm text-muted">No signals.</p>}
      </Card>
    </div>
  )
}
