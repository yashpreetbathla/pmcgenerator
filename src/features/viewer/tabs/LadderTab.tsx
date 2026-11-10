import { memo, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ListTree } from 'lucide-react'
import { Badge, Button, Card, Empty } from '@/components/ui'
import { LadderContext, useLadder } from '@/components/ladder/context'
import { LadderDiagram } from '@/components/ladder/LadderDiagram'
import { MnemonicList } from '@/components/ladder/MnemonicList'
import { findRefs } from '@/core/crossref'
import { parseAddress } from '@/core/types'
import { cn } from '@/lib/utils'
import { Chips, SearchBox } from '../shared'
import { levelLabel, netLabel, type LevelKey, type ProjectIndex, type ViewNet } from '../useProjectIndex'

const PAGE = 40
type Mode = 'diagram' | 'mnemonic'

/** Returns the set of net indexes matching a query (address, symbol/comment text, SUB name, or net number). */
function matchNets(idx: ProjectIndex, raw: string): Set<number> | null {
  const q = raw.trim().toUpperCase()
  if (!q) return null
  const out = new Set<number>()
  const netNo = /^N?(\d{1,5})$/.exec(q)
  if (netNo) { const i = idx.netById.get(Number(netNo[1])); if (i !== undefined) out.add(i) }
  if (parseAddress(q)) { for (const r of findRefs(idx.xref, q)) out.add(r.netIndex); return out }
  const addrs = new Set<string>()
  for (const s of idx.symbols.values()) if (s.symbol.toUpperCase().includes(q) || s.comment.toUpperCase().includes(q)) addrs.add(s.address)
  for (const a of addrs) for (const r of findRefs(idx.xref, a)) out.add(r.netIndex)
  idx.nets.forEach((n, i) => { if (n.instructions.some((ins) => ins.kind === 'sub' && ins.name === q)) out.add(i) })
  return out
}

