/**
 * Deterministic PMC generator: BuildConfig → PmcProject (origin 'generated').
 * Same config (+ same id/now) → identical output.
 */
import type { AlarmMessage, Instruction, Net, PmcProject, SymbolEntry } from '@/core/types'
import { parseAddress } from '@/core/types'
import { ACCESSORIES, OFF, ON, accParam, accessoryById, and, andAny, andn, anyOf, fn, or, rd, rdn, wrt, type AccDef, type Accessory, type Ctx, type NetDef, type Side } from '@/data/accessories'
import { CUSTOM_CONTROL_ID, PMC_TYPES, TYPICAL_NOTE, areaRanges, controlById, pmcById, stdAddr, stdByAddress, type PmcTypeSpec } from '@/data/controls'
import { defaultModules, type IoModuleInst } from '@/data/ioModules'
import { machineById, type MachineTypeId } from '@/data/machineTypes'
import { uid } from '@/lib/utils'

/* ================================================================== */
/* Config                                                              */
/* ================================================================== */
export interface CustomIo { symbol: string; comment: string }
export interface CustomOutput extends CustomIo { onM?: number; offM?: number; follow?: string }
/**
 * Custom device message. trigger = one of the device's input symbols (no trigger → placeholder relay).
 * timeout (ms): the condition must persist this long (TMRB) — e.g. "clamp not confirmed within 3 s".
 * Alarms latch until CNC reset once the cause is gone and hold the feed / inhibit cycle start; operator messages follow the condition.
 */
export interface CustomAlarm { text: string; kind: 'alarm' | 'operator'; trigger?: string; when?: 'on' | 'off'; timeout?: number }
export interface CustomDevice { id: string; name: string; inputs: CustomIo[]; outputs: CustomOutput[]; alarms: CustomAlarm[] }
export interface IoOverride { address?: string; symbol?: string; comment?: string }

export interface BuildConfig {
  version: 1
  name: string
  builder?: string
  memo?: string
  controlId: string
  customControlName?: string
  pmcId: string
  machineId: MachineTypeId
  axes: string[]
  paths: number
  accessories: string[]
  params: Record<string, number>
  modules: IoModuleInst[]
  customDevices: CustomDevice[]
  overrides: Record<string, IoOverride>
}

const DEFAULT_CONTROL: Record<'T' | 'M' | 'any', string> = { T: '0i-tf-plus', M: '0i-mf-plus', any: '0i-mf-plus' }

export function defaultConfig(machineId: MachineTypeId = 'lathe'): BuildConfig {
  const m = machineById(machineId)
  const control = controlById(DEFAULT_CONTROL[m.series])!
  return applyMachine({
    version: 1, name: '', controlId: control.id, pmcId: control.pmc[0], machineId, axes: [], paths: 1, accessories: [], params: {},
    modules: defaultModules(), customDevices: [], overrides: {},
  }, machineId)
}

/** Switch machine type: axes, paths and default options. */
export function applyMachine(cfg: BuildConfig, machineId: MachineTypeId): BuildConfig {
  const m = machineById(machineId)
  const ctl = controlById(cfg.controlId)
  return { ...cfg, machineId, axes: [...m.axes], paths: Math.min(m.paths, ctl?.paths ?? 10), accessories: withRequired(m.defaults), overrides: {} }
}

/** Switch control: default PMC type for it. */
export function applyControl(cfg: BuildConfig, controlId: string): BuildConfig {
  if (controlId === CUSTOM_CONTROL_ID) return { ...cfg, controlId, pmcId: cfg.pmcId || PMC_TYPES[0].id }
  const c = controlById(controlId)
  if (!c) return cfg
  return { ...cfg, controlId, pmcId: c.pmc.includes(cfg.pmcId) ? cfg.pmcId : c.pmc[0], paths: Math.min(cfg.paths, c.paths) }
}

const withRequired = (ids: string[]) => [...new Set([...ACCESSORIES.filter((a) => a.required).map((a) => a.id), ...ids])]

/** Selected accessories in catalog order, with required + dependencies added. */
export function resolveAccessories(ids: string[]): { list: Accessory[]; added: string[] } {
  const sel = new Set(withRequired(ids))
  const added: string[] = []
  let grew = true
  while (grew) {
    grew = false
    for (const id of [...sel]) for (const r of accessoryById(id)?.requires ?? []) if (!sel.has(r)) { sel.add(r); added.push(r); grew = true }
  }
  return { list: ACCESSORIES.filter((a) => sel.has(a.id)), added: added.filter((a) => !ids.includes(a)) }
}

export const controlName = (cfg: BuildConfig) => cfg.controlId === CUSTOM_CONTROL_ID ? (cfg.customControlName?.trim() || 'Custom control') : `FANUC ${controlById(cfg.controlId)?.name ?? cfg.controlId}`
export const pmcOf = (cfg: BuildConfig): PmcTypeSpec => pmcById(cfg.pmcId) ?? pmcById('pmc-0if')!

/** Symbol tag: upper case, no spaces, ≤ 16 chars (LADDER-III limit on older PMCs). */
export const tag = (s: string) => s.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9+\-*_.#/]/g, '').slice(0, 16)

