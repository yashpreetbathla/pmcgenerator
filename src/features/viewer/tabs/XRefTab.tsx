import { useDeferredValue, useMemo, useState } from 'react'
import { Network } from 'lucide-react'
import { Card, Empty } from '@/components/ui'
import { findRefs } from '@/core/crossref'
import { parseAddress } from '@/core/types'
import { RefList, SearchBox } from '../shared'
import type { ProjectIndex } from '../useProjectIndex'

/** Pick an address (type it, or search by symbol/comment) → where it is used. */
export function XRefTab({ idx, address, onAddress, onJump }: { idx: ProjectIndex; address?: string; onAddress: (a: string) => void; onJump: (netId: number) => void }) {
  const [q, setQ] = useState(address ?? '')
  const dq = useDeferredValue(q.trim().toUpperCase())
  const exact = parseAddress(dq) ? dq.replace(/^([A-Z])0+(\d)/, '$1$2') : undefined
  const selected = exact ?? address

  const suggestions = useMemo(() => {
    if (!dq || exact) return []
    const out: { address: string; symbol: string; comment: string }[] = []
    for (const s of idx.symbols.values()) {
      if (s.address.startsWith(dq) || s.symbol.toUpperCase().includes(dq) || s.comment.toUpperCase().includes(dq)) out.push(s)
      if (out.length >= 30) break
    }
    return out
  }, [dq, exact, idx])

  const refs = useMemo(() => (selected ? findRefs(idx.xref, selected) : []), [selected, idx])
  const sym = selected ? idx.symbols.get(selected) : undefined

  return (
    <div className="space-y-3">
      <SearchBox value={q} onChange={setQ} placeholder="Address (e.g. X8.4, R100) or symbol / comment" />
      {suggestions.length > 0 && (
        <Card className="max-h-80 divide-y divide-border overflow-y-auto">
          {suggestions.map((s) => (
            <button key={s.address} type="button" onClick={() => { setQ(s.address); onAddress(s.address) }} className="flex min-h-11 w-full items-baseline gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2">
              <span className="w-16 shrink-0 font-mono font-medium">{s.address}</span>
              <span className="w-28 shrink-0 truncate font-mono text-link">{s.symbol}</span>
              <span className="min-w-0 flex-1 truncate text-muted">{s.comment}</span>
            </button>
          ))}
        </Card>
      )}
      {dq && !exact && !suggestions.length && <Empty title="No matching symbol" text="Type a full address like X8.4 or R100 to see its references." />}
      {!dq && !address && <Empty icon={<Network />} title="Pick an address" text="Type an address, symbol or comment. You can also tap any address in the Ladder, Symbol or I/O Map tabs." />}
      {selected && (dq ? !!exact : true) && (
        <Card className="p-4">
          <div className="mb-3">
            <p className="font-mono text-xl font-semibold">{selected}</p>
            {sym?.symbol && <p className="font-mono text-link">{sym.symbol}</p>}
            {sym?.comment && <p className="text-sm text-muted">{sym.comment}</p>}
            {parseAddress(selected)?.bit === undefined && <p className="mt-1 text-xs text-muted">Byte address — includes every bit of {selected}.</p>}
          </div>
          <RefList refs={refs} idx={idx} onJump={onJump} />
        </Card>
      )}
    </div>
  )
}
