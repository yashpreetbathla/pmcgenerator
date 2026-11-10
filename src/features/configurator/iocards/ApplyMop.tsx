import { useMemo, useState } from 'react'
import { ArrowLeft, Check, ClipboardPaste, LayoutGrid } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Callout, Select, Sheet } from '@/components/ui'
import { applyMopPlan, optionLabel, planMop, type MopRow, type MopStatus } from '@/core/mop'
import { cardConnectors } from '@/data/ioCards'
import type { IoModuleInst } from '@/data/ioModules'
import { MOP_PRESETS, parseMopTable, type MopPin } from '@/data/mopPresets'
import { cn } from '@/lib/utils'
import { Choice } from '../parts'
import type { CardsModel } from './model'

const STATUS: Record<MopStatus, { label: string; tone: 'success' | 'neutral' | 'warning' | 'accent' | 'danger' }> = {
  matched: { label: 'Matched', tone: 'success' }, spare: { label: 'Spare', tone: 'warning' }, unused: { label: 'Not used', tone: 'neutral' },
  power: { label: 'Power', tone: 'neutral' }, nopin: { label: 'No such pin', tone: 'danger' }, mismatch: { label: 'Power pin', tone: 'danger' },
}
const EXAMPLE = 'CE56\n3 AUTO SW11\n4 EDIT SW12\n\nCE57,7,+X\nCE57 8 +Z\nInput spares: CE57/13, 14'