/* ================================================================== */
/* I/O plan                                                            */
/* ================================================================== */
export interface IoRow {
  id: string
  dir: 'X' | 'Y'
  key: string
  address: string
  symbol: string
  comment: string
  group: string
  side: Side
  fixed?: string
  align?: number
  overridden: boolean
  overflow?: boolean
  custom?: boolean
}

interface Resolved {
  list: Accessory[]
  added: string[]
  defs: Map<string, AccDef>
}

function resolve(cfg: BuildConfig): Resolved {
  const { list, added } = resolveAccessories(cfg.accessories)
  const defs = new Map<string, AccDef>()
  const ids = new Set(list.map((a) => a.id))
  for (const a of list) defs.set(a.id, a.define({ axes: cfg.axes, paths: cfg.paths, p: (k) => accParam(a, k, cfg.params), has: (id) => ids.has(id) }))
  return { list, added, defs }
}

/** X bytes kept for fixed CNC inputs (skip/XAE, *ESP, *DEC) — never auto-assigned. */
export const RESERVED_X_BYTES = [4, 8, 9]

export function planIo(cfg: BuildConfig, r: Resolved = resolve(cfg)): IoRow[] {
  const rows: IoRow[] = []
  for (const a of r.list) {
    const d = r.defs.get(a.id)!
    for (const [dir, sigs] of [['X', d.inputs], ['Y', d.outputs]] as const) {
      for (const s of sigs) {
        const id = `${a.id}.${s.key}`
        const o = cfg.overrides[id]
        rows.push({ id, dir, key: s.key, address: '', symbol: o?.symbol ?? s.key, comment: o?.comment ?? s.comment, group: a.name, side: s.side ?? 'machine', fixed: s.fixed, align: s.align, overridden: !!o?.address })
      }
    }
  }
  for (const dev of cfg.customDevices) {
    const base = tag(dev.name) || 'DEV'
    const push = (dir: 'X' | 'Y', i: number, io: CustomIo) => {
      const id = `cd.${dev.id}.${dir}${i}`
      const o = cfg.overrides[id]
      const sym = tag(io.symbol) || `${base}${dir === 'X' ? 'I' : 'O'}${i + 1}`
      rows.push({ id, dir, key: sym, address: '', symbol: o?.symbol ?? sym, comment: o?.comment ?? (io.comment || `${dev.name} ${dir === 'X' ? 'input' : 'output'} ${i + 1}`), group: dev.name || 'Custom device', side: 'machine', overridden: !!o?.address, custom: true })
    }
    dev.inputs.forEach((io, i) => push('X', i, io))
    dev.outputs.forEach((io, i) => push('Y', i, io))
  }

  const used = new Set<string>()
  const ok = (a?: string, dir?: string) => { const p = a ? parseAddress(a) : null; return !!p && p.bit !== undefined && p.area === dir }
  // 1. user overrides  2. fixed standard addresses
  for (const row of rows) {
    const o = cfg.overrides[row.id]?.address
    // invalid overrides are kept as typed so validateIo can flag them
    if (o?.trim()) { row.address = o.trim().toUpperCase(); row.overridden = true; if (ok(row.address, row.dir)) used.add(row.address) }
    else row.overridden = false
  }
  for (const row of rows) if (!row.address && row.fixed) { row.address = row.fixed; used.add(row.fixed) }

  // 3. sequential per I/O Module
  const mods = cfg.modules
  const endOf = (dir: 'X' | 'Y') => mods.reduce((m, x) => Math.max(m, dir === 'X' ? x.xStart + x.xBytes : x.yStart + x.yBytes), 0)
  const free = (dir: string, byte: number, bit: number) => !used.has(`${dir}${byte}.${bit}`) && !(dir === 'X' && RESERVED_X_BYTES.includes(byte))
  const ranges = (side: Side, dir: 'X' | 'Y'): [number, number][] => {
    const order = [...mods.filter((m) => m.role === side), ...mods.filter((m) => m.role === 'any'), ...mods.filter((m) => m.role !== side && m.role !== 'any')]
    return order.map((m) => (dir === 'X' ? [m.xStart, m.xStart + m.xBytes] : [m.yStart, m.yStart + m.yBytes]))
  }
  const find = (dir: 'X' | 'Y', side: Side, n: number): { byte: number; bit: number; overflow: boolean } => {
    const tryRange = (s: number, e: number) => {
      for (let byte = s; byte < e; byte++) {
        if (n > 1) { if ([...Array(n).keys()].every((b) => free(dir, byte, b))) return { byte, bit: 0 } }
        else for (let bit = 0; bit < 8; bit++) if (free(dir, byte, bit)) return { byte, bit }
      }
      return null
    }
    for (const [s, e] of ranges(side, dir)) { const f = tryRange(s, e); if (f) return { ...f, overflow: false } }
    const end = endOf(dir)
    return { ...tryRange(end, end + 1000)!, overflow: true }
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row.address) continue
    const n = row.align && row.align > 1 ? row.align : 1
    const group = rows.slice(i, i + n).filter((g) => !g.address && g.dir === row.dir)
    const f = find(row.dir, row.side, group.length > 1 ? group.length : 1)
    group.forEach((g, k) => { g.address = `${g.dir}${f.byte}.${f.bit + k}`; g.overflow = f.overflow; used.add(g.address) })
  }
  return rows
}

