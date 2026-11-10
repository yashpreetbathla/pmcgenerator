/**
 * Apply a machine operator panel (MOP) pin sheet to an I/O card: label → signal matching, auto-enable the options
 * the panel needs, switch off conflicting ones, unmatched labels → spare signals (label kept as comment).
 * Deterministic: same config + same MOP → same plan.
 */
import { ACCESSORIES, accParam, accessoryById } from '@/data/accessories'
import { CARD_TEMPLATES, cardConnectors, makeCard, pinAddress, pinKey, type PinAssign, type PinKind } from '@/data/ioCards'
import { nextStart, type IoModuleInst } from '@/data/ioModules'
import { candidates, classify, conflictsOf, normLabel, optionOf, type MopPin } from '@/data/mopPresets'
import { panelFuncById } from '@/data/panelFunctions'
import { resolveAccessories, type BuildConfig } from './generator'

export type MopStatus = 'matched' | 'spare' | 'unused' | 'power' | 'nopin' | 'mismatch'
export interface MopRow {
  conn: string
  sno: number
  label: string
  ref?: string
  key?: string
  card?: string
  kind?: PinKind
  pinName?: string
  address?: string
  status: MopStatus
  sig?: string
  /** option the signal belongs to */
  option?: string
  /** matching function exists but is already on another pin */
  taken?: boolean
}
export interface MopPlan {
  rows: MopRow[]
  assignments: Record<string, PinAssign>
  enable: string[]
  disable: string[]
  params: Record<string, number>
  newCards: IoModuleInst[]
  /** cards whose pins (for the MOP connectors) are replaced */
  cleared: { card: string; conn: string }[]
}

const has = (pins: MopPin[], re: RegExp) => pins.some((p) => re.test(normLabel(p.label)))

/** Options a pasted table implies (mode by code bits, rapid keys, MPG keys). */
export function inferOptions(pins: MopPin[]): { enable: string[]; params: Record<string, number> } {
  const enable: string[] = []
  const params: Record<string, number> = {}
  if (has(pins, /^MODE ?[124]$/)) enable.push('moderot')
  if (has(pins, /^RAPID (F0|0|25|50|100) ?%?$/)) enable.push('rapidkeys')
  if (has(pins, /^[XYZABC] (MPG|HANDLE)$/) || has(pins, /^(MPG )?[X×]? ?(1|10|100)$/)) enable.push('mpgkeys')
  if (has(pins, /^(FEED|FOV|OVR) ?(OVR )?(1|2|4|8)$/)) params['feedovr.bits'] = has(pins, /^(FEED|FOV|OVR) ?(OVR )?16$/) ? 5 : 4
  return { enable, params }
}

/** Signal ids an option would define with the given selection / params. */
function sigIds(cfg: BuildConfig, id: string, sel: Set<string>, params: Record<string, number>): Set<string> {
  const a = accessoryById(id) ?? panelFuncById(id)
  if (!a) return new Set()
  const d = a.define({ axes: cfg.axes, paths: cfg.paths, p: (k) => accParam(a, k, params), has: (x) => sel.has(x) })
  return new Set([...d.inputs, ...d.outputs].map((s) => `${id}.${s.key}`))
}

