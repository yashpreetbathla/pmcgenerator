import { useMemo, useState } from 'react'
import { Grid3x3 } from 'lucide-react'
import { Button, Card, Empty } from '@/components/ui'
import type { PmcProject } from '@/core/types'
import { cn } from '@/lib/utils'
import { Chips } from '../shared'
import type { ProjectIndex } from '../useProjectIndex'

const BITS = [7, 6, 5, 4, 3, 2, 1, 0]

/** X/Y bytes as 8-bit grids (bit 7 on the left, like the CNC diagnostic screen). */
export function IoMapTab({ p, idx, onAddress }: { p: PmcProject; idx: ProjectIndex; onAddress: (a: string) => void }) {
  const [area, setArea] = useState<'X' | 'Y'>('X')
  const [all, setAll] = useState(false)

  const { bytes, total } = useMemo(() => {
    const interesting = new Set<number>()
    const re = new RegExp(`^${area}(\\d+)`)
    for (const s of p.symbols) { const m = re.exec(s.address); if (m) interesting.add(Number(m[1])) }
    for (const a of idx.used) { const m = re.exec(a); if (m) interesting.add(Number(m[1])) }
    const mm = p.memoryMap.find((m) => m.letter === area)
    const range = mm && mm.size <= 1024 ? Array.from({ length: mm.size }, (_, i) => mm.start + i) : []
    const list = all && range.length ? range : [...interesting].sort((a, b) => a - b)
    return { bytes: list, total: range.length }
  }, [area, all, p.symbols, p.memoryMap, idx.used])

  const counts = (a: 'X' | 'Y') => p.symbols.filter((s) => s.address.startsWith(a)).length
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chips value={area} onChange={setArea} items={[{ value: 'X', label: 'X · Inputs', count: counts('X') }, { value: 'Y', label: 'Y · Outputs', count: counts('Y') }]} />
        {total > 0 && <Button size="sm" variant="ghost" className="ml-auto h-10" onClick={() => setAll(!all)}>{all ? 'Only used bytes' : `Show all ${total} bytes`}</Button>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5"><i className="size-3 rounded-sm border border-accent/40! bg-accent-soft" /> has symbol</span>
        <span className="flex items-center gap-1.5"><i className="size-3 rounded-sm border border-border bg-surface-2" /> used, no symbol</span>
        <span className="flex items-center gap-1.5"><i className="size-3 rounded-sm border border-dashed border-border" /> unused</span>
      </div>
      {!bytes.length ? <Empty icon={<Grid3x3 />} title={`No ${area} signals`} text="No symbols or ladder references in this area." /> : (
        <div className="grid gap-2 lg:grid-cols-2">
          {bytes.map((b) => (
            <Card key={b} className="p-2.5">
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="font-mono text-sm font-semibold">{area}{b}</span>
                <span className="text-[10px] text-muted">#7 … #0</span>
              </div>
              <div className="grid grid-cols-8 gap-1">
                {BITS.map((bit) => {
                  const a = `${area}${b}.${bit}`
                  const s = idx.symbols.get(a)
                  const used = idx.used.has(a)
                  return (
                    <button key={bit} type="button" onClick={() => onAddress(a)} title={[a, s?.symbol, s?.comment].filter(Boolean).join(' — ')}
                      className={cn('flex h-12 min-w-0 flex-col items-center justify-center rounded-md border px-0.5 text-center',
                        s ? 'border-accent/40! bg-accent-soft' : used ? 'border-border bg-surface-2' : 'border-dashed border-border text-muted')}>
                      <span className="text-[10px] leading-none text-muted">{bit}</span>
                      <span className={cn('mt-1 w-full truncate font-mono text-[10px] leading-none', s && 'font-semibold text-link')}>{s?.symbol || (used ? '•' : '')}</span>
                    </button>
                  )
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
