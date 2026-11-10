import type { BasicOp, Instruction } from '@/core/types'
import { subByName } from '@/core/subs'
import { stdAddr as g } from '@/data/controls'

/* ================================================================== */
/* Ladder DSL (FANUC stack ladder mnemonics)                           */
/* ================================================================== */
const b = (op: BasicOp, address?: string): Instruction => (address === undefined ? { kind: 'basic', op } : { kind: 'basic', op, address })
export const rd = (a: string) => b('RD', a)
export const rdn = (a: string) => b('RD.NOT', a)
export const and = (a: string) => b('AND', a)
export const andn = (a: string) => b('AND.NOT', a)
export const or = (a: string) => b('OR', a)
export const orn = (a: string) => b('OR.NOT', a)
export const rds = (a: string) => b('RD.STK', a)
export const rdns = (a: string) => b('RD.NOT.STK', a)
export const andStk = () => b('AND.STK')
export const orStk = () => b('OR.STK')
export const wrt = (a: string) => b('WRT', a)
export const wrtn = (a: string) => b('WRT.NOT', a)
export const set = (a: string) => b('SET', a)
export const rst = (a: string) => b('RST', a)
export const fn = (name: string, params: (number | string)[], table?: number[]): Instruction =>
  table ? { kind: 'sub', sub: subByName(name), name, params, table } : { kind: 'sub', sub: subByName(name), name, params }

export const ON = 'R9091.1'
export const OFF = 'R9091.0'

/** Push a contact block onto the stack (first RD → RD.STK). */
const stk = (t: Instruction[]): Instruction[] => {
  const [h, ...rest] = t
  if (h.kind !== 'basic') return t
  return [{ ...h, op: h.op === 'RD.NOT' ? 'RD.NOT.STK' : 'RD.STK' }, ...rest]
}
const single = (t: Instruction[]) => t.length === 1 && t[0].kind === 'basic' && (t[0].op === 'RD' || t[0].op === 'RD.NOT')

/** Parallel (OR) of contact blocks. Each block must start with RD / RD.NOT. */
export function anyOf(terms: Instruction[][]): Instruction[] {
  const out = [...terms[0]]
  for (const t of terms.slice(1)) {
    const h = t[0]
    if (single(t) && h.kind === 'basic') out.push(b(h.op === 'RD' ? 'OR' : 'OR.NOT', h.address))
    else out.push(...stk(t), orStk())
  }
  return out
}
/** block AND (any of terms) */
export function andAny(block: Instruction[], terms: Instruction[][]): Instruction[] {
  const p = anyOf(terms)
  if (single(p) && p[0].kind === 'basic') return [...block, b(p[0].op === 'RD' ? 'AND' : 'AND.NOT', p[0].address)]
  return [...block, ...stk(p), andStk()]
}

/** Byte part of a bit address: "X16.0" → "X16" */
export const byteOf = (a: string) => a.split('.')[0]
const nib = (n: number) => n.toString(2).padStart(4, '0')

/* ================================================================== */
/* Accessory model                                                     */
/* ================================================================== */
export type Side = 'machine' | 'panel'
export interface SigDef {
  key: string // also the default symbol (machine tag)
  comment: string
  side?: Side
  /** fixed standard address (e.g. X8.4 *ESP) */
  fixed?: string
  /** this + next n-1 signals need bits 0..n-1 of one byte (rotary switch / binary code) */
  align?: number
}
/**
 * A-address message. kind 'alarm' → number 1000–1999 (CNC alarm state, feed hold + cycle start inhibit via the shared
 * ALMANY relay); 'operator' → 2000–2099 (information only). sp: also stop the spindle (*SSTP); it: also interlock axes (*IT).
 */
export interface AlarmDef { key: string; text: string; kind: 'alarm' | 'operator'; sp?: boolean; it?: boolean }
export interface ParamDef { key: string; label: string; unit: 'ms' | 'M' | 'count'; default: number; min?: number; max?: number; /** value = index into choices (shown as a select) */ choices?: string[] }
export interface AccDef { inputs: SigDef[]; outputs: SigDef[]; alarms: AlarmDef[]; mcodes: { code: number; label: string; shared?: boolean }[] }
/** has: selected options (optional — callers that only list signals may omit it; conditional messages are then left out). */
export interface Env { axes: string[]; paths: number; p: (key: string) => number; has?: (id: string) => boolean }
export interface NetDef { comment: string; ins: Instruction[]; level?: 1 }

/** What an accessory can use while building its nets (implemented by the generator). */
export interface Ctx {
  axes: string[]
  paths: number
  x(key: string): string
  y(key: string): string
  a(key: string): string
  /** internal relay bit (global by symbol) */
  r(symbol: string, comment: string): string
  /** internal relay byte (global by symbol) */
  rb(symbol: string, comment: string): string
  p(key: string): number
  /** decoded M-code relay */
  m(code: number): string
  timer(): number
  edge(): number
  counter(): number
  has(id: string): boolean
  manual(): string
  auto(): string
  /** M-code completion condition (neg: when addr OFF) */
  mfin(code: number, addr: string, neg?: boolean): void
  tdone(addr: string): void
  startSrc(addr: string): void
  /** cycle start allowed only when addr ON (neg: OFF) */
  permit(addr: string, neg?: boolean): void
  /** feed hold (*SP) while addr ON (neg: OFF) */
  hold(addr: string, neg?: boolean): void
  /** interlock (*IT) while addr ON (neg: OFF) */
  inter(addr: string, neg?: boolean): void
  /** spindle stop (*SSTP) while addr ON (neg: OFF) */
  spStop(addr: string, neg?: boolean): void
  /** relay ON while any alarm (1000–1999) is active (written by the generator) */
  alm(): string
  /** address of any planned I/O signal by full id ("lube.LUBO"), undefined when that option is not selected */
  ref?(id: string): string | undefined
}

export const ACCESSORY_GROUPS = ['CNC interface', 'Safety', 'Operator panel', 'Spindle', 'Axes', 'Tool changer', 'Workholding', 'Coolant & lube', 'Hydraulics/pneumatics', 'Chip handling', 'Doors', 'Automation', 'Measurement', 'Misc'] as const
export type AccGroup = (typeof ACCESSORY_GROUPS)[number]

export interface Accessory {
  id: string
  group: AccGroup
  name: string
  desc: string
  required?: boolean
  requires?: string[]
  conflicts?: string[]
  params?: ParamDef[]
  define: (env: Env) => AccDef
  nets: (c: Ctx) => NetDef[]
}

/* ---------- small builders ---------- */
const N = (comment: string, ins: Instruction[], level?: 1): NetDef => (level ? { comment, ins, level } : { comment, ins })
const inp = (key: string, comment: string, side: Side = 'machine', extra: Partial<SigDef> = {}): SigDef => ({ key, comment, side, ...extra })
const out = inp
const al = (key: string, text: string, kind: AlarmDef['kind'] = 'alarm', fx: { sp?: boolean; it?: boolean } = {}): AlarmDef => ({ key, text, kind, ...fx })
const op = (key: string, text: string): AlarmDef => al(key, text, 'operator')
const alSp = (key: string, text: string): AlarmDef => al(key, text, 'alarm', { sp: true })
const def = (d: Partial<AccDef>): AccDef => ({ inputs: d.inputs ?? [], outputs: d.outputs ?? [], alarms: d.alarms ?? [], mcodes: d.mcodes ?? [] })
const RSTF = () => g('RST')
const tmrb = (c: Ctx, ms: number) => fn('TMRB', [c.timer(), ms])
const timeoutP = (ms: number): ParamDef => ({ key: 'timeout', label: 'Timeout alarm', unit: 'ms', default: ms, min: 100, max: 600000 })
const mP = (key: string, label: string, code: number): ParamDef => ({ key, label, unit: 'M', default: code, min: 0, max: 9999 })

/** Self-holding alarm reset by CNC reset (RST F1.1). */
const latchAlarm = (c: Ctx, cond: Instruction[], key: string, comment: string): NetDef =>
  N(comment, [...cond, or(c.a(key)), andn(RSTF()), wrt(c.a(key))])

/** Condition must persist for ms (TMRB), then latched alarm (reset by RST once the cause is gone). */
const delayAlarm = (c: Ctx, cond: Instruction[], ms: number, key: string, comment: string, sym: string): NetDef[] => {
  const T = c.r(sym, `${comment}: delay timer`)
  return [N(`${comment}: delay timer`, [...cond, tmrb(c, ms), wrt(T)]), latchAlarm(c, [rd(T)], key, comment)]
}
/** Message that follows its condition (operator messages, or alarms whose source latches itself). */
const msg = (c: Ctx, cond: Instruction[], key: string, comment: string): NetDef => N(comment, [...cond, wrt(c.a(key))])
/** Condition must persist for ms (TMRB), then a non-latched message. */
const delayMsg = (c: Ctx, cond: Instruction[], ms: number, key: string, comment: string, sym: string): NetDef[] => {
  const T = c.r(sym, `${comment}: delay timer`)
  return [N(`${comment}: delay timer`, [...cond, tmrb(c, ms), wrt(T)]), msg(c, [rd(T)], key, comment)]
}
const range = (n: number) => [...Array(Math.max(0, Math.floor(n))).keys()]
/** Index (0–7) of the first rotary axis A/B/C, or -1. */
const rotIdx = (axes: string[]) => axes.slice(0, 8).findIndex((a) => /^[ABC]$/.test(a))
/** Spindle running relay when the spindle option is selected. */
const spRun = (c: { has(id: string): boolean; r(s: string, cm: string): string }) => (c.has('spindle') ? c.r('SPRUN', 'Spindle running (CW or CCW)') : undefined)
/** cond AND (any of addrs) */
const andAnyOf = (cond: Instruction[], addrs: string[]) => andAny(cond, addrs.map((a) => [rd(a)]))

/** Rising-edge pulse of a contact block into a relay. */
const pulse = (c: Ctx, cond: Instruction[], relay: string, comment: string): NetDef => N(comment, [...cond, fn('DIFU', [c.edge()]), wrt(relay)])

/**
 * Latched ON/OFF function (coolant, conveyor…): ON by M-codes or push button toggle,
 * OFF by M-codes, push button, reset, M30.
 */
function onOff(c: Ctx, o: { st: string; sym: string; name: string; mOn?: number[]; mOff?: number[]; pb?: string; pbGate?: string; reset?: boolean; m30?: boolean; extraOff?: Instruction[] }): NetDef[] {
  const nets: NetDef[] = []
  let P: string | undefined
  if (o.pb) {
    P = c.r(`${o.sym}P`, `${o.name} push button pulse`)
    nets.push(pulse(c, o.pbGate ? [rd(o.pb), and(o.pbGate)] : [rd(o.pb)], P, `${o.name}: push button edge (DIFU)`))
  }
  const terms: Instruction[][] = (o.mOn ?? []).map((m) => [rd(c.m(m))])
  if (P) terms.push([rd(P), andn(o.st)])
  const hold: Instruction[] = [rd(o.st), ...(o.mOff ?? []).map((m) => andn(c.m(m)))]
  if (P) hold.push(andn(P))
  terms.push(hold)
  const ins = anyOf(terms)
  if (o.reset) ins.push(andn(RSTF()))
  if (o.m30) ins.push(andn(g('DM30')))
  if (o.extraOff) ins.push(...o.extraOff)
  nets.push(N(`${o.name}: ON/OFF latch`, [...ins, wrt(o.st)]))
  return nets
}

/** Message plan of a two-position actuator — shared by define() (message list) and twoPos() (nets). */
export interface TwoPosSpec {
  /** message key prefix */
  al: string
  /** device label for messages, e.g. "CHUCK" */
  dev: string
  /** verbs for the ON / OFF position, e.g. "CLAMP" / "UNCLAMP" */
  on: string
  off: string
  sensOn?: boolean
  sensOff?: boolean
  timeout?: boolean
  /** position must hold while running (spindle / automatic operation) → latched alarm */
  lost?: { pos: 'on' | 'off'; text: string; sp?: boolean }
  /** sensor fault text (default "<dev> SENSOR FAULT") */
  fault?: string
  /** command toward dir is ignored while blocked (e.g. spindle running) → operator message */
  block?: { dir: 'on' | 'off'; text: string }
}
/** Messages of a two-position actuator: ON / OFF timeout, both sensors ON, position lost, command rejected. */
export function tpAlarms(s: TwoPosSpec): AlarmDef[] {
  const out: AlarmDef[] = []
  if (s.timeout && s.sensOn) out.push(al(`${s.al}ONAL`, `${s.dev} ${s.on} TIMEOUT`))
  if (s.timeout && s.sensOff) out.push(al(`${s.al}OFAL`, `${s.dev} ${s.off} TIMEOUT`))
  if (s.sensOn && s.sensOff) out.push(al(`${s.al}SNAL`, s.fault ?? `${s.dev} SENSOR FAULT`))
  if (s.lost && (s.lost.pos === 'on' ? s.sensOn : s.sensOff)) out.push(al(`${s.al}LSAL`, s.lost.text, 'alarm', { sp: s.lost.sp }))
  if (s.block) out.push(op(`${s.al}RJMS`, s.block.text))
  return out
}

/**
 * Two-position actuator (clamp/unclamp, advance/retract…) commanded by M-codes and/or a manual push button
 * (toggle, manual mode only). State relay ON = "on" position.
 * Messages (spec): ON/OFF timeout, sensor fault (both ON), position lost while lostWhen, command rejected while blockWhen.
 */
function twoPos(c: Ctx, o: {
  st: string; name: string; mOn?: number; mOff?: number; pb?: string; outOn: string; outOff?: string
  sensOn?: string; sensOff?: string; timeout?: number; pbGate?: Instruction[]
  spec?: TwoPosSpec; lostWhen?: string[]; blockWhen?: string[]
}): NetDef[] {
  const nets: NetDef[] = []
  const s = o.spec
  const ST = c.r(o.st, `${o.name}: commanded ON position`)
  const blk = s?.block && o.blockWhen?.length ? { dir: s.block.dir, when: o.blockWhen } : undefined
  const free = (dir: 'on' | 'off') => (blk && blk.dir === dir ? blk.when.map(andn) : [])
  let P: string | undefined
  if (o.pb) {
    P = c.r(`${o.st}P`, `${o.name}: push button pulse`)
    nets.push(pulse(c, [rd(o.pb), and(c.manual()), ...(o.pbGate ?? [])], P, `${o.name}: manual push button edge (manual mode)`))
  }
  const terms: Instruction[][] = []
  if (o.mOn !== undefined) terms.push([rd(c.m(o.mOn)), ...free('on')])
  if (P) terms.push([rd(P), andn(ST), ...free('on')])
  const hold: Instruction[] = [rd(ST)]
  if (o.mOff !== undefined) hold.push(andn(c.m(o.mOff)))
  if (P) hold.push(andn(P))
  terms.push(hold)
  if (blk?.dir === 'off') terms.push(andAnyOf([rd(ST)], blk.when))
  nets.push(N(`${o.name}: command latch${blk ? ` (${blk.dir.toUpperCase()} command ignored while interlocked)` : ''}`, [...anyOf(terms), wrt(ST)]))
  nets.push(N(`${o.name}: ON solenoid`, [rd(ST), wrt(o.outOn)]))
  if (o.outOff) nets.push(N(`${o.name}: OFF solenoid`, [rdn(ST), wrt(o.outOff)]))
  if (o.mOn !== undefined) c.mfin(o.mOn, o.sensOn ?? ST)
  if (o.mOff !== undefined) { if (o.sensOff) c.mfin(o.mOff, o.sensOff); else c.mfin(o.mOff, ST, true) }
  if (!s) return nets
  const t = o.timeout ?? 3000
  if (s.timeout && s.sensOn && o.sensOn) nets.push(...delayAlarm(c, [rd(ST), andn(o.sensOn)], t, `${s.al}ONAL`, `${o.name}: ${s.on.toLowerCase()} timeout`, `${o.st}T1`))
  if (s.timeout && s.sensOff && o.sensOff) {
    // armed once the device has been commanded (ON, or the OFF M-code) — no alarm at power-on for a device that was never moved
    const ARM = c.r(`${o.st}AR`, `${o.name}: commanded since power-on (arms the ${s.off.toLowerCase()} timeout)`)
    nets.push(N(`${o.name}: commanded since power-on`, [rd(ST), ...(o.mOff !== undefined ? [or(c.m(o.mOff))] : []), or(ARM), wrt(ARM)]))
    nets.push(...delayAlarm(c, [rdn(ST), andn(o.sensOff), and(ARM)], t, `${s.al}OFAL`, `${o.name}: ${s.off.toLowerCase()} timeout`, `${o.st}T0`))
  }
  if (s.sensOn && s.sensOff && o.sensOn && o.sensOff) nets.push(...delayAlarm(c, [rd(o.sensOn), and(o.sensOff)], 300, `${s.al}SNAL`, `${o.name}: sensor fault (both position sensors ON)`, `${o.st}SF`))
  if (s.lost) {
    const sens = s.lost.pos === 'on' ? o.sensOn : o.sensOff
    if (sens) {
      const pos = (s.lost.pos === 'on' ? s.on : s.off).toLowerCase()
      const RCH = c.r(`${o.st}RCH`, `${o.name}: ${pos} position reached`)
      nets.push(N(`${o.name}: ${pos} position reached (held while commanded)`, [rd(sens), or(RCH), s.lost.pos === 'on' ? and(ST) : andn(ST), wrt(RCH)]))
      nets.push(...delayAlarm(c, andAnyOf([rd(RCH), andn(sens)], o.lostWhen?.length ? o.lostWhen : [g('OP')]), 200, `${s.al}LSAL`, `${o.name}: position lost while running`, `${o.st}LS`))
    }
  }
  if (s.block) {
    const req: Instruction[][] = []
    const m = s.block.dir === 'on' ? o.mOn : o.mOff
    if (m !== undefined) req.push([rd(c.m(m))])
    if (o.pb) req.push([rd(o.pb), and(c.manual())])
    const when = o.blockWhen?.length ? o.blockWhen : [OFF]
    nets.push(msg(c, andAnyOf(req.length ? anyOf(req) : [rd(OFF)], when), `${s.al}RJMS`, `${o.name}: ${(s.block.dir === 'on' ? s.on : s.off).toLowerCase()} command rejected (interlock)`))
  }
  return nets
}

/**
 * Step sequence started by an M-code request relay. Steps advance when their condition is ON.
 * Returns the step relay addresses and the DONE relay (reset when MF goes OFF).
 */