export function planMop(cfg: BuildConfig, cardId: string, pins: MopPin[], opts: { enable?: string[]; params?: Record<string, number> } = {}): MopPlan {
  const card = cfg.modules.find((m) => m.id === cardId)
  if (!card) throw new Error('Card not found')
  const inf = inferOptions(pins)
  const params = { ...cfg.params, ...inf.params, ...opts.params }
  const enable = [...new Set([...(opts.enable ?? []), ...inf.enable])]
  const blocked = new Set(enable.flatMap(conflictsOf))

  // connectors: on the target card, on another card, or a new card from a template that has that connector
  const conns = [...new Set(pins.map((p) => p.conn))]
  const newCards: IoModuleInst[] = []
  const owner = new Map<string, IoModuleInst>()
  let mods = [...cfg.modules]
  for (const c of conns) {
    const on = (m: IoModuleInst) => cardConnectors(m).some((k) => k.name === c)
    const hit = on(card) ? card : mods.find(on)
    if (hit) { owner.set(c, hit); continue }
    const t = CARD_TEMPLATES.find((t) => t.connectors.some((k) => k.name === c))
    if (!t) continue
    const n = nextStart(mods)
    const id = `m${mods.reduce((m, x) => Math.max(m, Number(x.id.slice(1)) || 0), 0) + 1}`
    const slot = Math.max(0, ...mods.filter((m) => (m.group ?? 0) === (card.group ?? 0)).map((m) => m.slot ?? 1)) + 1
    const nc = makeCard(t.id, id, { name: t.id === 'mkds8' ? `${c} terminal` : t.short, group: card.group ?? 0, base: card.base ?? 0, slot, xStart: n.x, yStart: n.y })
    newCards.push(nc); mods = [...mods, nc]; owner.set(c, nc)
  }
  const cleared = conns.filter((c) => owner.has(c)).map((c) => ({ card: owner.get(c)!.id, conn: c }))
  const clearedKeys = new Set(cleared.map((x) => `${x.card}/${x.conn}/`))
  const used = new Set(Object.entries(cfg.pinMap ?? {}).filter(([k]) => ![...clearedKeys].some((p) => k.startsWith(p))).map(([, v]) => v.sig).filter(Boolean) as string[])

  const sel = new Set([...resolveAccessories(cfg.accessories).list.map((a) => a.id).filter((a) => !blocked.has(a)), ...enable])
  const cache = new Map<string, Set<string>>()
  const exists = (sig: string) => { const o = optionOf(sig); if (!cache.has(o)) cache.set(o, sigIds(cfg, o, new Set([...sel, o]), params)); return cache.get(o)!.has(sig) }

  const rows: MopRow[] = []
  const assignments: Record<string, PinAssign> = {}
  const order = [...pins].sort((a, b) => conns.indexOf(a.conn) - conns.indexOf(b.conn) || a.sno - b.sno)
  for (const p of order) {
    const m = owner.get(p.conn)
    const pd = m ? cardConnectors(m).find((k) => k.name === p.conn)?.pins.find((x) => x.sno === p.sno) : undefined
    const base: MopRow = { conn: p.conn, sno: p.sno, label: p.label, ref: p.ref, status: 'nopin' }
    if (!m || !pd) { rows.push(base); continue }
    const key = pinKey(m.id, p.conn, p.sno)
    const row: MopRow = { ...base, key, card: m.id, kind: pd.kind, pinName: pd.name, address: pinAddress(m, pd) }
    const cls = classify(p.label)
    const io = pd.kind === 'DI' || pd.kind === 'DO'
    if (cls === 'power') { rows.push({ ...row, status: 'power' }); continue }
    if (!io) { rows.push({ ...row, status: cls === 'none' ? 'power' : 'mismatch' }); continue }
    if (cls === 'none') { assignments[key] = { none: true, label: p.label }; rows.push({ ...row, status: 'unused' }); continue }
    if (cls === 'spare') { assignments[key] = { label: p.label }; rows.push({ ...row, status: 'spare' }); continue }
    const cand = candidates(p.label, pd.kind === 'DI' ? 'in' : 'out', cfg.axes).filter((s) => !blocked.has(optionOf(s)) && !used.has(s))
    const pick = cand.find(exists)
    if (!pick) {
      const taken = candidates(p.label, pd.kind === 'DI' ? 'in' : 'out', cfg.axes).some((x) => used.has(x))
      assignments[key] = { label: p.label }; rows.push({ ...row, status: 'spare', ...(taken ? { taken } : {}) }); continue
    }
    used.add(pick)
    const o = optionOf(pick)
    sel.add(o)
    if (accessoryById(o) && !enable.includes(o)) enable.push(o)
    for (const r of panelFuncById(o)?.requires ?? []) if (!enable.includes(r)) enable.push(r)
    for (const c of conflictsOf(o)) blocked.add(c)
    assignments[key] = { sig: pick, label: p.label }
    rows.push({ ...row, status: 'matched', sig: pick, option: o })
  }
  const selected = new Set(cfg.accessories)
  const finalEnable = enable.filter((e) => accessoryById(e) && !blocked.has(e))
  const disable = [...selected].filter((a) => blocked.has(a) && !finalEnable.includes(a))
  const relevant = Object.fromEntries(Object.entries(params).filter(([k]) => (inf.params[k] !== undefined || opts.params?.[k] !== undefined)))
  return { rows, assignments, enable: finalEnable.filter((e) => !selected.has(e)), disable, params: relevant, newCards, cleared }
}

export function applyMopPlan(cfg: BuildConfig, plan: MopPlan, mopId?: string, cardId?: string): BuildConfig {
  const prefixes = plan.cleared.map((x) => `${x.card}/${x.conn}/`)
  const pinMap = Object.fromEntries(Object.entries(cfg.pinMap ?? {}).filter(([k]) => !prefixes.some((p) => k.startsWith(p))))
  Object.assign(pinMap, plan.assignments)
  const sigs = new Set(Object.values(plan.assignments).map((a) => a.sig).filter(Boolean))
  const overrides = Object.fromEntries(Object.entries(cfg.overrides).map(([k, v]) => [k, sigs.has(k) ? { ...v, address: undefined } : v]).filter(([, v]) => Object.values(v as object).some((x) => x !== undefined)))
  const off = new Set(plan.disable)
  const accessories = [...cfg.accessories.filter((a) => !off.has(a)), ...plan.enable.filter((a) => !cfg.accessories.includes(a))]
  const order = new Map(ACCESSORIES.map((a, i) => [a.id, i]))
  accessories.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999))
  const modules = [...cfg.modules, ...plan.newCards].map((m) => (m.id === cardId && mopId ? { ...m, mopId } : m))
  return { ...cfg, accessories, params: { ...cfg.params, ...plan.params }, pinMap, overrides, modules }
}

export const optionLabel = (id: string) => accessoryById(id)?.name ?? panelFuncById(id)?.name ?? id