export function LadderTab({ idx, focus, hitAddress }: { idx: ProjectIndex; focus?: { netId: number; nonce: number }; hitAddress?: string }) {
  const [level, setLevel] = useState<'all' | LevelKey>('all')
  const [query, setQuery] = useState(hitAddress ?? '')
  const [mode, setMode] = useState<Mode>('diagram')
  // Page size is remembered per filter, so changing the filter starts again at one page.
  const [pages, setPages] = useState({ key: 'all|', n: PAGE })
  const [flash, setFlash] = useState<number>()
  const dq = useDeferredValue(query)

  const filtered = useMemo(() => {
    const hits = matchNets(idx, dq)
    return idx.nets.filter((n, i) => (level === 'all' || n.levelKey === level) && (!hits || hits.has(i)))
  }, [idx, dq, level])

  const filterKey = `${level}|${dq.trim().toUpperCase()}`
  const count = pages.key === filterKey ? pages.n : PAGE
  const setCount = (n: number) => setPages({ key: filterKey, n })

  // Jump to a net (from cross reference / address sheet).
  useEffect(() => {
    if (!focus) return
    const i = idx.netById.get(focus.netId)
    if (i === undefined) return
    setLevel('all'); setQuery('')
    setPages({ key: 'all|', n: Math.max(PAGE, Math.ceil((i + 1) / PAGE) * PAGE) })
    setFlash(focus.netId)
    const t = setTimeout(() => document.getElementById(`net-${focus.netId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    const t2 = setTimeout(() => setFlash(undefined), 2200)
    return () => { clearTimeout(t); clearTimeout(t2) }
  }, [focus, idx])

  const q = dq.trim().toUpperCase()
  const hitSyms = useMemo(() => {
    if (!q || parseAddress(q)) return null
    const s = new Set<string>()
    for (const e of idx.symbols.values()) if (e.symbol.toUpperCase().includes(q) || e.comment.toUpperCase().includes(q)) s.add(e.address)
    return s
  }, [q, idx])
  const isHit = useMemo(() => {
    if (!q) return undefined
    const p = parseAddress(q)
    if (p) {
      const byte = `${p.area}${p.byte}`
      return (a: string) => a === q || (p.bit === undefined ? a.startsWith(byte + '.') : a === byte)
    }
    return (a: string) => !!hitSyms?.has(a)
  }, [q, hitSyms])

  if (!idx.nets.length) return <Empty icon={<ListTree />} title="No ladder program" text="This project has no nets." />

  const shown = filtered.slice(0, count)
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchBox value={query} onChange={setQuery} placeholder="Search address, symbol, SUB name or net no." />
        <div className="flex h-11 shrink-0 rounded-lg border border-border bg-surface p-1" role="group" aria-label="View mode">
          {(['diagram', 'mnemonic'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
              className={cn('flex-1 rounded-md px-3 text-sm font-medium capitalize text-muted sm:flex-none', mode === m && 'bg-fg text-bg')}>{m}</button>
          ))}
        </div>
      </div>
      <Chips value={level} onChange={setLevel} items={[{ value: 'all' as const, label: 'All', count: idx.nets.length }, ...idx.levels.map((l) => ({ value: l.key, label: l.label, count: l.count }))]} />
      <p className="text-xs text-muted tabular">
        {filtered.length === idx.nets.length ? `${idx.nets.length} nets` : `${filtered.length} of ${idx.nets.length} nets match`}
        {mode === 'diagram' && ' · tap an address for its symbol, comment and cross reference'}
      </p>

      {!filtered.length ? (
        <Empty icon={<ListTree />} title="No nets match" text="Try an address like X8.4, a symbol, or a SUB name like TMRB." action={<Button onClick={() => { setQuery(''); setLevel('all') }}>Clear filters</Button>} />
      ) : (
        <div className="space-y-3">
          {shown.map((n) => <NetCard key={n.id} net={n} mode={mode} flash={flash === n.id} isHit={isHit} />)}
        </div>
      )}
      {filtered.length > count && (
        <div className="flex flex-col items-center gap-2 py-2 sm:flex-row sm:justify-center">
          <Button onClick={() => setCount(count + PAGE)} className="w-full sm:w-auto">Load {Math.min(PAGE, filtered.length - count)} more nets</Button>
          <span className="text-xs text-muted tabular">Showing {count} of {filtered.length}</span>
        </div>
      )}
    </div>
  )
}

const NetCard = memo(function NetCard({ net, mode, flash, isHit }: { net: ViewNet; mode: Mode; flash: boolean; isHit?: (a: string) => boolean }) {
  return (
    <Card id={`net-${net.id}`} className={cn('scroll-mt-32 overflow-hidden transition-shadow [content-visibility:auto] [contain-intrinsic-size:auto_160px]', flash && 'ring-2 ring-fanuc')}>
      <div className="flex items-center gap-2 border-b border-border bg-surface-2/60 px-3 py-1.5">
        <span className="font-mono text-sm font-semibold">{netLabel(net.id)}</span>
        <Badge>{net.program ?? levelLabel(net.levelKey).replace('Subprograms', 'Subprogram')}</Badge>
        {net.comment && <span className="min-w-0 truncate text-xs text-muted">{net.comment}</span>}
      </div>
      <HitScope isHit={isHit}>
        <div className="overflow-x-auto overscroll-x-contain p-3">
          {mode === 'diagram' ? <LadderDiagram instructions={net.instructions} /> : <MnemonicList instructions={net.instructions} />}
        </div>
      </HitScope>
    </Card>
  )
})

/* Search highlighting is scoped per card so the global context (symbol lookup) stays stable. */
function HitScope({ isHit, children }: { isHit?: (a: string) => boolean; children: ReactNode }) {
  const parent = useLadder()
  const value = useMemo(() => ({ ...parent, isHit }), [parent, isHit])
  return <LadderContext.Provider value={value}>{children}</LadderContext.Provider>
}
