import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Copy, Download, Eraser, FileText, LayoutGrid, Plus, Printer, Trash2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Callout, Card, Field, Input, Select, Sheet, Tabs } from '@/components/ui'
import { CARD_TEMPLATES, cardConnectors, cardTemplateById, makeCard, pinBytes, type PinKind } from '@/data/ioCards'
import { nextStart, type IoModuleInst, type ModuleRole } from '@/data/ioModules'
import { mopById } from '@/data/mopPresets'
import { cn, saveFile } from '@/lib/utils'
import { Choice, NumInput, StepHeader } from '../parts'
import { ApplyMop } from './ApplyMop'
import { ioCsv, ioHtml } from './exportIo'
import { MopPanel } from './MopPanel'
import { useCardsModel, type CardsModel } from './model'
import { PinPicker, type PinTarget } from './PinPicker'
import { cardUsage, PinTable } from './PinTable'

const nextId = (ms: IoModuleInst[]) => `m${ms.reduce((m, x) => Math.max(m, Number(x.id.slice(1)) || 0), 0) + 1}`
const range = (a: number, n: number, l: string) => (n > 0 ? `${l}${a}–${l}${a + n - 1}` : '—')


/** Renumber I/O Link groups 0..n keeping chain order (cards sharing a group keep sharing). */
function compactGroups(ms: IoModuleInst[]): IoModuleInst[] {
  const order = [...new Set(ms.map((x) => x.group ?? 0))].sort((a, b) => a - b)
  return ms.map((x) => ({ ...x, group: order.indexOf(x.group ?? 0) }))
}
/** Make one card the I/O Link master (group 0); everything else moves down one place in the chain. */
export function setMaster(ms: IoModuleInst[], id: string): IoModuleInst[] {
  const shifted = ms.map((x) => (x.id === id ? { ...x, group: -1 } : x))
  return compactGroups(shifted)
}
/** Make a card a slave: move it to the end of the chain (the next card becomes master if it was master). */
export function setSlave(ms: IoModuleInst[], id: string): IoModuleInst[] {
  const max = Math.max(...ms.map((x) => x.group ?? 0))
  return compactGroups(ms.map((x) => (x.id === id ? { ...x, group: max + 1 } : x)))
}

