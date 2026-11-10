import { memo, useMemo, useState } from 'react'
import { Cpu, Lock, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Callout, Card, Input, Tabs } from '@/components/ui'
import { RESERVED_X_BYTES, pinText, pmcOf, planIo, validateIo, type IoOverride, type IoRow } from '@/core/generator'
import { cn } from '@/lib/utils'
import { useWizard } from './store'
import { SearchBox, StepHeader } from './parts'

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
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs text-muted" title={row.group}>{row.group}</span>
          {row.side === 'panel' && <Badge className="shrink-0">Panel</Badge>}
        </div>
        {row.pin
          ? <span className={cn('block truncate font-mono text-[11px]', row.pinned ? 'text-link' : 'text-muted')} title={`${row.pin.cardName} · ${pinText(row.pin)}`}>{row.pin.cardName} · {row.pin.conn}/{row.pin.sno}{row.pin.name ? ` (${row.pin.name})` : ''}</span>
          : <span className="block text-[11px] text-muted">No card pin</span>}
      </div>
      {error && <p className="col-span-2 text-xs font-medium text-danger sm:col-span-4">{error}</p>}
    </div>
  )
})

export function StepIo({ onGo }: { onGo?: (step: number) => void } = {}) {
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
  const nX = rows.filter((r) => r.dir === 'X').length, nY = rows.length - nX

  return (
    <div>
      <StepHeader title="I/O assignment" text="Every signal got an address automatically. Edit any address, symbol tag or comment — or leave it as is."
        right={<Button onClick={reassign}><RefreshCw />Re-assign automatically</Button>} />

      <Card className="mb-5 flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">I/O cards</h3>
          <p className="text-sm text-muted">{config.modules.map((m) => `${m.name} (X${m.xStart}/Y${m.yStart})`).join(' · ')}. X{RESERVED_X_BYTES.join(', X')} stay free for fixed CNC inputs.</p>
        </div>
        {onGo && <Button className="shrink-0" onClick={() => onGo(4)}><Cpu />Edit I/O cards</Button>}
      </Card>

      {errCount > 0 ? (
        <div className="mb-3"><Callout tone="warning" title={`${errCount} signal${errCount > 1 ? 's need' : ' needs'} attention`}>
          Duplicate or invalid addresses are highlighted. <button className="font-semibold text-link underline" onClick={() => setOnlyErr((v) => !v)}>{onlyErr ? 'Show all' : 'Show only problems'}</button>
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
          <span>Address</span><span>Symbol</span><span>Comment</span><span>Function · card pin</span>
        </div>
        {shown.map((r) => <SignalRow key={r.id} row={r} error={errors[r.id]} onSet={setOverride} />)}
        {!shown.length && <p className="p-6 text-center text-sm text-muted">No signals.</p>}
      </Card>
    </div>
  )
}
