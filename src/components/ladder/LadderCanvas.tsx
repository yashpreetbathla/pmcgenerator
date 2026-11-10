/**
 * FANUC LADDER-III style continuous ladder: one left and one right power rail, nets stacked flush,
 * net numbers in the left margin. Each net is a small SVG drawn from the grid layout (layout.ts);
 * only nets near the viewport are mounted (window-scroll virtualisation with heights known up front).
 */
import { memo, useLayoutEffect, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { SUB_NAMES } from '@/core/subs'
import { parseAddress, type AlarmMessage } from '@/core/types'
import { cn } from '@/lib/utils'
import { useLadder } from './context'
import { isDispb, netNo, type Geo } from './geometry'
import type { NetLayout, Prim } from './layout'

const WIRE: CSSProperties = { stroke: 'var(--lad-wire)', fill: 'none', strokeLinecap: 'square' }
const FG: CSSProperties = { fill: 'var(--lad-fg)' }
const MUTED: CSSProperties = { fill: 'var(--lad-muted)' }

/* ---------------- virtual stack ---------------- */

const OVERSCAN = 900

/** Absolutely positioned rows at known offsets; renders only those near the window viewport. */
export function VirtualStack({ tops, total, width, render, containerRef }: {
  tops: number[]; total: number; width?: number; render: (i: number) => ReactNode; containerRef: RefObject<HTMLDivElement | null>
}) {
  const [range, setRange] = useState<[number, number]>([0, 20])
  useLayoutEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const el = containerRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top
      const a = -top - OVERSCAN, b = -top + innerHeight + OVERSCAN
      const n = tops.length - 1 // tops has one extra entry (the total)
      const s = Math.min(n, Math.max(0, upper(tops, a) - 1)), e = Math.min(n, upper(tops, b))
      setRange((r) => (r[0] === s && r[1] === e ? r : [s, e]))
    }
    const on = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    addEventListener('scroll', on, { passive: true })
    addEventListener('resize', on)
    return () => { removeEventListener('scroll', on); removeEventListener('resize', on); cancelAnimationFrame(raf) }
  }, [tops, containerRef])
  const out: ReactNode[] = []
  for (let i = range[0], end = Math.min(range[1], tops.length - 1); i < end; i++) out.push(render(i))
  return <div ref={containerRef} className="relative" style={{ height: total, width }}>{out}</div>
}

/** First index whose value is > v. */
function upper(a: number[], v: number) {
  let lo = 0, hi = a.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] <= v) lo = m + 1; else hi = m }
  return lo
}

/* ---------------- net ---------------- */

export interface NetItem {
  id: number
  comment?: string
  program?: string
  layout: NetLayout
  msgs: AlarmMessage[]
}

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s)
const onKey = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn() } }

interface DrawCtx {
  g: Geo
  W: number
  isHit?: (a: string) => boolean
  msg: (a: string) => AlarmMessage | undefined
}

function Labels({ c, address, cx, wy, chars }: { c: DrawCtx; address: string; cx: number; wy: number; chars: number }) {
  const { lookup } = useLadder()
  const { g, isHit } = c
  const sym = lookup(address)?.symbol
  const top = g.display === 'address' ? address : g.display === 'symbol' ? sym || address : sym || ''
  const bottom = g.display === 'both' ? address : ''
  const hit = isHit?.(address)
  const cw = g.fs * 0.6
  const hl = (s: string, base: number) => hit && s
    ? <rect x={cx - (Math.min(s.length, chars) * cw) / 2 - 2} y={base - g.fs + 1} width={Math.min(s.length, chars) * cw + 4} height={g.fs + 3} rx={2} fill="var(--color-fanuc)" />
    : null
  const yTop = wy - 12 * g.z, yBot = wy + 20 * g.z
  return (
    <>
      {hl(top, yTop)}{hl(bottom, yBot)}
      {top && <text x={cx} y={yTop} textAnchor="middle" style={hit ? { fill: '#1C1F22' } : FG} fontSize={g.fs} fontWeight={500}>{clip(top, chars)}</text>}
      {bottom && <text x={cx} y={yBot} textAnchor="middle" style={hit ? { fill: '#1C1F22' } : MUTED} fontSize={g.fs * 0.95}>{clip(bottom, chars)}</text>}
    </>
  )
}

