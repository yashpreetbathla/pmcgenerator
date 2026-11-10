import { cardsOf, type BuildConfig, type IoRow } from '@/core/generator'
import { PIN_KIND_LABEL, cardConnectors, cardTemplateById, pinAddress, pinKey, type PinDef } from '@/data/ioCards'
import type { IoModuleInst } from '@/data/ioModules'
import { mopById } from '@/data/mopPresets'
import { DRAFT_NOTICE, toCsv } from '@/lib/utils'

interface PinOut { card: IoModuleInst; conn: string; p: PinDef; address?: string; row?: IoRow; label: string; spare: boolean }

function pinsOf(cfg: BuildConfig, rows: IoRow[]): PinOut[] {
  const byAddr = new Map(rows.map((r) => [r.address, r]))
  const out: PinOut[] = []
  for (const card of cardsOf(cfg)) for (const c of cardConnectors(card)) for (const p of c.pins) {
    const address = pinAddress(card, p)
    const row = address ? byAddr.get(address) : undefined
    const pa = cfg.pinMap?.[pinKey(card.id, c.name, p.sno)]
    const io = p.kind === 'DI' || p.kind === 'DO'
    const label = pa?.label ?? (row ? row.comment : pa?.none ? 'NOT USED' : io ? '' : PIN_KIND_LABEL[p.kind])
    const spare = io && !pa?.none && (!row || row.id.startsWith('pin.'))
    out.push({ card, conn: c.name, p, address, row, label, spare })
  }
  return out
}

export function ioCsv(cfg: BuildConfig, rows: IoRow[]) {
  const data = pinsOf(cfg, rows).map((x) => ({
    card: x.card.name, group: x.card.group ?? 0, base: x.card.base ?? 0, slot: x.card.slot ?? 1, connector: x.conn, sno: x.p.sno, pin: x.p.name ?? '',
    type: x.p.kind === '24E' ? 'DOCOM' : x.p.kind, address: x.address ?? '', symbol: x.row?.symbol ?? '', description: x.label, function: x.row && !x.row.id.startsWith('pin.') ? `${x.row.comment} (${x.row.group})` : x.spare ? 'Spare' : '',
  }))
  return toCsv(data, ['card', 'group', 'base', 'slot', 'connector', 'sno', 'pin', 'type', 'address', 'symbol', 'description', 'function'])
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Printable sheet like a panel wiring sheet: per connector S.No | Description | S.No | Description, then spare lists. */
export function ioHtml(cfg: BuildConfig, rows: IoRow[], title: string) {
  const pins = pinsOf(cfg, rows)
  const cell = (x?: PinOut) => (x ? `<td class="n">${x.p.sno}${x.p.name ? `<small>${x.p.name}</small>` : ''}</td><td>${esc(x.label)}${x.address ? `<small class="a">${x.address}${x.row ? ` · ${esc(x.row.symbol)}` : ''}</small>` : ''}</td>` : '<td></td><td></td>')
  const sections = cardsOf(cfg).map((card) => {
    const t = cardTemplateById(card.templateId)
    const mop = mopById(card.mopId)
    const conns = cardConnectors(card).map((c) => {
      const list = pins.filter((x) => x.card.id === card.id && x.conn === c.name)
      const half = Math.ceil(list.length / 2)
      const body = Array.from({ length: half }, (_, i) => `<tr>${cell(list[i])}${cell(list[half + i])}</tr>`).join('')
      return `<div class="conn"><h3>${esc(c.name)}</h3><table><thead><tr><th>S.No</th><th>Description</th><th>S.No</th><th>Description</th></tr></thead><tbody>${body}</tbody></table></div>`
    }).join('')
    const sp = (k: 'DI' | 'DO') => pins.filter((x) => x.card.id === card.id && x.p.kind === k && x.spare).map((x) => `${x.conn} / ${x.p.sno}`).join(', ') || '—'
    return `<section><h2>${esc(card.name)}${mop ? ` — ${esc(mop.name)}` : ''}</h2><p class="meta">${esc(t?.name ?? '')} · Group ${card.group ?? 0} · Base ${card.base ?? 0} · Slot ${card.slot ?? 1} · X${card.xStart}–X${card.xStart + card.xBytes - 1} · Y${card.yStart}–Y${card.yStart + card.yBytes - 1}</p>${conns}
      <p class="sp"><b>Input spares:</b> ${esc(sp('DI'))}</p><p class="sp"><b>Output spares:</b> ${esc(sp('DO'))}</p></section>`
  }).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — IO details</title>
<style>body{font:13px/1.35 system-ui,sans-serif;color:#1c1f22;margin:24px}h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 2px}h3{font-size:14px;margin:12px 0 4px}
.meta,.note{color:#5e666d;margin:0 0 8px}table{border-collapse:collapse;width:100%;max-width:900px}th,td{border:1px solid #9aa2a9;padding:3px 6px;text-align:left;vertical-align:top}th{background:#e3e6e5}
td.n{width:52px;font-family:ui-monospace,monospace;font-weight:600}small{display:block;color:#5e666d;font-weight:400;font-family:ui-monospace,monospace;font-size:11px}.conn{break-inside:avoid;margin-bottom:12px}
.sp{margin:4px 0}button{font:inherit;padding:6px 14px;margin:8px 0}@media print{button{display:none}body{margin:10mm}section{break-before:page}section:first-of-type{break-before:auto}}</style></head>
<body><h1>${esc(title)} — IO details</h1><p class="note">${esc(DRAFT_NOTICE)} Pin layouts are typical — verify against the FANUC connection manual for your module.</p><button onclick="print()">Print</button>${sections}</body></html>`
}
