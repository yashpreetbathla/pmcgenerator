import { memo } from 'react'
import { parseAddress, type Instruction } from '@/core/types'
import { cn } from '@/lib/utils'
import { useLadder } from './context'

function Addr({ a }: { a: string }) {
  const { lookup, onAddress, isHit } = useLadder()
  const s = lookup(a)
  return (
    <button type="button" onClick={() => onAddress?.(a)} title={s?.comment || undefined}
      className={cn('flex min-w-0 items-baseline gap-2 rounded text-left hover:text-accent', isHit?.(a) && 'bg-fanuc/50')}>
      <span className="w-16 shrink-0 font-mono">{a}</span>
      <span className="truncate font-mono text-muted">{s?.symbol}</span>
      {s?.comment && <span className="hidden truncate text-xs text-muted/80 sm:inline">{s.comment}</span>}
    </button>
  )
}

/** LADDER-III style mnemonic listing for one net. */
export const MnemonicList = memo(function MnemonicList({ instructions }: { instructions: Instruction[] }) {
  return (
    <ol className="text-[13px] leading-7">
      {instructions.map((ins, i) => {
        if (ins.kind === 'basic') {
          return (
            <li key={i} className="flex min-w-0 items-baseline gap-3">
              <span className="w-8 shrink-0 text-right font-mono text-[11px] text-muted tabular">{i + 1}</span>
              <span className="w-24 shrink-0 font-mono font-semibold">{ins.op}</span>
              {ins.address && <Addr a={ins.address} />}
            </li>
          )
        }
        return (
          <li key={i}>
            <div className="flex items-baseline gap-3">
              <span className="w-8 shrink-0 text-right font-mono text-[11px] text-muted tabular">{i + 1}</span>
              <span className="w-24 shrink-0 font-mono font-semibold">SUB {ins.sub}</span>
              <span className="font-mono font-semibold text-accent">{ins.name}</span>
            </div>
            {ins.params.map((p, k) => (
              <div key={k} className="flex min-w-0 items-baseline gap-3">
                <span className="w-8 shrink-0" />
                <span className="w-24 shrink-0 font-mono text-[11px] text-muted">(PRM)</span>
                {typeof p === 'string' && parseAddress(p) ? <Addr a={p} /> : <span className="font-mono tabular">{p}</span>}
              </div>
            ))}
            {ins.table && ins.table.length > 0 && (
              <div className="flex items-baseline gap-3">
                <span className="w-8 shrink-0" />
                <span className="w-24 shrink-0 font-mono text-[11px] text-muted">(TABLE)</span>
                <span className="min-w-0 break-words font-mono text-xs text-muted">{ins.table.join(' ')}</span>
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
})