function Cell({ c, x, y, address, children }: { c: DrawCtx; x: number; y: number; address: string; children: (cx: number, wy: number) => ReactNode }) {
  const { lookup, onAddress } = useLadder()
  const { g } = c
  const X0 = x * g.cellW, cx = X0 + g.cellW / 2, wy = y * g.rowH + g.wireY
  const s = lookup(address)
  const m = c.msg(address)
  const chars = Math.max(3, Math.floor((g.cellW - 4) / (g.fs * 0.6)))
  const tip = [address, s?.symbol, s?.comment, m && `${m.kind === 'alarm' ? 'Alarm' : 'Operator message'} ${m.number}: ${m.text}`].filter(Boolean).join(' — ')
  const open = () => onAddress?.(address)
  return (
    <g role="button" tabIndex={0} aria-label={tip} onClick={open} onKeyDown={onKey(open)} className="cursor-pointer outline-none [&:focus-visible>rect:first-child]:stroke-(--color-link) [&:hover>rect:first-child]:fill-(--color-fanuc)/15">
      <rect x={X0 + 1} y={y * g.rowH + 1} width={g.cellW - 2} height={g.rowH - 2} rx={4} fill="transparent" strokeWidth={1.5} />
      <title>{tip}</title>
      {children(cx, wy)}
      <Labels c={c} address={address} cx={cx} wy={wy} chars={chars} />
      {m && <circle cx={cx + 12 * g.z} cy={wy - 9 * g.z} r={3 * g.z} fill={m.kind === 'alarm' ? 'var(--color-danger)' : 'var(--color-warning)'} />}
    </g>
  )
}

function Contact({ c, p }: { c: DrawCtx; p: Extract<Prim, { k: 'contact' }> }) {
  const { g } = c
  const sw = Math.max(1.25, 1.6 * g.z)
  return (
    <Cell c={c} x={p.x} y={p.y} address={p.address}>
      {(cx, wy) => {
        const X0 = p.x * g.cellW, gw = 6 * g.z, gh = 9 * g.z
        return (
          <path style={WIRE} strokeWidth={sw} d={
            `M${X0} ${wy}H${cx - gw}M${cx + gw} ${wy}H${X0 + g.cellW}M${cx - gw} ${wy - gh}V${wy + gh}M${cx + gw} ${wy - gh}V${wy + gh}` +
            (p.negated ? `M${cx - gw + 2 * g.z} ${wy + gh - g.z}L${cx + gw - 2 * g.z} ${wy - gh + g.z}` : '')} />
        )
      }}
    </Cell>
  )
}

function Coil({ c, p }: { c: DrawCtx; p: Extract<Prim, { k: 'coil' }> }) {
  const { g } = c
  const sw = Math.max(1.25, 1.6 * g.z)
  return (
    <Cell c={c} x={p.x} y={p.y} address={p.address}>
      {(cx, wy) => {
        const X0 = p.x * g.cellW, r = 9 * g.z, gh = 9 * g.z, k = r * 0.55
        return (
          <>
            <path style={WIRE} strokeWidth={sw} d={
              `M${X0} ${wy}H${cx - r}M${cx + r} ${wy}H${X0 + g.cellW}` +
              `M${cx - k} ${wy - gh}Q${cx - r * 1.45} ${wy} ${cx - k} ${wy + gh}M${cx + k} ${wy - gh}Q${cx + r * 1.45} ${wy} ${cx + k} ${wy + gh}` +
              (p.op === 'WRT.NOT' ? `M${cx - 4 * g.z} ${wy + 6 * g.z}L${cx + 4 * g.z} ${wy - 6 * g.z}` : '')} />
            {(p.op === 'SET' || p.op === 'RST') && (
              <text x={cx} y={wy + 3.5 * g.z} textAnchor="middle" style={FG} fontSize={10 * g.z} fontWeight={700}>{p.op === 'SET' ? 'S' : 'R'}</text>
            )}
          </>
        )
      }}
    </Cell>
  )
}

const PARAM_LABELS: Record<string, string[]> = {
  TMRB: ['Timer no.', 'Preset ms'], TMRBF: ['Timer no.', 'Preset ms'], TMR: ['Timer no.'], TMRC: ['Format', 'Preset', 'Register', 'Output'],
  CTR: ['Counter'], CTRB: ['Counter', 'Preset'], CTRC: ['Preset', 'Register'], DIFU: ['Edge no.'], DIFD: ['Edge no.'],
  NUMEB: ['Format', 'Const', 'Output'], NUMB: ['Format', 'Const', 'Output'],
  CODB: ['Format', 'Size', 'Index', 'Output'], COD: ['Size', 'Index', 'Output'],
  MOVE: ['Hi mask', 'Lo mask', 'Input', 'Output'], MOVB: ['Source', 'Dest'], MOVW: ['Source', 'Dest'], MOVD: ['Source', 'Dest'], MOVN: ['Bytes', 'Source', 'Dest'],
  MOVOR: ['Input', 'OR data', 'Output'],
  COMPB: ['Format', 'Input', 'Compare'], COMP: ['Format', 'Input', 'Compare'], COIN: ['Format', 'Input', 'Compare'],
  DECB: ['Format', 'Code', 'Number', 'Output'], DEC: ['Code', 'Number', 'Output'],
  ADDB: ['Format', 'Augend', 'Addend', 'Result'], SUBB: ['Format', 'Minuend', 'Subtr.', 'Result'],
  MULB: ['Format', 'Multipl.', 'Factor', 'Result'], DIVB: ['Format', 'Dividend', 'Divisor', 'Result'],
  CALL: ['Program'], CALLU: ['Program'], SP: ['Program'], JMPB: ['Label'], LBL: ['Label'], DISPB: ['Messages'],
}

