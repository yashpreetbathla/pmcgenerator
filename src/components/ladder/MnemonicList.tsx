import { memo, type ReactNode } from 'react'
import { parseAddress, type Instruction } from '@/core/types'
import { cn } from '@/lib/utils'
import { useLadder } from './context'

/** Every listing line has the same height, so the virtualised list can compute net heights up front. */
export const MNEMONIC_LINE = 26
const TABLE_PER_LINE = 8

export function mnemonicLineCount(instructions: Instruction[]): number {
  let n = 0
  for (const ins of instructions) n += ins.kind === 'basic' ? 1 : 1 + ins.params.length + Math.ceil((ins.table?.length ?? 0) / TABLE_PER_LINE)
  return n
}

function Addr({ a, isHit }: { a: string; isHit?: (a: string) => boolean }) {
  const { lookup, onAddress } = useLadder()
  const s = lookup(a)
  return (
    <button type="button" onClick={() => onAddress?.(a)} title={[a, s?.symbol, s?.comment].filter(Boolean).join(' — ')}
      className={cn('flex min-w-0 items-baseline gap-2 rounded px-0.5 text-left hover:text-link', isHit?.(a) && 'bg-fanuc/60')}>
      <span className="w-16 shrink-0 font-mono">{a}</span>
      <span className="truncate font-mono text-muted">{s?.symbol}</span>
      {s?.comment && <span className="hidden truncate text-xs text-muted/80 sm:inline">{s.comment}</span>}
    </button>
  )
}

const Line = ({ step, op, children }: { step?: number; op: ReactNode; children?: ReactNode }) => (
  <div className="flex h-[26px] min-w-0 items-center gap-3 whitespace-nowrap">
    <span className="w-9 shrink-0 text-right font-mono text-[11px] text-muted tabular">{step ?? ''}</span>
    <span className="w-24 shrink-0 font-mono">{op}</span>
    {children}
  </div>
)

/** LADDER-III style mnemonic listing for one net. */
export const MnemonicList = memo(function MnemonicList({ instructions, isHit }: { instructions: Instruction[]; isHit?: (a: string) => boolean }) {
  return (
    <div className="text-[13px]">
      {instructions.map((ins, i) => {
        if (ins.kind === 'basic') {
          return <Line key={i} step={i + 1} op={<span className="font-semibold">{ins.op}</span>}>{ins.address && <Addr a={ins.address} isHit={isHit} />}</Line>
        }
        const rows: number[][] = []
        for (let k = 0; k < (ins.table?.length ?? 0); k += TABLE_PER_LINE) rows.push(ins.table!.slice(k, k + TABLE_PER_LINE))
        return (
          <div key={i}>
            <Line step={i + 1} op={<span className="font-semibold">SUB {ins.sub}</span>}><span className="font-mono font-semibold text-link">{ins.name}</span></Line>
            {ins.params.map((p, k) => (
              <Line key={k} op={<span className="text-[11px] text-muted">(PRM)</span>}>
                {typeof p === 'string' && parseAddress(p) ? <Addr a={p} isHit={isHit} /> : <span className="font-mono tabular">{p}</span>}
              </Line>
            ))}
            {rows.map((r, k) => (
              <Line key={`t${k}`} op={<span className="text-[11px] text-muted">{k === 0 ? '(TABLE)' : ''}</span>}>
                <span className="font-mono text-xs text-muted tabular">{String(k * TABLE_PER_LINE).padStart(3, '0')}: {r.join(' ')}</span>
              </Line>
            ))}
          </div>
        )
      })}
    </div>
  )
})