function stepSeq(c: Ctx, prefix: string, name: string, start: string, conds: { cond: string; label: string }[], timeout?: { ms: number; key: (i: number) => string }) {
  const nets: NetDef[] = []
  const SP = c.r(`${prefix}SP`, `${name}: start pulse`)
  const steps = conds.map((s, i) => c.r(`${prefix}S${i + 1}`, `${name} step ${i + 1}: ${s.label}`))
  const DN = c.r(`${prefix}DN`, `${name}: sequence complete`)
  nets.push(pulse(c, [rd(start)], SP, `${name}: start (DIFU)`))
  nets.push(N(`${name}: step 1 start`, [rd(SP), andn(DN), set(steps[0])]))
  conds.forEach((s, i) => {
    const next = i < conds.length - 1 ? steps[i + 1] : DN
    nets.push(N(`${name}: step ${i + 1} → ${i < conds.length - 1 ? `step ${i + 2}` : 'complete'} (${s.label})`, [rd(steps[i]), and(s.cond), set(next), rst(steps[i])]))
  })
  if (timeout) steps.forEach((st, i) => nets.push(...delayAlarm(c, [rd(st)], timeout.ms, timeout.key(i), `${name} step ${i + 1} (${conds[i].label}) timeout`, `${prefix}T${i + 1}`)))
  nets.push(N(`${name}: reset steps on CNC reset`, [rd(RSTF()), ...steps.map(rst)]))
  nets.push(N(`${name}: clear complete when MF OFF`, [rdn(g('MF')), or(RSTF()), rst(DN)]))
  return { nets, steps, DN }
}
const anyStep = (steps: string[]) => anyOf(steps.map((s) => [rd(s)]))
/** Per-step timeout messages of a step sequence. */
const stepAlarms = (pre: string, dev: string, labels: string[]) => labels.map((l, i) => al(`${pre}S${i + 1}AL`, `${dev} TIMEOUT: ${l}`))
const ATC_STEPS = ['POT DOWN', 'ARM TO GRIP', 'TOOL UNCLAMP', 'ARM SWAP', 'TOOL CLAMP', 'ARM TO ORIGIN', 'POT UP']
const APC_STEPS = ['PALLET UNCLAMP', 'LIFT', 'ROTATE', 'LOWER', 'PALLET CLAMP']

/** Gray code → binary position. */
export const grayToBin = (g0: number) => { let n = g0; for (let s = g0 >> 1; s; s >>= 1) n ^= s; return n }
/** FANUC standard 21-position feedrate override switch (%). */
export const FEED_OVR_STEPS = [0, 1, 2, 4, 6, 8, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100, 105, 110, 120]
export const SPINDLE_OVR_STEPS = [50, 60, 70, 80, 90, 100, 110, 120]
/** 16-position (4-bit) feedrate override switch (%) — typical, verify against the switch. */
export const FEED_OVR_STEPS16 = [0, 2, 4, 6, 8, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120]
const FOV_BITS = (bits: number) => (bits === 4 ? [1, 2, 4, 8] : [1, 2, 4, 8, 16])

const ax = (e: { axes: string[] }) => e.axes.slice(0, 8)

/**
 * Read a binary / Gray code switch into an R byte. When the bits are bits 0..n-1 of one X byte → MOVE with mask,
 * otherwise (e.g. wired across bytes on an operator-panel connector) copy every bit into the R byte.
 */
function codeIn(c: Ctx, keys: string[], sym: string, comment: string, label: string): { raw: string; nets: NetDef[] } {
  const raw = c.rb(sym, comment)
  const addrs = keys.map((k) => c.x(k))
  const aligned = addrs.every((a, i) => byteOf(a) === byteOf(addrs[0]) && a.endsWith(`.${i}`))
  if (aligned) {
    const mask = (1 << keys.length) - 1
    return { raw, nets: [N(`${label}: mask switch bits 0–${keys.length - 1} (MOVE)`, [rd(ON), fn('MOVE', [nib(mask >> 4), nib(mask & 15), byteOf(addrs[0]), raw])])] }
  }
  return { raw, nets: addrs.map((a, i) => N(`${label}: code bit ${1 << i} (${a}) → ${raw}.${i}`, [rd(a), wrt(`${raw}.${i}`)])) }
}

