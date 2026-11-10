import { useState, type CSSProperties } from 'react'
import { AlertTriangle, ChevronRight, Info } from 'lucide-react'
import { Button, Select, Sheet } from '@/components/ui'
import { ROT_POS, accParam, accessoryById } from '@/data/accessories'
import { cardConnectors, pinAddress, pinKey } from '@/data/ioCards'
import type { IoModuleInst } from '@/data/ioModules'
import type { MopItem, MopPreset } from '@/data/mopPresets'
import { cn } from '@/lib/utils'
import type { CardsModel } from './model'
import type { PinTarget } from './PinPicker'

/** Resolve a [connector, S.No] of a MOP to a pin target on the card (or another card holding that connector). */
function useResolver(m: CardsModel, card: IoModuleInst) {
  return (ref?: [string, number]): PinTarget | undefined => {
    if (!ref) return undefined
    const [conn, sno] = ref
    const owner = cardConnectors(card).some((c) => c.name === conn) ? card : m.config.modules.find((x) => cardConnectors(x).some((c) => c.name === conn))
    const p = owner && cardConnectors(owner).find((c) => c.name === conn)?.pins.find((x) => x.sno === sno)
    if (!owner || !p) return undefined
    const key = pinKey(owner.id, conn, sno)
    return { key, kind: p.kind, address: pinAddress(owner, p), ref: { card: owner.id, cardName: owner.name, conn, sno, name: p.name, key }, label: m.config.pinMap?.[key]?.label }
  }
}

/** Is a pin carrying a real (non-spare) function? */
const mapped = (m: CardsModel, t?: PinTarget) => { const r = t?.address ? m.byAddr.get(t.address) : undefined; return !!r && !r.id.startsWith('pin.') }

function PinLine({ m, t, role, onPick }: { m: CardsModel; t?: PinTarget; role: string; onPick: (t: PinTarget) => void }) {
  if (!t) return <p className="text-sm text-muted">{role}: no pin on this card</p>
  const r = t.address ? m.byAddr.get(t.address) : undefined
  const pa = m.config.pinMap?.[t.key]
  const ok = mapped(m, t)
  return (
    <button onClick={() => onPick(t)} className={cn('flex min-h-14 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left hover:border-accent', ok ? 'border-border' : 'border-warning/50 bg-warning-soft/40')}>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted">{role} · {t.ref.conn} / S.No {t.ref.sno}{t.ref.name ? ` / ${t.ref.name}` : ''}</span>
        <span className="flex flex-wrap items-baseline gap-x-2"><span className="font-mono text-sm font-semibold text-link">{t.address}</span>
          <span className="truncate text-sm">{r ? <><span className="font-mono font-semibold">{r.symbol}</span> · {r.comment}</> : pa?.none ? 'Not used' : 'Free'}</span></span>
      </span>
      {!ok && <AlertTriangle className="size-4 shrink-0 text-warning" aria-label="No function" />}
      <ChevronRight className="size-4 shrink-0 text-muted" />
    </button>
  )
}

function ModeTable({ m }: { m: CardsModel }) {
  const a = accessoryById('moderot')!
  if (!m.config.accessories.includes('moderot')) return null
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-sm font-semibold">Switch code → mode</p>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 8 }, (_, k) => (
          <label key={k} className="block min-w-0"><span className="mb-1 block font-mono text-xs text-muted">Code {k} ({[4, 2, 1].map((b) => (k & b ? 1 : 0)).join('')})</span>
            <Select value={accParam(a, `pos${k}`, m.config.params)} onChange={(e) => m.update((c) => ({ ...c, params: { ...c.params, [`moderot.pos${k}`]: Number(e.target.value) } }))}>
              {ROT_POS.map((p, i) => <option key={p.k} value={i}>{p.n}</option>)}
            </Select>
          </label>
        ))}
      </div>
    </div>
  )
}

