import { useDeferredValue, useMemo, useState } from 'react'
import { BookOpen, Search, X } from 'lucide-react'
import { Badge, Callout, Card, Empty, Input, PageTitle, Select, Tabs } from '@/components/ui'
import { SIGNALS_NOTE, SIGNAL_CATEGORIES, STANDARD_SIGNALS, type StandardSignal } from '@/data/standardSignals'
import { GLOSSARY } from '@/data/glossary'
import { cn } from '@/lib/utils'

type Tab = 'signals' | 'glossary'
type Dir = 'all' | 'G' | 'F'
type Mach = 'all' | 'T' | 'M'

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

export default function SignalsPage() {
  const [tab, setTab] = useState<Tab>('signals')
  return (
    <div>
      <PageTitle title="Signals & terms" subtitle="Standard FANUC CNC ↔ PMC interface signals and LADDER-III vocabulary." />
      <div className="mb-4">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { value: 'signals', label: 'Standard signals', count: STANDARD_SIGNALS.length },
            { value: 'glossary', label: 'LADDER-III terms', count: GLOSSARY.length },
          ]}
        />
      </div>
      {tab === 'signals' ? <SignalsTab /> : <GlossaryTab />}
    </div>
  )
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <Input type="search" inputMode="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9 pr-10" aria-label={placeholder} />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-0 top-0 flex size-11 items-center justify-center text-muted hover:text-fg" aria-label="Clear search">
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