/** Per-row validation messages (duplicate / invalid / outside PMC range / outside modules). */
export function validateIo(rows: IoRow[], pmc: PmcTypeSpec): Record<string, string> {
  const err: Record<string, string> = {}
  const byAddr = new Map<string, number>(), bySym = new Map<string, number>()
  rows.forEach((r) => { byAddr.set(r.address, (byAddr.get(r.address) ?? 0) + 1); bySym.set(r.symbol, (bySym.get(r.symbol) ?? 0) + 1) })
  for (const r of rows) {
    const p = parseAddress(r.address)
    if (!p || p.bit === undefined || p.area !== r.dir) err[r.id] = `Use an ${r.dir} bit address like ${r.dir}${r.dir === 'X' ? 10 : 2}.0`
    else if ((byAddr.get(r.address) ?? 0) > 1) err[r.id] = `${r.address} is used twice`
    else if (!areaRanges(pmc, r.dir).some((a) => p.byte >= a.start && p.byte < a.start + a.size)) err[r.id] = `${r.address} is outside the ${pmc.name} ${r.dir} range`
    else if (r.overflow) err[r.id] = 'No free bit in the I/O Modules — add a module'
    else if (!r.symbol.trim()) err[r.id] = 'Symbol is empty'
    else if ((bySym.get(r.symbol) ?? 0) > 1) err[r.id] = `Symbol ${r.symbol} is used twice`
  }
  return err
}

/* ================================================================== */
/* Message plan (A addresses + numbers)                                */
/* ================================================================== */
/** Recommended maximum message length (characters) for the CNC alarm / operator message screen. */
export const MSG_MAX = 32

export interface PlannedMessage {
  /** "<accessory>.<key>" or "cd.<device>.A<i>" */
  id: string
  symbol: string
  text: string
  kind: 'alarm' | 'operator'
  group: string
  address: string
  number: number
  sp?: boolean
  it?: boolean
  custom?: boolean
}

const normText = (t: string) => t.replace(/\s+/g, ' ').trim().toUpperCase()

/**
 * Deterministic message plan: alarms from A0.0 (1001, 1002…), operator messages from the next A byte (2001, 2002…).
 * Unique ids, symbols, addresses and numbers; bits = A bits covered by DISPB.
 */
export function planMessages(cfg: BuildConfig, r: Resolved = resolve(cfg)): { list: PlannedMessage[]; bits: number } {
  type M = Omit<PlannedMessage, 'address' | 'number'>
  const src: M[] = []
  const syms = new Set<string>()
  const uniq = (s: string) => {
    let out = tag(s) || 'MSG', n = 2
    while (syms.has(out)) { const suf = `_${n++}`; out = tag(s).slice(0, 16 - suf.length) + suf }
    syms.add(out)
    return out
  }
  const ids = new Set<string>()
  for (const a of r.list) for (const m of r.defs.get(a.id)!.alarms) {
    const id = `${a.id}.${m.key}`
    if (ids.has(id)) throw new Error(`${a.id}: duplicate message key ${m.key}`)
    ids.add(id)
    src.push({ id, symbol: uniq(m.key), text: normText(m.text), kind: m.kind, group: a.name, sp: m.sp, it: m.it })
  }
  cfg.customDevices.forEach((dev, d) => dev.alarms.forEach((m, i) => {
    let id = `cd.${dev.id}.A${i}`
    if (ids.has(id)) id = `cd.${dev.id}#${d}.A${i}`
    ids.add(id)
    const name = dev.name?.trim() || 'Custom device'
    src.push({ id, symbol: uniq(`${tag(dev.name) || 'DEV'}AL${i + 1}`), text: normText(m.text || `${name} alarm ${i + 1}`), kind: m.kind === 'operator' ? 'operator' : 'alarm', group: name, custom: true })
  }))
  const list: PlannedMessage[] = []
  let bit = 0
  for (const kind of ['alarm', 'operator'] as const) {
    if (kind === 'operator' && bit % 8) bit += 8 - (bit % 8)
    src.filter((m) => m.kind === kind).forEach((m, i) => {
      list.push({ ...m, address: `A${Math.floor(bit / 8)}.${bit % 8}`, number: (kind === 'alarm' ? 1000 : 2000) + i + 1 })
      bit++
    })
  }
  return { list, bits: bit }
}

/* ================================================================== */
/* Generator                                                           */
/* ================================================================== */
interface Cond { addr: string; neg?: boolean }
const RESERVED_M = [98, 99, 198]
const andAll = (terms: Instruction[][]) => (terms.length ? andAny([], terms) : [])