function ParamRow({ c, x0, x1, y, label, value }: { c: DrawCtx; x0: number; x1: number; y: number; label: string; value: number | string }) {
  const { lookup, onAddress } = useLadder()
  const { g, isHit } = c
  const isAddr = typeof value === 'string' && !!parseAddress(value)
  const sym = isAddr ? lookup(value as string)?.symbol : undefined
  const fsL = 9 * g.z, fsV = 10 * g.z
  const room = x1 - x0 - 8 * g.z
  const labelChars = Math.max(0, Math.min(label.length, Math.floor((room * 0.45) / (fsL * 0.6))))
  const valueChars = Math.max(3, Math.floor((room - labelChars * fsL * 0.6 - 4 * g.z) / (fsV * 0.6)))
  const shown = String(value) + (sym && g.display !== 'address' ? ` ${sym}` : '')
  const text = <text x={x1 - 4 * g.z} y={y} textAnchor="end" style={isAddr && isHit?.(value as string) ? { fill: 'var(--color-link)', fontWeight: 700 } : FG} fontSize={fsV}>{clip(g.display === 'symbol' && sym ? sym : shown, valueChars)}</text>
  return (
    <>
      {labelChars > 0 && <text x={x0 + 4 * g.z} y={y} style={MUTED} fontSize={fsL}>{clip(label, labelChars)}</text>}
      {isAddr ? (
        <g role="button" tabIndex={0} onClick={() => onAddress?.(value as string)} onKeyDown={onKey(() => onAddress?.(value as string))} className="cursor-pointer [&:hover>text]:underline">
          <title>{[value, sym, lookup(value as string)?.comment].filter(Boolean).join(' — ')}</title>
          <rect x={x0} y={y - fsV - 1} width={x1 - x0} height={fsV + 5} fill="transparent" />
          {text}
        </g>
      ) : text}
    </>
  )
}

function Box({ c, p, msgTotal }: { c: DrawCtx; p: Extract<Prim, { k: 'box' }>; msgTotal: number }) {
  const { g } = c
  const sw = Math.max(1.25, 1.6 * g.z)
  const xL = p.x * g.cellW, xR = (p.x + p.w) * g.cellW
  const X0 = xL + 6 * g.z, X1 = xR - 6 * g.z
  const top = p.y * g.rowH + 4 * g.z, bottom = (p.y + p.h) * g.rowH - 4 * g.z
  const wy0 = p.y * g.rowH + g.wireY
  const labels = PARAM_LABELS[p.ins.name] ?? []
  const desc = SUB_NAMES[p.ins.sub]?.desc
  const pins = p.act ? [{ y: 0, name: 'ACT' }] : p.pins
  const lines: { label: string; value: number | string }[] = p.ins.params.map((v, i) => ({ label: labels[i] ?? `P${i + 1}`, value: v }))
  if (isDispb(p.ins)) lines.push({ label: 'Defined', value: `${msgTotal} msg` })
  if (p.ins.table?.length) lines.push({ label: 'Table', value: `${p.ins.table.length} entries` })
  const tip = [`SUB ${p.ins.sub} ${p.ins.name}`, desc, p.ins.table?.length ? `Table: ${p.ins.table.slice(0, 48).join(' ')}${p.ins.table.length > 48 ? ' …' : ''}` : ''].filter(Boolean).join('\n')
  const lineY0 = wy0 + 15 * g.z
  // multi-input boxes keep a left gutter for the pin names (CN0, RST, ACT …)
  const pinW = p.act ? 0 : Math.max(0, ...p.pins.map((pi) => pi.name.length)) * 8 * g.z * 0.62 + (p.pins.length ? 4 * g.z : 0)
  return (
    <g>
      <title>{tip}</title>
      <rect x={X0} y={top} width={X1 - X0} height={bottom - top} rx={2} style={{ fill: 'var(--lad-box)', stroke: 'var(--lad-wire)' }} strokeWidth={sw} />
      <path style={WIRE} strokeWidth={sw} d={pins.map((pi) => { const wy = (p.y + pi.y) * g.rowH + g.wireY; return `M${xL} ${wy}H${X0}` }).join('') + (p.out ? `M${X1} ${wy0}H${xR}` : '')} />
      <text x={X0 + 4 * g.z} y={top + 11 * g.z} style={MUTED} fontSize={8.5 * g.z}>SUB {p.ins.sub}</text>
      <text x={(X0 + X1) / 2} y={top + 13 * g.z} textAnchor="middle" style={FG} fontSize={12 * g.z} fontWeight={700}>{p.ins.name}</text>
      {pins.map((pi) => pi.name && (
        <text key={pi.y} x={X0 + 3 * g.z} y={(p.y + pi.y) * g.rowH + g.wireY + 3.5 * g.z} style={MUTED} fontSize={8 * g.z} fontWeight={600}>{pi.name}</text>
      ))}
      {p.out && <text x={X1 - 3 * g.z} y={wy0 - 3 * g.z} textAnchor="end" style={MUTED} fontSize={8 * g.z}>W1</text>}
      {lines.length > 0 && <path d={`M${X0} ${wy0 + 4 * g.z}H${X1}`} style={{ stroke: 'var(--lad-sep)' }} strokeWidth={1} />}
      {lines.map((l, i) => <ParamRow key={i} c={c} x0={X0 + pinW} x1={X1} y={lineY0 + i * 14 * g.z} label={l.label} value={l.value} />)}
    </g>
  )
}