function ChainEditor({ m }: { m: CardsModel }) {
  const mods = [...m.config.modules].sort((a, b) => (a.group ?? 0) - (b.group ?? 0))
  if (mods.length < 2) return null
  return (
    <Card className="mb-4 p-3">
      <p className="text-sm font-semibold">I/O Link chain — choose the master</p>
      <p className="mt-0.5 text-xs text-muted">The master is the first I/O unit on the cable from the CNC (group 0). The rest are slaves (group 1, 2…) in cable order.</p>
      <div className="mt-3 space-y-2">
        {mods.map((card) => {
          const master = (card.group ?? 0) === 0
          return (
            <div key={card.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
              <Badge tone={master ? 'accent' : 'neutral'}>Group {card.group ?? 0}</Badge>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{card.name} <span className="font-normal text-muted">· {cardTemplateById(card.templateId)?.short ?? 'card'}</span></span>
              <div role="radiogroup" aria-label={`${card.name} role`} className="flex rounded-lg bg-surface-2 p-0.5">
                {(['master', 'slave'] as const).map((r) => (
                  <button key={r} type="button" role="radio" aria-checked={(r === 'master') === master}
                    onClick={() => m.update((c) => ({ ...c, modules: r === 'master' ? setMaster(c.modules, card.id) : setSlave(c.modules, card.id) }))}
                    className={cn('h-10 rounded-md px-3 text-sm font-medium capitalize text-muted sm:h-8', (r === 'master') === master && 'bg-bezel text-bezel-fg')}>{r}</button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function CardSettings({ card, onChange }: { card: IoModuleInst; onChange: (p: Partial<IoModuleInst>) => void }) {
  const t = cardTemplateById(card.templateId)
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      <Field label="Name" className="col-span-2"><Input value={card.name} onChange={(e) => onChange({ name: e.target.value })} /></Field>
      <Field label="Group"><NumInput value={card.group ?? 0} min={0} max={15} ariaLabel="I/O Link group" onCommit={(v) => onChange({ group: v ?? 0 })} /></Field>
      <Field label="Base"><NumInput value={card.base ?? 0} min={0} max={3} ariaLabel="Base" onCommit={(v) => onChange({ base: v ?? 0 })} /></Field>
      <Field label="Slot"><NumInput value={card.slot ?? 1} min={1} max={10} ariaLabel="Slot" onCommit={(v) => onChange({ slot: v ?? 1 })} /></Field>
      <Field label="Used for">
        <Select value={card.role} onChange={(e) => onChange({ role: e.target.value as ModuleRole })}>
          <option value="panel">Operator panel</option><option value="machine">Machine side</option><option value="any">Anything</option>
        </Select>
      </Field>
      <Field label="X start (Xm)"><NumInput value={card.xStart} min={0} max={9999} ariaLabel="X start byte" onCommit={(v) => onChange({ xStart: v ?? 0 })} /></Field>
      <Field label="Y start (Yn)"><NumInput value={card.yStart} min={0} max={9999} ariaLabel="Y start byte" onCommit={(v) => onChange({ yStart: v ?? 0 })} /></Field>
      <Field label="X bytes" hint="I/O Module size"><NumInput value={card.xBytes} min={0} max={128} ariaLabel="X bytes" onCommit={(v) => onChange({ xBytes: v ?? 0 })} /></Field>
      <Field label="Y bytes"><NumInput value={card.yBytes} min={0} max={128} ariaLabel="Y bytes" onCommit={(v) => onChange({ yBytes: v ?? 0 })} /></Field>
      {t?.kind === 'unitA' && <>
        <Field label="DI bytes fitted"><NumInput value={card.diBytes ?? 2} min={0} max={16} ariaLabel="DI bytes" onCommit={(v) => onChange({ diBytes: v ?? 0, xBytes: Math.max(card.xBytes, v ?? 0) })} /></Field>
        <Field label="DO bytes fitted"><NumInput value={card.doBytes ?? 2} min={0} max={16} ariaLabel="DO bytes" onCommit={(v) => onChange({ doBytes: v ?? 0, yBytes: Math.max(card.yBytes, v ?? 0) })} /></Field>
      </>}
    </div>
  )
}

function CustomConnectors({ card, onChange }: { card: IoModuleInst; onChange: (p: Partial<IoModuleInst>) => void }) {
  const conns = card.connectors ?? []
  const set = (i: number, c: { name: string; pins: PinKind[] }) => onChange({ connectors: conns.map((x, k) => (k === i ? c : x)) })
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-sm font-semibold">Connectors <span className="font-normal text-muted">— set the pin count here, then the type of each pin in the table below.</span></p>
      {conns.map((c, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          <Field label="Name" className="w-32"><Input value={c.name} onChange={(e) => set(i, { ...c, name: e.target.value.replace(/\//g, '-') })} /></Field>
          <Field label="Pins" className="w-24"><NumInput value={c.pins.length} min={1} max={100} ariaLabel="Pin count" onCommit={(v) => { const n = v ?? 1; set(i, { ...c, pins: n <= c.pins.length ? c.pins.slice(0, n) : [...c.pins, ...Array<PinKind>(n - c.pins.length).fill('DI')] }) }} /></Field>
          <Button size="icon" variant="ghost" className="text-muted hover:text-danger" aria-label="Remove connector" onClick={() => onChange({ connectors: conns.filter((_, k) => k !== i) })}><Trash2 /></Button>
        </div>
      ))}
      <Button size="sm" className="h-11 sm:h-9" onClick={() => onChange({ connectors: [...conns, { name: `CN${conns.length + 1}`, pins: ['0V', '24V', ...Array<PinKind>(8).fill('DI'), ...Array<PinKind>(8).fill('DO'), '24E'] }] })}><Plus />Connector</Button>
    </div>
  )
}

function CardPanel({ m, card, index, open, onToggle, onPick, onMop }: { m: CardsModel; card: IoModuleInst; index: number; open: boolean; onToggle: () => void; onPick: (t: PinTarget) => void; onMop: () => void }) {
  const t = cardTemplateById(card.templateId)
  const conns = cardConnectors(card)
  const mop = mopById(card.mopId)
  const tabs = [...(mop ? [{ value: '#panel', label: <span className="flex items-center gap-1.5"><LayoutGrid className="size-4" />Front panel</span> }] : []), ...conns.map((c) => ({ value: c.name, label: c.name }))]
  const [tab, setTab] = useState<string | null>(null)
  const cur = tab && tabs.some((x) => x.value === tab) ? tab : tabs[0]?.value
  const u = cardUsage(m, card, conns)
  const issues = m.issues.filter((i) => i.card === card.id && !i.pin)
  const n = m.config.modules.length
  const change = (p: Partial<IoModuleInst>) => m.update((c) => ({ ...c, modules: c.modules.map((x) => (x.id === card.id ? { ...x, ...p } : x)) }))
  const move = (d: number) => m.update((c) => { const ms = [...c.modules]; const j = index + d; if (j < 0 || j >= ms.length) return c; [ms[index], ms[j]] = [ms[j], ms[index]]; return { ...c, modules: ms } })
  const dup = () => m.update((c) => { const s = nextStart(c.modules); return { ...c, modules: [...c.modules, { ...card, id: nextId(c.modules), name: `${card.name} (copy)`, xStart: s.x, yStart: s.y, slot: (card.slot ?? 1) + 1, mopId: undefined }] } })
  const del = () => { if (n > 1 && confirm(`Delete ${card.name}? Its pin assignments are removed.`)) m.update((c) => ({ ...c, modules: c.modules.filter((x) => x.id !== card.id), pinMap: Object.fromEntries(Object.entries(c.pinMap ?? {}).filter(([k]) => !k.startsWith(`${card.id}/`))) })) }
  const clear = () => { if (confirm(`Clear all pin assignments of ${card.name}? Signals are then auto-assigned again.`)) m.update((c) => ({ ...c, modules: c.modules.map((x) => (x.id === card.id ? { ...x, mopId: undefined } : x)), pinMap: Object.fromEntries(Object.entries(c.pinMap ?? {}).filter(([k]) => !k.startsWith(`${card.id}/`))) })) }
  const setKind = (conn: string) => (sno: number, k: PinKind) => change({ connectors: (card.connectors ?? []).map((c) => (c.name === conn ? { ...c, pins: c.pins.map((x, i) => (i === sno - 1 ? k : x)) } : c)) })

  return (
    <Card className={cn('min-w-0 overflow-hidden', issues.length > 0 && 'border-warning/50')}>
      <div className="flex items-start gap-2 p-3">
        <button onClick={onToggle} aria-expanded={open} className="flex min-h-11 min-w-0 flex-1 items-start gap-2 text-left">
          <ChevronDown className={cn('mt-1 size-5 shrink-0 text-muted transition-transform', !open && '-rotate-90')} />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-1.5"><span className="font-semibold">{card.name}</span>{mop && <Badge tone="accent">{mop.name}</Badge>}{!t && <Badge tone="warning">No pin table</Badge>}</span>
            <span className="block text-sm text-muted">{t?.short ?? 'I/O Module'} · base {card.base ?? 0} · slot {card.slot ?? 1}</span>
            <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs text-muted">
              <span>{range(card.xStart, card.xBytes, 'X')}</span><span>{range(card.yStart, card.yBytes, 'Y')}</span>
              {t && <span className="font-sans">DI {u.diUsed}/{u.di} used · DO {u.doUsed}/{u.do} used</span>}
            </span>
          </span>
        </button>
        {t && conns.length > 0 && <Button size="sm" variant="primary" className="h-11 shrink-0 sm:h-9" onClick={onMop}><Wand2 />Apply MOP</Button>}
      </div>
      {open && (
        <div className="space-y-3 border-t border-border p-3">
          {issues.map((i) => <Callout key={i.text} tone="warning">{i.text}</Callout>)}
          {!t && (
            <Field label="Card type" hint="Pick a card template to get its connectors and pin table.">
              <Select value="" onChange={(e) => { const nt = cardTemplateById(e.target.value)!; change({ templateId: nt.id, ...(nt.kind === 'unitA' ? { diBytes: 4, doBytes: 4 } : {}), ...(nt.kind === 'custom' ? { connectors: makeCard(nt.id, card.id).connectors } : {}) }) }}>
                <option value="" disabled>Choose…</option>{CARD_TEMPLATES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </Field>
          )}
          <details className="group rounded-lg border border-border" open={!t}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-4 text-muted transition-transform group-not-open:-rotate-90" />Card settings
              <span className="hidden truncate font-normal text-muted sm:inline">· group {card.group ?? 0} · base {card.base ?? 0} · slot {card.slot ?? 1} · Xm = X{card.xStart} · Yn = Y{card.yStart}</span>
            </summary>
            <div className="space-y-2 border-t border-border p-3">
              <CardSettings card={card} onChange={change} />
              {t && <p className="text-xs text-muted">{t.desc} {t.note}</p>}
            </div>
          </details>
          {t?.kind === 'custom' && <CustomConnectors card={card} onChange={change} />}
          {tabs.length > 0 && (
            <div className="min-w-0">
              <Tabs items={tabs} value={cur!} onChange={setTab} />
              <div className="mt-2">
                {cur === '#panel' && mop ? <MopPanel m={m} card={card} preset={mop} onPick={onPick} />
                  : conns.filter((c) => c.name === cur).map((c) => <PinTable key={c.name} m={m} card={card} conn={c} onPick={onPick} onKind={t?.kind === 'custom' ? setKind(c.name) : undefined} />)}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
            <Button size="sm" variant="ghost" className="h-11 sm:h-9" onClick={() => move(-1)} disabled={index === 0}><ArrowUp />Up</Button>
            <Button size="sm" variant="ghost" className="h-11 sm:h-9" onClick={() => move(1)} disabled={index === n - 1}><ArrowDown />Down</Button>
            <Button size="sm" variant="ghost" className="h-11 sm:h-9" onClick={dup}><Copy />Duplicate</Button>
            {t && <Button size="sm" variant="ghost" className="h-11 sm:h-9" onClick={clear}><Eraser />Clear pins</Button>}
            <Button size="sm" variant="ghost" className="ml-auto h-11 text-danger sm:h-9" onClick={del} disabled={n <= 1}><Trash2 />Delete</Button>
          </div>
        </div>
      )}
    </Card>
  )
}

export function StepCards() {
  const m = useCardsModel()
  const mods = m.config.modules
  const [open, setOpen] = useState<Set<string>>(() => new Set(mods.filter((x) => x.role === 'panel').slice(0, 1).map((x) => x.id)))
  const [adding, setAdding] = useState(false)
  const [mopFor, setMopFor] = useState<string | null>(null)
  const [pick, setPick] = useState<PinTarget | null>(null)
  const groups = [...new Set(mods.map((x) => x.group ?? 0))].sort((a, b) => a - b)
  const general = m.issues.filter((i) => !i.card || i.pin)
  const pinned = Object.keys(m.config.pinMap ?? {}).length

  const add = (tid: string) => {
    const t = cardTemplateById(tid)!
    const id = nextId(mods)
    m.update((c) => {
      const s = nextStart(c.modules)
      const card = makeCard(tid, id, { xStart: s.x, yStart: s.y, group: c.modules.length ? Math.max(...c.modules.map((x) => x.group ?? 0)) + 1 : 0 })
      const pb = pinBytes(card)
      return { ...c, modules: [...c.modules, { ...card, xBytes: Math.max(card.xBytes, pb.x), yBytes: Math.max(card.yBytes, pb.y) }] }
    })
    setOpen((o) => new Set([...o, id]))
    setAdding(false)
    toast.success(`Added ${t.short}`)
  }
  const title = m.config.name.trim() || 'PMC project'
  const file = title.replace(/[^\w-]+/g, '_')

  return (
    <div>
      <StepHeader title="I/O cards" text={<>Your I/O Modules by I/O Link group. Tap a pin to choose its function, or <b className="text-fg">Apply MOP</b> to fill a whole panel at once. Pins left free are filled automatically.</>}
        right={<div className="flex flex-wrap gap-2">
          <Button onClick={async () => { await saveFile(ioCsv(m.config, m.rows), `${file}_io.csv`, 'text/csv') }}><Download />CSV</Button>
          <Button onClick={async () => { await saveFile(ioHtml(m.config, m.rows, title), `${file}_io.html`, 'text/html') }}><FileText />IO sheet</Button>
          <Button className="hidden sm:inline-flex" onClick={() => { const w = window.open('', '_blank'); if (w) { w.document.write(ioHtml(m.config, m.rows, title)); w.document.close() } }}><Printer />Print</Button>
          <Button variant="primary" onClick={() => setAdding(true)}><Plus />Add I/O card</Button>
        </div>} />

      {general.length > 0 ? (
        <div className="mb-4"><Callout tone="warning" title={`${general.length} I/O card note${general.length > 1 ? 's' : ''}`}><ul className="mt-1 list-disc space-y-0.5 pl-4">{general.slice(0, 8).map((i) => <li key={i.text}>{i.text}</li>)}</ul></Callout></div>
      ) : (
        <div className="mb-4"><Callout title={`${mods.length} I/O card${mods.length > 1 ? 's' : ''} · ${pinned} pin${pinned === 1 ? '' : 's'} assigned`}>No overlapping addresses. Typical pin layouts — verify against the FANUC connection manual for your module.</Callout></div>
      )}

      <ChainEditor m={m} />

      <div className="space-y-5">
        {groups.map((gr) => (
          <section key={gr}>
            <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold"><span>Group {gr} — {gr === 0 ? 'master' : 'slave'}</span><span className="text-xs font-normal text-muted">I/O Link</span></h3>
            <div className="space-y-2">
              {mods.map((card, i) => ((card.group ?? 0) === gr ? (
                <CardPanel key={card.id} m={m} card={card} index={i} open={open.has(card.id)} onPick={setPick} onMop={() => setMopFor(card.id)}
                  onToggle={() => setOpen((o) => { const n = new Set(o); if (n.has(card.id)) n.delete(card.id); else n.add(card.id); return n })} />
              ) : null))}
            </div>
          </section>
        ))}
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add I/O card" subtitle="Pick the module type. You can change group, base, slot and start addresses afterwards.">
        <div className="space-y-2">
          {CARD_TEMPLATES.map((t) => (
            <Choice key={t.id} selected={false} onClick={() => add(t.id)}>
              <span className="block font-medium">{t.name}</span>
              <span className="block text-sm text-muted">{t.desc}</span>
            </Choice>
          ))}
        </div>
      </Sheet>
      {mopFor && mods.find((x) => x.id === mopFor) && <ApplyMop m={m} card={mods.find((x) => x.id === mopFor)!} onClose={() => { setOpen((o) => new Set([...o, mopFor])); setMopFor(null) }} />}
      <PinPicker m={m} target={pick} onClose={() => setPick(null)} />
    </div>
  )
}
