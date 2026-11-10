/**
 * I/O card templates with connector pin maps (FANUC LADDER-III terms: I/O Module, Group, Base, Slot, Xm / Yn).
 * Pin → kind (DI / DO / power) + byte/bit offset from the card's X start (Xm) or Y start (Yn).
 * Typical layouts — verify against the FANUC connection manual for your module.
 */
import type { IoModuleInst, ModuleRole } from './ioModules'

export type PinKind = 'DI' | 'DO' | '0V' | '24V' | '24E' | 'COM' | 'NC'
export const PIN_KINDS: PinKind[] = ['DI', 'DO', '0V', '24V', '24E', 'COM', 'NC']
export const PIN_KIND_LABEL: Record<PinKind, string> = { DI: 'Input', DO: 'Output', '0V': '0 V', '24V': '+24 V', '24E': 'DOCOM (24E)', COM: 'COM', NC: 'Not connected' }

export interface PinDef {
  /** pin number as printed on the sheet (S.No) */
  sno: number
  kind: PinKind
  /** HIROSE row label, e.g. "A02" */
  name?: string
  /** byte offset from Xm / Yn and bit (DI / DO only) */
  byte?: number
  bit?: number
}
export interface ConnectorDef { name: string; pins: PinDef[] }

/** What a card pin carries: a signal id ("jog.+XDIRI"), a custom label (spare signal, label = comment) or nothing (DUMMY / unused). */
export interface PinAssign { sig?: string; label?: string; none?: boolean }

/** Custom connector as stored in the config: pin kinds in S.No order (S.No = index + 1). */
export interface CustomConnector { name: string; pins: PinKind[] }

export interface CardTemplate {
  id: string
  name: string
  short: string
  desc: string
  note: string
  /** default X / Y bytes occupied in the I/O Module assignment */
  xBytes: number
  yBytes: number
  use: ModuleRole
  /** fixed connectors (empty for configurable templates) */
  connectors: ConnectorDef[]
  kind?: 'unitA' | 'custom'
}

export const VERIFY = 'Typical — verify against the FANUC connection manual for your module.'

/**
 * HIROSE 50-pin connector, rows 01–25 × columns A/B. S.No 2k+1 = A(k+1), 2k+2 = B(k+1).
 * Row 01: A = 0V, B = +24V. Rows 02–13: 24 inputs, 4 rows per byte (A = even bit, B = odd bit), bytes from inBytes.
 * Rows 14–15: row14 (both columns) per opts. Rows 16–23: 16 outputs, bytes from outBytes. Rows 24–25: DOCOM.
 */
function hirose50(name: string, inBytes: number[], outBytes: number[], opts: { row14?: [PinKind, PinKind] } = {}): ConnectorDef {
  const pins: PinDef[] = []
  for (let sno = 1; sno <= 50; sno++) {
    const row = Math.ceil(sno / 2), b = sno % 2 === 0 ? 1 : 0
    const label = `${b ? 'B' : 'A'}${String(row).padStart(2, '0')}`
    let p: PinDef
    if (row === 1) p = { sno, kind: b ? '24V' : '0V' }
    else if (row <= 13) { const i = (row - 2) * 2 + b; p = { sno, kind: 'DI', byte: inBytes[Math.floor(i / 8)], bit: i % 8 } }
    else if (row === 14) p = { sno, kind: opts.row14?.[b] ?? 'NC' }
    else if (row === 15) p = { sno, kind: 'NC' }
    else if (row <= 23) { const i = (row - 16) * 2 + b; p = { sno, kind: 'DO', byte: outBytes[Math.floor(i / 8)], bit: i % 8 } }
    else p = { sno, kind: '24E' }
    pins.push({ ...p, name: label })
  }
  return { name, pins }
}