/** Apply a MOP (preset or pasted table) to a card: choose → preview (matched / spare) → confirm. */
export function ApplyMop({ m, card, onClose }: { m: CardsModel; card: IoModuleInst; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [conn, setConn] = useState(cardConnectors(card)[0]?.name ?? 'CE56')
  const [showAll, setShowAll] = useState(false)
  const preset = MOP_PRESETS.find((p) => p.id === src)

  const parsed = useMemo(() => (src === 'paste' ? parseMopTable(text, conn) : null), [src, text, conn])
  const pins: MopPin[] = useMemo(() => preset?.pins ?? parsed?.pins ?? [], [preset, parsed])
  const plan = useMemo(() => (pins.length ? planMop(m.config, card.id, pins, { enable: preset?.enable, params: preset?.params }) : null), [m.config, card.id, pins, preset])
  const counts = plan ? plan.rows.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {} as Record<string, number>) : {}
  const sym = (r: MopRow) => (r.sig ? r.sig.slice(r.sig.indexOf('.') + 1) : '')

  const confirm = () => {
    if (!plan) return
    m.update((c) => applyMopPlan(c, plan, preset?.id, card.id))
    const parts = [`${counts.matched ?? 0} pins matched`, `${counts.spare ?? 0} spare`]
    toast.success(`${preset?.name ?? 'MOP table'} applied: ${parts.join(', ')}`, {
      description: [plan.enable.length ? `Enabled: ${plan.enable.map(optionLabel).join(', ')}.` : '', plan.disable.length ? `Switched off: ${plan.disable.map(optionLabel).join(', ')}.` : '', plan.newCards.length ? `Added ${plan.newCards.map((c) => c.name).join(', ')}.` : ''].filter(Boolean).join(' ') || undefined,
      duration: 8000,
    })
    onClose()
  }

  const shown = plan?.rows.filter((r) => showAll || r.status !== 'power') ?? []
  const byConn = [...new Set(shown.map((r) => r.conn))].map((c) => ({ conn: c, rows: shown.filter((r) => r.conn === c) }))

  return (
    <Sheet open onClose={onClose} wide title={src ? (preset ? `Apply ${preset.name}` : 'Paste MOP table') : 'Apply MOP'} subtitle={`to ${card.name}`}
      footer={src ? (
        <div className="flex items-center gap-2">
          <Button onClick={() => setSrc(null)}><ArrowLeft />Back</Button>
          <span className="flex-1" />
          <Button variant="primary" size="lg" disabled={!plan || !plan.rows.length} onClick={confirm}><Check />Apply to pins</Button>
        </div>
      ) : undefined}>
      {!src && (
        <div className="space-y-2">
          <p className="text-sm text-muted">Pick your panel. Every pin label is matched to a PMC function; anything unknown becomes a spare signal with the label as its comment.</p>
          {MOP_PRESETS.map((p) => (
            <Choice key={p.id} selected={card.mopId === p.id} onClick={() => setSrc(p.id)}>
              <span className="flex items-center gap-2 font-medium"><LayoutGrid className="size-4 text-muted" />{p.name}</span>
              <span className="block text-sm text-muted">{p.desc}</span>
              <span className="mt-1 block font-mono text-xs text-muted">{[...new Set(p.pins.map((x) => x.conn))].join(' · ')}</span>
            </Choice>
          ))}
          <Choice selected={false} onClick={() => setSrc('paste')}>
            <span className="flex items-center gap-2 font-medium"><ClipboardPaste className="size-4 text-muted" />Paste MOP table</span>
            <span className="block text-sm text-muted">From Excel, a PDF or plain text: “CE56,3,MODE 1”, “CE56 3 MODE 1” or a connector line followed by “3 AUTO SW11”.</span>
          </Choice>
        </div>
      )}
      {src === 'paste' && (
        <div className="mb-3 space-y-2">
          <label className="block text-sm font-medium" htmlFor="mop-paste">MOP table</label>
          <textarea id="mop-paste" value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder={EXAMPLE}
            className="w-full rounded-lg border border-border bg-surface p-3 font-mono text-base sm:text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none" />
          <div className="flex flex-wrap items-end gap-2">
            <label className="block min-w-40"><span className="mb-1 block text-xs text-muted">Lines without a connector go to</span>
              <Select value={conn} onChange={(e) => setConn(e.target.value)}>{cardConnectors(card).map((c) => <option key={c.name}>{c.name}</option>)}</Select>
            </label>
            {parsed && parsed.skipped.length > 0 && <p className="text-xs text-warning">{parsed.skipped.length} line{parsed.skipped.length > 1 ? 's' : ''} not understood: {parsed.skipped.slice(0, 2).join(' · ')}</p>}
          </div>
        </div>
      )}
      {src && plan && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="success">{counts.matched ?? 0} matched</Badge>
            <Badge tone="warning">{counts.spare ?? 0} spare</Badge>
            <Badge>{counts.unused ?? 0} not used</Badge>
            {(counts.nopin ?? 0) + (counts.mismatch ?? 0) > 0 && <Badge tone="danger">{(counts.nopin ?? 0) + (counts.mismatch ?? 0)} problem</Badge>}
            <button className="ml-auto text-sm font-medium text-link underline" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Hide power pins' : 'Show power pins'}</button>
          </div>
          {(plan.enable.length > 0 || plan.disable.length > 0 || plan.newCards.length > 0) && (
            <Callout title="This also changes your options">
              {plan.enable.length > 0 && <p>Enables: {plan.enable.map(optionLabel).join(', ')}.</p>}
              {plan.disable.length > 0 && <p>Switches off (conflicts): {plan.disable.map(optionLabel).join(', ')}.</p>}
              {plan.newCards.length > 0 && <p>Adds card: {plan.newCards.map((c) => `${c.name} at Y${c.yStart}`).join(', ')} — change its Y start afterwards if it is wired elsewhere.</p>}
              {Object.entries(plan.params).map(([k, v]) => <p key={k}>Sets {k === 'feedovr.bits' ? `feed override switch to ${v} code bits` : `${k} = ${v}`}.</p>)}
            </Callout>
          )}
          {byConn.map(({ conn: c, rows }) => (
            <section key={c}>
              <h3 className="mb-1 text-sm font-semibold">{c}</h3>
              <div className="overflow-hidden rounded-lg border border-border">
                {rows.map((r) => (
                  <div key={`${r.conn}/${r.sno}`} className={cn('grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-2.5 py-2 text-sm last:border-0', r.status === 'spare' && 'bg-warning-soft/50')}>
                    <span className="font-mono font-semibold tabular">{r.sno}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.label}{r.ref && <span className="ml-1 text-xs text-muted">{r.ref}</span>}</span>
                      <span className="block truncate text-xs text-muted">
                        {r.address && <span className="font-mono text-link">{r.address} </span>}
                        {r.status === 'matched' ? <>→ <span className="font-mono">{sym(r)}</span> · {optionLabel(r.option ?? '')}</> : r.status === 'spare' ? (r.taken ? 'Function already on another pin — kept as spare' : 'Kept as spare signal (label = comment)') : r.status === 'nopin' ? 'This card has no such connector / pin' : r.status === 'mismatch' ? 'Pin is a power pin on this card' : r.kind ?? ''}
                      </span>
                    </span>
                    <Badge tone={STATUS[r.status].tone}>{r.status === 'matched' && <Check className="size-3" />}{STATUS[r.status].label}</Badge>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {src === 'paste' && !plan && <p className="text-sm text-muted">Paste a table to see the preview.</p>}
    </Sheet>
  )
}