/* ================================================================== */
/* Catalog                                                             */
/* ================================================================== */
/** Rotary mode selector positions (k = function id). */
export const ROT_POS = [
  { k: 'MDI', n: 'MDI' }, { k: 'AUTO', n: 'AUTO (MEM)' }, { k: 'EDIT', n: 'EDIT' }, { k: 'DNC', n: 'DNC (RMT)' }, { k: 'JOG', n: 'JOG' },
  { k: 'H1', n: 'HANDLE ×1' }, { k: 'H10', n: 'HANDLE ×10' }, { k: 'H100', n: 'HANDLE ×100' }, { k: 'REF', n: 'REF return' },
]
/** Default code → position (MP 225 selector order: EDIT, AUTO, MDI, JOG, ×1, ×10, ×100, REF — verify on the switch). */
const ROT_DEFAULT = [2, 1, 0, 4, 5, 6, 7, 8]
const ROVK = [{ k: 'F0', n: 'F0' }, { k: '25', n: '25 %' }, { k: '50', n: '50 %' }, { k: '100', n: '100 %' }]
const MPK = ['1', '10', '100']
export const ACCESSORIES: Accessory[] = [
  /* ---------------- CNC interface ---------------- */
  { id: 'mcode', group: 'CNC interface', name: 'M-code decode (MF / FIN)', required: true,
    desc: 'Decodes M-codes with DECB, handles M00/M01/M02/M30 and returns FIN (G4.3) when every requested function is complete. Undefined M-code and FIN timeout alarms, M00/M01 stop messages.',
    params: [{ key: 'finTimeout', label: 'M-code FIN timeout (0 = off)', unit: 'ms', default: 60000, min: 0, max: 600000 }],
    define: (e) => def({
      mcodes: [0, 1, 2, 30].map((code) => ({ code, label: 'Program stop / end', shared: true })),
      alarms: [al('MUNDAL', 'UNDEFINED M-CODE'), ...(e.p('finTimeout') > 0 ? [al('MFTOAL', 'M-CODE FIN TIMEOUT')] : []), op('M00MS', 'PROGRAM STOP (M00)'), op('M01MS', 'OPTIONAL STOP (M01)')],
    }),
    nets: (c) => {
      const STP = c.r('STLP', 'Cycle start lamp rising edge'), L0 = c.r('M00L', 'M00 program stop latched'), L1 = c.r('M01L', 'M01 optional stop latched')
      const nets: NetDef[] = [
        pulse(c, [rd(g('STL'))], STP, 'Cycle start lamp edge (DIFU) — clears stop messages'),
        N('M00 latched until next cycle start / reset', [rd(g('DM00')), or(L0), andn(STP), andn(RSTF()), wrt(L0)]),
        N('M01 latched until next cycle start / reset', [rd(g('DM01')), or(L1), andn(STP), andn(RSTF()), wrt(L1)]),
        msg(c, [rd(L0), andn(g('STL'))], 'M00MS', 'Program stop (M00) message'),
        msg(c, [rd(L1), andn(g('STL'))], 'M01MS', 'Optional stop (M01) message'),
      ]
      // MUNDAL (undefined M-code) is written by the generator once every decoded M-code is known.
      if (c.p('finTimeout') > 0) nets.push(...delayAlarm(c, [rd(g('MF')), andn(g('FIN'))], c.p('finTimeout'), 'MFTOAL', 'M-code FIN timeout', 'MFTO'))
      return nets
    } },
  { id: 'tcode', group: 'CNC interface', name: 'T-code (TF / TFIN)', desc: 'T function strobe TF (F7.3) → completion. Turret / magazine indexing hook in automatically. TF FIN timeout alarm.',
    params: [{ key: 'finTimeout', label: 'T-code FIN timeout (0 = off)', unit: 'ms', default: 30000, min: 0, max: 600000 }],
    define: (e) => def({ alarms: e.p('finTimeout') > 0 ? [al('TFTOAL', 'T-CODE FIN TIMEOUT')] : [] }),
    nets: (c) => (c.p('finTimeout') > 0 ? delayAlarm(c, [rd(g('TF')), andn(g('FIN'))], c.p('finTimeout'), 'TFTOAL', 'T-code FIN timeout', 'TFTO') : []) },
  { id: 'scode', group: 'CNC interface', name: 'S-code (SF / SFIN)', desc: 'S function strobe SF (F7.2) → immediate completion (serial spindle speed is sent by the CNC). S0 / speed arrival messages are in the spindle option.',
    define: () => def({}), nets: () => [] },

  /* ---------------- Safety ---------------- */
  { id: 'estop', group: 'Safety', name: 'Emergency stop chain', required: true,
    desc: 'E-stop push button on the fixed *ESP input X8.4 → *ESP (G8.4) in Level 1 (high-speed). Spindle *ESPA follows. With several buttons, auxiliary contacts tell which one is pressed.',
    params: [{ key: 'buttons', label: 'E-stop buttons with monitor contact (0 = chain only)', unit: 'count', default: 0, min: 0, max: 6 }],
    define: (e) => def({
      inputs: [inp('EMGPBI', 'Emergency stop push button (NC) — *ESP fixed input', 'machine', { fixed: 'X8.4' }), ...range(e.p('buttons')).map((i) => inp(`EMG${i + 1}MI`, `E-stop button ${i + 1} monitor contact (NC, OFF = pressed)`))],
      alarms: [op('EMGMS', 'EMERGENCY STOP'), ...range(e.p('buttons')).map((i) => op(`EMG${i + 1}MS`, `E-STOP BUTTON ${i + 1} PRESSED`))],
    }),
    nets: (c) => [
      msg(c, [rdn(c.x('EMGPBI'))], 'EMGMS', 'Emergency stop message'),
      ...range(c.p('buttons')).map((i) => msg(c, [rdn(c.x(`EMG${i + 1}MI`))], `EMG${i + 1}MS`, `E-stop button ${i + 1} pressed message`)),
    ] },
  { id: 'overtravel', group: 'Safety', name: 'Hardware overtravel limits', desc: 'One NC limit switch per axis direction → *+Ln / *-Ln (G114 / G116), Level 1. Needs parameter 3004#5 (OTH) = 0. Message tells which axis / direction.',
    define: (e) => def({
      inputs: ax(e).flatMap((a) => [inp(`+${a}OTI`, `+${a} overtravel limit switch (NC)`), inp(`-${a}OTI`, `-${a} overtravel limit switch (NC)`)]),
      alarms: ax(e).flatMap((a) => [op(`P${a}OTMS`, `+${a} OVERTRAVEL - JOG ${a} -`), op(`M${a}OTMS`, `-${a} OVERTRAVEL - JOG ${a} +`)]),
    }),
    nets: (c) => c.axes.slice(0, 8).flatMap((a, i) => [
      N(`*+L${i + 1} +${a} overtravel`, [rd(c.x(`+${a}OTI`)), wrt(`G114.${i}`)], 1),
      N(`*-L${i + 1} -${a} overtravel`, [rd(c.x(`-${a}OTI`)), wrt(`G116.${i}`)], 1),
      msg(c, [rdn(c.x(`+${a}OTI`))], `P${a}OTMS`, `+${a} overtravel message`),
      msg(c, [rdn(c.x(`-${a}OTI`))], `M${a}OTMS`, `-${a} overtravel message`),
    ]) },
  { id: 'lightcurtain', group: 'Safety', name: 'Light curtain / safety mat', desc: 'Interrupted (OFF) → feed hold, interlock and message. Interrupted during automatic operation → latched alarm.',
    define: () => def({ inputs: [inp('LCURTI', 'Light curtain clear (ON = clear)')], alarms: [al('LCURTAL', 'LIGHT CURTAIN BROKEN IN CYCLE', 'alarm', { it: true }), op('LCURTMS', 'LIGHT CURTAIN INTERRUPTED')] }),
    nets: (c) => {
      const x = c.x('LCURTI'); c.hold(x, true); c.inter(x, true); c.permit(x)
      return [msg(c, [rdn(x), andn(g('OP'))], 'LCURTMS', 'Light curtain interrupted message (idle)'), latchAlarm(c, [rdn(x), and(g('OP'))], 'LCURTAL', 'Light curtain interrupted during automatic operation')]
    } },
  { id: 'twohand', group: 'Safety', name: 'Two-hand start (anti tie-down)', desc: 'Both buttons within the window time → cycle start. Releasing early does not restart. Timing fault message.',
    params: [{ key: 'window', label: 'Simultaneous window', unit: 'ms', default: 500, min: 100, max: 2000 }],
    define: () => def({ inputs: [inp('THLPBI', 'Two-hand start — left button', 'panel'), inp('THRPBI', 'Two-hand start — right button', 'panel')], alarms: [op('THTMMS', 'TWO-HAND START TIMING FAULT')] }),
    nets: (c) => {
      const L = c.x('THLPBI'), R = c.x('THRPBI')
      const WIN = c.r('THWIN', 'Two-hand: window elapsed'), OK = c.r('THOK', 'Two-hand: start accepted')
      c.startSrc(OK)
      return [
        N('Two-hand: window timer (any button pressed)', [rd(L), or(R), tmrb(c, c.p('window')), wrt(WIN)]),
        N('Two-hand: both pressed within window', [rd(L), and(R), andn(WIN), or(OK), and(L), and(R), wrt(OK)]),
        msg(c, [rd(WIN), andn(OK)], 'THTMMS', 'Two-hand: timing fault (not pressed together / tied down) — release both'),
      ]
    } },

  /* ---------------- Operator panel ---------------- */
  { id: 'mode', group: 'Operator panel', name: 'Mode select (EDIT/AUTO/MDI/DNC/JOG/HANDLE/REF)', desc: 'Mode push buttons → MD1/MD2/MD4, DNCI, ZRN (G43). Lamps follow the CNC mode status (F3/F4).',
    define: () => def({
      inputs: MODES.map((m) => inp(`${m.k}PBI`, `${m.n} mode push button`, 'panel')),
      outputs: MODES.map((m) => out(`${m.k}L`, `${m.n} mode lamp`, 'panel')),
    }),
    nets: (c) => {
      const R = Object.fromEntries(MODES.map((m) => [m.k, c.r(`${m.k}MD`, `${m.n} mode selected`)]))
      const nets: NetDef[] = MODES.map((m) => N(`${m.n} mode select (self-hold, cleared by other mode buttons)`, [
        rd(c.x(`${m.k}PBI`)), or(R[m.k]), ...MODES.filter((o) => o.k !== m.k).map((o) => andn(c.x(`${o.k}PBI`))), wrt(R[m.k]),
      ]))
      nets.push(
        N('MD1: AUTO / EDIT / JOG / REF / DNC', [rd(R.AUTO), or(R.EDIT), or(R.JOG), or(R.REF), or(R.DNC), wrt(g('MD1'))]),
        N('MD2: EDIT', [rd(R.EDIT), wrt(g('MD2'))]),
        N('MD4: JOG / HANDLE / REF', [rd(R.JOG), or(R.HND), or(R.REF), wrt(g('MD4'))]),
        N('DNCI: DNC operation', [rd(R.DNC), wrt(g('DNCI'))]),
        N('ZRN: reference return', [rd(R.REF), wrt(g('ZRN'))]),
        ...MODES.map((m) => N(`${m.n} mode lamp`, [rd(g(m.f)), wrt(c.y(`${m.k}L`))])),
      )
      return nets
    } },
  { id: 'moderot', group: 'Operator panel', name: 'Mode select by rotary switch (binary code 1/2/4)', conflicts: ['mode'],
    desc: '8-position mode selector wired as code bits MODE 1 / 2 / 4. Each switch code is assigned a mode (EDIT, AUTO, MDI, DNC, JOG, HANDLE ×1/×10/×100, REF) → MD1/MD2/MD4, DNCI, ZRN (G43) and the handle multiplier MP1/MP2 (G19).',
    params: range(8).map((k) => ({ key: `pos${k}`, label: `Switch code ${k}`, unit: 'count' as const, default: ROT_DEFAULT[k], min: 0, max: ROT_POS.length - 1, choices: ROT_POS.map((p) => p.n) })),
    define: () => def({ inputs: [1, 2, 4].map((n, i) => inp(`MDSW${n}I`, `Mode selector code bit ${n}`, 'panel', i === 0 ? { align: 3 } : {})) }),
    nets: (c) => {
      const bits = [1, 2, 4].map((n) => c.x(`MDSW${n}I`))
      const posOf = (k: number) => ROT_POS[Math.min(Math.max(0, c.p(`pos${k}`)), ROT_POS.length - 1)].k
      const P = range(8).map((k) => c.r(`MDPOS${k}`, `Mode selector at code ${k} (${ROT_POS.find((p) => p.k === posOf(k))?.n})`))
      const nets: NetDef[] = range(8).map((k) => N(`Mode selector code ${k} → ${ROT_POS.find((p) => p.k === posOf(k))?.n}`, [k & 1 ? rd(bits[0]) : rdn(bits[0]), k & 2 ? and(bits[1]) : andn(bits[1]), k & 4 ? and(bits[2]) : andn(bits[2]), wrt(P[k])]))
      const any = (ks: string[]) => { const hit = range(8).filter((k) => ks.includes(posOf(k))); return hit.length ? anyOf(hit.map((k) => [rd(P[k])])) : [rd(OFF)] }
      const H = ['H1', 'H10', 'H100']
      nets.push(
        N('MD1: AUTO / EDIT / JOG / REF / DNC', [...any(['AUTO', 'EDIT', 'JOG', 'REF', 'DNC']), wrt(g('MD1'))]),
        N('MD2: EDIT', [...any(['EDIT']), wrt(g('MD2'))]),
        N('MD4: JOG / HANDLE / REF', [...any(['JOG', 'REF', ...H]), wrt(g('MD4'))]),
        N('DNCI: DNC operation', [...any(['DNC']), wrt(g('DNCI'))]),
        N('ZRN: reference return', [...any(['REF']), wrt(g('ZRN'))]),
      )
      if (!c.has('mpgkeys')) nets.push(N('Handle multiplier MP1 (×10)', [...any(['H10']), wrt(g('MP1'))]), N('Handle multiplier MP2 (×100)', [...any(['H100']), wrt(g('MP2'))]))
      return nets
    } },
  { id: 'cycle', group: 'Operator panel', name: 'Cycle start / feed hold', desc: 'ST (G7.2) with all start permissives, *SP (G8.5) feed hold with every hold condition. Lamps from STL/SPL. Messages when start is inhibited, feed hold comes from an interlock, or axes are interlocked.',
    define: () => def({
      inputs: [inp('CYSTPBI', 'Cycle start push button', 'panel'), inp('FHLDPBI', 'Feed hold push button', 'panel')],
      outputs: [out('CYSTL', 'Cycle start lamp', 'panel'), out('FHLDL', 'Feed hold lamp', 'panel')],
      alarms: [op('STINMS', 'CYCLE START INHIBITED'), op('FHILMS', 'FEED HOLD BY INTERLOCK'), op('ITMS', 'AXIS INTERLOCK ACTIVE')],
    }),
    nets: (c) => {
      c.startSrc(c.x('CYSTPBI')); c.hold(c.x('FHLDPBI'))
      // STINMS (start pressed while a permissive is missing) is written by the generator — it knows every permissive.
      return [
        N('Cycle start lamp (STL)', [rd(g('STL')), wrt(c.y('CYSTL'))]),
        N('Feed hold lamp (SPL)', [rd(g('SPL')), wrt(c.y('FHLDL'))]),
        msg(c, [rd(g('OP')), andn(g('*SP')), andn(c.x('FHLDPBI'))], 'FHILMS', 'Feed hold by an interlock (not the button) message'),
        ...delayMsg(c, [rd(g('OP')), andn(g('*IT'))], 2000, 'ITMS', 'Axis interlock active in automatic operation', 'ITMST'),
      ]
    } },
  { id: 'reset', group: 'Operator panel', name: 'External reset button', desc: 'Panel reset button → ERS (G8.7). The MDI RESET key works without this. Reset (RST F1.1) clears every latched alarm whose cause is gone.',
    define: () => def({ inputs: [inp('RSTPBI', 'External reset push button', 'panel')] }),
    nets: (c) => [N('External reset (ERS)', [rd(c.x('RSTPBI')), wrt(g('ERS'))])] },
  { id: 'feedovr', group: 'Operator panel', name: 'Feed override (Gray code rotary switch)', desc: '4- or 5-bit Gray (or binary) code switch → CODB table → *FV0–7 (G12) and jog override *JV (G10/G11). 0–120 %. Message when 0 % in automatic operation.',
    params: [{ key: 'bits', label: 'Switch code bits', unit: 'count', default: 5, min: 4, max: 5 }, { key: 'code', label: 'Switch code', unit: 'count', default: 0, min: 0, max: 1, choices: ['Gray code', 'Binary'] }],
    define: (e) => def({ inputs: FOV_BITS(e.p('bits')).map((n, i) => inp(`OV${n}I`, `Feed override switch bit ${n} (${e.p('code') ? 'binary' : 'Gray code'})`, 'panel', i === 0 ? { align: FOV_BITS(e.p('bits')).length } : {})), alarms: [op('OVR0MS', 'FEEDRATE OVERRIDE 0%')] }),
    nets: (c) => {
      const bits = FOV_BITS(c.p('bits'))
      const { raw, nets } = codeIn(c, bits.map((n) => `OV${n}I`), 'OVRAW', 'Feed override switch code (masked)', 'Feed override')
      const n = 1 << bits.length
      const steps = bits.length === 4 ? FEED_OVR_STEPS16 : FEED_OVR_STEPS
      const table = Array.from({ length: n }, (_, gc) => steps[Math.min(c.p('code') ? gc : grayToBin(gc), steps.length - 1)])
      return [
        ...nets,
        N(`Feed override: ${c.p('code') ? 'binary' : 'Gray'} code → *FV0–7 (CODB, negative logic)`, [rd(OFF), rds(ON), fn('CODB', [1, n, raw, 'G12'], table.map((p) => 255 - p)), wrt(c.r('OVERR1', 'Feed override CODB error'))]),
        N(`Jog override: ${c.p('code') ? 'binary' : 'Gray'} code → *JV0–15 (CODB, 0.01 %)`, [rd(OFF), rds(ON), fn('CODB', [2, n, raw, 'G10'], table.map((p) => 65535 - p * 100)), wrt(c.r('OVERR2', 'Jog override CODB error'))]),
        msg(c, [rd(g('OP')), ...bits.map((b) => andn(c.x(`OV${b}I`)))], 'OVR0MS', 'Feed override at 0 % (switch code 0) in automatic operation'),
      ]
    } },
  { id: 'spovr', group: 'Operator panel', name: 'Spindle override (rotary switch)', desc: '3-bit Gray (or binary) code switch → CODB → SOV0–7 (G30), 50–120 %.',
    params: [{ key: 'code', label: 'Switch code', unit: 'count', default: 0, min: 0, max: 1, choices: ['Gray code', 'Binary'] }],
    define: (e) => def({ inputs: [1, 2, 4].map((n, i) => inp(`SOV${n}I`, `Spindle override switch bit ${n} (${e.p('code') ? 'binary' : 'Gray code'})`, 'panel', i === 0 ? { align: 3 } : {})) }),
    nets: (c) => {
      const { raw, nets } = codeIn(c, ['SOV1I', 'SOV2I', 'SOV4I'], 'SOVRAW', 'Spindle override switch code (masked)', 'Spindle override')
      const table = Array.from({ length: 8 }, (_, gc) => SPINDLE_OVR_STEPS[c.p('code') ? gc : grayToBin(gc)])
      return [
        ...nets,
        N(`Spindle override: ${c.p('code') ? 'binary' : 'Gray'} code → SOV (CODB)`, [rd(OFF), rds(ON), fn('CODB', [1, 8, raw, 'G30'], table), wrt(c.r('SOVERR', 'Spindle override CODB error'))]),
      ]
    } },
  { id: 'rapidovr', group: 'Operator panel', name: 'Rapid override (F0 / 25 / 50 / 100 %)', desc: 'Two switch bits → ROV1/ROV2 (G14.0/G14.1): 00 = 100 %, 01 = 50 %, 10 = 25 %, 11 = F0. Message when F0 is selected in automatic operation.',
    define: () => def({ inputs: [inp('ROV1I', 'Rapid override select bit 1', 'panel'), inp('ROV2I', 'Rapid override select bit 2', 'panel')], alarms: [op('ROVF0MS', 'RAPID OVERRIDE F0')] }),
    nets: (c) => [N('Rapid override ROV1', [rd(c.x('ROV1I')), wrt(g('ROV1'))]), N('Rapid override ROV2', [rd(c.x('ROV2I')), wrt(g('ROV2'))]),
      msg(c, [rd(g('OP')), and(c.x('ROV1I')), and(c.x('ROV2I'))], 'ROVF0MS', 'Rapid override F0 in automatic operation message')] },
  { id: 'rapidkeys', group: 'Operator panel', name: 'Rapid override keys (F0 / 25 / 50 / 100 % with LEDs)', conflicts: ['rapidovr'],
    desc: 'Four push buttons select the rapid override (last pressed wins, 100 % after power-on) → ROV1/ROV2 (G14). LED per key. Message when F0 is selected in automatic operation.',
    define: () => def({ inputs: ROVK.map((r) => inp(`ROV${r.k}PBI`, `Rapid override ${r.n} push button`, 'panel')), outputs: ROVK.map((r) => out(`ROV${r.k}L`, `Rapid override ${r.n} LED`, 'panel')), alarms: [op('ROVF0MS', 'RAPID OVERRIDE F0')] }),
    nets: (c) => {
      const R = Object.fromEntries(ROVK.map((r) => [r.k, c.r(`ROV${r.k}R`, `Rapid override ${r.n} selected`)]))
      const others = (k: string) => ROVK.filter((o) => o.k !== k).map((o) => andn(c.x(`ROV${o.k}PBI`)))
      return [
        ...ROVK.filter((r) => r.k !== '100').map((r) => N(`Rapid override ${r.n} selected (self-hold, cleared by the other keys)`, [rd(c.x(`ROV${r.k}PBI`)), or(R[r.k]), ...others(r.k), wrt(R[r.k])])),
        N('Rapid override 100 % (none of the other keys selected)', [rdn(R.F0), andn(R['25']), andn(R['50']), wrt(R['100'])]),
        N('ROV1: 50 % or F0', [rd(R['50']), or(R.F0), wrt(g('ROV1'))]),
        N('ROV2: 25 % or F0', [rd(R['25']), or(R.F0), wrt(g('ROV2'))]),
        ...ROVK.map((r) => N(`Rapid override ${r.n} LED`, [rd(R[r.k]), wrt(c.y(`ROV${r.k}L`))])),
        msg(c, [rd(g('OP')), and(R.F0)], 'ROVF0MS', 'Rapid override F0 in automatic operation message'),
      ]
    } },
  { id: 'jog', group: 'Operator panel', name: 'Jog feed buttons (+J / -J, rapid)', desc: '+/- button per axis → +Jn (G100) / -Jn (G102). Direction lamps from MV/MVD. Rapid → RT (G19.7).',
    define: (e) => def({
      inputs: [...ax(e).flatMap((a) => [inp(`+${a}DIRI`, `+${a} jog push button`, 'panel'), inp(`-${a}DIRI`, `-${a} jog push button`, 'panel')]), inp('RAPIDPBI', 'Rapid traverse push button', 'panel')],
      outputs: ax(e).flatMap((a) => [out(`+${a}MOVL`, `+${a} axis moving lamp`, 'panel'), out(`-${a}MOVL`, `-${a} axis moving lamp`, 'panel')]),
    }),
    nets: (c) => [
      ...c.axes.slice(0, 8).flatMap((a, i) => [
        N(`+J${i + 1} +${a} jog`, [rd(c.x(`+${a}DIRI`)), andn(c.x(`-${a}DIRI`)), wrt(`G100.${i}`)]),
        N(`-J${i + 1} -${a} jog`, [rd(c.x(`-${a}DIRI`)), andn(c.x(`+${a}DIRI`)), wrt(`G102.${i}`)]),
        N(`+${a} moving lamp`, [rd(`F102.${i}`), andn(`F106.${i}`), wrt(c.y(`+${a}MOVL`))]),
        N(`-${a} moving lamp`, [rd(`F102.${i}`), and(`F106.${i}`), wrt(c.y(`-${a}MOVL`))]),
      ]),
      N('Manual rapid traverse (RT)', [rd(c.x('RAPIDPBI')), wrt(g('RT'))]),
    ] },
  { id: 'mpg', group: 'Operator panel', name: 'MPG handle axis & multiplier', desc: 'Axis select switch → HS1A–HS1D (G18), multiplier ×10 / ×100 → MP1/MP2 (G19). ×1 when both OFF.',
    define: (e) => def({ inputs: [...ax(e).map((a) => inp(`H${a}SELI`, `Handle axis select ${a}`, 'panel')), ...(hasOf(e, 'moderot') ? [] : [inp('MPX10I', 'Handle multiplier ×10', 'panel'), inp('MPX100I', 'Handle multiplier ×100', 'panel')])] }),
    nets: (c) => {
      const nets: NetDef[] = []
      const axs = c.axes.slice(0, 8)
      ;['HS1A', 'HS1B', 'HS1C', 'HS1D'].forEach((s, bit) => {
        const src = axs.filter((_, i) => ((i + 1) >> bit) & 1)
        if (src.length) nets.push(N(`Handle axis select ${s}`, [...anyOf(src.map((a) => [rd(c.x(`H${a}SELI`))])), wrt(g(s))]))
      })
      if (!c.has('moderot')) nets.push(N('Handle multiplier MP1 (×10)', [rd(c.x('MPX10I')), wrt(g('MP1'))]), N('Handle multiplier MP2 (×100)', [rd(c.x('MPX100I')), wrt(g('MP2'))]))
      return nets
    } },
  { id: 'mpgkeys', group: 'Operator panel', name: 'MPG axis & multiplier keys (with LEDs)', conflicts: ['mpg'],
    desc: 'Push buttons select the handle axis (X MPG, Z MPG…) and multiplier ×1 / ×10 / ×100 (last pressed wins) → HS1A–HS1D (G18), MP1/MP2 (G19). LED per key.',
    define: (e) => def({
      inputs: [...ax(e).map((a) => inp(`H${a}PBI`, `Handle axis ${a} push button`, 'panel')), ...MPK.map((m) => inp(`MPX${m}PBI`, `Handle multiplier ×${m} push button`, 'panel'))],
      outputs: [...ax(e).map((a) => out(`H${a}L`, `Handle axis ${a} LED`, 'panel')), ...MPK.map((m) => out(`MPX${m}L`, `Handle multiplier ×${m} LED`, 'panel'))],
    }),
    nets: (c) => {
      const axs = c.axes.slice(0, 8)
      const A = axs.map((a) => c.r(`H${a}SEL`, `Handle axis ${a} selected`))
      const M = Object.fromEntries(MPK.map((m) => [m, c.r(`MPX${m}R`, `Handle multiplier ×${m} selected`)]))
      const nets: NetDef[] = axs.map((a, i) => N(`Handle axis ${a} selected (self-hold, cleared by the other axis keys)`, [rd(c.x(`H${a}PBI`)), or(A[i]), ...axs.filter((o) => o !== a).map((o) => andn(c.x(`H${o}PBI`))), wrt(A[i])]))
      ;['HS1A', 'HS1B', 'HS1C', 'HS1D'].forEach((s, bit) => {
        const src = axs.map((_, i) => i).filter((i) => ((i + 1) >> bit) & 1)
        if (src.length) nets.push(N(`Handle axis select ${s}`, [...anyOf(src.map((i) => [rd(A[i])])), wrt(g(s))]))
      })
      for (const m of ['10', '100']) nets.push(N(`Handle multiplier ×${m} selected (self-hold, cleared by the other keys)`, [rd(c.x(`MPX${m}PBI`)), or(M[m]), ...MPK.filter((o) => o !== m).map((o) => andn(c.x(`MPX${o}PBI`))), wrt(M[m])]))
      nets.push(
        N('Handle multiplier ×1 (neither ×10 nor ×100)', [rdn(M['10']), andn(M['100']), wrt(M['1'])]),
        N('Handle multiplier MP1 (×10)', [rd(M['10']), wrt(g('MP1'))]), N('Handle multiplier MP2 (×100)', [rd(M['100']), wrt(g('MP2'))]),
        ...axs.map((a, i) => N(`Handle axis ${a} LED`, [rd(A[i]), wrt(c.y(`H${a}L`))])),
        ...MPK.map((m) => N(`Handle multiplier ×${m} LED`, [rd(M[m]), wrt(c.y(`MPX${m}L`))])),
      )
      return nets
    } },
  { id: 'prgfunc', group: 'Operator panel', name: 'Single block / Block skip / Dry run / Machine lock', desc: 'Push buttons with LEDs (toggle) → SBK G46.1, BDT1 G44.0, DRN G46.7, MLK G44.1. Messages while machine lock / dry run are ON.',
    define: () => def({ inputs: PRG.map((p) => inp(`${p.k}PBI`, `${p.n} push button`, 'panel')), outputs: PRG.map((p) => out(`${p.k}L`, `${p.n} lamp`, 'panel')), alarms: [op('MLKMS', 'MACHINE LOCK ON'), op('DRNMS', 'DRY RUN ON')] }),
    nets: (c) => [...PRG.flatMap((p) => {
      const st = c.r(`${p.k}R`, `${p.n} ON`)
      return [...onOff(c, { st, sym: `${p.k}R`, name: p.n, pb: c.x(`${p.k}PBI`) }), N(`${p.n} → ${p.s} + lamp`, [rd(st), wrt(g(p.s)), wrt(c.y(`${p.k}L`))])]
    }), msg(c, [rd(c.r('MLKR', 'Machine lock ON'))], 'MLKMS', 'Machine lock ON message'), msg(c, [rd(c.r('DRNR', 'Dry run ON'))], 'DRNMS', 'Dry run ON message')] },
  { id: 'memkey', group: 'Operator panel', name: 'Program protect key', desc: 'Key switch ON = editing allowed → KEY1–KEY4 (G46.3–G46.6).',
    define: () => def({ inputs: [inp('KEYSWI', 'Program protect key switch (ON = edit allowed)', 'panel')] }),
    nets: (c) => [N('Memory protect KEY1–KEY4', [rd(c.x('KEYSWI')), wrt(g('KEY1')), wrt(g('KEY2')), wrt(g('KEY3')), wrt(g('KEY4'))])] },

  /* ---------------- Spindle ---------------- */
  { id: 'spindle', group: 'Spindle', name: 'Spindle CW / CCW / stop (M03/M04/M05)', desc: 'M03/M04/M05 + panel buttons in manual mode → SFRA/SRVA (G70). *ESPA in Level 1, MRDYA always ON. Spindle amplifier alarm (ARSTA on reset), speed not reached, S0, interlock and warm-up messages.',
    params: [{ key: 'finDelay', label: 'M03/M04 FIN delay (speed up)', unit: 'ms', default: 1000, min: 0, max: 30000 }, { key: 'sarTime', label: 'Speed arrival timeout', unit: 'ms', default: 15000, min: 1000, max: 120000 }],
    define: () => def({
      inputs: [inp('SPCWPBI', 'Spindle CW push button', 'panel'), inp('SPCCWPBI', 'Spindle CCW push button', 'panel'), inp('SPSTPBI', 'Spindle stop push button', 'panel')],
      outputs: [out('SPCWL', 'Spindle CW lamp', 'panel'), out('SPCCWL', 'Spindle CCW lamp', 'panel'), out('SPSTPL', 'Spindle stop lamp', 'panel')],
      mcodes: [{ code: 3, label: 'Spindle CW' }, { code: 4, label: 'Spindle CCW' }, { code: 5, label: 'Spindle stop', shared: true }],
      alarms: [alSp('SPALMAL', 'SPINDLE AMPLIFIER ALARM'), alSp('SPSAAL', 'SPINDLE SPEED NOT REACHED'), op('SPS0MS', 'SPINDLE S0 - CHECK S COMMAND'), op('SPILKMS', 'SPINDLE INTERLOCK ACTIVE'), op('SPMNMS', 'SPINDLE KEYS: MANUAL MODE ONLY'), op('SPWUMS', 'RUN SPINDLE WARM-UP PROGRAM')],
    }),
    nets: (c) => {
      const man = c.manual(), m3 = c.m(3), m4 = c.m(4), m5 = c.m(5)
      const STOP = c.r('SPSTOP', 'Spindle stop request'), CW = c.r('SPCW', 'Spindle CW command'), CCW = c.r('SPCCW', 'Spindle CCW command')
      const RUN = c.r('SPRUN', 'Spindle running (CW or CCW)'), FIN = c.r('SPFIN', 'Spindle M03/M04 completion'), WU = c.r('SPWUDN', 'Warm-up reminder cleared (first cycle start)')
      const turning = [rd(RUN), and(g('*SSTP')), andn(g('ORCMA'))]
      c.mfin(3, FIN); c.mfin(4, FIN); c.mfin(5, RUN, true)
      return [
        N('Spindle *ESPA follows *ESP', [rd(g('*ESP')), wrt(g('*ESPA'))], 1),
        N('Spindle stop request (M05 / STOP button / reset / E-stop / spindle alarm)', [rd(m5), or(c.x('SPSTPBI')), or(RSTF()), orn(g('*ESP')), or(g('ALMA')), wrt(STOP)]),
        N('Spindle CW (M03 or CW button in manual)', [...anyOf([[rd(m3)], [rd(c.x('SPCWPBI')), and(man)], [rd(CW)]]), andn(STOP), andn(m4), andn(c.x('SPCCWPBI')), wrt(CW)]),
        N('Spindle CCW (M04 or CCW button in manual)', [...anyOf([[rd(m4)], [rd(c.x('SPCCWPBI')), and(man)], [rd(CCW)]]), andn(STOP), andn(m3), andn(c.x('SPCWPBI')), wrt(CCW)]),
        N('SFRA spindle CW + lamp', [rd(CW), wrt(g('SFRA')), wrt(c.y('SPCWL'))]),
        N('SRVA spindle CCW + lamp', [rd(CCW), wrt(g('SRVA')), wrt(c.y('SPCCWL'))]),
        N('Spindle running', [rd(CW), or(CCW), wrt(RUN)]),
        N('Spindle stop lamp', [rdn(RUN), wrt(c.y('SPSTPL'))]),
        N('MRDYA machine ready (spindle 1)', [rd(ON), wrt(g('MRDYA'))]),
        N('M03/M04 completion delay', [rd(RUN), tmrb(c, c.p('finDelay')), wrt(FIN)]),
        N('ARSTA spindle alarm reset on CNC reset', [rd(RSTF()), wrt(g('ARSTA'))]),
        msg(c, [rd(g('ALMA'))], 'SPALMAL', 'Spindle amplifier alarm (ALMA) — reset with RESET after the cause is removed'),
        ...delayAlarm(c, [...turning, andn(g('SARA')), andn(g('SSTA'))], c.p('sarTime'), 'SPSAAL', 'Spindle speed arrival (SARA) not reached', 'SPSATO'),
        ...delayMsg(c, [...turning, and(g('SSTA'))], 3000, 'SPS0MS', 'M03/M04 with S0 (speed zero while commanded)', 'SPS0T'),
        msg(c, [rd(RUN), andn(g('*SSTP'))], 'SPILKMS', 'Spindle commanded but *SSTP interlock active'),
        msg(c, [rd(c.x('SPCWPBI')), or(c.x('SPCCWPBI')), andn(man)], 'SPMNMS', 'Spindle buttons pressed outside manual mode'),
        N('Warm-up reminder cleared by first cycle start', [rd(g('STL')), or(WU), wrt(WU)]),
        msg(c, [rd(g('MA')), andn(WU)], 'SPWUMS', 'Power-on warm-up reminder'),
      ]
    } },
  { id: 'orient', group: 'Spindle', name: 'Spindle orientation (M19)', requires: ['spindle'], desc: 'M19 → ORCMA (G70.6); FIN on ORARA (F45.7). Timeout and orientation-lost alarms.',
    params: [timeoutP(10000)],
    define: () => def({ mcodes: [{ code: 19, label: 'Spindle orientation' }], alarms: [al('ORTOAL', 'SPINDLE ORIENTATION TIMEOUT'), al('ORLSAL', 'SPINDLE ORIENTATION LOST')] }),
    nets: (c) => {
      const REQ = c.r('ORREQ', 'Orientation request'), TO = c.r('ORTO', 'Orientation timeout timer'), RCH = c.r('ORRCH', 'Orientation reached (held while commanded)')
      c.mfin(19, g('ORARA'))
      return [
        N('Orientation request (M19, cancelled by M03/M04/M05/reset)', [rd(c.m(19)), or(REQ), andn(c.m(3)), andn(c.m(4)), andn(c.m(5)), andn(RSTF()), wrt(REQ)]),
        N('ORCMA orientation command', [rd(REQ), wrt(g('ORCMA'))]),
        N('Orientation timeout timer', [rd(REQ), andn(g('ORARA')), andn(RCH), tmrb(c, c.p('timeout')), wrt(TO)]),
        latchAlarm(c, [rd(TO)], 'ORTOAL', 'Orientation timeout alarm'),
        N('Orientation reached (held while commanded)', [rd(g('ORARA')), or(RCH), and(REQ), wrt(RCH)]),
        ...delayAlarm(c, [rd(RCH), andn(g('ORARA'))], 200, 'ORLSAL', 'Orientation lost while commanded', 'ORLST'),
      ]
    } },
  { id: 'gear', group: 'Spindle', name: 'Spindle gear change (M41 / M42)', requires: ['spindle'], desc: 'Gear solenoids until gear position switch is reached; GR1/GR2 (G28) back to CNC. Timeout, switch fault and gear-not-engaged alarms.',
    params: [mP('m1', 'Low gear M-code', 41), mP('m2', 'High gear M-code', 42), timeoutP(8000)],
    define: (e) => def({
      inputs: [inp('GR1PSI', 'Gear 1 (low) position switch'), inp('GR2PSI', 'Gear 2 (high) position switch')],
      outputs: [out('GR1SOL', 'Gear 1 shift solenoid'), out('GR2SOL', 'Gear 2 shift solenoid')],
      mcodes: [{ code: e.p('m1'), label: 'Low gear' }, { code: e.p('m2'), label: 'High gear' }],
      alarms: [al('GRTOAL', 'SPINDLE GEAR CHANGE TIMEOUT'), al('GRSNAL', 'GEAR SWITCH FAULT (BOTH ON)'), alSp('GRNEAL', 'SPINDLE GEAR NOT ENGAGED')],
    }),
    nets: (c) => {
      const m1 = c.m(c.p('m1')), m2 = c.m(c.p('m2')), G1 = c.x('GR1PSI'), G2 = c.x('GR2PSI')
      const R1 = c.r('GR1REQ', 'Gear 1 request'), R2 = c.r('GR2REQ', 'Gear 2 request'), TO = c.r('GRTO', 'Gear change timeout timer')
      c.mfin(c.p('m1'), G1); c.mfin(c.p('m2'), G2); c.spStop(R1); c.spStop(R2)
      return [
        N('Gear 1 request', [rd(m1), or(R1), andn(m2), andn(G1), andn(RSTF()), wrt(R1)]),
        N('Gear 2 request', [rd(m2), or(R2), andn(m1), andn(G2), andn(RSTF()), wrt(R2)]),
        N('Gear 1 solenoid', [rd(R1), wrt(c.y('GR1SOL'))]),
        N('Gear 2 solenoid', [rd(R2), wrt(c.y('GR2SOL'))]),
        N('GR1 gear select → CNC', [rd(G1), wrt(g('GR1'))]),
        N('GR2 gear select → CNC', [rd(G2), wrt(g('GR2'))]),
        N('Gear change timeout timer', [rd(R1), or(R2), tmrb(c, c.p('timeout')), wrt(TO)]),
        latchAlarm(c, [rd(TO)], 'GRTOAL', 'Gear change timeout alarm'),
        ...delayAlarm(c, [rd(G1), and(G2)], 300, 'GRSNAL', 'Gear position switches both ON', 'GRSFT'),
        ...delayAlarm(c, [rd(c.r('SPRUN', 'Spindle running (CW or CCW)')), andn(G1), andn(G2), andn(R1), andn(R2)], 500, 'GRNEAL', 'Spindle running with no gear engaged', 'GRNET'),
      ]
    } },
  { id: 'sp2', group: 'Spindle', name: 'Sub-spindle CW / CCW / stop', desc: 'Second serial spindle via SFRB/SRVB (G74). M-codes configurable. *ESPB in Level 1. Spindle 2 amplifier alarm (ALMB).', conflicts: ['livetool'],
    params: [mP('mCw', 'Sub-spindle CW', 63), mP('mCcw', 'Sub-spindle CCW', 64), mP('mStop', 'Sub-spindle stop', 65), { key: 'finDelay', label: 'FIN delay', unit: 'ms', default: 1000, min: 0, max: 30000 }],
    define: (e) => def({ mcodes: [{ code: e.p('mCw'), label: 'Sub-spindle CW' }, { code: e.p('mCcw'), label: 'Sub-spindle CCW' }, { code: e.p('mStop'), label: 'Sub-spindle stop' }], alarms: [al('SP2ALMAL', 'SUB-SPINDLE AMPLIFIER ALARM')] }),
    nets: (c) => spindle2(c, 'SP2', 'Sub-spindle') },
  { id: 'livetool', group: 'Spindle', name: 'Live tool (rotary tool spindle)', desc: 'Rotary tool on serial spindle 2 (SFRB/SRVB, G74). M-codes configurable. Amplifier alarm; with a turret, start only when the turret is clamped.', conflicts: ['sp2'],
    params: [mP('mCw', 'Live tool CW', 45), mP('mCcw', 'Live tool CCW', 46), mP('mStop', 'Live tool stop', 47), { key: 'finDelay', label: 'FIN delay', unit: 'ms', default: 800, min: 0, max: 30000 }],
    define: (e) => def({ mcodes: [{ code: e.p('mCw'), label: 'Live tool CW' }, { code: e.p('mCcw'), label: 'Live tool CCW' }, { code: e.p('mStop'), label: 'Live tool stop' }], alarms: [al('LTALMAL', 'LIVE TOOL AMPLIFIER ALARM'), ...(hasOf(e, 'turret') ? [op('LTTCMS', 'LIVE TOOL: TURRET NOT CLAMPED')] : [])] }),
    nets: (c) => spindle2(c, 'LT', 'Live tool', c.has('turret') ? c.r('TCLOK', 'Turret clamped (confirm, not unclamping)') : undefined) },
  { id: 'spclamp', group: 'Spindle', name: 'Spindle / C-axis clamp', desc: 'Spindle brake for milling on a lathe. Spindle stop while clamped; clamp command ignored while the spindle runs.',
    params: [mP('mOn', 'Clamp', 68), mP('mOff', 'Unclamp', 69), timeoutP(3000)],
    define: (e) => def({ inputs: [inp('SPCLPI', 'Spindle clamped confirm'), inp('SPUCLI', 'Spindle unclamped confirm')], outputs: [out('SPCLPO', 'Spindle clamp solenoid')], mcodes: [{ code: e.p('mOn'), label: 'Spindle clamp' }, { code: e.p('mOff'), label: 'Spindle unclamp' }], alarms: [...tpAlarms(SPEC.spclamp(e)), ...(hasOf(e, 'spindle') ? [op('SPCLSPMS', 'SPINDLE CLAMPED: START INHIBIT')] : [])] }),
    nets: (c) => {
      c.spStop(c.y('SPCLPO')); const run = spRun(c)
      return [...twoPos(c, { st: 'SPCLR', name: 'Spindle clamp', mOn: c.p('mOn'), mOff: c.p('mOff'), outOn: c.y('SPCLPO'), sensOn: c.x('SPCLPI'), sensOff: c.x('SPUCLI'), timeout: c.p('timeout'), spec: SPEC.spclamp(c), blockWhen: run ? [run] : [] }),
        ...(run ? [msg(c, [rd(run), and(c.y('SPCLPO'))], 'SPCLSPMS', 'Spindle start while spindle clamped')] : [])]
    } },
  { id: 'spcooler', group: 'Spindle', name: 'Spindle oil cooler', desc: 'Cooler runs with servo ready (SA); cooler alarm stops the spindle and feed (latched until reset).',
    define: () => def({ inputs: [inp('SPCLALI', 'Spindle cooler OK (NC alarm contact)')], outputs: [out('SPCOOLO', 'Spindle oil cooler run')], alarms: [alSp('SPCOOLAL', 'SPINDLE OIL COOLER ALARM')] }),
    nets: (c) => [N('Spindle cooler run', [rd(g('SA')), wrt(c.y('SPCOOLO'))]), ...delayAlarm(c, [rd(g('SA')), andn(c.x('SPCLALI'))], 500, 'SPCOOLAL', 'Spindle cooler alarm', 'SPCOOLT')] },

  /* ---------------- Axes ---------------- */
  { id: 'decdog', group: 'Axes', name: 'Reference return dogs (*DEC)', desc: 'Deceleration dogs on the fixed inputs X9.0–X9.7 (read directly by the CNC — no ladder needed).',
    define: (e) => def({ inputs: ax(e).map((a, i) => inp(`${a}DECI`, `*DEC${i + 1} ${a} reference return dog (fixed input)`, 'machine', { fixed: `X9.${i}` })) }),
    nets: () => [] },
  { id: 'refdone', group: 'Axes', name: 'Reference return complete lamps', desc: 'Lamp per axis from ZPn (F94). Cycle start needs every axis referenced; reminder message after power-on.',
    define: (e) => def({ outputs: ax(e).map((a) => out(`${a}ZRNL`, `${a} reference return complete lamp`, 'panel')), alarms: [op('ZRNMS', 'PERFORM REFERENCE RETURN')] }),
    nets: (c) => {
      const ALL = c.r('ALLZP', 'All axes reference return complete'); c.permit(ALL)
      const axs = c.axes.slice(0, 8)
      return [
        ...axs.map((a, i) => N(`${a} reference return lamp (ZP${i + 1})`, [rd(`F94.${i}`), wrt(c.y(`${a}ZRNL`))])),
        N('All axes referenced', axs.length ? [rd('F94.0'), ...axs.slice(1).map((_, i) => and(`F94.${i + 1}`)), wrt(ALL)] : [rd(ON), wrt(ALL)]),
        msg(c, [rdn(ALL), and(g('MA'))], 'ZRNMS', 'Reference return not done (power-on reminder)'),
      ]
    } },
  { id: 'axbrake', group: 'Axes', name: 'Vertical axis brake release', desc: 'Brake released when servo ready (SA F0.6), with a release delay. Brake confirm switch → brake fault alarm (interlock).',
    params: [{ key: 'delay', label: 'Release delay after SA', unit: 'ms', default: 100, min: 0, max: 5000 }],
    define: () => def({ inputs: [inp('ZBRKI', 'Vertical axis brake released confirm')], outputs: [out('ZBRKO', 'Vertical axis brake release')], alarms: [al('ZBRKAL', 'AXIS BRAKE FAULT', 'alarm', { it: true })] }),
    nets: (c) => {
      const O = c.y('ZBRKO'), I = c.x('ZBRKI')
      return [N('Axis brake release after servo ready', [rd(g('SA')), tmrb(c, c.p('delay')), wrt(O)]),
        ...delayAlarm(c, anyOf([[rd(O), andn(I)], [rdn(O), and(I)]]), 1000, 'ZBRKAL', 'Axis brake confirm does not follow the release output', 'ZBRKT')]
    } },
  { id: 'absbattery', group: 'Axes', name: 'Battery alarms (CNC + absolute encoder)', desc: 'BAL (F1.2) and absolute encoder battery box → operator messages. Battery zero is raised by the CNC itself (DS0306).',
    define: () => def({ inputs: [inp('APCBATI', 'Absolute encoder battery low (ON = low)')], alarms: [op('CNCBATMS', 'CNC BATTERY LOW'), op('APCBATMS', 'ENCODER BATTERY LOW')] }),
    nets: (c) => [msg(c, [rd(g('BAL'))], 'CNCBATMS', 'CNC battery low message'), msg(c, [rd(c.x('APCBATI'))], 'APCBATMS', 'Absolute encoder battery low message (replace with power ON)')] },

  /* ---------------- Tool changer ---------------- */
  { id: 'turret', group: 'Tool changer', name: 'Turret (lathe) — index by T-code', requires: ['tcode'], conflicts: ['atc'],
    desc: 'Binary position sensors vs T-code (COMPB), unclamp → rotate → clamp, TFIN when clamped in position. Index / clamp timeout, T0 or T > stations, position code error, not-clamped and sensor fault alarms.',
    params: [{ key: 'stations', label: 'Turret stations', unit: 'count', default: 12, min: 2, max: 15 }, timeoutP(8000), { key: 'clampTime', label: 'Clamp timeout', unit: 'ms', default: 3000, min: 100, max: 30000 }],
    define: (e) => def({
      inputs: [...[1, 2, 4, 8].map((n, i) => inp(`TPOS${n}I`, `Turret position code bit ${n}`, 'machine', i === 0 ? { align: 4 } : {})), inp('TCLPI', 'Turret clamped confirm'), inp('TUCLI', 'Turret unclamped confirm'), inp('TMANPBI', 'Turret manual index push button', 'panel')],
      outputs: [out('TUCLO', 'Turret unclamp solenoid'), out('TROTO', 'Turret rotate (motor / valve)')],
      alarms: [al('TIDXAL', 'TURRET INDEX TIMEOUT'), al('TOUTAL', 'T-CODE OUT OF RANGE'), al('TCLTAL', 'TURRET CLAMP TIMEOUT'), alSp('TNCLAL', 'TURRET NOT CLAMPED'), al('TSNAL', 'TURRET CLAMP SENSOR FAULT'), al('TPOSAL', 'TURRET POSITION CODE ERROR'),
        ...(hasOf(e, 'spindle') ? [op('TMNMS', 'TURRET INDEX: SPINDLE RUNNING')] : [])],
    }),
    nets: (c) => {
      const TF = g('TF'), run = spRun(c)
      const pos = codeIn(c, ['TPOS1I', 'TPOS2I', 'TPOS4I', 'TPOS8I'], 'TCUR', 'Turret current position', 'Turret: read position code'), cur = pos.raw
      const EQ = c.r('TEQ', 'Turret at commanded T'), BAD = c.r('TBAD', 'T-code out of range (T0 or > stations)'), BIG = c.r('TBIG', 'T-code > stations'), IDX = c.r('TIDX', 'Turret index in progress')
      const MAN = c.r('TMAN', 'Turret manual index'), DONE = c.r('TDONE', 'Turret index complete'), TO = c.r('TIDXTO', 'Turret index timeout timer')
      const PBIG = c.r('TPBIG', 'Turret position code > stations'), PERR = c.r('TPERR', 'Turret position code invalid (0 or > stations)')
      const OK = c.r('TCLOK', 'Turret clamped (confirm, not unclamping)')
      c.tdone(DONE); c.permit(c.x('TCLPI')); c.inter(c.x('TCLPI'), true)
      const nets: NetDef[] = [
        ...pos.nets,
        N('Turret: compare T-code with position (COMPB)', [rd(TF), fn('COMPB', [1001, 'F26', cur])]),
        N('Turret: in position', [rd(TF), and('R9000.0'), wrt(EQ)]),
        N('Turret: check T-code ≤ stations (COMPB)', [rd(TF), fn('COMPB', [1, c.p('stations'), 'F26'])]),
        N('Turret: T-code > stations', [rd(TF), and('R9000.1'), wrt(BIG)]),
        N('Turret: check T0 (COMPB)', [rd(TF), fn('COMPB', [1, 0, 'F26'])]),
        N('Turret: T-code out of range (T0 or > stations)', [rd(TF), and('R9000.0'), or(BIG), and(TF), wrt(BAD)]),
        latchAlarm(c, [rd(BAD)], 'TOUTAL', 'T-code out of range alarm'),
        N('Turret: check position code ≤ stations (COMPB)', [rd(ON), fn('COMPB', [1, c.p('stations'), cur])]),
        N('Turret: position code > stations', [rd('R9000.1'), wrt(PBIG)]),
        N('Turret: check position code 0 (COMPB)', [rd(ON), fn('COMPB', [1, 0, cur])]),
        N('Turret: position code invalid', [rd('R9000.0'), or(PBIG), wrt(PERR)]),
        N('Turret: index request', [rd(TF), andn(EQ), andn(BAD), or(IDX), andn(EQ), andn(RSTF()), andn(TO), wrt(IDX)]),
        N(`Turret: manual index (hold button in manual mode${run ? ', spindle stopped' : ''})`, [rd(c.x('TMANPBI')), and(c.manual()), ...(run ? [andn(run)] : []), wrt(MAN)]),
        N('Turret: unclamp', [rd(IDX), or(MAN), wrt(c.y('TUCLO'))]),
        N('Turret: rotate when unclamped', [rd(IDX), or(MAN), and(c.x('TUCLI')), wrt(c.y('TROTO'))]),
        N('Turret: index complete → TFIN', [rd(TF), and(EQ), and(c.x('TCLPI')), andn(c.y('TUCLO')), wrt(DONE)]),
        N('Turret: clamped (for live tool / interlocks)', [rd(c.x('TCLPI')), andn(c.y('TUCLO')), wrt(OK)]),
        N('Turret: index timeout timer', [rd(IDX), tmrb(c, c.p('timeout')), wrt(TO)]),
        latchAlarm(c, [rd(TO)], 'TIDXAL', 'Turret index timeout alarm'),
        ...delayAlarm(c, [rd(TF), and(EQ), andn(c.y('TUCLO')), andn(c.x('TCLPI'))], c.p('clampTime'), 'TCLTAL', 'Turret clamp not confirmed after index', 'TCLTO'),
        ...delayAlarm(c, [rdn(c.x('TCLPI')), andn(c.y('TUCLO')), andn(TF)], 500, 'TNCLAL', 'Turret unclamped without command (cutting)', 'TNCLT'),
        ...delayAlarm(c, [rd(c.x('TCLPI')), and(c.x('TUCLI'))], 300, 'TSNAL', 'Turret clamp / unclamp sensors both ON', 'TSNT'),
        ...delayAlarm(c, [rd(PERR), and(c.x('TCLPI')), andn(IDX), andn(MAN)], 500, 'TPOSAL', 'Turret position code invalid while clamped', 'TPOST'),
      ]
      if (run) nets.push(msg(c, [rd(c.x('TMANPBI')), and(c.manual()), and(run)], 'TMNMS', 'Turret manual index rejected: spindle running'))
      return nets
    } },
  { id: 'atc', group: 'Tool changer', name: 'ATC — arm type with carousel (M06)', requires: ['tcode', 'spindle'], conflicts: ['turret', 'drawbar'],
    desc: 'T-code rotates the magazine (pocket counter + COMPB). M06 runs: pot down → arm grip → unclamp → swap → clamp → arm origin → pot up. Orient the spindle in the M06 macro. Per-step timeout, magazine timeout / count mismatch, T out of range, tool clamp and recovery messages.',
    params: [{ key: 'pockets', label: 'Magazine pockets', unit: 'count', default: 24, min: 4, max: 120 }, timeoutP(15000)],
    define: (e) => def({
      inputs: [
        inp('MGCNTI', 'Magazine pocket count sensor'), inp('MGORGI', 'Magazine origin (pocket 1)'), inp('POTDNI', 'Tool pot down'), inp('POTUPI', 'Tool pot up'),
        inp('ARMORGI', 'ATC arm origin'), inp('ARMGRPI', 'ATC arm grip position (60°)'), inp('ARMSWPI', 'ATC arm swap complete'),
        inp('TCLMPI', 'Spindle tool clamped'), inp('TUNCLI', 'Spindle tool unclamped'),
        inp('TLUNCPBI', 'Tool unclamp push button (manual)', 'panel'), inp('MGCWPBI', 'Magazine rotate push button (manual)', 'panel'),
      ],
      outputs: [out('MGCWO', 'Magazine rotate'), out('POTDNO', 'Tool pot down solenoid'), out('ARMO', 'ATC arm motor'), out('TLUNCO', 'Spindle tool unclamp solenoid')],
      mcodes: [{ code: 6, label: 'Tool change' }],
      alarms: [...stepAlarms('ATC', 'ATC', ATC_STEPS), ...(e.axes.includes('Z') ? [al('ATCZPAL', 'ATC: Z NOT AT TOOL CHANGE POS')] : []), al('MGTOAL', 'MAGAZINE INDEX TIMEOUT'), al('MGCNAL', 'MAGAZINE COUNT MISMATCH'), al('ATCTRAL', 'T-CODE OUT OF RANGE'),
        alSp('TLUSAL', 'TOOL UNCLAMPED: SPINDLE STOP'), al('TLSNAL', 'TOOL CLAMP SENSOR FAULT'), op('TLUCMS', 'TOOL UNCLAMP: SPINDLE RUNNING'), op('MGPTMS', 'MAGAZINE: TOOL POT NOT UP'), op('ATCORMS', 'ATC NOT AT ORIGIN - RECOVER')],
    }),
    nets: (c) => {
      const TF = g('TF'), man = c.manual(), run = c.r('SPRUN', 'Spindle running (CW or CCW)')
      const PK = c.rb('MGPK', 'Magazine current pocket'), P = c.r('MGP', 'Magazine count pulse'), EQ = c.r('MGEQ', 'Magazine at commanded pocket'), MD = c.r('MGDONE', 'Magazine positioning complete')
      const REQ = c.r('ATCREQ', 'ATC request (M06)'), BIG = c.r('ATCTBIG', 'T-code > magazine pockets'), BAD = c.r('ATCTBAD', 'T-code out of range (T0 or > pockets)')
      const zi = c.axes.indexOf('Z')
      const seq = stepSeq(c, 'ATC', 'ATC', REQ, ATC_STEPS.map((label, i) => ({ label: label.toLowerCase(), cond: c.x(['POTDNI', 'ARMGRPI', 'TUNCLI', 'ARMSWPI', 'TCLMPI', 'ARMORGI', 'POTUPI'][i]) })), { ms: c.p('timeout'), key: (i) => `ATCS${i + 1}AL` })
      const S = seq.steps
      c.tdone(MD); c.mfin(6, seq.DN); c.inter(REQ); c.spStop(REQ); c.spStop(c.x('TUNCLI')); c.permit(c.x('ARMORGI')); c.permit(c.x('POTUPI'))
      const nets: NetDef[] = [
        pulse(c, [rd(c.x('MGCNTI'))], P, 'Magazine: count pulse (DIFU)'),
        N('Magazine: pocket +1 while rotating (ADDB)', [rd(P), and(c.y('MGCWO')), fn('ADDB', [1, PK, 1, PK])]),
        N('Magazine: pocket overflow check (COMPB)', [rd(ON), fn('COMPB', [1, c.p('pockets'), PK])]),
        // count pulse of pocket 1 must come while the origin switch is made — adjust to the magazine
        latchAlarm(c, [rd('R9000.1'), andn(c.x('MGORGI'))], 'MGCNAL', 'Magazine: wrapped past last pocket without origin switch (count mismatch)'),
        N('Magazine: wrap to pocket 1 / origin (NUMEB)', [rd('R9000.1'), or(c.x('MGORGI')), fn('NUMEB', [1, 1, PK])]),
        N('Magazine: compare T-code with pocket (COMPB)', [rd(TF), fn('COMPB', [1001, 'F26', PK])]),
        N('Magazine: at commanded pocket', [rd(TF), and('R9000.0'), wrt(EQ)]),
        N('Magazine: check T-code ≤ pockets (COMPB)', [rd(TF), fn('COMPB', [1, c.p('pockets'), 'F26'])]),
        N('Magazine: T-code > pockets', [rd(TF), and('R9000.1'), wrt(BIG)]),
        N('Magazine: check T0 (COMPB)', [rd(TF), fn('COMPB', [1, 0, 'F26'])]),
        N('Magazine: T-code out of range (T0 or > pockets)', [rd(TF), and('R9000.0'), or(BIG), and(TF), wrt(BAD)]),
        latchAlarm(c, [rd(BAD)], 'ATCTRAL', 'T-code out of range alarm'),
        N('Magazine: rotate (T-code or manual button)', [...anyOf([[rd(TF), andn(EQ), andn(BAD), and(c.x('POTUPI')), andn(REQ), andn(c.a('MGTOAL'))], [rd(c.x('MGCWPBI')), and(man), and(c.x('POTUPI'))]]), wrt(c.y('MGCWO'))]),
        N('Magazine: positioning complete → TFIN', [rd(TF), and(EQ), andn(c.y('MGCWO')), wrt(MD)]),
        ...delayAlarm(c, [rd(TF), andn(EQ), andn(BAD)], c.p('timeout'), 'MGTOAL', 'Magazine positioning timeout', 'MGTO'),
        msg(c, [rd(c.x('MGCWPBI')), and(man), andn(c.x('POTUPI'))], 'MGPTMS', 'Magazine manual rotate rejected: tool pot not up'),
        N(zi >= 0 ? 'ATC request (M06 at Z tool change position ZP2)' : 'ATC request (M06)', [rd(c.m(6)), ...(zi >= 0 ? [and(`F96.${zi}`)] : []), andn(seq.DN), andn(RSTF()), wrt(REQ)]),
        ...seq.nets,
        N('ATC: pot down solenoid (steps 1–6)', [...anyStep(S.slice(0, 6)), wrt(c.y('POTDNO'))]),
        N('ATC: arm motor (steps 2, 4, 6)', [rd(S[1]), or(S[3]), or(S[5]), wrt(c.y('ARMO'))]),
        N('ATC: tool unclamp (steps 3–4 or manual button, spindle stopped)', [...anyOf([[rd(S[2])], [rd(S[3])], [rd(c.x('TLUNCPBI')), and(man), andn(g('OP')), andn(run)]]), wrt(c.y('TLUNCO'))]),
        msg(c, [rd(c.x('TLUNCPBI')), and(run)], 'TLUCMS', 'Tool unclamp rejected: spindle running'),
        latchAlarm(c, [rd(c.x('TUNCLI')), and(run), andn(REQ)], 'TLUSAL', 'Tool unclamped while spindle running'),
        ...delayAlarm(c, [rd(c.x('TCLMPI')), and(c.x('TUNCLI'))], 300, 'TLSNAL', 'Tool clamp / unclamp sensors both ON', 'TLSNT'),
        msg(c, andAny([rdn(REQ)], [[rdn(c.x('ARMORGI'))], [rdn(c.x('POTUPI'))]]), 'ATCORMS', 'ATC not at origin (arm / pot) — recover in manual'),
      ]
      if (zi >= 0) nets.push(latchAlarm(c, [rd(c.m(6)), andn(`F96.${zi}`)], 'ATCZPAL', 'ATC: Z not at tool change position alarm'))
      return nets
    } },
  { id: 'drawbar', group: 'Tool changer', name: 'Manual tool clamp / unclamp (drawbar)', conflicts: ['atc'], desc: 'Tool unclamp push button in manual mode with spindle stopped. Clamp / unclamp timeout, unclamped-while-running alarm, rejected-command messages.',
    params: [timeoutP(2000)],
    define: (e) => def({ inputs: [inp('TLUNCPBI', 'Tool unclamp push button', 'panel'), inp('TUNCLI', 'Tool unclamped confirm')], outputs: [out('TLUNCO', 'Spindle tool unclamp solenoid')],
      alarms: [al('DBUCAL', 'TOOL UNCLAMP TIMEOUT'), al('DBCLAL', 'TOOL CLAMP TIMEOUT'), op('DBMNMS', 'TOOL UNCLAMP: MANUAL MODE ONLY'), ...(hasOf(e, 'spindle') ? [alSp('DBRNAL', 'TOOL UNCLAMPED: SPINDLE STOP'), op('DBSPMS', 'TOOL UNCLAMP: SPINDLE RUNNING')] : [])] }),
    nets: (c) => {
      const O = c.y('TLUNCO'), I = c.x('TUNCLI'), B = c.x('TLUNCPBI'), run = spRun(c)
      c.spStop(O); c.spStop(I); c.permit(I, true)
      return [
        N('Tool unclamp (manual mode, spindle stopped)', [rd(B), and(c.manual()), ...(run ? [andn(run)] : []), wrt(O)]),
        ...delayAlarm(c, [rd(O), andn(I)], c.p('timeout'), 'DBUCAL', 'Tool unclamp not confirmed', 'DBUCT'),
        ...delayAlarm(c, [rdn(O), and(I)], c.p('timeout'), 'DBCLAL', 'Tool clamp not confirmed (unclamped sensor stays ON)', 'DBCLT'),
        msg(c, [rd(B), andn(c.manual())], 'DBMNMS', 'Tool unclamp button outside manual mode'),
        ...(run ? [latchAlarm(c, [rd(I), and(run)], 'DBRNAL', 'Tool unclamped while spindle running'), msg(c, [rd(B), and(run)], 'DBSPMS', 'Tool unclamp rejected: spindle running')] : []),
      ]
    } },
  { id: 'toollife', group: 'Tool changer', name: 'Tool life management', desc: 'TLCH (F64.0) → message + lamp; TLCHB (F64.3) remaining-life warning; reset button → TLRST (G48.7).',
    define: () => def({ inputs: [inp('TLRSTPBI', 'Tool life reset push button', 'panel')], outputs: [out('TLCHL', 'Tool life expired lamp', 'panel')], alarms: [op('TLCHMS', 'TOOL LIFE EXPIRED - CHANGE TOOL'), op('TLCHBMS', 'TOOL LIFE NEAR END')] }),
    nets: (c) => [N('Tool life expired lamp + message', [rd(g('TLCH')), wrt(c.y('TLCHL')), wrt(c.a('TLCHMS'))]), msg(c, [rd('F64.3'), andn(g('TLCH'))], 'TLCHBMS', 'Tool life remaining warning (TLCHB F64.3 — verify for your control)'), N('Tool life reset (TLRST)', [rd(c.x('TLRSTPBI')), wrt(g('TLRST'))])] },

  /* ---------------- Workholding ---------------- */
  { id: 'chuck', group: 'Workholding', name: 'Chuck clamp / unclamp (foot switch, ID/OD)', conflicts: ['collet'],
    desc: 'M-codes + foot switch (manual, spindle stopped). ID/OD select swaps the solenoids. Pressure low, clamp timeout, unclamped-while-running alarms; rejected-command and spindle-start messages. Spindle and cycle start interlocked.',
    params: [mP('mClamp', 'Chuck clamp', 10), mP('mUnclamp', 'Chuck unclamp', 11), { key: 'prsDelay', label: 'Pressure low delay', unit: 'ms', default: 500, min: 0, max: 10000 }, timeoutP(3000)],
    define: (e) => def({
      inputs: [inp('CHKFSWI', 'Chuck foot switch'), inp('CHKIDSWI', 'Chuck ID/OD select (ON = ID clamp)', 'panel'), inp('CHKCLI', 'Chuck clamped confirm'), inp('CHKPRSI', 'Chuck pressure switch (ON = OK)')],
      outputs: [out('CHKCLO', 'Chuck clamp solenoid'), out('CHKUNO', 'Chuck unclamp solenoid')],
      mcodes: [{ code: e.p('mClamp'), label: 'Chuck clamp' }, { code: e.p('mUnclamp'), label: 'Chuck unclamp' }],
      alarms: [alSp('CHKPRAL', 'CHUCK PRESSURE LOW'), al('CHKTOAL', 'CHUCK CLAMP TIMEOUT'), alSp('CHKLSAL', 'CHUCK UNCLAMPED IN CYCLE'), op('CHKMNMS', 'CHUCK FOOT SW: MANUAL MODE ONLY'),
        ...(hasOf(e, 'spindle') ? [op('CHKRJMS', 'CHUCK UNCLAMP: SP RUNNING'), op('CHKSPMS', 'SPINDLE START: CHUCK OPEN')] : [])],
    }),
    nets: (c) => {
      const mC = c.m(c.p('mClamp')), mU = c.m(c.p('mUnclamp')), ID = c.x('CHKIDSWI'), CL = c.x('CHKCLI'), FS = c.x('CHKFSWI')
      const P = c.r('CHKP', 'Chuck foot switch pulse'), UN = c.r('CHKUN', 'Chuck unclamp commanded'), OK = c.r('CHKOK', 'Chuck clamped and pressure OK'), PL = c.r('CHKPL', 'Chuck pressure low timer')
      const RCH = c.r('CHKRCH', 'Chuck clamp reached (held while commanded)'), ARM = c.r('CHKAR', 'Chuck commanded since power-on'), sp = spRun(c)
      const run = sp ? [andn(sp)] : []
      c.mfin(c.p('mClamp'), CL); c.mfin(c.p('mUnclamp'), CL, true); c.permit(OK); c.spStop(OK, true)
      return [
        pulse(c, [rd(FS), and(c.manual()), ...run], P, 'Chuck: foot switch edge (manual mode, spindle stopped)'),
        N('Chuck: unclamp command latch', [...anyOf([[rd(mU), ...run], [rd(P), andn(UN)], [rd(UN), andn(mC), andn(P)]]), wrt(UN)]),
        N('Chuck: clamp solenoid (OD: clamp, ID: swapped)', [...anyOf([[rdn(UN), andn(ID)], [rd(UN), and(ID)]]), wrt(c.y('CHKCLO'))]),
        N('Chuck: unclamp solenoid (OD: unclamp, ID: swapped)', [...anyOf([[rd(UN), andn(ID)], [rdn(UN), and(ID)]]), wrt(c.y('CHKUNO'))]),
        N('Chuck: clamped and pressure OK', [rdn(UN), and(CL), and(c.x('CHKPRSI')), wrt(OK)]),
        N('Chuck: pressure low timer', [rdn(UN), andn(c.x('CHKPRSI')), tmrb(c, c.p('prsDelay')), wrt(PL)]),
        latchAlarm(c, [rd(PL)], 'CHKPRAL', 'Chuck pressure low alarm'),
        N('Chuck: commanded since power-on (arms the clamp timeout — no alarm for an empty chuck at power-on)', [rd(UN), or(mC), or(ARM), wrt(ARM)]),
        ...delayAlarm(c, [rdn(UN), andn(CL), and(ARM)], c.p('timeout'), 'CHKTOAL', 'Chuck clamp not confirmed', 'CHKTO'),
        N('Chuck: clamp reached (held while clamp commanded)', [rd(CL), or(RCH), andn(UN), wrt(RCH)]),
        ...delayAlarm(c, andAnyOf([rd(RCH), andn(CL)], sp ? [sp, g('OP')] : [g('OP')]), 100, 'CHKLSAL', 'Chuck clamp lost while spindle running / in cycle', 'CHKLST'),
        msg(c, [rd(FS), andn(c.manual())], 'CHKMNMS', 'Chuck foot switch outside manual mode'),
        ...(sp ? [
          msg(c, [...anyOf([[rd(mU)], [rd(FS)]]), and(sp)], 'CHKRJMS', 'Chuck unclamp rejected: spindle running'),
          msg(c, [rd(sp), andn(OK)], 'CHKSPMS', 'Spindle start while chuck not clamped'),
        ] : []),
      ]
    } },
  { id: 'collet', group: 'Workholding', name: 'Collet open / close', conflicts: ['chuck'], desc: 'Collet closer by M-code or foot switch. Spindle stop while open; open command ignored while the spindle runs. Timeouts, sensor fault, opened-in-cycle alarm.',
    params: [mP('mOn', 'Collet open', 11), mP('mOff', 'Collet close', 10), timeoutP(3000)],
    define: (e) => def({ inputs: [inp('CLTFSWI', 'Collet foot switch'), inp('CLTCLI', 'Collet closed confirm'), inp('CLTOPI', 'Collet open confirm')], outputs: [out('CLTOPO', 'Collet open solenoid')], mcodes: [{ code: e.p('mOn'), label: 'Collet open' }, { code: e.p('mOff'), label: 'Collet close' }], alarms: tpAlarms(SPEC.collet(e)) }),
    nets: (c) => { c.spStop(c.y('CLTOPO')); c.permit(c.x('CLTCLI')); const run = spRun(c)
      return twoPos(c, { st: 'CLTR', name: 'Collet', mOn: c.p('mOn'), mOff: c.p('mOff'), pb: c.x('CLTFSWI'), outOn: c.y('CLTOPO'), sensOn: c.x('CLTOPI'), sensOff: c.x('CLTCLI'), timeout: c.p('timeout'), spec: SPEC.collet(c), blockWhen: run ? [run] : [], lostWhen: run ? [run, g('OP')] : [g('OP')] }) } },
  { id: 'tailstock', group: 'Workholding', name: 'Tailstock advance / retract', desc: 'Double solenoid, M-codes or push button in manual mode, limit switches confirm. Retract ignored while the spindle runs; retracted-while-running alarm.',
    params: [mP('mOn', 'Tailstock advance', 21), mP('mOff', 'Tailstock retract', 22), timeoutP(5000)],
    define: (e) => def({ inputs: [inp('TSPBI', 'Tailstock push button', 'panel'), inp('TSFWDI', 'Tailstock advanced LS'), inp('TSBWDI', 'Tailstock retracted LS')], outputs: [out('TSFWO', 'Tailstock advance solenoid'), out('TSBWO', 'Tailstock retract solenoid')], mcodes: [{ code: e.p('mOn'), label: 'Tailstock advance' }, { code: e.p('mOff'), label: 'Tailstock retract' }], alarms: tpAlarms(SPEC.tailstock(e)) }),
    nets: (c) => { const run = spRun(c)
      return twoPos(c, { st: 'TSR', name: 'Tailstock', mOn: c.p('mOn'), mOff: c.p('mOff'), pb: c.x('TSPBI'), outOn: c.y('TSFWO'), outOff: c.y('TSBWO'), sensOn: c.x('TSFWDI'), sensOff: c.x('TSBWDI'), timeout: c.p('timeout'), spec: SPEC.tailstock(c), blockWhen: run ? [run] : [], lostWhen: run ? [run] : [g('OP')] }) } },
  { id: 'steady', group: 'Workholding', name: 'Steady rest close / open', desc: 'Hydraulic steady rest by M-code or push button. Open ignored while the spindle runs; opened-while-running alarm.',
    params: [mP('mOn', 'Steady rest close', 23), mP('mOff', 'Steady rest open', 24), timeoutP(5000)],
    define: (e) => def({ inputs: [inp('SRPBI', 'Steady rest push button', 'panel'), inp('SRCLI', 'Steady rest closed'), inp('SROPI', 'Steady rest open')], outputs: [out('SRCLO', 'Steady rest close solenoid')], mcodes: [{ code: e.p('mOn'), label: 'Steady rest close' }, { code: e.p('mOff'), label: 'Steady rest open' }], alarms: tpAlarms(SPEC.steady(e)) }),
    nets: (c) => { const run = spRun(c)
      return twoPos(c, { st: 'SRR', name: 'Steady rest', mOn: c.p('mOn'), mOff: c.p('mOff'), pb: c.x('SRPBI'), outOn: c.y('SRCLO'), sensOn: c.x('SRCLI'), sensOff: c.x('SROPI'), timeout: c.p('timeout'), spec: SPEC.steady(c), blockWhen: run ? [run] : [], lostWhen: run ? [run] : [g('OP')] }) } },
  { id: 'vise', group: 'Workholding', name: 'Vise / fixture clamp', desc: 'Hydraulic or pneumatic vise by M-code or foot switch. Cycle start needs clamped; unclamp ignored while the spindle runs; unclamped-in-cycle alarm.',
    params: [mP('mOn', 'Fixture clamp', 12), mP('mOff', 'Fixture unclamp', 13), timeoutP(3000)],
    define: (e) => def({ inputs: [inp('VSPBI', 'Fixture clamp foot switch / button'), inp('VSCLI', 'Fixture clamped confirm'), inp('VSUCI', 'Fixture unclamped confirm')], outputs: [out('VSCLO', 'Fixture clamp solenoid')], mcodes: [{ code: e.p('mOn'), label: 'Fixture clamp' }, { code: e.p('mOff'), label: 'Fixture unclamp' }], alarms: tpAlarms(SPEC.vise(e)) }),
    nets: (c) => { c.permit(c.x('VSCLI')); const run = spRun(c)
      return twoPos(c, { st: 'VSR', name: 'Fixture clamp', mOn: c.p('mOn'), mOff: c.p('mOff'), pb: c.x('VSPBI'), outOn: c.y('VSCLO'), sensOn: c.x('VSCLI'), sensOff: c.x('VSUCI'), timeout: c.p('timeout'), spec: SPEC.vise(c), blockWhen: run ? [run] : [], lostWhen: run ? [run, g('OP')] : [g('OP')] }) } },
  { id: 'rotclamp', group: 'Workholding', name: 'Rotary table clamp (4th / 5th axis)', desc: 'Rotary axis brake by M-code; clamp confirm interlocks cycle start. Timeouts, sensor fault, rotary axis moved while clamped.',
    params: [mP('mOn', 'Rotary clamp', 78), mP('mOff', 'Rotary unclamp', 79), timeoutP(3000)],
    define: (e) => def({ inputs: [inp('RTCLI', 'Rotary table clamped'), inp('RTUCI', 'Rotary table unclamped')], outputs: [out('RTCLO', 'Rotary table clamp solenoid')], mcodes: [{ code: e.p('mOn'), label: 'Rotary clamp' }, { code: e.p('mOff'), label: 'Rotary unclamp' }],
      alarms: [...tpAlarms(SPEC.rotclamp(e)), ...(rotIdx(e.axes) >= 0 ? [al('RTMVAL', 'ROTARY AXIS MOVED WHILE CLAMPED')] : [])] }),
    nets: (c) => {
      const ri = rotIdx(c.axes)
      return [...twoPos(c, { st: 'RTR', name: 'Rotary clamp', mOn: c.p('mOn'), mOff: c.p('mOff'), outOn: c.y('RTCLO'), sensOn: c.x('RTCLI'), sensOff: c.x('RTUCI'), timeout: c.p('timeout'), spec: SPEC.rotclamp(c) }),
        ...(ri >= 0 ? [latchAlarm(c, [rd(c.x('RTCLI')), and(`F102.${ri}`)], 'RTMVAL', `Rotary axis ${c.axes[ri]} moving (MV) while clamped`)] : [])]
    } },
  { id: 'vacuum', group: 'Workholding', name: 'Vacuum table', desc: 'Vacuum pump by M-code or button; vacuum switch must be OK to start / feed. Vacuum not reached / lost alarms.',
    params: [mP('mOn', 'Vacuum ON', 70), mP('mOff', 'Vacuum OFF', 71), timeoutP(5000)],
    define: (e) => def({ inputs: [inp('VACPBI', 'Vacuum ON/OFF push button', 'panel'), inp('VACOKI', 'Vacuum OK switch')], outputs: [out('VACO', 'Vacuum pump / valve')], mcodes: [{ code: e.p('mOn'), label: 'Vacuum ON' }, { code: e.p('mOff'), label: 'Vacuum OFF' }], alarms: [al('VACTOAL', 'VACUUM NOT REACHED'), alSp('VACAL', 'VACUUM LOST')] }),
    nets: (c) => {
      const st = c.r('VACR', 'Vacuum ON'), OK = c.x('VACOKI'), RCH = c.r('VACRCH', 'Vacuum reached (held while ON)'); c.mfin(c.p('mOn'), OK); c.permit(OK)
      return [...onOff(c, { st, sym: 'VACR', name: 'Vacuum', mOn: [c.p('mOn')], mOff: [c.p('mOff')], pb: c.x('VACPBI') }), N('Vacuum pump', [rd(st), wrt(c.y('VACO'))]),
        ...delayAlarm(c, [rd(st), andn(OK), andn(RCH)], c.p('timeout'), 'VACTOAL', 'Vacuum not reached after pump ON', 'VACTO'),
        N('Vacuum reached (held while ON)', [rd(OK), or(RCH), and(st), wrt(RCH)]),
        ...delayAlarm(c, [rd(RCH), andn(OK)], 200, 'VACAL', 'Vacuum lost during operation', 'VACLT')]
    } },
  { id: 'magchuck', group: 'Workholding', name: 'Magnetic chuck (grinder)', desc: 'Magnetize / demagnetize by M-code or button; magnetized confirm interlocks start. Magnetize timeout, lost-in-cycle alarm, demagnetize ignored while the spindle runs.',
    params: [mP('mOn', 'Magnetize', 72), mP('mOff', 'Demagnetize', 73), timeoutP(3000)],
    define: (e) => def({ inputs: [inp('MAGPBI', 'Magnetic chuck push button', 'panel'), inp('MAGOKI', 'Chuck magnetized confirm')], outputs: [out('MAGO', 'Magnetic chuck ON')], mcodes: [{ code: e.p('mOn'), label: 'Magnetize' }, { code: e.p('mOff'), label: 'Demagnetize' }], alarms: tpAlarms(SPEC.magchuck(e)) }),
    nets: (c) => { c.permit(c.x('MAGOKI')); const run = spRun(c)
      return twoPos(c, { st: 'MAGR', name: 'Magnetic chuck', mOn: c.p('mOn'), mOff: c.p('mOff'), pb: c.x('MAGPBI'), outOn: c.y('MAGO'), sensOn: c.x('MAGOKI'), timeout: c.p('timeout'), spec: SPEC.magchuck(c), blockWhen: run ? [run] : [], lostWhen: run ? [run, g('OP')] : [g('OP')] }) } },

  /* ---------------- Coolant & lube ---------------- */
  { id: 'coolant', group: 'Coolant & lube', name: 'Flood coolant (M08 / M09)', desc: 'M08/M09 + panel button toggle, OFF on reset / M30. Pump overload alarm (latched), tank level message.',
    define: () => def({
      inputs: [inp('COOLPBI', 'Coolant ON/OFF push button', 'panel'), inp('COOLOLI', 'Coolant pump overload OK (NC)'), inp('COOLLVLI', 'Coolant tank level OK')],
      outputs: [out('COOLO', 'Coolant pump contactor'), out('COOLL', 'Coolant lamp', 'panel')],
      mcodes: [{ code: 8, label: 'Coolant ON' }, { code: 9, label: 'Coolant OFF', shared: true }],
      alarms: [al('COOLOLAL', 'COOLANT PUMP OVERLOAD'), op('COOLLVMS', 'COOLANT LEVEL LOW')],
    }),
    nets: (c) => {
      const st = c.r('COOLR', 'Coolant ON')
      return [...onOff(c, { st, sym: 'COOLR', name: 'Coolant', mOn: [8], mOff: [9], pb: c.x('COOLPBI'), reset: true, m30: true }),
        N('Coolant pump + lamp', [rd(st), and(c.x('COOLOLI')), wrt(c.y('COOLO')), wrt(c.y('COOLL'))]),
        latchAlarm(c, [rdn(c.x('COOLOLI'))], 'COOLOLAL', 'Coolant pump overload alarm'),
        ...delayMsg(c, [rdn(c.x('COOLLVLI'))], 2000, 'COOLLVMS', 'Coolant level low message (debounced)', 'COOLLVT')]
    } },
  { id: 'mist', group: 'Coolant & lube', name: 'Mist coolant / air blow (M07)', desc: 'M07 ON, M09 OFF (shared with flood coolant), push button toggle. With the air pressure option: message when air is low.',
    define: (e) => def({ inputs: [inp('MISTPBI', 'Mist / air blow push button', 'panel')], outputs: [out('MISTO', 'Mist / air blow valve')], mcodes: [{ code: 7, label: 'Mist ON' }, { code: 9, label: 'Coolant OFF', shared: true }], alarms: hasOf(e, 'air') ? [op('MISTAIMS', 'MIST: AIR PRESSURE LOW')] : [] }),
    nets: (c) => {
      const st = c.r('MISTR', 'Mist ON')
      return [...onOff(c, { st, sym: 'MISTR', name: 'Mist', mOn: [7], mOff: [9], pb: c.x('MISTPBI'), reset: true, m30: true }), N('Mist valve', [rd(st), wrt(c.y('MISTO'))]),
        ...(c.has('air') ? [msg(c, [rd(st), and(c.r('AIRPL', 'Air pressure low timer'))], 'MISTAIMS', 'Mist ON with air pressure low')] : [])]
    } },
  { id: 'tsc', group: 'Coolant & lube', name: 'Through-spindle coolant (M88 / M89)', desc: 'High-pressure pump with pressure-OK completion; pressure low, pump overload and pressure switch stuck alarms; filter message.',
    params: [mP('mOn', 'TSC ON', 88), mP('mOff', 'TSC OFF', 89), { key: 'prsDelay', label: 'Pressure check delay', unit: 'ms', default: 3000, min: 0, max: 30000 }],
    define: (e) => def({ inputs: [inp('TSCPRSI', 'TSC pressure OK'), inp('TSCFLTI', 'TSC filter clogged (ON = clogged)'), inp('TSCOLI', 'TSC pump overload OK (NC)')], outputs: [out('TSCO', 'TSC pump')], mcodes: [{ code: e.p('mOn'), label: 'TSC ON' }, { code: e.p('mOff'), label: 'TSC OFF' }],
      alarms: [alSp('TSCPRAL', 'TSC PRESSURE LOW'), al('TSCOLAL', 'TSC PUMP OVERLOAD'), al('TSCSWAL', 'TSC PRESSURE SWITCH FAULT'), op('TSCFLMS', 'TSC FILTER CLOGGED')] }),
    nets: (c) => {
      const st = c.r('TSCR', 'TSC ON'), TO = c.r('TSCPL', 'TSC pressure low timer'), PRS = c.x('TSCPRSI')
      c.mfin(c.p('mOn'), PRS)
      return [...onOff(c, { st, sym: 'TSCR', name: 'TSC', mOn: [c.p('mOn')], mOff: [c.p('mOff'), 9], reset: true, m30: true }),
        N('TSC pump (no overload)', [rd(st), and(c.x('TSCOLI')), wrt(c.y('TSCO'))]),
        N('TSC pressure low timer', [rd(st), andn(PRS), tmrb(c, c.p('prsDelay')), wrt(TO)]),
        latchAlarm(c, [rd(TO)], 'TSCPRAL', 'TSC pressure low alarm'),
        latchAlarm(c, [rdn(c.x('TSCOLI'))], 'TSCOLAL', 'TSC pump overload alarm'),
        ...delayAlarm(c, [rdn(c.y('TSCO')), and(PRS)], 10000, 'TSCSWAL', 'TSC pressure switch ON with pump OFF (stuck)', 'TSCSWT'),
        msg(c, [rd(c.x('TSCFLTI'))], 'TSCFLMS', 'TSC filter clogged message')]
    } },
  { id: 'lube', group: 'Coolant & lube', name: 'Way lubrication (pump, pressure, float, timer)', desc: 'Interval timer while servo ready → pump for discharge time; discharge (pressure) failure and pressure switch stuck alarms; level low message, alarm at program end if still low; manual button.',
    params: [{ key: 'interval', label: 'Lube interval', unit: 'ms', default: 600000, min: 10000, max: 3600000 }, { key: 'discharge', label: 'Pump ON time', unit: 'ms', default: 10000, min: 500, max: 120000 }, { key: 'prsCheck', label: 'Pressure check time', unit: 'ms', default: 8000, min: 500, max: 120000 }, { key: 'prsDecay', label: 'Pressure decay time (switch stuck)', unit: 'ms', default: 30000, min: 1000, max: 600000 }],
    define: () => def({ inputs: [inp('LUBPRSI', 'Lube pressure switch'), inp('LUBLVLI', 'Lube oil level OK (float)'), inp('LUBPBI', 'Manual lube push button', 'panel')], outputs: [out('LUBO', 'Lube pump')],
      alarms: [al('LUBPRAL', 'LUBRICATION PRESSURE LOW'), al('LUBSWAL', 'LUBE PRESSURE SWITCH FAULT'), al('LUBEMAL', 'LUBE OIL EMPTY - REFILL'), op('LUBLVMS', 'LUBRICATION OIL LEVEL LOW')] }),
    nets: (c) => {
      const LO = c.y('LUBO'), IV = c.r('LUBIV', 'Lube interval elapsed'), DS = c.r('LUBDS', 'Lube discharge complete'), PL = c.r('LUBPL', 'Lube pressure not reached'), LV = c.x('LUBLVLI')
      return [
        N('Lube interval timer (servo ready, pump OFF)', [rd(g('SA')), andn(LO), tmrb(c, c.p('interval')), wrt(IV)]),
        N('Lube pump (interval or manual button)', [rd(IV), or(c.x('LUBPBI')), or(LO), andn(DS), and(g('*ESP')), wrt(LO)]),
        N('Lube discharge time', [rd(LO), tmrb(c, c.p('discharge')), wrt(DS)]),
        N('Lube pressure check timer', [rd(LO), andn(c.x('LUBPRSI')), tmrb(c, c.p('prsCheck')), wrt(PL)]),
        latchAlarm(c, [rd(PL)], 'LUBPRAL', 'Lube pressure low (discharge failure) alarm'),
        ...delayAlarm(c, [rdn(LO), and(c.x('LUBPRSI'))], c.p('prsDecay'), 'LUBSWAL', 'Lube pressure switch stays ON with pump OFF', 'LUBSWT'),
        msg(c, [rdn(LV)], 'LUBLVMS', 'Lube level low message (warning)'),
        latchAlarm(c, [rdn(LV), ...andAny([], [[rd(g('DM30'))], [rd(g('DM02'))]])], 'LUBEMAL', 'Lube level still low at program end — block next start'),
      ]
    } },

  /* ---------------- Hydraulics / pneumatics ---------------- */
  { id: 'hydraulic', group: 'Hydraulics/pneumatics', name: 'Hydraulic unit', desc: 'Pump runs when E-stop released; pressure low, overload, pressure switch stuck alarms; oil level / temperature messages. Start needs pressure OK.',
    params: [{ key: 'prsDelay', label: 'Pressure build-up time', unit: 'ms', default: 3000, min: 0, max: 30000 }],
    define: () => def({ inputs: [inp('HYDPRSI', 'Hydraulic pressure switch'), inp('HYDOLI', 'Hydraulic motor overload OK (NC)'), inp('HYDLVLI', 'Hydraulic oil level OK'), inp('HYDTMPI', 'Hydraulic oil temperature high')], outputs: [out('HYDO', 'Hydraulic pump contactor')],
      alarms: [alSp('HYDPRAL', 'HYDRAULIC PRESSURE LOW'), alSp('HYDOLAL', 'HYDRAULIC MOTOR OVERLOAD'), al('HYDSWAL', 'HYD PRESSURE SWITCH FAULT'), op('HYDLVMS', 'HYDRAULIC OIL LEVEL LOW'), op('HYDTPMS', 'HYDRAULIC OIL TEMP HIGH')] }),
    nets: (c) => {
      const PL = c.r('HYDPL', 'Hydraulic pressure low timer'), PRS = c.x('HYDPRSI'); c.permit(PRS)
      return [
        N('Hydraulic pump (E-stop released, no overload)', [rd(g('*ESP')), and(c.x('HYDOLI')), wrt(c.y('HYDO'))]),
        N('Hydraulic pressure low timer', [rd(c.y('HYDO')), andn(PRS), tmrb(c, c.p('prsDelay')), wrt(PL)]),
        latchAlarm(c, [rd(PL)], 'HYDPRAL', 'Hydraulic pressure low alarm'),
        latchAlarm(c, [rdn(c.x('HYDOLI'))], 'HYDOLAL', 'Hydraulic motor overload alarm'),
        ...delayAlarm(c, [rdn(c.y('HYDO')), and(PRS)], 10000, 'HYDSWAL', 'Hydraulic pressure switch ON with pump OFF (stuck)', 'HYDSWT'),
        ...delayMsg(c, [rdn(c.x('HYDLVLI'))], 2000, 'HYDLVMS', 'Hydraulic oil level low message (debounced)', 'HYDLVT'),
        msg(c, [rd(c.x('HYDTMPI'))], 'HYDTPMS', 'Hydraulic oil temperature high message'),
      ]
    } },
  { id: 'air', group: 'Hydraulics/pneumatics', name: 'Air pressure switch', desc: 'Low air pressure (after delay) → alarm latched until reset; cycle start needs air OK.',
    params: [{ key: 'delay', label: 'Low pressure delay', unit: 'ms', default: 2000, min: 0, max: 30000 }],
    define: () => def({ inputs: [inp('AIRPRSI', 'Air pressure switch (ON = OK)')], alarms: [al('AIRPRAL', 'AIR PRESSURE LOW')] }),
    nets: (c) => { c.permit(c.x('AIRPRSI')); return delayAlarm(c, [rdn(c.x('AIRPRSI'))], c.p('delay'), 'AIRPRAL', 'Air pressure low alarm', 'AIRPL') } },

  /* ---------------- Chip handling ---------------- */
  { id: 'chipconv', group: 'Chip handling', name: 'Chip conveyor (fwd / rev / overload)', desc: 'Forward by M-code or button toggle, reverse while button held, overload message.',
    params: [mP('mOn', 'Conveyor forward', 31), mP('mOff', 'Conveyor stop', 33)],
    define: (e) => def({ inputs: [inp('CHPFWPBI', 'Chip conveyor forward push button', 'panel'), inp('CHPRVPBI', 'Chip conveyor reverse push button (hold)', 'panel'), inp('CHPOLI', 'Chip conveyor overload OK (NC)')], outputs: [out('CHPFWO', 'Chip conveyor forward'), out('CHPRVO', 'Chip conveyor reverse')], mcodes: [{ code: e.p('mOn'), label: 'Conveyor forward' }, { code: e.p('mOff'), label: 'Conveyor stop' }], alarms: [op('CHPOLMS', 'CHIP CONVEYOR OVERLOAD')] }),
    nets: (c) => {
      const st = c.r('CHPR', 'Chip conveyor forward ON')
      return [...onOff(c, { st, sym: 'CHPR', name: 'Chip conveyor', mOn: [c.p('mOn')], mOff: [c.p('mOff')], pb: c.x('CHPFWPBI'), extraOff: [and(g('*ESP'))] }),
        N('Chip conveyor forward', [rd(st), and(c.x('CHPOLI')), andn(c.x('CHPRVPBI')), wrt(c.y('CHPFWO'))]),
        N('Chip conveyor reverse (while held)', [rd(c.x('CHPRVPBI')), and(c.x('CHPOLI')), and(g('*ESP')), wrt(c.y('CHPRVO'))]),
        msg(c, [rdn(c.x('CHPOLI'))], 'CHPOLMS', 'Chip conveyor overload message')]
    } },
  { id: 'dust', group: 'Chip handling', name: 'Dust extraction', desc: 'Extractor runs while the spindle runs or in automatic operation. Overload alarm, filter clogged message.',
    define: () => def({ inputs: [inp('DUSTOLI', 'Dust extractor overload OK (NC)'), inp('DUSTFLI', 'Dust filter clogged (ON = clogged)')], outputs: [out('DUSTO', 'Dust extractor')], alarms: [al('DUSTOLAL', 'DUST EXTRACTOR OVERLOAD'), op('DUSTFLMS', 'DUST FILTER CLOGGED')] }),
    nets: (c) => { const run = spRun(c)
      return [N('Dust extractor', [rd(g('OP')), ...(run ? [or(run)] : []), and(c.x('DUSTOLI')), wrt(c.y('DUSTO'))]),
        latchAlarm(c, [rdn(c.x('DUSTOLI'))], 'DUSTOLAL', 'Dust extractor overload alarm'), msg(c, [rd(c.x('DUSTFLI'))], 'DUSTFLMS', 'Dust filter clogged message')] } },
  { id: 'mistcoll', group: 'Chip handling', name: 'Mist collector', desc: 'Runs during automatic operation or while coolant is ON. Overload message.',
    define: () => def({ inputs: [inp('MSTCOLI', 'Mist collector overload OK (NC)')], outputs: [out('MSTCO', 'Mist collector')], alarms: [op('MSTCOLMS', 'MIST COLLECTOR OVERLOAD')] }),
    nets: (c) => [N('Mist collector', [rd(g('OP')), ...(c.has('coolant') ? [or(c.r('COOLR', 'Coolant ON'))] : []), and(c.x('MSTCOLI')), wrt(c.y('MSTCO'))]), msg(c, [rdn(c.x('MSTCOLI'))], 'MSTCOLMS', 'Mist collector overload message')] },

  /* ---------------- Doors ---------------- */
  { id: 'door', group: 'Doors', name: 'Door interlock (safety door switch + lock)', desc: 'Lock in AUTO / spindle running; door must be closed & locked to start. Opening → feed hold, interlock, spindle stop. Setup key overrides. Lock fault, switch fault, door-open and override messages.',
    define: (e) => def({ inputs: [inp('DRCLSI', 'Door closed switch'), inp('DRLCKI', 'Door locked confirm'), inp('DRKEYI', 'Door interlock override key (setup)', 'panel')], outputs: [out('DRLCKO', 'Door lock solenoid')],
      alarms: [al('DRLKAL', 'DOOR LOCK FAULT'), al('DRSWAL', 'DOOR SWITCH FAULT'), op('DROPNMS', 'DOOR OPEN - CLOSE DOOR TO START'), op('DRAUMS', 'DOOR OPEN - FEED HOLD'), op('DRKYMS', 'DOOR INTERLOCK OVERRIDE ON'), ...(hasOf(e, 'spindle') ? [op('DRSPMS', 'SPINDLE START: DOOR OPEN')] : [])] }),
    nets: (c) => {
      const OK = c.r('DROK', 'Door closed & locked (or override)'), CL = c.x('DRCLSI'), LK = c.x('DRLCKI'), KEY = c.x('DRKEYI'), LO = c.y('DRLCKO'), run = spRun(c)
      c.permit(OK); c.hold(OK, true); c.inter(OK, true); c.spStop(OK, true)
      return [
        N('Door lock (AUTO mode or spindle running)', [rd(c.auto()), ...(run ? [or(run)] : []), and(CL), wrt(LO)]),
        N('Door closed & locked (or setup override)', [rd(CL), and(LK), or(KEY), wrt(OK)]),
        ...delayAlarm(c, [rd(LO), and(CL), andn(LK)], 2000, 'DRLKAL', 'Door lock commanded but not confirmed', 'DRLKT'),
        ...delayAlarm(c, [rd(LK), andn(CL)], 300, 'DRSWAL', 'Door locked confirm without door closed (switch fault)', 'DRSWT'),
        msg(c, [rdn(CL), andn(KEY), andn(g('OP'))], 'DROPNMS', 'Door open message'),
        msg(c, [rdn(OK), and(g('OP'))], 'DRAUMS', 'Door opened during automatic operation (feed hold)'),
        msg(c, [rd(KEY)], 'DRKYMS', 'Door interlock override key ON (setup mode)'),
        ...(run ? [msg(c, [rd(run), andn(OK)], 'DRSPMS', 'Spindle start while door open')] : []),
      ]
    } },
  { id: 'autodoor', group: 'Doors', name: 'Automatic door (M80 / M81)', desc: 'Door cylinder open/close by M-code or push button; FIN on limit switch. Open ignored while the spindle runs; timeouts, sensor fault, opened-in-cycle alarm.',
    params: [mP('mOn', 'Door open', 80), mP('mOff', 'Door close', 81), timeoutP(8000)],
    define: (e) => def({ inputs: [inp('ADPBI', 'Auto door open/close push button', 'panel'), inp('ADOPNI', 'Auto door open LS'), inp('ADCLSI', 'Auto door closed LS')], outputs: [out('ADOPNO', 'Auto door open solenoid'), out('ADCLSO', 'Auto door close solenoid')], mcodes: [{ code: e.p('mOn'), label: 'Door open' }, { code: e.p('mOff'), label: 'Door close' }], alarms: tpAlarms(SPEC.autodoor(e)) }),
    nets: (c) => { const run = spRun(c)
      return twoPos(c, { st: 'ADR', name: 'Auto door', mOn: c.p('mOn'), mOff: c.p('mOff'), pb: c.x('ADPBI'), outOn: c.y('ADOPNO'), outOff: c.y('ADCLSO'), sensOn: c.x('ADOPNI'), sensOff: c.x('ADCLSI'), timeout: c.p('timeout'), spec: SPEC.autodoor(c), blockWhen: run ? [run] : [], lostWhen: [g('OP')] }) } },

  /* ---------------- Automation ---------------- */
  { id: 'partcatcher', group: 'Automation', name: 'Parts catcher', desc: 'Advance / retract by M-code; FIN on limit switch. Timeouts and sensor fault alarms.',
    params: [mP('mOn', 'Parts catcher advance', 36), mP('mOff', 'Parts catcher retract', 37), timeoutP(5000)],
    define: (e) => def({ inputs: [inp('PCADVI', 'Parts catcher advanced'), inp('PCRETI', 'Parts catcher retracted')], outputs: [out('PCADVO', 'Parts catcher advance solenoid')], mcodes: [{ code: e.p('mOn'), label: 'Parts catcher advance' }, { code: e.p('mOff'), label: 'Parts catcher retract' }], alarms: tpAlarms(SPEC.partcatcher(e)) }),
    nets: (c) => twoPos(c, { st: 'PCR', name: 'Parts catcher', mOn: c.p('mOn'), mOff: c.p('mOff'), outOn: c.y('PCADVO'), sensOn: c.x('PCADVI'), sensOff: c.x('PCRETI'), timeout: c.p('timeout'), spec: SPEC.partcatcher(c) }) },
  { id: 'barfeeder', group: 'Automation', name: 'Bar feeder interface', desc: 'Bar change M-code waits for bar feed complete; bar feeder alarm (latched) blocks start; bar change timeout; bar end message.',
    params: [mP('mBar', 'Bar change / push', 60), timeoutP(30000)],
    define: (e) => def({ inputs: [inp('BFALMI', 'Bar feeder OK (NC alarm contact)'), inp('BFENDI', 'Bar end'), inp('BFDNI', 'Bar feed complete')], outputs: [out('BFAUTO', 'CNC in automatic operation → bar feeder'), out('BFREQO', 'Bar change request → bar feeder')], mcodes: [{ code: e.p('mBar'), label: 'Bar change' }],
      alarms: [al('BFALMAL', 'BAR FEEDER ALARM'), al('BFTOAL', 'BAR CHANGE TIMEOUT'), op('BFENDMS', 'BAR END - LOAD NEW BARS')] }),
    nets: (c) => {
      const m = c.m(c.p('mBar')); c.mfin(c.p('mBar'), c.x('BFDNI')); c.permit(c.x('BFALMI'))
      return [
        N('Automatic operation → bar feeder', [rd(g('OP')), wrt(c.y('BFAUTO'))]),
        N('Bar change request (until bar feed complete)', [rd(m), andn(c.x('BFDNI')), wrt(c.y('BFREQO'))]),
        latchAlarm(c, [rdn(c.x('BFALMI'))], 'BFALMAL', 'Bar feeder alarm'),
        ...delayAlarm(c, [rd(m), andn(c.x('BFDNI'))], c.p('timeout'), 'BFTOAL', 'Bar change not completed', 'BFTO'),
        msg(c, [rd(c.x('BFENDI'))], 'BFENDMS', 'Bar end message'),
      ]
    } },
  { id: 'robot', group: 'Automation', name: 'Robot / loader interface', desc: 'Handshake: machine ready, load/unload request by M-code, robot clear interlock, remote cycle start. Robot alarm, handshake timeout, robot-in-machine alarm / message, start-not-ready message.',
    params: [mP('mReq', 'Robot load/unload request', 62), timeoutP(60000)],
    define: (e) => def({
      inputs: [inp('RBSTI', 'Robot cycle start request'), inp('RBOUTI', 'Robot clear of machine'), inp('RBALMI', 'Robot OK (NC alarm contact)'), inp('RBDNI', 'Robot load/unload complete')],
      outputs: [out('RBRDYO', 'Machine ready for robot'), out('RBREQO', 'Load/unload request → robot')],
      mcodes: [{ code: e.p('mReq'), label: 'Robot request' }],
      alarms: [al('RBALMAL', 'ROBOT ALARM'), al('RBTOAL', 'ROBOT HANDSHAKE TIMEOUT'), al('RBINAL', 'ROBOT IN MACHINE DURING CYCLE', 'alarm', { it: true }), op('RBOUTMS', 'ROBOT INSIDE MACHINE AREA'), op('RBNRMS', 'ROBOT START: MACHINE NOT READY')],
    }),
    nets: (c) => {
      const m = c.m(c.p('mReq')), OUT = c.x('RBOUTI'), REQ = c.y('RBREQO'), RDY = c.y('RBRDYO'); c.mfin(c.p('mReq'), c.x('RBDNI')); c.permit(OUT); c.inter(OUT, true); c.startSrc(c.x('RBSTI'))
      return [
        N('Machine ready for robot (AUTO, no alarm, not running)', [rd(c.auto()), andn(g('AL')), andn(c.alm()), andn(g('OP')), wrt(RDY)]),
        N('Load/unload request (until robot complete)', [rd(m), andn(c.x('RBDNI')), wrt(REQ)]),
        latchAlarm(c, [rdn(c.x('RBALMI'))], 'RBALMAL', 'Robot alarm'),
        ...delayAlarm(c, [rd(m), andn(c.x('RBDNI'))], c.p('timeout'), 'RBTOAL', 'Robot load/unload handshake not completed', 'RBTO'),
        latchAlarm(c, [rdn(OUT), andn(REQ), and(g('OP'))], 'RBINAL', 'Robot inside machine during automatic operation without request'),
        msg(c, [rdn(OUT), andn(REQ), andn(g('OP'))], 'RBOUTMS', 'Robot inside machine message'),
        msg(c, [rd(c.x('RBSTI')), andn(RDY), andn(g('OP'))], 'RBNRMS', 'Robot start request while machine not ready'),
      ]
    } },
  { id: 'apc', group: 'Automation', name: 'Pallet changer (2-pallet rotary APC)', desc: 'M-code sequence: unclamp → lift → rotate 180° → lower → clamp. Needs the "pallet ready" button at the setup station. Per-step timeouts, rotation sensor fault, pallet unclamped in cycle, recovery message.',
    params: [mP('mApc', 'Pallet change', 50), timeoutP(30000)],
    define: (e) => def({
      inputs: [inp('PLUCLI', 'Pallet unclamped'), inp('PLCLI', 'Pallet clamped'), inp('APCUPI', 'APC lifted'), inp('APCDNI', 'APC down'), inp('APC0I', 'APC at 0°'), inp('APC180I', 'APC at 180°'), inp('APCRDYPBI', 'Pallet ready push button (setup station)', 'panel')],
      outputs: [out('PLUCO', 'Pallet unclamp solenoid'), out('APCUPO', 'APC lift solenoid'), out('APC180O', 'APC rotate to 180°'), out('APC0O', 'APC rotate to 0°')],
      mcodes: [{ code: e.p('mApc'), label: 'Pallet change' }],
      alarms: [...stepAlarms('APC', 'APC', APC_STEPS), al('APCSNAL', 'APC ROTATION SENSOR FAULT'), al('APCLSAL', 'PALLET UNCLAMPED IN CYCLE', 'alarm', { sp: true, it: true }), op('APCRDMS', 'APC: PRESS PALLET READY'), op('APCORMS', 'APC NOT AT HOME - RECOVER')],
    }),
    nets: (c) => {
      const m = c.m(c.p('mApc')), RDY = c.r('APCRDY', 'Pallet ready'), REQ = c.r('APCREQ', 'APC request'), DIR = c.r('APCDIR', 'APC rotate direction (1 = to 180°)'), RD = c.r('APCRD', 'APC rotation reached')
      const conds = [c.x('PLUCLI'), c.x('APCUPI'), RD, c.x('APCDNI'), c.x('PLCLI')]
      const seq = stepSeq(c, 'APC', 'APC', REQ, APC_STEPS.map((label, i) => ({ label: label.toLowerCase(), cond: conds[i] })), { ms: c.p('timeout'), key: (i) => `APCS${i + 1}AL` })
      const S = seq.steps, A0 = c.x('APC0I'), A180 = c.x('APC180I')
      c.mfin(c.p('mApc'), seq.DN); c.permit(c.x('PLCLI')); c.inter(REQ)
      return [
        N('Pallet ready (button, cleared after change)', [rd(c.x('APCRDYPBI')), or(RDY), andn(seq.DN), wrt(RDY)]),
        N('APC request (M-code + pallet ready)', [rd(m), and(RDY), andn(seq.DN), andn(RSTF()), wrt(REQ)]),
        msg(c, [rd(m), andn(RDY)], 'APCRDMS', 'APC: waiting for pallet ready message'),
        ...seq.nets,
        N('APC: direction = to 180° when at 0°', [rd(S[1]), and(A0), set(DIR)]),
        N('APC: direction = to 0° when at 180°', [rd(S[1]), and(A180), rst(DIR)]),
        N('APC: rotation reached', [...anyOf([[rd(DIR), and(A180)], [rdn(DIR), and(A0)]]), wrt(RD)]),
        N('APC: pallet unclamp (steps 1–4)', [...anyStep(S.slice(0, 4)), wrt(c.y('PLUCO'))]),
        N('APC: lift (steps 2–3)', [rd(S[1]), or(S[2]), wrt(c.y('APCUPO'))]),
        N('APC: rotate to 180°', [rd(S[2]), and(DIR), wrt(c.y('APC180O'))]),
        N('APC: rotate to 0°', [rd(S[2]), andn(DIR), wrt(c.y('APC0O'))]),
        ...delayAlarm(c, [rd(A0), and(A180)], 300, 'APCSNAL', 'APC 0° and 180° sensors both ON', 'APCSNT'),
        ...delayAlarm(c, [rd(g('OP')), andn(c.x('PLCLI')), andn(REQ)], 200, 'APCLSAL', 'Pallet unclamped during automatic operation', 'APCLST'),
        msg(c, andAny([rdn(REQ)], [[rdn(c.x('APCDNI'))], [rdn(c.x('PLCLI'))], [rdn(A0), andn(A180)]]), 'APCORMS', 'APC not at home (down, clamped, 0° / 180°) — recover in manual'),
      ]
    } },

  /* ---------------- Measurement ---------------- */
  { id: 'probe', group: 'Measurement', name: 'Touch probe (skip X4.7)', desc: 'Probe signal on the fixed SKIP input; probe ON/OFF by M-code with start-up delay. Probe error alarm (latched), battery message, probe ON with spindle running alarm.',
    params: [mP('mOn', 'Probe ON', 58), mP('mOff', 'Probe OFF', 59), { key: 'delay', label: 'Probe start-up delay', unit: 'ms', default: 1000, min: 0, max: 10000 }],
    define: (e) => def({ inputs: [inp('PRBSKPI', 'Probe trigger — SKIP fixed input', 'machine', { fixed: 'X4.7' }), inp('PRBLBI', 'Probe battery low'), inp('PRBERRI', 'Probe error')], outputs: [out('PRBONO', 'Probe start / ON')], mcodes: [{ code: e.p('mOn'), label: 'Probe ON' }, { code: e.p('mOff'), label: 'Probe OFF' }],
      alarms: [al('PRBERRAL', 'PROBE ERROR'), ...(hasOf(e, 'spindle') ? [alSp('PRBSPAL', 'PROBE ON WITH SPINDLE RUNNING')] : []), op('PRBLBMS', 'PROBE BATTERY LOW')] }),
    nets: (c) => {
      const st = c.r('PRBR', 'Probe ON'), RDY = c.r('PRBRDY', 'Probe ready'), run = spRun(c); c.mfin(c.p('mOn'), RDY)
      return [...onOff(c, { st, sym: 'PRBR', name: 'Probe', mOn: [c.p('mOn')], mOff: [c.p('mOff')], reset: true, m30: true }),
        N('Probe ON output', [rd(st), wrt(c.y('PRBONO'))]),
        N('Probe start-up delay', [rd(st), tmrb(c, c.p('delay')), wrt(RDY)]),
        latchAlarm(c, [rd(st), and(c.x('PRBERRI'))], 'PRBERRAL', 'Probe error alarm'),
        ...(run ? [latchAlarm(c, [rd(st), and(run)], 'PRBSPAL', 'Probe ON while spindle running')] : []),
        msg(c, [rd(c.x('PRBLBI'))], 'PRBLBMS', 'Probe battery low message')]
    } },
  { id: 'presetter', group: 'Measurement', name: 'Tool presetter arm (lathe, XAE)', desc: 'Arm down/up by M-code or button; touch sensor on fixed XAE1/XAE2 (X4.0/X4.1). Spindle stop while arm is down; arm-down ignored while the spindle runs; timeouts, sensor faults, arm dropped alarm.',
    params: [mP('mOn', 'Arm down', 38), mP('mOff', 'Arm up', 39), timeoutP(5000)],
    define: (e) => def({ inputs: [inp('XAE1I', 'Tool setter X touch — XAE1 fixed input', 'machine', { fixed: 'X4.0' }), inp('XAE2I', 'Tool setter Z touch — XAE2 fixed input', 'machine', { fixed: 'X4.1' }), inp('TSARMPBI', 'Tool setter arm push button', 'panel'), inp('TSARMDNI', 'Tool setter arm down'), inp('TSARMUPI', 'Tool setter arm up')], outputs: [out('TSARMO', 'Tool setter arm down solenoid')], mcodes: [{ code: e.p('mOn'), label: 'Setter arm down' }, { code: e.p('mOff'), label: 'Setter arm up' }],
      alarms: [...tpAlarms(SPEC.presetter(e)), al('TSTCHAL', 'TOOL SETTER TOUCH SENSOR FAULT')] }),
    nets: (c) => { c.spStop(c.x('TSARMUPI'), true); const run = spRun(c)
      return [...twoPos(c, { st: 'TSARMR', name: 'Tool setter arm', mOn: c.p('mOn'), mOff: c.p('mOff'), pb: c.x('TSARMPBI'), outOn: c.y('TSARMO'), sensOn: c.x('TSARMDNI'), sensOff: c.x('TSARMUPI'), timeout: c.p('timeout'), spec: SPEC.presetter(c), blockWhen: run ? [run] : [], lostWhen: run ? [run, g('OP')] : [g('OP')] }),
        ...delayAlarm(c, [rd(c.x('XAE1I')), or(c.x('XAE2I')), and(c.x('TSARMUPI'))], 300, 'TSTCHAL', 'Tool setter touch signal ON with arm up', 'TSTCHT')] } },
  { id: 'workcounter', group: 'Measurement', name: 'Work counter', desc: 'Counts M30/M02 with CTRB; target reached → message and start blocked until reset button.',
    params: [{ key: 'target', label: 'Target count', unit: 'count', default: 100, min: 1, max: 32767 }],
    define: () => def({ inputs: [inp('WCRSTPBI', 'Work counter reset push button', 'panel')], alarms: [op('WCDNMS', 'WORK COUNT REACHED - RESET')] }),
    nets: (c) => {
      const P = c.r('WCP', 'Program end pulse'), UP = c.r('WCUP', 'Work count reached'); c.permit(UP, true)
      return [
        pulse(c, [rd(g('DM30')), or(g('DM02'))], P, 'Work counter: program end edge (DIFU)'),
        N('Work counter (CTRB: CN0, UPDOWN, RST, ACT)', [rd(OFF), rds(OFF), rds(c.x('WCRSTPBI')), rds(P), fn('CTRB', [c.counter(), c.p('target')]), wrt(UP)]),
        msg(c, [rd(UP)], 'WCDNMS', 'Work count reached message'),
      ]
    } },

  /* ---------------- Misc ---------------- */
  { id: 'signaltower', group: 'Misc', name: 'Signal tower lamps + buzzer', desc: 'Red = alarm (AL or any PMC alarm), amber = feed hold / M00 / M01, green = automatic operation (OP). Buzzer on alarm until silenced, with acknowledge message.',
    define: () => def({ inputs: [inp('BUZSTPBI', 'Buzzer stop push button', 'panel')], outputs: [out('TWRREDL', 'Signal tower red'), out('TWRYELL', 'Signal tower amber'), out('TWRGRNL', 'Signal tower green'), out('BUZZO', 'Alarm buzzer')], alarms: [op('BUZZMS', 'ALARM - PRESS BUZZER STOP')] }),
    nets: (c) => {
      const S = c.r('BUZSTP', 'Buzzer silenced'), A = c.r('ANYAL', 'CNC alarm (AL) or PMC alarm')
      return [
        N('CNC or PMC alarm active', [rd(g('AL')), or(c.alm()), wrt(A)]),
        N('Signal tower red (alarm)', [rd(A), wrt(c.y('TWRREDL'))]),
        N('Signal tower amber (feed hold / M00 / M01)', [rd(g('SPL')), or(g('DM00')), or(g('DM01')), wrt(c.y('TWRYELL'))]),
        N('Signal tower green (automatic operation)', [rd(g('OP')), wrt(c.y('TWRGRNL'))]),
        N('Buzzer silenced (until alarm clears)', [rd(c.x('BUZSTPBI')), or(S), and(A), wrt(S)]),
        N('Alarm buzzer', [rd(A), andn(S), wrt(c.y('BUZZO'))]),
        msg(c, [rd(c.y('BUZZO'))], 'BUZZMS', 'Buzzer sounding — acknowledge with buzzer stop'),
      ]
    } },
  { id: 'worklight', group: 'Misc', name: 'Work light', desc: 'Push button toggles the work light.',
    define: () => def({ inputs: [inp('WKLTPBI', 'Work light push button', 'panel')], outputs: [out('WKLTO', 'Work light')] }),
    nets: (c) => onOff(c, { st: c.y('WKLTO'), sym: 'WKLT', name: 'Work light', pb: c.x('WKLTPBI') }) },
  { id: 'panelcooler', group: 'Misc', name: 'Electrical cabinet cooler', desc: 'Cabinet over-temperature / cooler alarm → operator message; still high after the delay → alarm (stops the cycle).',
    params: [{ key: 'delay', label: 'Over-temperature → alarm delay', unit: 'ms', default: 600000, min: 1000, max: 3600000 }],
    define: () => def({ inputs: [inp('PNLTMPI', 'Cabinet temperature high / cooler alarm')], alarms: [al('PNLTMPAL', 'CABINET OVERTEMPERATURE'), op('PNLTMPMS', 'CABINET TEMPERATURE HIGH')] }),
    nets: (c) => [msg(c, [rd(c.x('PNLTMPI'))], 'PNLTMPMS', 'Cabinet temperature high message'), ...delayAlarm(c, [rd(c.x('PNLTMPI'))], c.p('delay'), 'PNLTMPAL', 'Cabinet over-temperature persists', 'PNLTMPT')] },
]