function Cont({ c, p }: { c: DrawCtx; p: Extract<Prim, { k: 'cont' }> }) {
  const { g } = c
  const sw = Math.max(1.25, 1.6 * g.z)
  const wy = p.y * g.rowH + g.wireY, a = 5 * g.z
  if (p.dir === 'out') {
    const xe = c.W * g.cellW - 12 * g.z
    return (
      <g>
        <path style={WIRE} strokeWidth={sw} d={`M${p.x * g.cellW} ${wy}H${xe - a}`} />
        <path d={`M${xe - a} ${wy - a}L${xe} ${wy}L${xe - a} ${wy + a}Z`} style={{ fill: 'var(--lad-wire)' }} />
        <text x={xe - a / 2} y={wy - 8 * g.z} textAnchor="middle" style={MUTED} fontSize={8.5 * g.z} fontWeight={700}>{p.label}</text>
      </g>
    )
  }
  return (
    <g>
      <rect x={1.5} y={wy - 3 * g.z} width={12 * g.z} height={6 * g.z} style={{ fill: 'var(--lad-bg)' }} />
      <path d={`M${4 * g.z} ${wy - a}L${4 * g.z + a} ${wy}L${4 * g.z} ${wy + a}Z`} style={{ fill: 'var(--lad-wire)' }} />
      <text x={4 * g.z + a / 2} y={wy - 8 * g.z} textAnchor="middle" style={MUTED} fontSize={8.5 * g.z} fontWeight={700}>{p.label}</text>
    </g>
  )
}

