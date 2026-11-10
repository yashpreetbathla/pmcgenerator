/**
 * Ladder diagram renderer (HTML/CSS + tiny SVG glyphs). Every element is a 56px-tall cell whose
 * wire runs at y=27..29, so series/parallel blocks line up without measuring.
 */
import { memo, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { buildLadderTree, pinNames, type LCoil, type LNode, type LOutput, type LRung } from '@/core/ladderTree'
import { SUB_NAMES } from '@/core/subs'
import { parseAddress, type FunctionalInstruction, type Instruction } from '@/core/types'
import { cn } from '@/lib/utils'
import { useLadder } from './context'

/** Horizontal wire through the vertical middle of a 56px row. */
const WIRE = 'pointer-events-none absolute inset-x-0 top-[27px] h-[2px] bg-rung'

function AddressCell({ address, children, wide }: { address: string; children: ReactNode; wide?: boolean }) {
  const { lookup, onAddress, isHit } = useLadder()
  const sym = lookup(address)
  const hit = isHit?.(address)
  return (
    <button
      type="button"
      onClick={() => onAddress?.(address)}
      title={[address, sym?.symbol, sym?.comment].filter(Boolean).join(' — ')}
      className={cn('group relative h-14 shrink-0 rounded-md text-center outline-offset-0 hover:bg-accent-soft/60', wide ? 'w-[92px]' : 'w-[84px]')}
    >
      <span className={WIRE} />
      <span className={cn('absolute inset-x-0.5 top-0 truncate rounded px-0.5 font-mono text-[11px] font-medium leading-[18px] text-fg', hit && 'bg-fanuc/50')}>{address}</span>
      <span className="absolute left-1/2 top-[18px] -translate-x-1/2">{children}</span>
      <span className="absolute inset-x-0.5 bottom-0 truncate font-mono text-[10px] leading-[18px] text-muted group-hover:text-link">{sym?.symbol || ' '}</span>
    </button>
  )
}

function ContactGlyph({ negated }: { negated: boolean }) {
  return (
    <svg width="26" height="20" viewBox="0 0 26 20" className="block" aria-hidden>
      <rect x="5" y="0" width="16" height="20" className="fill-surface" />
      <path d="M6 1v18M20 1v18" className="stroke-rung" strokeWidth="2" />
      {negated && <path d="M8 18L18 2" className="stroke-rung" strokeWidth="1.6" />}
    </svg>
  )
}

function CoilGlyph({ op }: { op: LCoil['op'] }) {
  return (
    <svg width="28" height="20" viewBox="0 0 28 20" className="block" aria-hidden>
      <rect x="4" y="0" width="20" height="20" className="fill-surface" />
      <path d="M9 1Q3 10 9 19M19 1Q25 10 19 19" className="fill-none stroke-rung" strokeWidth="2" />
      {op === 'WRT.NOT' && <path d="M10 17L18 3" className="stroke-rung" strokeWidth="1.6" />}
      {(op === 'SET' || op === 'RST') && (
        <text x="14" y="14.5" textAnchor="middle" className="fill-rung font-mono text-[10px] font-bold">{op === 'SET' ? 'S' : 'R'}</text>
      )}
    </svg>
  )
}

function Contact({ n }: { n: Extract<LNode, { t: 'contact' }> }) {
  return <AddressCell address={n.address}><ContactGlyph negated={n.negated} /></AddressCell>
}

function Coil({ c }: { c: LCoil }) {
  return <AddressCell address={c.address} wide><CoilGlyph op={c.op} /></AddressCell>
}

/** Filler wire that stretches. */
const Fill = ({ min = 'min-w-4', wire = true, grow = true }: { min?: string; wire?: boolean; grow?: boolean }) => (
  <div className={cn('relative h-14', grow ? 'flex-1' : 'shrink-0', min)}>{wire && <span className={WIRE} />}</div>
)

/** Parallel rows joined by vertical bars on both sides. Rows stretch to the widest. */
function Parallel({ rows, right = true }: { rows: ReactNode[]; right?: boolean }) {
  if (rows.length === 1) return <div className="flex items-start">{rows[0]}</div>
  const last = rows.length - 1
  return (
    <div className="flex flex-col">
      {rows.map((r, i) => {
        const v = i === 0 ? { top: 27, bottom: 0 } : i === last ? { top: 0, height: 29 } : { top: 0, bottom: 0 }
        return (
          <div key={i} className="relative flex items-start px-2">
            <span className={WIRE} />
            <span className="pointer-events-none absolute left-0 w-[2px] bg-rung" style={v} />
            {right && <span className="pointer-events-none absolute right-0 w-[2px] bg-rung" style={v} />}
            <div className="relative flex min-w-0 flex-1 items-start">{r}</div>
          </div>
        )
      })}
    </div>
  )
}

function NodeView({ n }: { n: LNode | null }) {
  if (!n) return <Fill min="min-w-8" />
  if (n.t === 'contact') return <Contact n={n} />
  if (n.t === 'series') return <div className="flex items-start">{n.items.map((c, i) => <NodeView key={i} n={c} />)}</div>
  return <Parallel rows={n.items.map((c, i) => <NodeView key={i} n={c} />)} />
}

/* ---------------- functional instruction box ---------------- */

const PARAM_LABELS: Record<string, string[]> = {
  TMRB: ['Timer no.', 'Preset ms'], TMRBF: ['Timer no.', 'Preset ms'], TMR: ['Timer no.'], TMRC: ['Format', 'Preset', 'Register', 'Output'],
  CTR: ['Counter no.'], CTRB: ['Counter no.', 'Preset'], DIFU: ['Edge no.'], DIFD: ['Edge no.'],
  NUMEB: ['Format', 'Constant', 'Output'], NUMB: ['Format', 'Constant', 'Output'],
  CODB: ['Format', 'Table size', 'Index', 'Output'], COD: ['Table size', 'Index', 'Output'],
  MOVE: ['High mask', 'Low mask', 'Input', 'Output'], MOVB: ['Source', 'Dest'], MOVW: ['Source', 'Dest'], MOVD: ['Source', 'Dest'],
  COMPB: ['Format', 'Input', 'Compare'], COMP: ['Format', 'Input', 'Compare'], COIN: ['Format', 'Input', 'Compare'],
  DECB: ['Format', 'Code', 'Number', 'Output'], DEC: ['Code', 'Number', 'Output'],
  CALL: ['Program'], CALLU: ['Program'], SP: ['Program'], JMPB: ['Label'], LBL: ['Label'], DISPB: ['Messages'],
}

function ParamValue({ value }: { value: number | string }) {
  const { lookup, onAddress, isHit } = useLadder()
  if (typeof value === 'string' && parseAddress(value)) {
    const sym = lookup(value)
    return (
      <button type="button" onClick={() => onAddress?.(value)} title={[value, sym?.symbol, sym?.comment].filter(Boolean).join(' — ')}
        className={cn('min-w-0 truncate rounded text-left font-mono text-[11px] hover:text-link', isHit?.(value) && 'bg-fanuc/50')}>
        {value}{sym?.symbol && <span className="ml-1 text-muted">{sym.symbol}</span>}
      </button>
    )
  }
  return <span className="font-mono text-[11px] tabular">{String(value)}</span>
}

function FuncBox({ ins, tall }: { ins: FunctionalInstruction; tall?: boolean }) {
  const [open, setOpen] = useState(false)
  const labels = PARAM_LABELS[ins.name] ?? []
  const desc = SUB_NAMES[ins.sub]?.desc
  return (
    <div className={cn('relative z-[1] my-1 w-[168px] shrink-0 rounded-md border-2 border-rung! bg-surface px-2 py-1.5 text-left', tall && 'self-stretch')} title={desc}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[13px] font-bold">{ins.name}</span>
        <span className="font-mono text-[10px] text-muted">SUB {ins.sub}</span>
      </div>
      {desc && <p className="mb-1 truncate text-[10px] text-muted">{desc}</p>}
      {ins.params.length > 0 && (
        <dl className="space-y-0.5 border-t border-border pt-1">
          {ins.params.map((p, i) => (
            <div key={i} className="flex items-baseline gap-1.5">
              <dt className="w-14 shrink-0 truncate text-[10px] text-muted">{labels[i] ?? `P${i + 1}`}</dt>
              <dd className="min-w-0 flex-1 truncate"><ParamValue value={p} /></dd>
            </div>
          ))}
        </dl>
      )}
      {ins.table && ins.table.length > 0 && (
        <div className="mt-1 border-t border-border pt-1">
          <button type="button" onClick={() => setOpen(!open)} className="flex h-7 w-full items-center justify-between text-[11px] font-medium text-link">
            Table · {ins.table.length} {ins.table.length === 1 ? 'entry' : 'entries'}
            <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
          </button>
          {open && (
            <div className="grid max-h-56 grid-cols-2 gap-x-2 overflow-y-auto font-mono text-[10px]">
              {ins.table.map((v, i) => (
                <div key={i} className="flex justify-between gap-1"><span className="text-muted">{String(i).padStart(3, '0')}</span><span className="tabular">{v}</span></div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Box followed by any coils driven by its output. */
function FuncOutput({ out, tall }: { out: Extract<LOutput, { t: 'func' }>; tall?: boolean }) {
  return (
    <div className={cn('flex items-start', tall && 'self-stretch', out.coils.length > 0 && 'flex-1')}>
      <FuncBox ins={out.ins} tall={tall} />
      {out.coils.length > 0 && (
        <>
          <Fill min="min-w-6" />
          <Parallel right={false} rows={out.coils.map((c, i) => <div key={i} className="flex flex-1 items-start"><Fill min="min-w-1" /><Coil c={c} /></div>)} />
        </>
      )}
    </div>
  )
}

function OutputView({ out }: { out: LOutput }) {
  return out.t === 'coil' ? <Coil c={out} /> : <FuncOutput out={out} />
}

function Rung({ rung }: { rung: LRung }) {
  const multi = rung.inputs.length > 1
  const single = rung.outputs.length === 1 && !rung.outputs[0].cond
  const onlyFunc = rung.outputs.length === 1 && rung.outputs[0].out.t === 'func'

  // Multi-input functional instruction (CTR, ROT, CODB …): one row per input, labelled with its pin.
  if (multi && onlyFunc) {
    const out = rung.outputs[0].out as Extract<LOutput, { t: 'func' }>
    const pins = pinNames(out.ins.name, rung.inputs.length)
    return (
      <div className="flex min-w-full items-stretch border-x-2 border-rung!">
        <div className="flex flex-col">
          {rung.inputs.map((n, i) => (
            <div key={i} className="relative flex items-start pr-1">
              <span className={WIRE} />
              <div className="relative flex flex-1 items-start"><NodeView n={n} /><Fill /></div>
              {pins[i] && <span className="absolute right-1 top-[10px] font-mono text-[9px] font-semibold text-muted">{pins[i]}</span>}
            </div>
          ))}
        </div>
        <FuncOutput out={out} tall />
        {!out.coils.length && <Fill min="min-w-2" wire={false} />}
      </div>
    )
  }

  const input = rung.inputs.length ? rung.inputs[0] : undefined
  const noOutputs = rung.outputs.length === 0
  return (
    <div className="flex min-w-full items-start border-x-2 border-rung!">
      {input !== undefined && <NodeView n={input} />}
      {!noOutputs && <Fill min="min-w-6" grow={!(single && rung.outputs[0].out.t === 'func')} />}
      {noOutputs ? (
        <><Fill min="min-w-6" /><span className="self-center px-2 text-[11px] italic text-warning">no output</span></>
      ) : single ? (
        <OutputView out={rung.outputs[0].out} />
      ) : (
        <Parallel right={false} rows={rung.outputs.map((o, i) => (
          <div key={i} className="flex flex-1 items-start">
            {o.cond && <NodeView n={o.cond} />}
            <Fill min="min-w-2" />
            <OutputView out={o.out} />
          </div>
        ))} />
      )}
      {!noOutputs && rung.outputs.every((o) => o.out.t === 'func' && !o.out.coils.length) && <Fill min="min-w-2" wire={false} />}
    </div>
  )
}

export const LadderDiagram = memo(function LadderDiagram({ instructions }: { instructions: Instruction[] }) {
  const tree = useMemo(() => buildLadderTree(instructions), [instructions])
  return (
    <div className="w-max min-w-full space-y-3">
      {tree.rungs.map((r, i) => <Rung key={i} rung={r} />)}
      {tree.issues.length > 0 && (
        <p className="text-[11px] text-warning">Drawn best-effort: {tree.issues.join(' ')} Check the mnemonic view.</p>
      )}
    </div>
  )
})