/** Sequential terminal: power pins first, then DI bits, DO bits, then trailing pins. */
function terminal(name: string, lead: PinKind[], di: number, doBits: number, tail: PinKind[], diByte0 = 0, doByte0 = 0): ConnectorDef {
  const pins: PinDef[] = []
  let sno = 1
  for (const k of lead) pins.push({ sno: sno++, kind: k })
  for (let i = 0; i < di; i++) pins.push({ sno: sno++, kind: 'DI', byte: diByte0 + Math.floor(i / 8), bit: i % 8 })
  for (let i = 0; i < doBits; i++) pins.push({ sno: sno++, kind: 'DO', byte: doByte0 + Math.floor(i / 8), bit: i % 8 })
  for (const k of tail) pins.push({ sno: sno++, kind: k })
  return { name, pins }
}

export const CARD_TEMPLATES: CardTemplate[] = [
  { id: 'op-ce56', name: 'Operator panel I/O module (CE56 / CE57)', short: 'Operator panel module', use: 'panel', xBytes: 16, yBytes: 8,
    desc: '48 DI / 32 DO on two 50-pin connectors. CE56 = Xm+0.0–Xm+2.7 / Yn+0.0–Yn+1.7, CE57 = Xm+3.0–Xm+5.7 / Yn+2.0–Yn+3.7.',
    note: `Same row layout as the connector panel module (rows 02–13 inputs, 16–23 outputs, 24–25 DOCOM). ${VERIFY}`,
    connectors: [hirose50('CE56', [0, 1, 2], [0, 1], { row14: ['0V', '0V'] }), hirose50('CE57', [3, 4, 5], [2, 3], { row14: ['0V', '0V'] })] },
  { id: 'conn-cb', name: 'Connector panel I/O module (CB104–CB107)', short: 'Connector panel module', use: 'machine', xBytes: 16, yBytes: 8,
    desc: '96 DI / 64 DO on four 50-pin connectors (Xm+0–Xm+11 / Yn+0–Yn+7). Xm+12–15 are the MPG counters on the basic module.',
    note: 'Pin layout per FANUC connection manual B-64113EN/03 §9.1.4 "Connector pin arrangement" (HIROSE 50-pin, rows 01–25 × A/B). Verify for your module.',
    connectors: [hirose50('CB104', [0, 1, 2], [0, 1]), hirose50('CB105', [3, 8, 9], [2, 3]), hirose50('CB106', [4, 5, 6], [4, 5], { row14: ['COM', 'NC'] }), hirose50('CB107', [7, 10, 11], [6, 7])] },
  { id: 'unit-a', name: 'I/O Unit-MODEL A (DI / DO modules on a base)', short: 'I/O Unit-MODEL A', use: 'any', xBytes: 4, yBytes: 4, kind: 'unitA',
    desc: 'Choose how many DI and DO bytes the fitted modules have — terminals are numbered in order.', note: VERIFY, connectors: [] },
  { id: 'generic-16', name: 'Generic 16 DI / 16 DO module', short: 'Generic 16/16', use: 'any', xBytes: 2, yBytes: 2,
    desc: 'One 40-pin connector: 0V, +24V, 16 inputs, 16 outputs, DOCOM.', note: VERIFY,
    connectors: [terminal('CN1', ['0V', '24V'], 16, 16, ['24E', '24E', '0V', '0V'])] },
  { id: 'mkds8', name: 'Output terminal 8 DO (e.g. MKDS3/8)', short: 'Output terminal 8 DO', use: 'panel', xBytes: 0, yBytes: 1,
    desc: '8 outputs on a screw terminal (Yn+0.0–Yn+0.7) — e.g. tool number display and extra LEDs.', note: VERIFY,
    connectors: [terminal('MKDS3/8', [], 0, 8, [])] },
  { id: 'custom-card', name: 'Custom card (define connectors and pins)', short: 'Custom card', use: 'any', xBytes: 2, yBytes: 2, kind: 'custom',
    desc: 'Define your own connectors, pin count and which pins are inputs, outputs or power.', note: 'Inputs and outputs are numbered in pin order across all connectors.', connectors: [] },
]