const MODES = [
  { k: 'EDIT', n: 'EDIT', f: 'MEDT' }, { k: 'AUTO', n: 'AUTO (MEM)', f: 'MMEM' }, { k: 'MDI', n: 'MDI', f: 'MMDI' }, { k: 'DNC', n: 'DNC (RMT)', f: 'MRMT' },
  { k: 'JOG', n: 'JOG', f: 'MJ' }, { k: 'HND', n: 'HANDLE', f: 'MH' }, { k: 'REF', n: 'REF return', f: 'MREF' },
]
const PRG = [
  { k: 'SBK', n: 'Single block', s: 'SBK' }, { k: 'BDT', n: 'Block skip', s: 'BDT1' },
  { k: 'DRN', n: 'Dry run', s: 'DRN' }, { k: 'MLK', n: 'Machine lock', s: 'MLK' },
]

type Has = { has?: (id: string) => boolean }
const hasOf = (e: Has, id: string) => !!e.has?.(id)
const spBlock = (e: Has, dir: 'on' | 'off', text: string) => (hasOf(e, 'spindle') ? { dir, text } : undefined)
/** Message plans of the two-position devices (used by define() and nets() alike). */
const SPEC = {
  spclamp: (e: Has): TwoPosSpec => ({ al: 'SPCL', dev: 'SPINDLE', on: 'CLAMP', off: 'UNCLAMP', sensOn: true, sensOff: true, timeout: true, fault: 'SPINDLE CLAMP SENSOR FAULT', block: spBlock(e, 'on', 'SPINDLE CLAMP: SP RUNNING') }),
  collet: (e: Has): TwoPosSpec => ({ al: 'CLT', dev: 'COLLET', on: 'OPEN', off: 'CLOSE', sensOn: true, sensOff: true, timeout: true, lost: { pos: 'off', text: 'COLLET OPENED WHILE RUNNING', sp: true }, block: spBlock(e, 'on', 'COLLET OPEN: SP RUNNING') }),
  tailstock: (e: Has): TwoPosSpec => ({ al: 'TS', dev: 'TAILSTOCK', on: 'ADVANCE', off: 'RETRACT', sensOn: true, sensOff: true, timeout: true, lost: { pos: 'on', text: 'TAILSTOCK POSITION LOST', sp: true }, block: spBlock(e, 'off', 'TAILSTOCK RETRACT: SP RUNNING') }),
  steady: (e: Has): TwoPosSpec => ({ al: 'SR', dev: 'STEADY REST', on: 'CLOSE', off: 'OPEN', sensOn: true, sensOff: true, timeout: true, lost: { pos: 'on', text: 'STEADY REST POSITION LOST', sp: true }, block: spBlock(e, 'off', 'STEADY REST OPEN: SP RUNNING') }),
  vise: (e: Has): TwoPosSpec => ({ al: 'VS', dev: 'FIXTURE', on: 'CLAMP', off: 'UNCLAMP', sensOn: true, sensOff: true, timeout: true, lost: { pos: 'on', text: 'FIXTURE UNCLAMPED IN CYCLE', sp: true }, block: spBlock(e, 'off', 'FIXTURE UNCLAMP: SP RUNNING') }),
  rotclamp: (_e?: Has): TwoPosSpec => ({ al: 'RT', dev: 'ROTARY TABLE', on: 'CLAMP', off: 'UNCLAMP', sensOn: true, sensOff: true, timeout: true }),
  magchuck: (e: Has): TwoPosSpec => ({ al: 'MAG', dev: 'MAG CHUCK', on: 'MAGNETIZE', off: 'DEMAGNETIZE', sensOn: true, timeout: true, lost: { pos: 'on', text: 'MAG CHUCK LOST IN CYCLE', sp: true }, block: spBlock(e, 'off', 'DEMAGNETIZE: SP RUNNING') }),
  autodoor: (e: Has): TwoPosSpec => ({ al: 'AD', dev: 'AUTO DOOR', on: 'OPEN', off: 'CLOSE', sensOn: true, sensOff: true, timeout: true, lost: { pos: 'off', text: 'AUTO DOOR OPENED IN CYCLE' }, block: spBlock(e, 'on', 'AUTO DOOR OPEN: SP RUNNING') }),
  partcatcher: (_e?: Has): TwoPosSpec => ({ al: 'PC', dev: 'PARTS CATCHER', on: 'ADVANCE', off: 'RETRACT', sensOn: true, sensOff: true, timeout: true }),
  presetter: (e: Has): TwoPosSpec => ({ al: 'TSA', dev: 'TOOL SETTER ARM', on: 'DOWN', off: 'UP', sensOn: true, sensOff: true, timeout: true, lost: { pos: 'off', text: 'TOOL SETTER ARM NOT UP', sp: true }, block: spBlock(e, 'on', 'SETTER ARM DOWN: SP RUNNING') }),
}

