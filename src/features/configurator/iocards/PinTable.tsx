import { AlertTriangle, ChevronRight } from 'lucide-react'
import { PIN_KINDS, PIN_KIND_LABEL, pinAddress, pinKey, type ConnectorDef, type PinDef, type PinKind } from '@/data/ioCards'
import type { IoModuleInst } from '@/data/ioModules'
import { cn } from '@/lib/utils'
import type { CardsModel } from './model'
import type { PinTarget } from './PinPicker'

const KIND_TONE: Record<PinKind, string> = {
  DI: 'bg-success-soft text-success', DO: 'bg-accent-soft text-link', '0V': 'bg-surface-2 text-muted', '24V': 'bg-danger-soft text-danger',
  '24E': 'bg-danger-soft text-danger', COM: 'bg-surface-2 text-muted', NC: 'bg-surface-2 text-muted',
}
export const KindBadge = ({ k, className }: { k: PinKind; className?: string }) => (
  <span className={cn('inline-flex h-6 min-w-9 items-center justify-center rounded px-1.5 font-mono text-[11px] font-semibold', KIND_TONE[k], className)}>{k === '24E' ? 'DOCOM' : k}</span>
)

function PinCell({ m, card, conn, p, onPick, onKind }: { m: CardsModel; card: IoModuleInst; conn: ConnectorDef; p: PinDef; onPick: (t: PinTarget) => void; onKind?: (k: PinKind) => void }) {
  const key = pinKey(card.id, conn.name, p.sno)
  const address = pinAddress(card, p)
  const pa = m.config.pinMap?.[key]
  const row = address ? m.byAddr.get(address) : undefined
  const err = row ? m.errors[row.id] : undefined
  const io = p.kind === 'DI' || p.kind === 'DO'
  const dangling = pa?.sig && !m.byId.has(pa.sig)
  const ref = { card: card.id, cardName: card.name, conn: conn.name, sno: p.sno, name: p.name, key }
  const spare = row?.id.startsWith('pin.')
  const title = pa?.label ?? (row ? row.comment : undefined)

  return (
    <div className={cn('grid min-h-14 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-2 border-b border-border px-2 py-1.5 last:border-0 sm:grid-cols-[4rem_3.25rem_4.25rem_minmax(0,1fr)]', err && 'bg-danger-soft/50')}>
      <div className="leading-tight">
        <span className="block font-mono text-sm font-semibold tabular">{p.sno}</span>
        {p.name && <span className="block font-mono text-[11px] text-muted">{p.name}</span>}
      </div>
      <div className="flex items-center gap-1.5 sm:contents">
        {onKind ? (
          <select value={p.kind} onChange={(e) => onKind(e.target.value as PinKind)} aria-label={`Pin ${p.sno} type`} className="h-9 rounded-md border border-border bg-surface px-1 font-mono text-xs">
            {PIN_KINDS.map((k) => <option key={k} value={k}>{k === '24E' ? 'DOCOM' : k}</option>)}
          </select>
        ) : <KindBadge k={p.kind} />}
        <span className="font-mono text-sm text-link sm:text-[13px]">{address ?? ''}</span>
        {!io && <span className="truncate text-sm text-muted sm:hidden">{pa?.label ?? PIN_KIND_LABEL[p.kind]}</span>}
      </div>
      {io ? (
        <button onClick={() => onPick({ key, kind: p.kind, address, ref, label: pa?.label })}
          className={cn('col-span-2 mt-1 flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1 text-left transition-colors hover:border-accent sm:col-span-1 sm:mt-0',
            row ? 'border-border bg-surface' : pa?.none ? 'border-dashed border-border bg-surface-2/60' : 'border-dashed border-border', err && 'border-danger')}>
          <span className="min-w-0 flex-1 leading-tight">
            {row ? (
              <>
                <span className="block truncate text-sm font-medium">{title}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="truncate font-mono font-semibold text-fg/80">{row.symbol}</span>
                  <span className={cn('shrink-0 rounded px-1 text-[10px] font-semibold', spare ? 'bg-surface-2' : row.pinned ? 'bg-accent-soft text-link' : 'bg-surface-2')}>{spare ? 'Spare' : row.pinned ? 'Pinned' : 'Auto'}</span>
                </span>
              </>
            ) : pa?.none ? (
              <span className="block truncate text-sm text-muted">Not used{pa.label ? ` · ${pa.label}` : ''}</span>
            ) : (
              <span className="block truncate text-sm text-muted">{dangling ? <span className="flex items-center gap-1 text-warning"><AlertTriangle className="size-3.5" />{pa?.label ?? pa?.sig} — option off</span> : 'Free — tap to assign'}</span>
            )}
            {err && <span className="block truncate text-xs font-medium text-danger">{err}</span>}
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted" />
        </button>
      ) : (
        <span className="hidden truncate text-sm text-muted sm:block">{pa?.label ?? PIN_KIND_LABEL[p.kind]}</span>
      )}
    </div>
  )
}

/** Connector pin table like the panel sheet: S.No | Description | S.No | Description (two halves side by side on wide screens). */
export function PinTable({ m, card, conn, onPick, onKind }: { m: CardsModel; card: IoModuleInst; conn: ConnectorDef; onPick: (t: PinTarget) => void; onKind?: (sno: number, k: PinKind) => void }) {
  const half = Math.ceil(conn.pins.length / 2)
  const cols = [conn.pins.slice(0, half), conn.pins.slice(half)].filter((c) => c.length)
  const head = (
    <div className="hidden grid-cols-[4rem_3.25rem_4.25rem_minmax(0,1fr)] gap-x-2 border-b border-border bg-surface-2 px-2 py-1.5 text-xs font-semibold text-muted sm:grid">
      <span>S.No</span><span>Type</span><span>Address</span><span>Description</span>
    </div>
  )
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {cols.map((pins, i) => (
        <div key={i} className="min-w-0 overflow-hidden rounded-lg border border-border">
          {head}
          {pins.map((p) => <PinCell key={p.sno} m={m} card={card} conn={conn} p={p} onPick={onPick} onKind={onKind ? (k) => onKind(p.sno, k) : undefined} />)}
        </div>
      ))}
    </div>
  )
}

/** Used / free DI and DO pins of a card. */
export function cardUsage(m: CardsModel, card: IoModuleInst, conns: ConnectorDef[]) {
  const u = { di: 0, diUsed: 0, do: 0, doUsed: 0 }
  for (const c of conns) for (const p of c.pins) {
    if (p.kind !== 'DI' && p.kind !== 'DO') continue
    const a = pinAddress(card, p)
    const busy = (a && m.byAddr.has(a)) || m.config.pinMap?.[pinKey(card.id, c.name, p.sno)]?.none
    if (p.kind === 'DI') { u.di++; if (busy) u.diUsed++ } else { u.do++; if (busy) u.doUsed++ }
  }
  return u
}