export function generateProject(cfg: BuildConfig, opts: { id?: string; now?: number } = {}): PmcProject {
  const now = opts.now ?? Date.now()
  const pmc = pmcOf(cfg)
  const ctl = controlById(cfg.controlId)
  const res = resolve(cfg)
  const rows = planIo(cfg, res)
  const sel = new Set(res.list.map((a) => a.id))
  const warnings: string[] = ['Verify all addresses, M-codes, timer presets and interlocks against the machine electrical drawings before use.', TYPICAL_NOTE]

  const rowById = new Map(rows.map((r) => [r.id, r]))
  const symbols = new Map<string, SymbolEntry>()
  const addSym = (e: SymbolEntry) => { if (!symbols.has(e.address)) symbols.set(e.address, e) }

  /* ---------- R relays ---------- */
  let rByte = 100, rBit = 0
  const relays = new Map<string, string>()
  const relay = (sym: string, comment: string, group: string) => {
    const s = tag(sym)
    const hit = relays.get(s)
    if (hit) return hit
    if (rBit > 7) { rByte++; rBit = 0 }
    const a = `R${rByte}.${rBit++}`
    relays.set(s, a); addSym({ address: a, symbol: s, comment, source: 'generated', group })
    return a
  }
  const relayByte = (sym: string, comment: string, group: string) => {
    const s = tag(sym)
    const hit = relays.get(s)
    if (hit) return hit
    if (rBit > 0) { rByte++; rBit = 0 }
    const a = `R${rByte++}`
    relays.set(s, a); addSym({ address: a, symbol: s, comment, source: 'generated', group })
    return a
  }

  /* ---------- A messages ---------- */
  // Alarms first (A0.0…, numbers 1001…), operator messages from the next A byte (numbers 2001…).
  // Order = catalog order of the options, then custom devices → deterministic, each option's messages are consecutive.
  const plan = planMessages(cfg, res)
  const messages: AlarmMessage[] = []
  const alAddr = new Map<string, string>()
  const alarmBits: { address: string; sp?: boolean; it?: boolean }[] = []
  for (const m of plan.list) {
    alAddr.set(m.id, m.address)
    messages.push({ address: m.address, number: String(m.number), text: m.text, kind: m.kind })
    addSym({ address: m.address, symbol: m.symbol, comment: `${m.kind === 'alarm' ? 'Alarm' : 'Operator message'} ${m.number}: ${m.text}`, source: m.custom ? 'custom' : 'generated', group: m.group })
    if (m.kind === 'alarm') alarmBits.push({ address: m.address, sp: m.sp, it: m.it })
  }
  const aBit = plan.bits
  const aSize = pmc.areas.find((a) => a.letter === 'A')?.size ?? 25
  const nAl = plan.list.filter((m) => m.kind === 'alarm').length, nOp = plan.list.length - nAl
  if (nAl > 999) warnings.push(`${nAl} alarm messages — FANUC alarm numbers 1000–1999 allow 999.`)
  if (nOp > 100) warnings.push(`${nOp} operator messages — numbers 2000–2099 show with their number, 2100–2999 show the text only.`)
  if (Math.ceil(aBit / 8) > aSize) warnings.push(`Message request area exceeded: ${Math.ceil(aBit / 8)} A bytes needed (A0–A${Math.ceil(aBit / 8) - 1}), ${pmc.name} has ${aSize} (A0–A${aSize - 1}). Reduce options or choose a larger PMC.`)
  for (const m of plan.list) if (m.custom && m.text.length > MSG_MAX) warnings.push(`Message ${m.number} "${m.text}" is ${m.text.length} characters — keep messages to ${MSG_MAX} for the CNC screen.`)

  /* ---------- registries ---------- */
  let timerNo = 0, edgeNo = 0, ctrNo = 0
  const mDec = new Map<number, string>()
  const mGroups = new Map<number, string>()
  const decode = (code: number) => {
    const hit = mDec.get(code)
    if (hit) return hit
    const base = Math.floor(code / 8) * 8
    let byte = mGroups.get(base)
    if (!byte) { byte = relayByte(`MDEC${base}`, `M${base}–M${base + 7} decoded (DECB)`, 'M-code decode'); mGroups.set(base, byte) }
    const a = `${byte}.${code - base}`
    mDec.set(code, a)
    addSym({ address: a, symbol: `M${String(code).padStart(2, '0')}`, comment: `M${String(code).padStart(2, '0')} decoded`, source: 'generated', group: 'M-code decode' })
    return a
  }
  ;[0, 1, 2, 30].forEach(decode)
  const mfins = new Map<number, Cond[]>()
  const tdones: string[] = [], starts: string[] = []
  const permits: Cond[] = [], holds: Cond[] = [], inters: Cond[] = [], spStops: Cond[] = []
  let needManual = false, needAuto = false, needAlm = false

  /* ---------- M-code conflicts ---------- */
  const mOwners = new Map<number, { owner: string; shared?: boolean }[]>()
  const addM = (code: number, owner: string, shared?: boolean) => { const l = mOwners.get(code) ?? []; l.push({ owner, shared }); mOwners.set(code, l) }
  for (const a of res.list) for (const m of res.defs.get(a.id)!.mcodes) addM(m.code, a.name, m.shared)
  for (const dev of cfg.customDevices) for (const o of dev.outputs) { if (o.onM !== undefined) addM(o.onM, dev.name || 'Custom device'); if (o.offM !== undefined) addM(o.offM, dev.name || 'Custom device', true) }
  for (const [code, owners] of [...mOwners].sort((a, b) => a[0] - b[0])) {
    const names = [...new Set(owners.map((o) => o.owner))]
    if (names.length > 1 && owners.some((o) => !o.shared)) warnings.push(`Conflicting M-code M${String(code).padStart(2, '0')}: used by ${names.join(', ')}.`)
    if (RESERVED_M.includes(code)) warnings.push(`M${code} is processed by the CNC (subprogram call/end) and never reaches the PMC — choose another M-code.`)
  }

  /* ---------- build accessory nets ---------- */
  const level1: NetDef[] = [], level2: NetDef[] = []
  const makeCtx = (a: Accessory): Ctx => {
    const sig = (dir: 'X' | 'Y', key: string) => {
      const r = rowById.get(`${a.id}.${key}`)
      if (!r || r.dir !== dir) throw new Error(`${a.id}: unknown ${dir} signal ${key}`)
      return r.address
    }
    return {
      axes: cfg.axes, paths: cfg.paths,
      x: (k) => sig('X', k), y: (k) => sig('Y', k),
      a: (k) => { const v = alAddr.get(`${a.id}.${k}`); if (!v) throw new Error(`${a.id}: unknown alarm ${k}`); return v },
      r: (s, c) => relay(s, c, a.name), rb: (s, c) => relayByte(s, c, a.name),
      p: (k) => accParam(a, k, cfg.params),
      m: decode,
      timer: () => ++timerNo, edge: () => ++edgeNo, counter: () => ++ctrNo,
      has: (id) => sel.has(id),
      manual: () => { needManual = true; return relay('MANUAL', 'Manual mode (JOG / HANDLE / INC / REF)', 'Common') },
      auto: () => { needAuto = true; return relay('AUTOMODE', 'Automatic mode (MEM / MDI / DNC)', 'Common') },
      mfin: (code, addr, neg) => { decode(code); const l = mfins.get(code) ?? []; l.push({ addr, neg }); mfins.set(code, l) },
      tdone: (addr) => { tdones.push(addr) },
      startSrc: (addr) => { starts.push(addr) },
      permit: (addr, neg) => { permits.push({ addr, neg }) },
      hold: (addr, neg) => { holds.push({ addr, neg }) },
      inter: (addr, neg) => { inters.push({ addr, neg }) },
      spStop: (addr, neg) => { spStops.push({ addr, neg }) },
      alm: () => { needAlm = true; return relay('ALMANY', 'Any PMC alarm (1000–1999) active', 'Alarms') },
    }
  }
  const groupOf = new Map<NetDef, string>()
  for (const a of res.list) {
    for (const n of a.nets(makeCtx(a))) { (n.level === 1 ? level1 : level2).push(n); groupOf.set(n, a.name) }
  }

  /* ---------- custom devices ---------- */
  for (const dev of cfg.customDevices) {
    const name = dev.name || 'Custom device'
    const base = tag(dev.name) || 'DEV'
    const inAddr = (sym?: string) => {
      if (!sym) return undefined
      const i = dev.inputs.findIndex((io, k) => (tag(io.symbol) || `${base}I${k + 1}`) === tag(sym))
      return i >= 0 ? rowById.get(`cd.${dev.id}.X${i}`)?.address : undefined
    }
    const push = (n: NetDef) => { level2.push(n); groupOf.set(n, name) }
    dev.outputs.forEach((o, i) => {
      const row = rowById.get(`cd.${dev.id}.Y${i}`)!
      const terms: Instruction[][] = []
      if (o.onM !== undefined) {
        const st = relay(`${row.symbol}R`, `${row.comment} — ON by M${o.onM}`, name)
        const latch: Instruction[] = [rd(decode(o.onM)), or(st)]
        if (o.offM !== undefined) latch.push(andn(decode(o.offM)))
        push({ comment: `${name}: ${row.symbol} M${o.onM}${o.offM !== undefined ? ` / M${o.offM}` : ''} latch`, ins: [...latch, wrt(st)] })
        mfins.set(o.onM, [...(mfins.get(o.onM) ?? []), { addr: st }])
        terms.push([rd(st)])
      }
      const f = inAddr(o.follow)
      if (f) terms.push([rd(f)])
      if (!terms.length) {
        const cmd = relay(`${row.symbol}CMD`, `${row.comment} — command (add your logic)`, name)
        terms.push([rd(cmd)])
        warnings.push(`Custom output ${row.symbol} has no M-code or input — driven by placeholder relay ${cmd}. Add your logic.`)
      }
      push({ comment: `${name}: ${row.symbol} output`, ins: [...anyOf(terms), wrt(row.address)] })
    })
    dev.alarms.forEach((m, i) => {
      const a = alAddr.get(`cd.${dev.id}.A${i}`)
      if (!a) return
      const label = `${name}: ${m.kind === 'alarm' ? 'alarm' : 'message'} ${i + 1}`
      const t = inAddr(m.trigger)
      let cond: Instruction[]
      if (t) cond = [m.when === 'off' ? rdn(t) : rd(t)]
      else {
        const cmd = relay(`${base}AL${i + 1}R`, `${name} alarm ${i + 1} condition (add your logic)`, name)
        cond = [rd(cmd)]
        if (m.trigger?.trim()) warnings.push(`Custom device "${name}": message ${i + 1} trigger "${m.trigger}" is not one of its inputs — placeholder relay ${cmd} used.`)
      }
      const ms = Math.round(Number(m.timeout) || 0)
      if (ms > 0) {
        const T = relay(`${base}AL${i + 1}T`, `${name} message ${i + 1} delay timer (${ms} ms)`, name)
        push({ comment: `${label}: condition for ${ms} ms (TMRB)`, ins: [...cond, fn('TMRB', [++timerNo, ms]), wrt(T)] })
        cond = [rd(T)]
      }
      if (m.kind === 'alarm') push({ comment: `${label} (latched until reset)${t ? '' : ' — placeholder condition'}`, ins: [...cond, or(a), andn(stdAddr('RST')), wrt(a)] })
      else push({ comment: `${label}${t ? '' : ' (placeholder condition)'}`, ins: [...cond, wrt(a)] })
    })
  }

  /* ---------- CNC interface (collectors) ---------- */
  const g = stdAddr
  const iface: NetDef[] = []

  // Undefined M-code: MF with none of the decoded M-codes ON (DECB) → latched alarm.
  const mUnd = alAddr.get('mcode.MUNDAL')
  if (mUnd) {
    const T = relay('MUNDT', 'Undefined M-code delay timer', 'M-code decode')
    iface.push({ comment: 'Undefined M-code: MF with no decoded M-code (debounce)', ins: [rd(g('MF')), ...[...mDec.keys()].sort((a, b) => a - b).map((c) => andn(mDec.get(c)!)), fn('TMRB', [++timerNo, 100]), wrt(T)] })
    iface.push({ comment: 'Undefined M-code alarm (latched until reset)', ins: [rd(T), or(mUnd), andn(g('RST')), wrt(mUnd)] })
  }
  // Shared alarm logic: any alarm → feed hold + cycle start inhibit; flagged alarms also stop the spindle / interlock axes.
  if (alarmBits.length || needAlm) {
    const ANY = relay('ALMANY', 'Any PMC alarm (1000–1999) active', 'Alarms')
    iface.push({ comment: 'Any PMC alarm active (1000–1999) → feed hold, cycle start inhibit', ins: [...(alarmBits.length ? anyOf(alarmBits.map((b) => [rd(b.address)])) : [rd(OFF)]), wrt(ANY)] })
    if (alarmBits.length) { holds.push({ addr: ANY }); permits.push({ addr: ANY, neg: true }) }
    const sp = alarmBits.filter((b) => b.sp), it = alarmBits.filter((b) => b.it)
    if (sp.length) {
      const SP = relay('ALMSP', 'Spindle-stop alarm active', 'Alarms')
      iface.push({ comment: 'Spindle-stop alarms active → *SSTP', ins: [...anyOf(sp.map((b) => [rd(b.address)])), wrt(SP)] })
      spStops.push({ addr: SP })
    }
    if (it.length) {
      const IT = relay('ALMIT', 'Axis-interlock alarm active', 'Alarms')
      iface.push({ comment: 'Axis-interlock alarms active → *IT', ins: [...anyOf(it.map((b) => [rd(b.address)])), wrt(IT)] })
      inters.push({ addr: IT })
    }
  }
  // Cycle start pressed while a permissive is missing → operator message.
  const stIn = alAddr.get('cycle.STINMS')
  if (stIn) {
    const missing = permits.map((p) => [p.neg ? rd(p.addr) : rdn(p.addr)])
    iface.push({ comment: 'Cycle start inhibited message (start pressed, a start permissive is missing)', ins: starts.length && missing.length ? [...andAny(anyOf(starts.map((s) => [rd(s)])), missing), wrt(stIn)] : [rd(OFF), wrt(stIn)] })
  }
  const condIns = (c: Cond, active: boolean) => (c.neg !== active ? andn(c.addr) : and(c.addr))
  // permit: AND addr (neg → AND.NOT). hold/inter/stop: active when addr ON (neg → OFF) ⇒ AND.NOT addr (neg → AND addr)
  if (starts.length) iface.push({ comment: 'ST cycle start (with start permissives)', ins: [...anyOf(starts.map((s) => [rd(s)])), ...permits.map((p) => (p.neg ? andn(p.addr) : and(p.addr))), wrt(g('ST'))] })
  iface.push({ comment: '*SP feed hold (0 = hold)', ins: [rd(ON), ...holds.map((h) => condIns(h, true)), wrt(g('*SP')), ...(cfg.paths > 1 ? [wrt(g('*SP#2'))] : [])] })
  iface.push({ comment: '*IT interlock all axes (0 = interlock)', ins: [rd(ON), ...inters.map((h) => condIns(h, true)), wrt(g('*IT'))] })
  if (sel.has('spindle') || spStops.length) iface.push({ comment: '*SSTP spindle stop (0 = stop)', ins: [rd(ON), ...spStops.map((h) => condIns(h, true)), wrt(g('*SSTP'))] })
  if (!sel.has('feedovr')) {
    iface.push({ comment: 'Feedrate override fixed at 100 % (*FV0–7, NUMEB)', ins: [rd(ON), fn('NUMEB', [1, 255 - 100, 'G12'])] })
    iface.push({ comment: 'Jog override fixed at 100 % (*JV0–15, NUMEB)', ins: [rd(ON), fn('NUMEB', [2, 65535 - 10000, 'G10'])] })
  }
  if (!sel.has('spovr') && (sel.has('spindle') || sel.has('sp2') || sel.has('livetool'))) iface.push({ comment: 'Spindle override fixed at 100 % (SOV, NUMEB)', ins: [rd(ON), fn('NUMEB', [1, 100, 'G30'])] })

  // M / T / S completion and FIN
  const finSrc: string[] = []
  const codes = [...mDec.keys()].sort((a, b) => a - b)
  const immediate = codes.filter((c) => !mfins.has(c))
  const terms: Instruction[][] = []
  if (immediate.length) terms.push(immediate.map((c, i) => (i === 0 ? rd(mDec.get(c)!) : or(mDec.get(c)!))))
  for (const c of codes.filter((c) => mfins.has(c))) {
    const conds = mfins.get(c)!
    terms.push([rd(mDec.get(c)!), ...conds.map((d) => (d.neg ? andn(d.addr) : and(d.addr)))])
  }
  const MFINR = relay('MFINR', 'M function complete', 'M-code decode')
  iface.push({ comment: 'M function completion (all decoded M-codes)', ins: [rd(g('MF')), ...andAll(terms), wrt(MFINR)] })
  finSrc.push(MFINR)
  if (sel.has('tcode')) {
    const TFINR = relay('TFINR', 'T function complete', 'T-code')
    iface.push({ comment: tdones.length ? 'T function completion (turret / magazine in position)' : 'T function completion (immediate)', ins: [rd(g('TF')), ...(tdones.length ? andAll(tdones.map((t) => [rd(t)])) : []), wrt(TFINR)] })
    finSrc.push(TFINR)
  }
  if (sel.has('scode')) {
    const SFINR = relay('SFINR', 'S function complete', 'S-code')
    iface.push({ comment: 'S function completion (immediate)', ins: [rd(g('SF')), wrt(SFINR)] })
    finSrc.push(SFINR)
  }
  iface.push({ comment: 'FIN completion signal', ins: [...anyOf(finSrc.map((f) => [rd(f)])), wrt(g('FIN'))] })
  if (aBit > 0) iface.push({ comment: `DISPB message display (${Math.ceil(aBit / 8) * 8} message bits)`, ins: [rd(ON), fn('DISPB', [Math.ceil(aBit / 8) * 8])] })

  /* ---------- common + decode nets (start of Level 2) ---------- */
  const head: NetDef[] = []
  if (needManual) head.push({ comment: 'Manual mode (JOG / HANDLE / INC / REF)', ins: [rd(g('MJ')), or(g('MH')), or(g('MINC')), or(g('MREF')), wrt(relays.get('MANUAL')!)] })
  if (needAuto) head.push({ comment: 'Automatic mode (MEM / MDI / DNC)', ins: [rd(g('MMEM')), or(g('MMDI')), or(g('MRMT')), wrt(relays.get('AUTOMODE')!)] })
  const fmt = codes.some((c) => c > 255) ? 4 : 1
  for (const [base, byte] of [...mGroups].sort((a, b) => a[0] - b[0])) head.push({ comment: `Decode M${base}–M${base + 7} (DECB)`, ins: [rd(g('MF')), fn('DECB', [fmt, 'F10', base, byte])] })

  /* ---------- Level 1: E-stop ---------- */
  const esp = rowById.get('estop.EMGPBI')!.address
  const l1: NetDef[] = [{ comment: '*ESP emergency stop (Level 1 high-speed)', ins: [rd(esp), wrt(g('*ESP')), ...(cfg.paths > 1 ? [wrt(g('*ESP#2'))] : [])] }, ...level1]

  /* ---------- assemble ---------- */
  const nets: Net[] = []
  const push = (level: Net['level'], n: NetDef) => nets.push({ id: nets.length + 1, level, instructions: n.ins, comment: n.comment })
  l1.forEach((n) => push(1, n))
  push(1, { comment: 'End of Level 1', ins: [fn('END1', [])] })
  ;[...head, ...level2, ...iface].forEach((n) => push(2, n))
  push(2, { comment: 'End of Level 2', ins: [fn('END2', [])] })
  push(2, { comment: 'End of ladder', ins: [fn('END', [])] })

  /* ---------- symbols ---------- */
  for (const r of rows) {
    const std = r.fixed ? stdByAddress(r.fixed) : undefined
    addSym({ address: r.address, symbol: r.symbol, comment: std && r.address === r.fixed ? `${r.comment} (${std.symbol})` : r.comment, source: r.overridden || r.custom || cfg.overrides[r.id]?.symbol ? 'custom' : 'generated', group: r.group })
  }
  const coilsMissing: string[] = []
  const writes = new Map<string, number[]>()
  for (const n of nets) for (const i of n.instructions) {
    const addrs = i.kind === 'basic' ? (i.address ? [i.address] : []) : i.params.filter((p): p is string => typeof p === 'string' && /^[A-Z]\d+(\.\d)?$/.test(p))
    for (const a of addrs) {
      if (!symbols.has(a)) {
        const s = stdByAddress(a)
        if (s) addSym({ address: a, symbol: s.symbol, comment: s.comment, source: 'standard', group: 'CNC interface' })
        else if (i.kind === 'basic' && (i.op === 'WRT' || i.op === 'WRT.NOT' || i.op === 'SET' || i.op === 'RST')) coilsMissing.push(a)
      }
    }
    if (i.kind === 'basic' && (i.op === 'WRT' || i.op === 'WRT.NOT') && i.address) writes.set(i.address, [...(writes.get(i.address) ?? []), n.id])
  }
  for (const a of coilsMissing) addSym({ address: a, symbol: a, comment: 'Coil — add a symbol', source: 'generated' })
  for (const [a, ids] of writes) if (ids.length > 1) warnings.push(`Double coil: ${symbols.get(a)?.symbol ?? a} (${a}) is written in nets ${ids.join(', ')}.`)

  const areaOrder = 'XYFGRAEKTCD'
  const sortKey = (a: string) => { const p = parseAddress(a); return p ? [areaOrder.indexOf(String(p.area)), p.byte, p.bit ?? -1] : [99, 0, 0] }
  const symList = [...symbols.values()].sort((x, y) => { const a = sortKey(x.address), b = sortKey(y.address); return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] })

  /* ---------- warnings ---------- */
  const errs = validateIo(rows, pmc)
  const overflow = rows.filter((r) => r.overflow)
  if (overflow.length) warnings.push(`I/O capacity exceeded: ${overflow.length} signal(s) do not fit the I/O Modules (from ${overflow[0].address}). Add an I/O Module or reduce options.`)
  const otherErr = Object.entries(errs).filter(([id]) => !rowById.get(id)?.overflow)
  if (otherErr.length) warnings.push(`I/O assignment has ${otherErr.length} problem(s): ${otherErr.slice(0, 3).map(([id, e]) => `${rowById.get(id)?.symbol}: ${e}`).join('; ')}${otherErr.length > 3 ? '…' : ''}`)
  for (const a of res.added) warnings.push(`Added "${accessoryById(a)?.name}" — required by another selected option.`)
  for (const a of res.list) for (const c of a.conflicts ?? []) if (sel.has(c) && a.id < c) warnings.push(`Conflicting options: "${a.name}" and "${accessoryById(c)?.name}" — keep only one.`)
  if (pmc.legacy) warnings.push(`${pmc.name} is a legacy PMC: G/F interface addresses differ from the i-series standard used here — re-address before use.`)
  if (pmc.note) warnings.push(pmc.note)
  const rSize = pmc.areas.find((a) => a.letter === 'R' && a.start === 0)?.size ?? 1000
  if (rByte + (rBit ? 1 : 0) > rSize) warnings.push(`Internal relays exceed ${pmc.name} R area (R0–R${rSize - 1}).`)
  if (timerNo > pmc.tmrb) warnings.push(`${timerNo} TMRB timers used — ${pmc.name} typically allows ${pmc.tmrb}.`)
  if (edgeNo > pmc.difu) warnings.push(`${edgeNo} DIFU edges used — ${pmc.name} typically allows ${pmc.difu}.`)
  if (ctrNo > pmc.ctrb) warnings.push(`${ctrNo} CTRB counters used — ${pmc.name} typically allows ${pmc.ctrb}.`)
  if (cfg.axes.length > 8) warnings.push('Only the first 8 axes get jog / overtravel / *DEC signals (path 1 G100/G102 hold 8 axes).')
  if (ctl && cfg.axes.length > ctl.maxAxes) warnings.push(`${cfg.axes.length} axes configured — ${ctl.name} typically supports ${ctl.maxAxes}.`)
  if (ctl && cfg.paths > ctl.paths) warnings.push(`${cfg.paths} paths configured — ${ctl.name} supports ${ctl.paths}.`)
  if (cfg.paths > 1) warnings.push('Multi-path: only E-stop and feed hold are duplicated for path 2 (G1008). Add path 2 logic (G1000+/F1000+) in LADDER-III.')
  if (!sel.has('mode')) warnings.push('No mode select option — MD1/MD2/MD4 stay 0 (MDI mode). Add "Mode select" or drive G43 yourself.')
  if (sel.has('feedovr')) { const ov = ['OV1I', 'OV2I', 'OV4I', 'OV8I', 'OV16I'].map((k) => rowById.get(`feedovr.${k}`)?.address ?? ''); if (!ov.every((a, i) => a.endsWith(`.${i}`) && a.split('.')[0] === ov[0].split('.')[0])) warnings.push('Feed override switch bits must be bits 0–4 of one X byte for the MOVE/CODB nets.') }
  if (sel.has('overtravel')) warnings.push('System Parameter: hardware overtravel signals *+L/*-L need parameter 3004#5 (OTH) = 0.')

  const instructions = nets.reduce((s, n) => s + n.instructions.length, 0)
  return {
    id: opts.id ?? uid('gen'),
    name: cfg.name.trim() || `${machineById(cfg.machineId).name} — ${controlName(cfg)}`,
    origin: 'generated',
    createdAt: now,
    info: {
      builder: cfg.builder?.trim() || undefined,
      machine: machineById(cfg.machineId).name,
      control: controlName(cfg),
      pmcType: pmc.name,
      ladderVersion: 'Generated draft',
      date: new Date(now).toISOString().slice(0, 10),
      memo: cfg.memo?.trim() || `Axes ${cfg.axes.join(', ')} · ${res.list.length} options · ${rows.length} I/O signals`,
    },
    memoryMap: pmc.areas,
    symbols: symList,
    messages,
    nets,
    warnings: [...new Set(warnings)],
    stats: { nets: nets.length, instructions, unknownWords: 0 },
  }
}

/** Short summary used by the wizard. */
export function summarize(cfg: BuildConfig) {
  const rows = planIo(cfg)
  const { list, added } = resolveAccessories(cfg.accessories)
  return { rows, inputs: rows.filter((r) => r.dir === 'X').length, outputs: rows.filter((r) => r.dir === 'Y').length, accessories: list, added }
}