export const cardTemplateById = (id?: string) => CARD_TEMPLATES.find((t) => t.id === id)

/** Resolved connectors of a card instance (with byte / bit per DI / DO pin). */
export function cardConnectors(m: IoModuleInst): ConnectorDef[] {
  const t = cardTemplateById(m.templateId)
  if (!t) return []
  if (t.kind === 'unitA') {
    const di = Math.max(0, m.diBytes ?? 2), dO = Math.max(0, m.doBytes ?? 2)
    const out: ConnectorDef[] = []
    if (di) out.push(terminal('DI', [], di * 8, 0, ['COM', '0V']))
    if (dO) out.push(terminal('DO', [], 0, dO * 8, ['24E', '0V']))
    return out
  }
  if (t.kind === 'custom') {
    let di = 0, dO = 0
    return (m.connectors ?? []).map((c) => ({
      name: c.name,
      pins: c.pins.map((kind, i) => {
        if (kind === 'DI') { const n = di++; return { sno: i + 1, kind, byte: Math.floor(n / 8), bit: n % 8 } }
        if (kind === 'DO') { const n = dO++; return { sno: i + 1, kind, byte: Math.floor(n / 8), bit: n % 8 } }
        return { sno: i + 1, kind }
      }),
    }))
  }
  return t.connectors
}

/** Address of a DI / DO pin on a card ("X16.3"), undefined for power pins. */
export const pinAddress = (m: IoModuleInst, p: PinDef) =>
  p.byte === undefined || p.bit === undefined ? undefined : p.kind === 'DI' ? `X${m.xStart + p.byte}.${p.bit}` : p.kind === 'DO' ? `Y${m.yStart + p.byte}.${p.bit}` : undefined

/** "A02 / S.No 3" style label. */
export const pinLabel = (p: PinDef) => (p.name ? `${p.name} / S.No ${p.sno}` : `S.No ${p.sno}`)

export const pinKey = (cardId: string, conn: string, sno: number) => `${cardId}/${conn}/${sno}`
export const parsePinKey = (k: string) => { const [card, conn, sno] = k.split('/'); return { card, conn, sno: Number(sno) } }

/** DI / DO pin counts of a card. */
export function cardCapacity(m: IoModuleInst) {
  let di = 0, dO = 0
  for (const c of cardConnectors(m)) for (const p of c.pins) { if (p.kind === 'DI') di++; else if (p.kind === 'DO') dO++ }
  return { di, do: dO }
}

/** X / Y bytes the pins of a card really use (for the default I/O Module size). */
export function pinBytes(m: IoModuleInst) {
  let x = 0, y = 0
  for (const c of cardConnectors(m)) for (const p of c.pins) if (p.byte !== undefined) { if (p.kind === 'DI') x = Math.max(x, p.byte + 1); else if (p.kind === 'DO') y = Math.max(y, p.byte + 1) }
  return { x, y }
}

/** New card instance from a template. */
export function makeCard(templateId: string, id: string, o: Partial<IoModuleInst> = {}): IoModuleInst {
  const t = cardTemplateById(templateId) ?? CARD_TEMPLATES[0]
  const base: IoModuleInst = {
    id, typeId: 'custom', templateId: t.id, name: t.short, role: t.use, xStart: 0, yStart: 0, xBytes: t.xBytes, yBytes: t.yBytes, group: 0, base: 0, slot: 1,
    ...(t.kind === 'unitA' ? { diBytes: 4, doBytes: 4 } : {}),
    ...(t.kind === 'custom' ? { connectors: [{ name: 'CN1', pins: ['0V', '24V', ...Array(8).fill('DI'), ...Array(8).fill('DO'), '24E', '24E'] as PinKind[] }] } : {}),
  }
  return { ...base, ...o }
}