function SignalsTab() {
  const [q, setQ] = useState('')
  const [dir, setDir] = useState<Dir>('all')
  const [cat, setCat] = useState('all')
  const [mach, setMach] = useState<Mach>('all')
  const dq = useDeferredValue(q)

  const rows = useMemo(() => {
    const terms = norm(dq).split(' ').filter(Boolean)
    return STANDARD_SIGNALS.filter((s) => {
      if (dir !== 'all' && s.direction !== dir) return false
      if (cat !== 'all' && s.category !== cat) return false
      if (mach !== 'all' && !s.machine.includes(mach)) return false
      if (!terms.length) return true
      const hay = norm(`${s.address} ${s.symbol} ${s.name} ${s.description} ${s.category}`)
      return terms.every((t) => hay.includes(t))
    })
  }, [dq, dir, cat, mach])

  const filtered = q || dir !== 'all' || cat !== 'all' || mach !== 'all'
  const reset = () => { setQ(''); setDir('all'); setCat('all'); setMach('all') }

  return (
    <div className="space-y-4">
      <Callout title="Verify before use">{SIGNALS_NOTE}</Callout>

      <div className="space-y-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search address, symbol or meaning — e.g. G8.4, ST, feed hold" />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Segmented<Dir>
            className="col-span-2 sm:col-span-1"
            value={dir}
            onChange={setDir}
            items={[{ value: 'all', label: 'All' }, { value: 'G', label: 'G · PMC→CNC' }, { value: 'F', label: 'F · CNC→PMC' }]}
          />
          <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category" className="sm:w-56">
            <option value="all">All categories</option>
            {SIGNAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select value={mach} onChange={(e) => setMach(e.target.value as Mach)} aria-label="Machine type" className="sm:w-40">
            <option value="all">Lathe & Mill</option>
            <option value="T">Lathe (T)</option>
            <option value="M">Mill (M)</option>
          </Select>
        </div>
        <div className="flex min-h-11 items-center justify-between text-sm text-muted">
          <span className="tabular">{rows.length} of {STANDARD_SIGNALS.length} signals</span>
          {filtered && <button onClick={reset} className="h-11 rounded-lg px-3 font-medium text-accent hover:bg-accent-soft">Clear filters</button>}
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty icon={<Search />} title="No matching signals" text="Try a different word, or clear the filters." />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="w-24 px-4 py-2.5 font-medium">Address</th>
                  <th className="w-28 px-2 py-2.5 font-medium">Symbol</th>
                  <th className="px-2 py-2.5 font-medium">Signal</th>
                  <th className="w-44 px-2 py-2.5 font-medium">Category</th>
                  <th className="w-20 px-4 py-2.5 font-medium">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((s) => (
                  <tr key={s.address + s.symbol} className="align-top hover:bg-surface-2/60">
                    <td className="px-4 py-2.5"><Addr s={s} /></td>
                    <td className="px-2 py-2.5 font-mono font-semibold break-all">{s.symbol}</td>
                    <td className="px-2 py-2.5"><p className="font-medium">{s.name}</p><p className="text-muted">{s.description}</p></td>
                    <td className="px-2 py-2.5 text-muted">{s.category}</td>
                    <td className="px-4 py-2.5"><MachineTags m={s.machine} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <ul className="grid gap-2 md:hidden">
            {rows.map((s) => (
              <li key={s.address + s.symbol} className="rounded-xl border border-border bg-surface p-3.5">
                <div className="flex items-center gap-2">
                  <Addr s={s} />
                  <span className="min-w-0 truncate font-mono font-semibold">{s.symbol}</span>
                  <span className="ml-auto"><MachineTags m={s.machine} /></span>
                </div>
                <p className="mt-1.5 font-medium">{s.name}</p>
                <p className="mt-0.5 text-sm text-muted">{s.description}</p>
                <p className="mt-1.5 text-xs text-muted">{s.category}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function Addr({ s }: { s: StandardSignal }) {
  return (
    <span
      className={cn('tabular inline-flex rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold', s.direction === 'G' ? 'bg-accent-soft text-accent' : 'bg-success-soft text-success')}
      title={s.direction === 'G' ? 'G: PMC → CNC (ladder writes)' : 'F: CNC → PMC (ladder reads)'}
    >
      {s.address}
    </span>
  )
}

function MachineTags({ m }: { m: ('T' | 'M')[] }) {
  if (m.length === 2) return <Badge>T · M</Badge>
  return <Badge tone="warning">{m[0] === 'T' ? 'Lathe' : 'Mill'}</Badge>
}

function Segmented<T extends string>({ items, value, onChange, className }: { items: { value: T; label: string }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="radiogroup" className={cn('flex rounded-lg border border-border bg-surface p-0.5', className)}>
      {items.map((it) => (
        <button
          key={it.value}
          role="radio"
          aria-checked={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn('h-10 flex-1 whitespace-nowrap rounded-md px-3 text-sm font-medium text-muted hover:text-fg', value === it.value && 'bg-fg text-bg hover:text-bg')}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

function GlossaryTab() {
  const [q, setQ] = useState('')
  const dq = useDeferredValue(q)
  const groups = useMemo(() => {
    const t = norm(dq)
    const hit = GLOSSARY.filter((g) => !t || norm(`${g.term} ${g.also ?? ''} ${g.description}`).includes(t))
    return (['Program', 'Ladder', 'Address', 'Tools'] as const)
      .map((c) => ({ c, items: hit.filter((g) => g.category === c) }))
      .filter((g) => g.items.length)
  }, [dq])

  const LABEL = { Program: 'Program structure', Ladder: 'Ladder elements', Address: 'Address areas', Tools: 'Diagnostic tools' }

  return (
    <div className="space-y-4">
      <SearchBox value={q} onChange={setQ} placeholder="Search terms — e.g. keep relay, level 1, coil" />
      {groups.length === 0 ? (
        <Empty icon={<BookOpen />} title="No matching terms" text="Try a shorter word." />
      ) : (
        groups.map(({ c, items }) => (
          <section key={c}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{LABEL[c]}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((g) => (
                <div key={g.term} className="rounded-xl border border-border bg-surface p-4">
                  <p className="font-semibold">
                    {g.term}
                    {g.also && <span className="ml-2 text-sm font-normal text-muted">{g.also}</span>}
                  </p>
                  <p className="mt-1 text-sm text-fg/80">{g.description}</p>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
