import { useEffect, type ReactNode } from 'react'
import { ArrowRight, Search, X } from 'lucide-react'
import { Badge, Button, Input } from '@/components/ui'
import { findRefs, groupRefs, type XRef } from '@/core/crossref'
import type { AlarmMessage } from '@/core/types'
import { cn } from '@/lib/utils'
import { netLabel, type ProjectIndex } from './useProjectIndex'

export function SearchBox({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={cn('relative min-w-0 flex-1', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <Input type="search" inputMode="search" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9 pr-10" />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-0 top-0 flex size-11 items-center justify-center text-muted hover:text-fg">
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

export function Chips<T extends string>({ items, value, onChange }: { items: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {items.map((it) => (
        <button key={it.value} type="button" onClick={() => onChange(it.value)} aria-pressed={value === it.value}
          className={cn('flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-sm font-medium text-muted hover:text-fg',
            value === it.value && 'border-accent! bg-accent-soft text-link hover:text-link')}>
          {it.label}{it.count !== undefined && <span className="tabular text-xs opacity-70">{it.count}</span>}
        </button>
      ))}
    </div>
  )
}

const ROLE = { coil: { label: 'Coil (written)', tone: 'danger' as const }, contact: { label: 'Contact (read)', tone: 'accent' as const }, param: { label: 'Functional instruction', tone: 'warning' as const } }

/** Grouped cross reference list; every row jumps to the net. */
export function RefList({ refs, idx, onJump, limit }: { refs: XRef[]; idx: ProjectIndex; onJump: (netId: number) => void; limit?: number }) {
  const g = groupRefs(refs)
  if (!refs.length) return <p className="py-3 text-sm text-muted">Not used in the ladder program.</p>
  return (
    <div className="space-y-4">
      {(['coil', 'contact', 'param'] as const).filter((k) => g[k].length).map((k) => (
        <section key={k}>
          <h4 className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-muted">
            <Badge tone={ROLE[k].tone}>{ROLE[k].label}</Badge><span className="tabular">{g[k].length}</span>
          </h4>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {g[k].slice(0, limit).map((r, i) => {
              const net = idx.nets[r.netIndex]
              return (
                <li key={i}>
                  <button type="button" onClick={() => onJump(r.netId)} className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2">
                    <span className="font-mono font-semibold">{netLabel(r.netId)}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-muted">{r.op} {r.address}</span>
                    <span className="hidden text-xs text-muted sm:inline">{net?.program ?? (net ? `Level ${net.levelKey}` : '')}</span>
                    <ArrowRight className="size-4 shrink-0 text-muted" />
                  </button>
                </li>
              )
            })}
          </ul>
          {limit && g[k].length > limit && <p className="mt-1 text-xs text-muted">+{g[k].length - limit} more — open Cross Reference for the full list.</p>}
        </section>
      ))}
    </div>
  )
}

/** Bottom sheet (phone) / floating panel (desktop) with symbol, comment and where-used for one address. */
export function AddressSheet({ address, idx, onClose, onJump, onXref, messages }: { address: string; idx: ProjectIndex; onClose: () => void; onJump: (netId: number) => void; onXref: (a: string) => void; messages?: AlarmMessage[] }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [onClose])
  const sym = idx.symbols.get(address)
  const refs = findRefs(idx.xref, address)
  const msg = messages?.find((m) => m.address === address)
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`Address ${address}`}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="safe-bottom relative max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface p-4 shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border sm:hidden" />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-2xl font-semibold">{address}</p>
            {sym?.symbol ? <p className="font-mono text-link">{sym.symbol}</p> : <p className="text-sm text-muted">No symbol defined</p>}
            {sym?.comment && <p className="mt-1 text-sm">{sym.comment}</p>}
            {msg && (
              <p className="mt-2 flex items-start gap-2 text-sm">
                <Badge tone={msg.kind === 'alarm' ? 'danger' : 'warning'} className="font-mono">{msg.kind === 'alarm' ? 'Alarm' : 'Operator'} {msg.number}</Badge>
                <span className="min-w-0 break-words font-mono">{msg.text}</span>
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X /></Button>
        </div>
        <div className="mt-4">
          <RefList refs={refs} idx={idx} onJump={(id) => { onClose(); onJump(id) }} limit={5} />
        </div>
        <Button className="mt-4 w-full" onClick={() => { onClose(); onXref(address) }}>Open in Cross Reference <ArrowRight /></Button>
      </div>
    </div>
  )
}
