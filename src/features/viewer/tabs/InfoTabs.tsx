import { useDeferredValue, useMemo, useState } from 'react'
import { MessageSquare, Settings2, Tags } from 'lucide-react'
import { Badge, Button, Callout, Card, Empty } from '@/components/ui'
import type { PmcProject } from '@/core/types'
import { cn } from '@/lib/utils'
import { Chips, SearchBox } from '../shared'
import type { ProjectIndex } from '../useProjectIndex'

/* ---------------- Title ---------------- */

export function TitleTab({ p }: { p: PmcProject }) {
  const i = p.info
  const rows: [string, string | undefined][] = [
    ['Builder', i.builder], ['Machine', i.machine], ['CNC control', i.control], ['PMC type', i.pmcType],
    ['Ladder version', i.ladderVersion], ['Date', i.date], ['File name', i.fileName],
    ['File size', i.fileSize ? `${(i.fileSize / 1024).toFixed(1)} KB` : undefined],
    ['Added on this device', new Date(p.createdAt).toLocaleString()],
  ]
  return (
    <div className="space-y-3">
      <Card className="p-4">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted">{k}</dt>
              <dd className={cn('mt-0.5 break-words', !v && 'text-muted')}>{v || '—'}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 border-t border-border pt-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">Memo</dt>
          <dd className={cn('mt-0.5 whitespace-pre-wrap break-words text-sm', !i.memo && 'text-muted')}>{i.memo || '—'}</dd>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[['Nets', p.stats.nets], ['Instructions', p.stats.instructions], ['Symbols', p.symbols.length], ['Messages', p.messages.length]].map(([k, v]) => (
          <Card key={k} className="p-3"><p className="text-xs text-muted">{k}</p><p className="text-xl font-semibold tabular">{v}</p></Card>
        ))}
      </div>
      {p.warnings.length > 0 && (
        <Callout tone="warning" title="Notes from the decoder">
          <ul className="list-disc pl-4">{p.warnings.map((w, k) => <li key={k}>{w}</li>)}</ul>
        </Callout>
      )}
    </div>
  )
}

/* ---------------- Symbol Comment ---------------- */

const SYM_PAGE = 150
const AREA_ORDER = 'XYFGRAKDTCEMNLPVUW'

