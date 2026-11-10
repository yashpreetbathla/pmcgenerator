import { useMemo, useState } from 'react'
import { Ban, Check, RotateCcw, Tag } from 'lucide-react'
import { Badge, Button, Input, Sheet } from '@/components/ui'
import { pinText, resolveAccessories, type IoRow, type PinRef } from '@/core/generator'
import type { PinKind } from '@/data/ioCards'
import { PANEL_FUNCS } from '@/data/panelFunctions'
import { cn } from '@/lib/utils'
import { SearchBox } from '../parts'
import type { CardsModel } from './model'

export interface PinTarget { key: string; kind: PinKind; address?: string; ref: PinRef; label?: string }

/** Function picker for one pin: any planned signal of the right direction, extra panel functions, spare label, not used, free. */
export function PinPicker({ m, target, onClose }: { m: CardsModel; target: PinTarget | null; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [label, setLabel] = useState<string | null>(null)
  const dir = target?.kind === 'DI' ? 'X' : 'Y'
  const pa = target ? m.config.pinMap?.[target.key] : undefined
  const here = target?.address ? m.byAddr.get(target.address) : undefined

  const sel = useMemo(() => new Set(resolveAccessories(m.config.accessories).list.map((a) => a.id)), [m.config.accessories])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    const hit = (t: string) => !s || t.toLowerCase().includes(s)
    const role = m.config.modules.find((x) => x.id === target?.ref.card)?.role
    const rank = (r: IoRow) => (r.id === here?.id ? 0 : role && role !== 'any' && r.side === role ? 1 : 2)
    const sig = m.rows.filter((r) => r.dir === dir && !r.id.startsWith('pin.') && hit(`${r.symbol} ${r.comment} ${r.group} ${r.address}`)).map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map((x) => x.r)
    const have = new Set(m.rows.map((r) => r.id))
    const extra = PANEL_FUNCS.filter((f) => (f.requires ?? []).every((r) => sel.has(r))).flatMap((f) => {
      const d = f.define({ axes: m.config.axes, paths: m.config.paths, p: () => 0 })
      return (dir === 'X' ? d.inputs : d.outputs).map((x) => ({ id: `${f.id}.${x.key}`, symbol: x.key, comment: x.comment, group: f.name }))
    }).filter((x) => !have.has(x.id) && hit(`${x.symbol} ${x.comment} ${x.group}`))
    return { sig, extra }
  }, [m.rows, m.config.axes, m.config.paths, m.config.modules, dir, q, sel, target?.ref.card, here?.id])

  if (!target) return null
  const close = () => { setQ(''); setLabel(null); onClose() }
  const pick = (sig: string) => { m.setPin(target.key, { sig, ...(pa?.label ? { label: pa.label } : {}) }); close() }
  const where = (r: IoRow) => (r.pin && r.pin.key !== target.key ? `${r.address} · ${r.pin.cardName} ${r.pin.conn}/${r.pin.sno}` : r.address)

  return (
    <Sheet open onClose={close} wide
      title={<span className="flex flex-wrap items-center gap-2">{target.ref.conn} · S.No {target.ref.sno}{target.ref.name && <span className="text-muted">({target.ref.name})</span>}<span className="font-mono text-link">{target.address}</span></span>}
      subtitle={<>{target.ref.cardName} · {target.kind === 'DI' ? 'input' : 'output'} pin{pa?.label ? <> · sheet label <b className="text-fg">{pa.label}</b></> : null}</>}>
      <div className="grid gap-2 sm:grid-cols-3">
        <Button className="h-12 justify-start" onClick={() => { m.setPin(target.key, undefined); close() }}><RotateCcw />Free (auto-assign)</Button>
        <Button className="h-12 justify-start" onClick={() => setLabel(pa?.label ?? '')}><Tag />Spare / custom label…</Button>
        <Button className="h-12 justify-start" onClick={() => { m.setPin(target.key, { none: true, ...(pa?.label ? { label: pa.label } : {}) }); close() }}><Ban />Not used (dummy)</Button>
      </div>
      {label !== null && (
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); m.setPin(target.key, { label: label.trim() || (dir === 'X' ? 'SPARE INPUT' : 'SPARE OUTPUT') }); close() }}>
          <Input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. IN/SP 4 or CONTROL ON" aria-label="Custom label" />
          <Button type="submit" variant="primary" className="shrink-0">Save</Button>
        </form>
      )}
      <div className="sticky top-0 z-10 -mx-4 mt-3 bg-surface px-4 py-2"><SearchBox value={q} onChange={setQ} placeholder={`Search ${dir === 'X' ? 'input' : 'output'} signals…`} /></div>
      <ul className="divide-y divide-border">
        {list.sig.map((r) => {
          const cur = here?.id === r.id
          return (
            <li key={r.id}>
              <button onClick={() => pick(r.id)} className={cn('flex min-h-12 w-full flex-wrap items-center gap-x-3 px-1 py-2 text-left hover:bg-surface-2 sm:flex-nowrap', cur && 'bg-accent-soft/60')}>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5"><span className="font-mono text-sm font-semibold">{r.symbol}</span>{cur && <Badge tone="accent"><Check className="size-3" />On this pin</Badge>}{r.pinned && !cur && <Badge>Pinned</Badge>}</span>
                  <span className="block truncate text-sm text-muted">{r.comment} · {r.group}</span>
                </span>
                <span className="w-full font-mono text-xs text-muted sm:w-auto sm:shrink-0 sm:text-right">{where(r)}</span>
              </button>
            </li>
          )
        })}
        {list.extra.length > 0 && <li className="pt-3 pb-1 text-xs font-semibold text-muted">More panel functions</li>}
        {list.extra.map((x) => (
          <li key={x.id}>
            <button onClick={() => pick(x.id)} className="flex min-h-12 w-full items-center gap-3 px-1 py-2 text-left hover:bg-surface-2">
              <span className="min-w-0 flex-1"><span className="font-mono text-sm font-semibold">{x.symbol}</span><span className="block truncate text-sm text-muted">{x.comment} · {x.group}</span></span>
              <Badge tone="accent">Add</Badge>
            </button>
          </li>
        ))}
        {!list.sig.length && !list.extra.length && <li className="py-6 text-center text-sm text-muted">No signals match. Use “Spare / custom label”.</li>}
      </ul>
      {here?.pin && pa?.sig && <p className="mt-2 text-xs text-muted">Currently {here.symbol} at {pinText(here.pin)}.</p>}
    </Sheet>
  )
}