export const NetView = memo(function NetView({ item, top, height, g, isHit, msg, msgTotal, mark, onSelect }: {
  item: NetItem; top: number; height: number; g: Geo
  isHit?: (a: string) => boolean
  msg: (a: string) => AlarmMessage | undefined
  msgTotal: number
  /** 'flash' = jump target, 'hit' = current search hit, 'match' = other search hit, 'selected' = tapped */
  mark?: 'flash' | 'hit' | 'match' | 'selected'
  onSelect: (id: number) => void
}) {
  const { onAddress } = useLadder()
  const l = item.layout
  const c: DrawCtx = { g, W: l.w, isHit, msg }
  const railR = g.margin + l.w * g.cellW
  const svgTop = g.padY + (item.comment ? g.commentH : 0)
  const svgH = l.h * g.rowH
  const sw = Math.max(1.25, 1.6 * g.z)
  const strong = mark === 'flash' || mark === 'hit' || mark === 'selected'
  return (
    <div id={`net-${item.id}`} className="absolute inset-x-0" style={{ top, height }}>
      {/* margin (net number) */}
      <div className={cn('absolute inset-y-0 left-0', strong && 'bg-fanuc/25', mark === 'flash' && 'animate-pulse')} style={{ width: g.margin - 1 }} />
      {strong && <div className="absolute inset-y-0 left-0 w-[3px] bg-fanuc" />}
      <button type="button" onClick={() => onSelect(item.id)} aria-label={`Net ${item.id}`}
        className="absolute left-0 flex flex-col items-start justify-start pl-1 text-left font-mono font-semibold"
        style={{ top: svgTop + g.wireY - 7 * g.z, width: g.margin - 2, fontSize: 9.5 * g.z, lineHeight: 1.3, color: 'var(--lad-num)' }}>
        <span className={cn(mark === 'match' && 'rounded-sm bg-fanuc/40 px-0.5 text-[#1C1F22]')}>{netNo(item.id)}</span>
        {item.program && <span className="font-normal" style={{ fontSize: 8.5 * g.z, color: 'var(--lad-muted)' }}>{item.program}</span>}
      </button>
      {/* power rails + separator */}
      <span className="absolute inset-y-0" style={{ left: g.margin - sw / 2, width: sw, background: 'var(--lad-wire)' }} />
      <span className="absolute inset-y-0" style={{ left: railR - sw / 2, width: sw, background: 'var(--lad-wire)' }} />
      <span className="absolute bottom-0 h-px" style={{ left: g.margin + sw, width: Math.max(0, railR - g.margin - sw * 2), background: 'var(--lad-sep)' }} />

      {item.comment && (
        <p className="absolute truncate font-mono italic" title={item.comment}
          style={{ top: g.padY, left: g.margin + 8 * g.z, width: railR - g.margin - 16 * g.z, height: g.commentH, lineHeight: `${g.commentH}px`, fontSize: 10 * g.z, color: 'var(--lad-muted)' }}>
          {item.comment}
        </p>
      )}
      <svg className="absolute overflow-visible font-mono" style={{ top: svgTop, left: g.margin }} width={l.w * g.cellW} height={svgH} aria-label={`Net ${item.id} ladder`}>
        {l.prims.map((p, i) => {
          switch (p.k) {
            case 'h': return <path key={i} style={WIRE} strokeWidth={sw} d={`M${p.x0 * g.cellW} ${p.y * g.rowH + g.wireY}H${p.x1 * g.cellW}`} />
            case 'v': return <path key={i} style={WIRE} strokeWidth={sw} d={`M${p.x * g.cellW} ${p.y0 * g.rowH + g.wireY}V${p.y1 * g.rowH + g.wireY}`} />
            case 'contact': return <Contact key={i} c={c} p={p} />
            case 'coil': return <Coil key={i} c={c} p={p} />
            case 'box': return <Box key={i} c={c} p={p} msgTotal={msgTotal} />
            case 'cont': return <Cont key={i} c={c} p={p} />
            case 'note': return <text key={i} x={p.x * g.cellW + 8 * g.z} y={p.y * g.rowH + g.wireY + 4 * g.z} fontSize={10 * g.z} fontStyle="italic" fill="var(--color-warning)">no output</text>
          }
        })}
      </svg>
      {item.msgs.map((m, i) => (
        <button key={m.address + m.number} type="button" onClick={() => onAddress?.(m.address)} title={`${m.address} — ${m.number} ${m.text}`}
          className="absolute flex items-center gap-1.5 text-left hover:underline"
          style={{ top: svgTop + svgH + i * g.msgH, left: g.margin + 8 * g.z, width: railR - g.margin - 16 * g.z, height: g.msgH, fontSize: 10.5 * g.z }}>
          <span className={cn('shrink-0 rounded-sm px-1 font-mono font-bold leading-snug', m.kind === 'alarm' ? 'bg-danger text-white' : 'bg-accent text-on-accent')} style={{ fontSize: 9 * g.z }}>
            {m.kind === 'alarm' ? 'ALM' : 'MSG'} {m.number}
          </span>
          <span className="min-w-0 truncate font-mono" style={{ color: 'var(--lad-fg)' }}>{m.text}</span>
          <span className="shrink-0 font-mono" style={{ color: 'var(--lad-muted)', fontSize: 9 * g.z }}>{m.text.includes(m.address) ? '' : m.address}</span>
        </button>
      ))}
      {l.issues.length > 0 && (
        <p className="absolute truncate text-warning" title={l.issues.join(' ')}
          style={{ top: svgTop + svgH + item.msgs.length * g.msgH, left: g.margin + 8 * g.z, width: railR - g.margin - 16 * g.z, height: g.issueH, lineHeight: `${g.issueH}px`, fontSize: 10 * g.z }}>
          Drawn best-effort — check the mnemonic view.
        </p>
      )}
    </div>
  )
})