export function SymbolsTab({ p, idx, onAddress }: { p: PmcProject; idx: ProjectIndex; onAddress: (a: string) => void }) {
  const [q, setQ] = useState('')
  const [area, setArea] = useState('all')
  const [n, setN] = useState(SYM_PAGE)
  const dq = useDeferredValue(q.trim().toUpperCase())
  const areas = useMemo(() => {
    const c = new Map<string, number>()
    for (const s of p.symbols) { const a = s.address[0]; c.set(a, (c.get(a) ?? 0) + 1) }
    return [...c].sort((a, b) => AREA_ORDER.indexOf(a[0]) - AREA_ORDER.indexOf(b[0]))
  }, [p.symbols])
  const list = useMemo(() => p.symbols.filter((s) => (area === 'all' || s.address[0] === area) &&
    (!dq || s.address.includes(dq) || s.symbol.toUpperCase().includes(dq) || s.comment.toUpperCase().includes(dq))), [p.symbols, area, dq])

  if (!p.symbols.length) return <Empty icon={<Tags />} title="No symbols" text="This project has no symbol comments." />
  const shown = list.slice(0, n)
  return (
    <div className="space-y-3">
      <SearchBox value={q} onChange={(v) => { setQ(v); setN(SYM_PAGE) }} placeholder="Search address, symbol or comment" />
      <Chips value={area} onChange={(v) => { setArea(v); setN(SYM_PAGE) }} items={[{ value: 'all', label: 'All', count: p.symbols.length }, ...areas.map(([a, c]) => ({ value: a, label: a, count: c }))]} />
      <p className="text-xs text-muted tabular">{list.length} symbols</p>
      {!list.length ? <Empty title="Nothing found" text="Try a different search or area." /> : (
        <>
          {/* phone: stacked cards */}
          <ul className="space-y-2 md:hidden">
            {shown.map((s) => (
              <li key={s.address}>
                <button type="button" onClick={() => onAddress(s.address)} className="w-full rounded-xl border border-border bg-surface p-3 text-left active:bg-surface-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono font-semibold">{s.address}</span>
                    <span className="min-w-0 truncate font-mono text-sm text-accent">{s.symbol}</span>
                    {!idx.used.has(s.address) && <Badge className="ml-auto">unused</Badge>}
                  </div>
                  {s.comment && <p className="mt-1 text-sm text-muted">{s.comment}</p>}
                </button>
              </li>
            ))}
          </ul>
          {/* desktop: table */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                <tr><th className="w-28 px-3 py-2 font-medium">Address</th><th className="w-44 px-3 py-2 font-medium">Symbol</th><th className="px-3 py-2 font-medium">Comment</th><th className="w-20 px-3 py-2" /></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((s) => (
                  <tr key={s.address} onClick={() => onAddress(s.address)} className="cursor-pointer hover:bg-surface-2">
                    <td className="px-3 py-2 font-mono font-medium">{s.address}</td>
                    <td className="truncate px-3 py-2 font-mono text-accent">{s.symbol}</td>
                    <td className="px-3 py-2 text-muted">{s.comment}</td>
                    <td className="px-3 py-2 text-right">{!idx.used.has(s.address) && <Badge>unused</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {list.length > n && <Button className="w-full" onClick={() => setN(n + SYM_PAGE * 2)}>Show more ({list.length - n} left)</Button>}
        </>
      )}
    </div>
  )
}

/* ---------------- Message ---------------- */

export function MessagesTab({ p, onAddress }: { p: PmcProject; onAddress: (a: string) => void }) {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<'all' | 'alarm' | 'operator'>('all')
  const dq = useDeferredValue(q.trim().toUpperCase())
  const list = useMemo(() => p.messages.filter((m) => (kind === 'all' || m.kind === kind) &&
    (!dq || m.address.includes(dq) || m.number.includes(dq) || m.text.toUpperCase().includes(dq))), [p.messages, kind, dq])
  if (!p.messages.length) return <Empty icon={<MessageSquare />} title="No messages" text="This project has no alarm or operator messages (A addresses)." />
  const alarms = p.messages.filter((m) => m.kind === 'alarm').length
  return (
    <div className="space-y-3">
      <SearchBox value={q} onChange={setQ} placeholder="Search number, text or A address" />
      <Chips value={kind} onChange={setKind} items={[
        { value: 'all', label: 'All', count: p.messages.length },
        { value: 'alarm', label: 'Alarm (1000s)', count: alarms },
        { value: 'operator', label: 'Operator (2000s)', count: p.messages.length - alarms },
      ]} />
      {!list.length ? <Empty title="Nothing found" /> : (
        <Card className="divide-y divide-border overflow-hidden">
          {list.map((m) => (
            <button key={m.address} type="button" onClick={() => onAddress(m.address)} className="flex min-h-12 w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-surface-2">
              <span className="w-14 shrink-0 pt-0.5 font-mono text-sm text-muted">{m.address}</span>
              <Badge tone={m.kind === 'alarm' ? 'danger' : 'accent'} className="mt-0.5 font-mono">{m.number}</Badge>
              <span className="min-w-0 flex-1 break-words text-sm">{m.text}</span>
            </button>
          ))}
        </Card>
      )}
    </div>
  )
}

/* ---------------- System Parameter (memory map) ---------------- */

const AREA_DESC: Record<string, string> = {
  X: 'Input signals from the machine', Y: 'Output signals to the machine', F: 'Input signals from the CNC (CNC → PMC)',
  G: 'Output signals to the CNC (PMC → CNC)', R: 'Internal relay', E: 'Extra relay', A: 'Message display request',
  T: 'Variable timer', C: 'Counter', K: 'Keep relay', D: 'Data table', L: 'Label', P: 'Subprogram',
}

export function ParamsTab({ p }: { p: PmcProject }) {
  if (!p.memoryMap.length) return <Empty icon={<Settings2 />} title="No memory map" text="Memory map information is not available for this project." />
  const rows = [...p.memoryMap].sort((a, b) => AREA_ORDER.indexOf(a.letter) - AREA_ORDER.indexOf(b.letter))
  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-3 py-2 font-medium">Area</th><th className="px-3 py-2 font-medium">Range</th><th className="px-3 py-2 text-right font-medium">Bytes</th><th className="hidden px-3 py-2 font-medium sm:table-cell">Use</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((m) => (
              <tr key={m.letter + m.start}>
                <td className="px-3 py-2.5 font-mono font-semibold">{m.letter}</td>
                <td className="px-3 py-2.5 font-mono">{m.letter}{m.start}–{m.letter}{m.start + m.size - 1}
                  <span className="block font-sans text-xs text-muted sm:hidden">{m.description ?? AREA_DESC[m.letter]}</span></td>
                <td className="px-3 py-2.5 text-right tabular">{m.size.toLocaleString()}</td>
                <td className="hidden px-3 py-2.5 text-muted sm:table-cell">{m.description ?? AREA_DESC[m.letter] ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-muted">Address ranges as stored in the file. Exact limits depend on the PMC type and options — check the PMC system parameter screen on the control.</p>
    </div>
  )
}