/** Front-panel drawing of a MOP: tap a key to see its pins, addresses and function, and re-map it. */
export function MopPanel({ m, card, preset, onPick }: { m: CardsModel; card: IoModuleInst; preset: MopPreset; onPick: (t: PinTarget) => void }) {
  const res = useResolver(m, card)
  const [detail, setDetail] = useState<MopItem | null>(null)
  const pick = (t: PinTarget) => { setDetail(null); onPick(t) }
  const unmapped = preset.panel.flatMap((s) => s.items).filter((i) => (i.in && !mapped(m, res(i.in))) || (i.bits && i.bits.some((b) => !mapped(m, res(b)))) || (i.lamp && !mapped(m, res(i.lamp)))).length

  return (
    <div>
      <p className="mb-3 flex items-center gap-1.5 text-sm text-muted">
        <Info className="size-4 shrink-0" />Tap a key to see its pin and address. {unmapped > 0 ? <span className="font-medium text-warning">{unmapped} item{unmapped > 1 ? 's' : ''} without a function (outlined).</span> : 'Every key has a function.'}
      </p>
      <div className="mx-auto max-w-2xl space-y-4 rounded-xl bg-bezel p-3 sm:p-4">
        {preset.panel.map((s) => (
          <section key={s.title}>
            <h4 className="mb-2 text-xs font-semibold text-bezel-fg/70">{s.title}</h4>
            <div className="pb-1">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2 sm:grid-cols-[repeat(var(--cols),minmax(0,1fr))]" style={{ '--cols': s.cols } as CSSProperties}>
                {s.items.map((it, i) => {
                  const inT = res(it.in), lampT = res(it.lamp)
                  const okIn = !it.in || mapped(m, inT), okLamp = !it.lamp || mapped(m, lampT), okBits = !it.bits || it.bits.every((b) => mapped(m, res(b)))
                  const warn = !(okIn && okLamp && okBits) && it.type !== 'hard' && it.type !== 'blank'
                  const shape = it.type === 'knob' || it.type === 'lamp' ? 'rounded-full aspect-square mx-auto w-full max-w-24' : it.type === 'key' ? 'rounded-lg aspect-square' : 'rounded-lg min-h-[4.25rem]'
                  return (
                    <button key={i} onClick={() => setDetail(it)} style={it.span ? { gridColumn: `span ${it.span}` } : undefined}
                      className={cn('relative flex min-w-0 flex-col items-center justify-center p-1.5 text-center text-[11px] leading-tight font-semibold transition-transform active:scale-95', shape,
                        it.type === 'key' && 'bg-surface text-fg shadow-[inset_0_-3px_0_rgba(0,0,0,0.18)]',
                        it.type === 'button' && (/start/i.test(it.label) ? 'bg-success text-white' : 'bg-danger text-white'),
                        it.type === 'knob' && 'border-4 border-bezel-2 bg-surface-2 text-fg',
                        it.type === 'lamp' && (okLamp ? 'bg-accent text-on-accent' : 'bg-bezel-2 text-bezel-fg'),
                        it.type === 'switch' && 'bg-bezel-2 text-bezel-fg ring-1 ring-bezel-fg/20',
                        it.type === 'display' && 'rounded-lg bg-black font-mono text-accent',
                        it.type === 'hard' && 'border border-dashed border-bezel-fg/30 text-bezel-fg/60',
                        it.type === 'blank' && 'border border-dashed border-bezel-fg/30 text-bezel-fg/40',
                        warn && 'ring-3 ring-warning')}>
                      {it.lamp && it.type !== 'lamp' && <span className={cn('absolute top-1.5 right-1.5 size-2 rounded-full', okLamp ? 'bg-accent shadow-[0_0_6px_#FFC20E]' : 'bg-muted/50')} />}
                      {it.type === 'display' && <span className="text-lg">88</span>}
                      <span className="break-words">{it.label}</span>
                      {it.type === 'knob' && it.positions && <span className="mt-0.5 text-[9px] font-normal text-muted">{it.positions.length > 2 ? `${it.positions.length} pos.` : it.positions[0]}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          </section>
        ))}
      </div>

      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail?.label ?? ''} subtitle={detail ? `${preset.name} · ${detail.type === 'key' ? 'push button' : detail.type}` : undefined}>
        {detail && (
          <div className="space-y-2">
            {detail.note && <p className="text-sm text-muted">{detail.note}</p>}
            {detail.in && <PinLine m={m} t={res(detail.in)} role="Input" onPick={pick} />}
            {detail.lamp && <PinLine m={m} t={res(detail.lamp)} role="Lamp" onPick={pick} />}
            {detail.bits?.filter((b) => !detail.in || b[0] !== detail.in[0] || b[1] !== detail.in[1]).map((b, i) => <PinLine key={i} m={m} t={res(b)} role={detail.type === 'display' ? `Bit ${1 << i}` : detail.type === 'switch' ? 'Other contact' : `Code bit ${1 << i}`} onPick={pick} />)}
            {detail.positions && detail.positions.length > 2 && <p className="text-sm text-muted">Positions: {detail.positions.join(' · ')}</p>}
            {/mode/i.test(detail.label) && detail.type === 'knob' && <ModeTable m={m} />}
            <Button className="mt-2 w-full" onClick={() => setDetail(null)}>Done</Button>
          </div>
        )}
      </Sheet>
    </div>
  )
}