/** Second serial spindle (sub-spindle / live tool) on G74. */
function spindle2(c: Ctx, pre: string, name: string, toolOk?: string): NetDef[] {
  const mCw = c.m(c.p('mCw')), mCcw = c.m(c.p('mCcw')), mStop = c.m(c.p('mStop')), ALMB = 'F49.0'
  const CW = c.r(`${pre}CW`, `${name} CW`), CCW = c.r(`${pre}CCW`, `${name} CCW`), FIN = c.r(`${pre}FIN`, `${name} completion`), RUN = c.r(`${pre}RUN`, `${name} running`)
  c.mfin(c.p('mCw'), FIN); c.mfin(c.p('mCcw'), FIN); c.mfin(c.p('mStop'), RUN, true)
  return [
    N(`${name} *ESPB follows *ESP`, [rd(g('*ESP')), wrt(g('*ESPB'))], 1),
    N(`${name} CW${toolOk ? ' (turret clamped)' : ''}`, [rd(mCw), or(CW), andn(mCcw), andn(mStop), andn(RSTF()), and(g('*ESP')), andn(ALMB), ...(toolOk ? [and(toolOk)] : []), wrt(CW)]),
    N(`${name} CCW${toolOk ? ' (turret clamped)' : ''}`, [rd(mCcw), or(CCW), andn(mCw), andn(mStop), andn(RSTF()), and(g('*ESP')), andn(ALMB), ...(toolOk ? [and(toolOk)] : []), wrt(CCW)]),
    N(`${name} SFRB`, [rd(CW), wrt(g('SFRB'))]),
    N(`${name} SRVB`, [rd(CCW), wrt(g('SRVB'))]),
    N(`${name} MRDYB`, [rd(ON), wrt(g('MRDYB'))]),
    N(`${name} running`, [rd(CW), or(CCW), wrt(RUN)]),
    N(`${name} FIN delay`, [rd(RUN), tmrb(c, c.p('finDelay')), wrt(FIN)]),
    msg(c, [rd(ALMB)], `${pre}ALMAL`, `${name} amplifier alarm (ALMB F49.0 — verify; reset ARSTB G75.0 in LADDER-III)`),
    ...(toolOk ? [msg(c, [rd(mCw), or(mCcw), andn(toolOk)], `${pre}TCMS`, `${name} start rejected: turret not clamped`)] : []),
  ]
}

export const accessoryById = (id: string) => ACCESSORIES.find((a) => a.id === id)

/** Default parameter values for an accessory. */
export const accParam = (a: Accessory, key: string, params: Record<string, number>) => params[`${a.id}.${key}`] ?? a.params?.find((p) => p.key === key)?.default ?? 0
