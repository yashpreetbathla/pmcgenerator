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
export interface AlarmDef { key: string; text: string; kind: 'alarm' | 'operator' }
export interface ParamDef { key: string; label: string; unit: 'ms' | 'M' | 'count'; default: number; min?: number; max?: number }
export interface AccDef { inputs: SigDef[]; outputs: SigDef[]; alarms: AlarmDef[]; mcodes: { code: number; label: string; shared?: boolean }[] }
export interface Env { axes: string[]; paths: number; p: (key: string) => number }
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
const al = (key: string, text: string, kind: AlarmDef['kind'] = 'alarm'): AlarmDef => ({ key, text, kind })
const def = (d: Partial<AccDef>): AccDef => ({ inputs: d.inputs ?? [], outputs: d.outputs ?? [], alarms: d.alarms ?? [], mcodes: d.mcodes ?? [] })
const RSTF = () => g('RST')
const tmrb = (c: Ctx, ms: number) => fn('TMRB', [c.timer(), ms])
const timeoutP = (ms: number): ParamDef => ({ key: 'timeout', label: 'Timeout alarm', unit: 'ms', default: ms, min: 100, max: 600000 })
const mP = (key: string, label: string, code: number): ParamDef => ({ key, label, unit: 'M', default: code, min: 0, max: 9999 })

/** Self-holding alarm reset by CNC reset (RST F1.1). */
const latchAlarm = (c: Ctx, cond: Instruction[], key: string, comment: string): NetDef =>
  N(comment, [...cond, or(c.a(key)), andn(RSTF()), wrt(c.a(key))])

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

/**
 * Two-position actuator (clamp/unclamp, advance/retract…) commanded by M-codes and/or a manual push button
 * (toggle, manual mode only). State relay ON = "on" position.
 */
function twoPos(c: Ctx, o: {
  st: string; name: string; mOn?: number; mOff?: number; pb?: string; outOn: string; outOff?: string;
  sensOn?: string; sensOff?: string; alarm?: string; timeout?: number; pbGate?: Instruction[]
}): NetDef[] {
  const nets: NetDef[] = []
  const ST = c.r(o.st, `${o.name}: commanded ON position`)
  let P: string | undefined
  if (o.pb) {
    P = c.r(`${o.st}P`, `${o.name}: push button pulse`)
    nets.push(pulse(c, [rd(o.pb), and(c.manual()), ...(o.pbGate ?? [])], P, `${o.name}: manual push button edge (manual mode)`))
  }
  const terms: Instruction[][] = []
  if (o.mOn !== undefined) terms.push([rd(c.m(o.mOn))])
  if (P) terms.push([rd(P), andn(ST)])
  const hold: Instruction[] = [rd(ST)]
  if (o.mOff !== undefined) hold.push(andn(c.m(o.mOff)))
  if (P) hold.push(andn(P))
  terms.push(hold)
  nets.push(N(`${o.name}: command latch`, [...anyOf(terms), wrt(ST)]))
  nets.push(N(`${o.name}: ON solenoid`, [rd(ST), wrt(o.outOn)]))
  if (o.outOff) nets.push(N(`${o.name}: OFF solenoid`, [rdn(ST), wrt(o.outOff)]))
  if (o.mOn !== undefined) c.mfin(o.mOn, o.sensOn ?? ST)
  if (o.mOff !== undefined) { if (o.sensOff) c.mfin(o.mOff, o.sensOff); else c.mfin(o.mOff, ST, true) }
  if (o.alarm && o.timeout && (o.sensOn || o.sensOff)) {
    const TO = c.r(`${o.st}TO`, `${o.name}: timeout timer`)
    const terms2: Instruction[][] = []
    if (o.sensOn) terms2.push([rd(ST), andn(o.sensOn)])
    if (o.sensOff) terms2.push([rdn(ST), andn(o.sensOff)])
    nets.push(N(`${o.name}: position not reached timer`, [...anyOf(terms2), tmrb(c, o.timeout), wrt(TO)]))
    nets.push(latchAlarm(c, [rd(TO)], o.alarm, `${o.name}: timeout alarm`))
  }
  return nets
}

/**
 * Step sequence started by an M-code request relay. Steps advance when their condition is ON.
 * Returns the step relay addresses and the DONE relay (reset when MF goes OFF).
 */
function stepSeq(c: Ctx, prefix: string, name: string, start: string, conds: { cond: string; label: string }[]) {
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
  nets.push(N(`${name}: reset steps on CNC reset`, [rd(RSTF()), ...steps.map(rst)]))
  nets.push(N(`${name}: clear complete when MF OFF`, [rdn(g('MF')), or(RSTF()), rst(DN)]))
  return { nets, steps, DN }
}
const anyStep = (steps: string[]) => anyOf(steps.map((s) => [rd(s)]))

/** Gray code → binary position. */
export const grayToBin = (g0: number) => { let n = g0; for (let s = g0 >> 1; s; s >>= 1) n ^= s; return n }
/** FANUC standard 21-position feedrate override switch (%). */
export const FEED_OVR_STEPS = [0, 1, 2, 4, 6, 8, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100, 105, 110, 120]
export const SPINDLE_OVR_STEPS = [50, 60, 70, 80, 90, 100, 110, 120]

const ax = (e: { axes: string[] }) => e.axes.slice(0, 8)

/* ================================================================== */
/* Catalog                                                             */
/* ================================================================== */
export const ACCESSORIES: Accessory[] = [
  /* ---------------- CNC interface ---------------- */
  { id: 'mcode', group: 'CNC interface', name: 'M-code decode (MF / FIN)', required: true,
    desc: 'Decodes M-codes with DECB, handles M00/M01/M02/M30 and returns FIN (G4.3) when every requested function is complete.',
    define: () => def({ mcodes: [0, 1, 2, 30].map((code) => ({ code, label: 'Program stop / end', shared: true })) }),
    nets: () => [] },
  { id: 'tcode', group: 'CNC interface', name: 'T-code (TF / TFIN)', desc: 'T function strobe TF (F7.3) → completion. Turret / magazine indexing hook in automatically.',
    define: () => def({}), nets: () => [] },
  { id: 'scode', group: 'CNC interface', name: 'S-code (SF / SFIN)', desc: 'S function strobe SF (F7.2) → immediate completion (serial spindle speed is sent by the CNC).',
    define: () => def({}), nets: () => [] },

  /* ---------------- Safety ---------------- */
  { id: 'estop', group: 'Safety', name: 'Emergency stop chain', required: true,
    desc: 'E-stop push button on the fixed *ESP input X8.4 → *ESP (G8.4) in Level 1 (high-speed). Spindle *ESPA follows.',
    define: () => def({ inputs: [inp('EMGPBI', 'Emergency stop push button (NC) — *ESP fixed input', 'machine', { fixed: 'X8.4' })] }),
    nets: () => [] },
  { id: 'overtravel', group: 'Safety', name: 'Hardware overtravel limits', desc: 'One NC limit switch per axis direction → *+Ln / *-Ln (G114 / G116), Level 1. Needs parameter 3004#5 (OTH) = 0.',
    define: (e) => def({ inputs: ax(e).flatMap((a) => [inp(`+${a}OTI`, `+${a} overtravel limit switch (NC)`), inp(`-${a}OTI`, `-${a} overtravel limit switch (NC)`)]) }),
    nets: (c) => c.axes.slice(0, 8).flatMap((a, i) => [
      N(`*+L${i + 1} +${a} overtravel`, [rd(c.x(`+${a}OTI`)), wrt(`G114.${i}`)], 1),
      N(`*-L${i + 1} -${a} overtravel`, [rd(c.x(`-${a}OTI`)), wrt(`G116.${i}`)], 1),
    ]) },
  { id: 'lightcurtain', group: 'Safety', name: 'Light curtain / safety mat', desc: 'Interrupted (OFF) → feed hold, interlock and operator message.',
    define: () => def({ inputs: [inp('LCURTI', 'Light curtain clear (ON = clear)')], alarms: [al('LCURTMS', 'LIGHT CURTAIN INTERRUPTED', 'operator')] }),
    nets: (c) => { const x = c.x('LCURTI'); c.hold(x, true); c.inter(x, true); c.permit(x); return [N('Light curtain interrupted message', [rdn(x), wrt(c.a('LCURTMS'))])] } },
  { id: 'twohand', group: 'Safety', name: 'Two-hand start (anti tie-down)', desc: 'Both buttons within the window time → cycle start. Releasing early does not restart.',
    params: [{ key: 'window', label: 'Simultaneous window', unit: 'ms', default: 500, min: 100, max: 2000 }],
    define: () => def({ inputs: [inp('THLPBI', 'Two-hand start — left button', 'panel'), inp('THRPBI', 'Two-hand start — right button', 'panel')] }),
    nets: (c) => {
      const L = c.x('THLPBI'), R = c.x('THRPBI')
      const WIN = c.r('THWIN', 'Two-hand: window elapsed'), OK = c.r('THOK', 'Two-hand: start accepted')
      c.startSrc(OK)
      return [
        N('Two-hand: window timer (any button pressed)', [rd(L), or(R), tmrb(c, c.p('window')), wrt(WIN)]),
        N('Two-hand: both pressed within window', [rd(L), and(R), andn(WIN), or(OK), and(L), and(R), wrt(OK)]),
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
  { id: 'cycle', group: 'Operator panel', name: 'Cycle start / feed hold', desc: 'ST (G7.2) with all start permissives, *SP (G8.5) feed hold with every hold condition. Lamps from STL/SPL.',
    define: () => def({
      inputs: [inp('CYSTPBI', 'Cycle start push button', 'panel'), inp('FHLDPBI', 'Feed hold push button', 'panel')],
      outputs: [out('CYSTL', 'Cycle start lamp', 'panel'), out('FHLDL', 'Feed hold lamp', 'panel')],
    }),
    nets: (c) => { c.startSrc(c.x('CYSTPBI')); c.hold(c.x('FHLDPBI')); return [N('Cycle start lamp (STL)', [rd(g('STL')), wrt(c.y('CYSTL'))]), N('Feed hold lamp (SPL)', [rd(g('SPL')), wrt(c.y('FHLDL'))])] } },
  { id: 'reset', group: 'Operator panel', name: 'External reset button', desc: 'Panel reset button → ERS (G8.7). The MDI RESET key works without this.',
    define: () => def({ inputs: [inp('RSTPBI', 'External reset push button', 'panel')] }),
    nets: (c) => [N('External reset (ERS)', [rd(c.x('RSTPBI')), wrt(g('ERS'))])] },
  { id: 'feedovr', group: 'Operator panel', name: 'Feed override (Gray code rotary switch)', desc: '5-bit Gray code switch → CODB table → *FV0–7 (G12) and jog override *JV (G10/G11). 21 positions 0–120 %.',
    define: () => def({ inputs: [1, 2, 4, 8, 16].map((n, i) => inp(`OV${n}I`, `Feed override switch bit ${n} (Gray code)`, 'panel', i === 0 ? { align: 5 } : {})) }),
    nets: (c) => {
      const raw = c.rb('OVRAW', 'Feed override switch code (masked)')
      const table = Array.from({ length: 32 }, (_, gc) => FEED_OVR_STEPS[Math.min(grayToBin(gc), FEED_OVR_STEPS.length - 1)])
      return [
        N('Feed override: mask switch bits 0–4 (MOVE)', [rd(ON), fn('MOVE', ['0001', '1111', byteOf(c.x('OV1I')), raw])]),
        N('Feed override: Gray code → *FV0–7 (CODB, negative logic)', [rd(OFF), rds(ON), fn('CODB', [1, 32, raw, 'G12'], table.map((p) => 255 - p)), wrt(c.r('OVERR1', 'Feed override CODB error'))]),
        N('Jog override: Gray code → *JV0–15 (CODB, 0.01 %)', [rd(OFF), rds(ON), fn('CODB', [2, 32, raw, 'G10'], table.map((p) => 65535 - p * 100)), wrt(c.r('OVERR2', 'Jog override CODB error'))]),
      ]
    } },
  { id: 'spovr', group: 'Operator panel', name: 'Spindle override (rotary switch)', desc: '3-bit Gray code switch → CODB → SOV0–7 (G30), 50–120 %.',
    define: () => def({ inputs: [1, 2, 4].map((n, i) => inp(`SOV${n}I`, `Spindle override switch bit ${n} (Gray code)`, 'panel', i === 0 ? { align: 3 } : {})) }),
    nets: (c) => {
      const raw = c.rb('SOVRAW', 'Spindle override switch code (masked)')
      const table = Array.from({ length: 8 }, (_, gc) => SPINDLE_OVR_STEPS[grayToBin(gc)])
      return [
        N('Spindle override: mask switch bits 0–2 (MOVE)', [rd(ON), fn('MOVE', ['0000', '0111', byteOf(c.x('SOV1I')), raw])]),
        N('Spindle override: Gray code → SOV (CODB)', [rd(OFF), rds(ON), fn('CODB', [1, 8, raw, 'G30'], table), wrt(c.r('SOVERR', 'Spindle override CODB error'))]),
      ]
    } },
  { id: 'rapidovr', group: 'Operator panel', name: 'Rapid override (F0 / 25 / 50 / 100 %)', desc: 'Two switch bits → ROV1/ROV2 (G14.0/G14.1): 00 = 100 %, 01 = 50 %, 10 = 25 %, 11 = F0.',
    define: () => def({ inputs: [inp('ROV1I', 'Rapid override select bit 1', 'panel'), inp('ROV2I', 'Rapid override select bit 2', 'panel')] }),
    nets: (c) => [N('Rapid override ROV1', [rd(c.x('ROV1I')), wrt(g('ROV1'))]), N('Rapid override ROV2', [rd(c.x('ROV2I')), wrt(g('ROV2'))])] },
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
    define: (e) => def({ inputs: [...ax(e).map((a) => inp(`H${a}SELI`, `Handle axis select ${a}`, 'panel')), inp('MPX10I', 'Handle multiplier ×10', 'panel'), inp('MPX100I', 'Handle multiplier ×100', 'panel')] }),
    nets: (c) => {
      const nets: NetDef[] = []
      const axs = c.axes.slice(0, 8)
      ;['HS1A', 'HS1B', 'HS1C', 'HS1D'].forEach((s, bit) => {
        const src = axs.filter((_, i) => ((i + 1) >> bit) & 1)
        if (src.length) nets.push(N(`Handle axis select ${s}`, [...anyOf(src.map((a) => [rd(c.x(`H${a}SELI`))])), wrt(g(s))]))
      })
      nets.push(N('Handle multiplier MP1 (×10)', [rd(c.x('MPX10I')), wrt(g('MP1'))]), N('Handle multiplier MP2 (×100)', [rd(c.x('MPX100I')), wrt(g('MP2'))]))
      return nets
    } },
  { id: 'prgfunc', group: 'Operator panel', name: 'Single block / Block skip / Dry run / Machine lock', desc: 'Push buttons with LEDs (toggle) → SBK G46.1, BDT1 G44.0, DRN G46.7, MLK G44.1.',
    define: () => def({ inputs: PRG.map((p) => inp(`${p.k}PBI`, `${p.n} push button`, 'panel')), outputs: PRG.map((p) => out(`${p.k}L`, `${p.n} lamp`, 'panel')) }),
    nets: (c) => PRG.flatMap((p) => {
      const st = c.r(`${p.k}R`, `${p.n} ON`)
      return [...onOff(c, { st, sym: `${p.k}R`, name: p.n, pb: c.x(`${p.k}PBI`) }), N(`${p.n} → ${p.s} + lamp`, [rd(st), wrt(g(p.s)), wrt(c.y(`${p.k}L`))])]
    }) },
  { id: 'memkey', group: 'Operator panel', name: 'Program protect key', desc: 'Key switch ON = editing allowed → KEY1–KEY4 (G46.3–G46.6).',
    define: () => def({ inputs: [inp('KEYSWI', 'Program protect key switch (ON = edit allowed)', 'panel')] }),
    nets: (c) => [N('Memory protect KEY1–KEY4', [rd(c.x('KEYSWI')), wrt(g('KEY1')), wrt(g('KEY2')), wrt(g('KEY3')), wrt(g('KEY4'))])] },

  /* ---------------- Spindle ---------------- */
  { id: 'spindle', group: 'Spindle', name: 'Spindle CW / CCW / stop (M03/M04/M05)', desc: 'M03/M04/M05 + panel buttons in manual mode → SFRA/SRVA (G70). *ESPA in Level 1, MRDYA always ON.',
    params: [{ key: 'finDelay', label: 'M03/M04 FIN delay (speed up)', unit: 'ms', default: 1000, min: 0, max: 30000 }],
    define: () => def({
      inputs: [inp('SPCWPBI', 'Spindle CW push button', 'panel'), inp('SPCCWPBI', 'Spindle CCW push button', 'panel'), inp('SPSTPBI', 'Spindle stop push button', 'panel')],
      outputs: [out('SPCWL', 'Spindle CW lamp', 'panel'), out('SPCCWL', 'Spindle CCW lamp', 'panel'), out('SPSTPL', 'Spindle stop lamp', 'panel')],
      mcodes: [{ code: 3, label: 'Spindle CW' }, { code: 4, label: 'Spindle CCW' }, { code: 5, label: 'Spindle stop', shared: true }],
    }),
    nets: (c) => {
      const man = c.manual(), m3 = c.m(3), m4 = c.m(4), m5 = c.m(5)
      const STOP = c.r('SPSTOP', 'Spindle stop request'), CW = c.r('SPCW', 'Spindle CW command'), CCW = c.r('SPCCW', 'Spindle CCW command')
      const RUN = c.r('SPRUN', 'Spindle running (CW or CCW)'), FIN = c.r('SPFIN', 'Spindle M03/M04 completion')
      c.mfin(3, FIN); c.mfin(4, FIN); c.mfin(5, RUN, true)
      return [
        N('Spindle *ESPA follows *ESP', [rd(g('*ESP')), wrt(g('*ESPA'))], 1),
        N('Spindle stop request (M05 / STOP button / reset / E-stop)', [rd(m5), or(c.x('SPSTPBI')), or(RSTF()), orn(g('*ESP')), wrt(STOP)]),
        N('Spindle CW (M03 or CW button in manual)', [...anyOf([[rd(m3)], [rd(c.x('SPCWPBI')), and(man)], [rd(CW)]]), andn(STOP), andn(m4), andn(c.x('SPCCWPBI')), wrt(CW)]),
        N('Spindle CCW (M04 or CCW button in manual)', [...anyOf([[rd(m4)], [rd(c.x('SPCCWPBI')), and(man)], [rd(CCW)]]), andn(STOP), andn(m3), andn(c.x('SPCWPBI')), wrt(CCW)]),
        N('SFRA spindle CW + lamp', [rd(CW), wrt(g('SFRA')), wrt(c.y('SPCWL'))]),
        N('SRVA spindle CCW + lamp', [rd(CCW), wrt(g('SRVA')), wrt(c.y('SPCCWL'))]),
        N('Spindle running', [rd(CW), or(CCW), wrt(RUN)]),
        N('Spindle stop lamp', [rdn(RUN), wrt(c.y('SPSTPL'))]),
        N('MRDYA machine ready (spindle 1)', [rd(ON), wrt(g('MRDYA'))]),
        N('M03/M04 completion delay', [rd(RUN), tmrb(c, c.p('finDelay')), wrt(FIN)]),
      ]
    } },
  { id: 'orient', group: 'Spindle', name: 'Spindle orientation (M19)', requires: ['spindle'], desc: 'M19 → ORCMA (G70.6); FIN on ORARA (F45.7). Timeout alarm.',
    params: [timeoutP(10000)],
    define: () => def({ mcodes: [{ code: 19, label: 'Spindle orientation' }], alarms: [al('ORTOAL', 'SPINDLE ORIENTATION TIMEOUT')] }),
    nets: (c) => {
      const REQ = c.r('ORREQ', 'Orientation request'), TO = c.r('ORTO', 'Orientation timeout timer')
      c.mfin(19, g('ORARA'))
      return [
        N('Orientation request (M19, cancelled by M03/M04/M05/reset)', [rd(c.m(19)), or(REQ), andn(c.m(3)), andn(c.m(4)), andn(c.m(5)), andn(RSTF()), wrt(REQ)]),
        N('ORCMA orientation command', [rd(REQ), wrt(g('ORCMA'))]),
        N('Orientation timeout timer', [rd(REQ), andn(g('ORARA')), tmrb(c, c.p('timeout')), wrt(TO)]),
        latchAlarm(c, [rd(TO)], 'ORTOAL', 'Orientation timeout alarm'),
      ]
    } },
  { id: 'gear', group: 'Spindle', name: 'Spindle gear change (M41 / M42)', requires: ['spindle'], desc: 'Gear solenoids until gear position switch is reached; GR1/GR2 (G28) back to CNC.',
    params: [mP('m1', 'Low gear M-code', 41), mP('m2', 'High gear M-code', 42), timeoutP(8000)],
    define: (e) => def({
      inputs: [inp('GR1PSI', 'Gear 1 (low) position switch'), inp('GR2PSI', 'Gear 2 (high) position switch')],
      outputs: [out('GR1SOL', 'Gear 1 shift solenoid'), out('GR2SOL', 'Gear 2 shift solenoid')],
      mcodes: [{ code: e.p('m1'), label: 'Low gear' }, { code: e.p('m2'), label: 'High gear' }], alarms: [al('GRTOAL', 'SPINDLE GEAR CHANGE TIMEOUT')],
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
      ]
    } },
  { id: 'sp2', group: 'Spindle', name: 'Sub-spindle CW / CCW / stop', desc: 'Second serial spindle via SFRB/SRVB (G74). M-codes configurable. *ESPB in Level 1.', conflicts: ['livetool'],
    params: [mP('mCw', 'Sub-spindle CW', 63), mP('mCcw', 'Sub-spindle CCW', 64), mP('mStop', 'Sub-spindle stop', 65), { key: 'finDelay', label: 'FIN delay', unit: 'ms', default: 1000, min: 0, max: 30000 }],
    define: (e) => def({ mcodes: [{ code: e.p('mCw'), label: 'Sub-spindle CW' }, { code: e.p('mCcw'), label: 'Sub-spindle CCW' }, { code: e.p('mStop'), label: 'Sub-spindle stop' }] }),
    nets: (c) => spindle2(c, 'SP2', 'Sub-spindle') },
  { id: 'livetool', group: 'Spindle', name: 'Live tool (rotary tool spindle)', desc: 'Rotary tool on serial spindle 2 (SFRB/SRVB, G74). M-codes configurable.', conflicts: ['sp2'],
    params: [mP('mCw', 'Live tool CW', 45), mP('mCcw', 'Live tool CCW', 46), mP('mStop', 'Live tool stop', 47), { key: 'finDelay', label: 'FIN delay', unit: 'ms', default: 800, min: 0, max: 30000 }],
    define: (e) => def({ mcodes: [{ code: e.p('mCw'), label: 'Live tool CW' }, { code: e.p('mCcw'), label: 'Live tool CCW' }, { code: e.p('mStop'), label: 'Live tool stop' }] }),
    nets: (c) => spindle2(c, 'LT', 'Live tool') },
  { id: 'spclamp', group: 'Spindle', name: 'Spindle / C-axis clamp', desc: 'Spindle brake for milling on a lathe. Spindle stop while clamped.',
    params: [mP('mOn', 'Clamp', 68), mP('mOff', 'Unclamp', 69), timeoutP(3000)],
    define: (e) => def({ inputs: [inp('SPCLPI', 'Spindle clamped confirm'), inp('SPUCLI', 'Spindle unclamped confirm')], outputs: [out('SPCLPO', 'Spindle clamp solenoid')], mcodes: [{ code: e.p('mOn'), label: 'Spindle clamp' }, { code: e.p('mOff'), label: 'Spindle unclamp' }], alarms: [al('SPCLTOAL', 'SPINDLE CLAMP/UNCLAMP TIMEOUT')] }),
    nets: (c) => { c.spStop(c.y('SPCLPO')); return twoPos(c, { st: 'SPCLR', name: 'Spindle clamp', mOn: c.p('mOn'), mOff: c.p('mOff'), outOn: c.y('SPCLPO'), sensOn: c.x('SPCLPI'), sensOff: c.x('SPUCLI'), alarm: 'SPCLTOAL', timeout: c.p('timeout') }) } },
  { id: 'spcooler', group: 'Spindle', name: 'Spindle oil cooler', desc: 'Cooler runs with servo ready (SA); cooler alarm stops the machine.',
    define: () => def({ inputs: [inp('SPCLALI', 'Spindle cooler OK (NC alarm contact)')], outputs: [out('SPCOOLO', 'Spindle oil cooler run')], alarms: [al('SPCOOLAL', 'SPINDLE OIL COOLER ALARM')] }),
    nets: (c) => [N('Spindle cooler run', [rd(g('SA')), wrt(c.y('SPCOOLO'))]), N('Spindle cooler alarm', [rd(g('SA')), andn(c.x('SPCLALI')), wrt(c.a('SPCOOLAL'))])] },

  /* ---------------- Axes ---------------- */
  { id: 'decdog', group: 'Axes', name: 'Reference return dogs (*DEC)', desc: 'Deceleration dogs on the fixed inputs X9.0–X9.7 (read directly by the CNC — no ladder needed).',
    define: (e) => def({ inputs: ax(e).map((a, i) => inp(`${a}DECI`, `*DEC${i + 1} ${a} reference return dog (fixed input)`, 'machine', { fixed: `X9.${i}` })) }),
    nets: () => [] },
  { id: 'refdone', group: 'Axes', name: 'Reference return complete lamps', desc: 'Lamp per axis from ZPn (F94).',
    define: (e) => def({ outputs: ax(e).map((a) => out(`${a}ZRNL`, `${a} reference return complete lamp`, 'panel')) }),
    nets: (c) => c.axes.slice(0, 8).map((a, i) => N(`${a} reference return lamp (ZP${i + 1})`, [rd(`F94.${i}`), wrt(c.y(`${a}ZRNL`))])) },
  { id: 'axbrake', group: 'Axes', name: 'Vertical axis brake release', desc: 'Brake released when servo ready (SA F0.6), with a release delay.',
    params: [{ key: 'delay', label: 'Release delay after SA', unit: 'ms', default: 100, min: 0, max: 5000 }],
    define: () => def({ outputs: [out('ZBRKO', 'Vertical axis brake release')] }),
    nets: (c) => [N('Axis brake release after servo ready', [rd(g('SA')), tmrb(c, c.p('delay')), wrt(c.y('ZBRKO'))])] },
  { id: 'absbattery', group: 'Axes', name: 'Battery alarms (CNC + absolute encoder)', desc: 'BAL (F1.2) and absolute encoder battery box → operator messages.',
    define: () => def({ inputs: [inp('APCBATI', 'Absolute encoder battery low (ON = low)')], alarms: [al('CNCBATMS', 'CNC BATTERY LOW', 'operator'), al('APCBATMS', 'ENCODER BATTERY LOW - REPLACE WITH POWER ON', 'operator')] }),
    nets: (c) => [N('CNC battery low message', [rd(g('BAL')), wrt(c.a('CNCBATMS'))]), N('Absolute encoder battery low message', [rd(c.x('APCBATI')), wrt(c.a('APCBATMS'))])] },

  /* ---------------- Tool changer ---------------- */
  { id: 'turret', group: 'Tool changer', name: 'Turret (lathe) — index by T-code', requires: ['tcode'], conflicts: ['atc'],
    desc: 'Binary position sensors vs T-code (COMPB), unclamp → rotate → clamp, TFIN when clamped in position. Index timeout + T out of range alarms.',
    params: [{ key: 'stations', label: 'Turret stations', unit: 'count', default: 12, min: 2, max: 15 }, timeoutP(8000)],
    define: () => def({
      inputs: [...[1, 2, 4, 8].map((n, i) => inp(`TPOS${n}I`, `Turret position code bit ${n}`, 'machine', i === 0 ? { align: 4 } : {})), inp('TCLPI', 'Turret clamped confirm'), inp('TUCLI', 'Turret unclamped confirm'), inp('TMANPBI', 'Turret manual index push button', 'panel')],
      outputs: [out('TUCLO', 'Turret unclamp solenoid'), out('TROTO', 'Turret rotate (motor / valve)')],
      alarms: [al('TIDXAL', 'TURRET INDEX TIMEOUT'), al('TOUTAL', 'T-CODE OUT OF RANGE')],
    }),
    nets: (c) => {
      const TF = g('TF'), cur = c.rb('TCUR', 'Turret current position')
      const EQ = c.r('TEQ', 'Turret at commanded T'), BAD = c.r('TBAD', 'T-code out of range'), IDX = c.r('TIDX', 'Turret index in progress')
      const MAN = c.r('TMAN', 'Turret manual index'), DONE = c.r('TDONE', 'Turret index complete'), TO = c.r('TIDXTO', 'Turret index timeout timer')
      c.tdone(DONE); c.permit(c.x('TCLPI')); c.inter(c.x('TCLPI'), true)
      return [
        N('Turret: read position code (MOVE bits 0–3)', [rd(ON), fn('MOVE', ['0000', '1111', byteOf(c.x('TPOS1I')), cur])]),
        N('Turret: compare T-code with position (COMPB)', [rd(TF), fn('COMPB', [1001, 'F26', cur])]),
        N('Turret: in position', [rd(TF), and('R9000.0'), wrt(EQ)]),
        N('Turret: check T-code ≤ stations (COMPB)', [rd(TF), fn('COMPB', [1, c.p('stations'), 'F26'])]),
        N('Turret: T-code out of range', [rd(TF), and('R9000.1'), wrt(BAD)]),
        latchAlarm(c, [rd(BAD)], 'TOUTAL', 'T-code out of range alarm'),
        N('Turret: index request', [rd(TF), andn(EQ), andn(BAD), or(IDX), andn(EQ), andn(RSTF()), andn(TO), wrt(IDX)]),
        N('Turret: manual index (hold button in manual mode)', [rd(c.x('TMANPBI')), and(c.manual()), wrt(MAN)]),
        N('Turret: unclamp', [rd(IDX), or(MAN), wrt(c.y('TUCLO'))]),
        N('Turret: rotate when unclamped', [rd(IDX), or(MAN), and(c.x('TUCLI')), wrt(c.y('TROTO'))]),
        N('Turret: index complete → TFIN', [rd(TF), and(EQ), and(c.x('TCLPI')), andn(c.y('TUCLO')), wrt(DONE)]),
        N('Turret: index timeout timer', [rd(IDX), tmrb(c, c.p('timeout')), wrt(TO)]),
        latchAlarm(c, [rd(TO)], 'TIDXAL', 'Turret index timeout alarm'),
      ]
    } },
  { id: 'atc', group: 'Tool changer', name: 'ATC — arm type with carousel (M06)', requires: ['tcode', 'spindle'], conflicts: ['turret', 'drawbar'],
    desc: 'T-code rotates the magazine (pocket counter + COMPB). M06 runs: pot down → arm grip → unclamp → swap → clamp → arm origin → pot up. Orient the spindle in the M06 macro.',
    params: [{ key: 'pockets', label: 'Magazine pockets', unit: 'count', default: 24, min: 4, max: 120 }, timeoutP(15000)],
    define: () => def({
      inputs: [
        inp('MGCNTI', 'Magazine pocket count sensor'), inp('MGORGI', 'Magazine origin (pocket 1)'), inp('POTDNI', 'Tool pot down'), inp('POTUPI', 'Tool pot up'),
        inp('ARMORGI', 'ATC arm origin'), inp('ARMGRPI', 'ATC arm grip position (60°)'), inp('ARMSWPI', 'ATC arm swap complete'),
        inp('TCLMPI', 'Spindle tool clamped'), inp('TUNCLI', 'Spindle tool unclamped'),
        inp('TLUNCPBI', 'Tool unclamp push button (manual)', 'panel'), inp('MGCWPBI', 'Magazine rotate push button (manual)', 'panel'),
      ],
      outputs: [out('MGCWO', 'Magazine rotate'), out('POTDNO', 'Tool pot down solenoid'), out('ARMO', 'ATC arm motor'), out('TLUNCO', 'Spindle tool unclamp solenoid')],
      mcodes: [{ code: 6, label: 'Tool change' }],
      alarms: [al('ATCTOAL', 'ATC SEQUENCE TIMEOUT'), al('ATCZPAL', 'ATC: Z AXIS NOT AT TOOL CHANGE POSITION')],
    }),
    nets: (c) => {
      const TF = g('TF'), man = c.manual()
      const PK = c.rb('MGPK', 'Magazine current pocket'), P = c.r('MGP', 'Magazine count pulse'), EQ = c.r('MGEQ', 'Magazine at commanded pocket'), MD = c.r('MGDONE', 'Magazine positioning complete')
      const REQ = c.r('ATCREQ', 'ATC request (M06)'), TO = c.r('ATCTO', 'ATC timeout timer')
      const zi = c.axes.indexOf('Z')
      const seq = stepSeq(c, 'ATC', 'ATC', REQ, [
        { cond: c.x('POTDNI'), label: 'pot down' }, { cond: c.x('ARMGRPI'), label: 'arm to grip' }, { cond: c.x('TUNCLI'), label: 'tool unclamp' },
        { cond: c.x('ARMSWPI'), label: 'arm swap' }, { cond: c.x('TCLMPI'), label: 'tool clamp' }, { cond: c.x('ARMORGI'), label: 'arm to origin' }, { cond: c.x('POTUPI'), label: 'pot up' },
      ])
      const S = seq.steps
      c.tdone(MD); c.mfin(6, seq.DN); c.inter(REQ); c.spStop(REQ)
      const nets: NetDef[] = [
        pulse(c, [rd(c.x('MGCNTI'))], P, 'Magazine: count pulse (DIFU)'),
        N('Magazine: pocket +1 while rotating (ADDB)', [rd(P), and(c.y('MGCWO')), fn('ADDB', [1, PK, 1, PK])]),
        N('Magazine: pocket overflow check (COMPB)', [rd(ON), fn('COMPB', [1, c.p('pockets'), PK])]),
        N('Magazine: wrap to pocket 1 / origin (NUMEB)', [rd('R9000.1'), or(c.x('MGORGI')), fn('NUMEB', [1, 1, PK])]),
        N('Magazine: compare T-code with pocket (COMPB)', [rd(TF), fn('COMPB', [1001, 'F26', PK])]),
        N('Magazine: at commanded pocket', [rd(TF), and('R9000.0'), wrt(EQ)]),
        N('Magazine: rotate (T-code or manual button)', [...anyOf([[rd(TF), andn(EQ), and(c.x('POTUPI')), andn(REQ)], [rd(c.x('MGCWPBI')), and(man), and(c.x('POTUPI'))]]), wrt(c.y('MGCWO'))]),
        N('Magazine: positioning complete → TFIN', [rd(TF), and(EQ), andn(c.y('MGCWO')), wrt(MD)]),
        N(zi >= 0 ? 'ATC request (M06 at Z tool change position ZP2)' : 'ATC request (M06)', [rd(c.m(6)), ...(zi >= 0 ? [and(`F96.${zi}`)] : []), andn(seq.DN), andn(RSTF()), wrt(REQ)]),
        ...seq.nets,
        N('ATC: pot down solenoid (steps 1–6)', [...anyStep(S.slice(0, 6)), wrt(c.y('POTDNO'))]),
        N('ATC: arm motor (steps 2, 4, 6)', [rd(S[1]), or(S[3]), or(S[5]), wrt(c.y('ARMO'))]),
        N('ATC: tool unclamp (steps 3–4 or manual button)', [...anyOf([[rd(S[2])], [rd(S[3])], [rd(c.x('TLUNCPBI')), and(man), andn(g('OP'))]]), wrt(c.y('TLUNCO'))]),
        N('ATC: sequence timeout timer', [rd(REQ), tmrb(c, c.p('timeout')), wrt(TO)]),
        latchAlarm(c, [rd(TO)], 'ATCTOAL', 'ATC timeout alarm'),
      ]
      if (zi >= 0) nets.push(latchAlarm(c, [rd(c.m(6)), andn(`F96.${zi}`)], 'ATCZPAL', 'ATC: Z not at tool change position alarm'))
      return nets
    } },
  { id: 'drawbar', group: 'Tool changer', name: 'Manual tool clamp / unclamp (drawbar)', conflicts: ['atc'], desc: 'Tool unclamp push button in manual mode with spindle stopped.',
    define: () => def({ inputs: [inp('TLUNCPBI', 'Tool unclamp push button', 'panel'), inp('TUNCLI', 'Tool unclamped confirm')], outputs: [out('TLUNCO', 'Spindle tool unclamp solenoid')] }),
    nets: (c) => { c.spStop(c.y('TLUNCO')); c.permit(c.x('TUNCLI'), true); return [N('Tool unclamp (manual mode, spindle stopped)', [rd(c.x('TLUNCPBI')), and(c.manual()), ...(c.has('spindle') ? [andn(c.r('SPRUN', 'Spindle running (CW or CCW)'))] : []), wrt(c.y('TLUNCO'))])] } },
  { id: 'toollife', group: 'Tool changer', name: 'Tool life management', desc: 'TLCH (F64.0) → message + lamp; reset button → TLRST (G48.7).',
    define: () => def({ inputs: [inp('TLRSTPBI', 'Tool life reset push button', 'panel')], outputs: [out('TLCHL', 'Tool life expired lamp', 'panel')], alarms: [al('TLCHMS', 'TOOL LIFE EXPIRED - CHANGE TOOL', 'operator')] }),
    nets: (c) => [N('Tool life expired lamp + message', [rd(g('TLCH')), wrt(c.y('TLCHL')), wrt(c.a('TLCHMS'))]), N('Tool life reset (TLRST)', [rd(c.x('TLRSTPBI')), wrt(g('TLRST'))])] },

  /* ---------------- Workholding ---------------- */
  { id: 'chuck', group: 'Workholding', name: 'Chuck clamp / unclamp (foot switch, ID/OD)', conflicts: ['collet'],
    desc: 'M-codes + foot switch (manual, spindle stopped). ID/OD select swaps the solenoids. Pressure switch alarm; spindle and cycle start interlocked.',
    params: [mP('mClamp', 'Chuck clamp', 10), mP('mUnclamp', 'Chuck unclamp', 11), { key: 'prsDelay', label: 'Pressure low delay', unit: 'ms', default: 500, min: 0, max: 10000 }],
    define: (e) => def({
      inputs: [inp('CHKFSWI', 'Chuck foot switch'), inp('CHKIDSWI', 'Chuck ID/OD select (ON = ID clamp)', 'panel'), inp('CHKCLI', 'Chuck clamped confirm'), inp('CHKPRSI', 'Chuck pressure switch (ON = OK)')],
      outputs: [out('CHKCLO', 'Chuck clamp solenoid'), out('CHKUNO', 'Chuck unclamp solenoid')],
      mcodes: [{ code: e.p('mClamp'), label: 'Chuck clamp' }, { code: e.p('mUnclamp'), label: 'Chuck unclamp' }],
      alarms: [al('CHKPRAL', 'CHUCK PRESSURE LOW')],
    }),
    nets: (c) => {
      const mC = c.m(c.p('mClamp')), mU = c.m(c.p('mUnclamp')), ID = c.x('CHKIDSWI')
      const P = c.r('CHKP', 'Chuck foot switch pulse'), UN = c.r('CHKUN', 'Chuck unclamp commanded'), OK = c.r('CHKOK', 'Chuck clamped and pressure OK'), PL = c.r('CHKPL', 'Chuck pressure low timer')
      const run = c.has('spindle') ? [andn(c.r('SPRUN', 'Spindle running (CW or CCW)'))] : []
      c.mfin(c.p('mClamp'), c.x('CHKCLI')); c.mfin(c.p('mUnclamp'), c.x('CHKCLI'), true); c.permit(OK); c.spStop(OK, true)
      return [
        pulse(c, [rd(c.x('CHKFSWI')), and(c.manual()), ...run], P, 'Chuck: foot switch edge (manual mode, spindle stopped)'),
        N('Chuck: unclamp command latch', [...anyOf([[rd(mU), ...run], [rd(P), andn(UN)], [rd(UN), andn(mC), andn(P)]]), wrt(UN)]),
        N('Chuck: clamp solenoid (OD: clamp, ID: swapped)', [...anyOf([[rdn(UN), andn(ID)], [rd(UN), and(ID)]]), wrt(c.y('CHKCLO'))]),
        N('Chuck: unclamp solenoid (OD: unclamp, ID: swapped)', [...anyOf([[rd(UN), andn(ID)], [rdn(UN), and(ID)]]), wrt(c.y('CHKUNO'))]),
        N('Chuck: clamped and pressure OK', [rdn(UN), and(c.x('CHKCLI')), and(c.x('CHKPRSI')), wrt(OK)]),
        N('Chuck: pressure low timer', [rdn(UN), andn(c.x('CHKPRSI')), tmrb(c, c.p('prsDelay')), wrt(PL)]),
        latchAlarm(c, [rd(PL)], 'CHKPRAL', 'Chuck pressure low alarm'),
      ]
    } },
  { id: 'collet', group: 'Workholding', name: 'Collet open / close', conflicts: ['chuck'], desc: 'Collet closer by M-code or foot switch. Spindle stop while open.',
    params: [mP('mOn', 'Collet open', 11), mP('mOff', 'Collet close', 10), timeoutP(3000)],
    define: (e) => def({ inputs: [inp('CLTFSWI', 'Collet foot switch'), inp('CLTCLI', 'Collet closed confirm'), inp('CLTOPI', 'Collet open confirm')], outputs: [out('CLTOPO', 'Collet open solenoid')], mcodes: [{ code: e.p('mOn'), label: 'Collet open' }, { code: e.p('mOff'), label: 'Collet close' }], alarms: [al('CLTTOAL', 'COLLET OPEN/CLOSE TIMEOUT')] }),
    nets: (c) => { c.spStop(c.y('CLTOPO')); c.permit(c.x('CLTCLI')); return twoPos(c, { st: 'CLTR', name: 'Collet', mOn: c.p('mOn'), mOff: c.p('mOff'), pb: c.x('CLTFSWI'), outOn: c.y('CLTOPO'), sensOn: c.x('CLTOPI'), sensOff: c.x('CLTCLI'), alarm: 'CLTTOAL', timeout: c.p('timeout') }) } },
  { id: 'tailstock', group: 'Workholding', name: 'Tailstock advance / retract', desc: 'Double solenoid, M-codes or push button in manual mode, limit switches confirm.',
    params: [mP('mOn', 'Tailstock advance', 21), mP('mOff', 'Tailstock retract', 22), timeoutP(5000)],
    define: (e) => def({ inputs: [inp('TSPBI', 'Tailstock push button', 'panel'), inp('TSFWDI', 'Tailstock advanced LS'), inp('TSBWDI', 'Tailstock retracted LS')], outputs: [out('TSFWO', 'Tailstock advance solenoid'), out('TSBWO', 'Tailstock retract solenoid')], mcodes: [{ code: e.p('mOn'), label: 'Tailstock advance' }, { code: e.p('mOff'), label: 'Tailstock retract' }], alarms: [al('TSTOAL', 'TAILSTOCK MOVE TIMEOUT')] }),
    nets: (c) => twoPos(c, { st: 'TSR', name: 'Tailstock', mOn: c.p('mOn'), mOff: c.p('mOff'), pb: c.x('TSPBI'), outOn: c.y('TSFWO'), outOff: c.y('TSBWO'), sensOn: c.x('TSFWDI'), sensOff: c.x('TSBWDI'), alarm: 'TSTOAL', timeout: c.p('timeout') }) },
  { id: 'steady', group: 'Workholding', name: 'Steady rest close / open', desc: 'Hydraulic steady rest by M-code or push button.',
    params: [mP('mOn', 'Steady rest close', 23), mP('mOff', 'Steady rest open', 24), timeoutP(5000)],
    define: (e) => def({ inputs: [inp('SRPBI', 'Steady rest push button', 'panel'), inp('SRCLI', 'Steady rest closed'), inp('SROPI', 'Steady rest open')], outputs: [out('SRCLO', 'Steady rest close solenoid')], mcodes: [{ code: e.p('mOn'), label: 'Steady rest close' }, { code: e.p('mOff'), label: 'Steady rest open' }], alarms: [al('SRTOAL', 'STEADY REST TIMEOUT')] }),
    nets: (c) => twoPos(c, { st: 'SRR', name: 'Steady rest', mOn: c.p('mOn'), mOff: c.p('mOff'), pb: c.x('SRPBI'), outOn: c.y('SRCLO'), sensOn: c.x('SRCLI'), sensOff: c.x('SROPI'), alarm: 'SRTOAL', timeout: c.p('timeout') }) },
  { id: 'vise', group: 'Workholding', name: 'Vise / fixture clamp', desc: 'Hydraulic or pneumatic vise by M-code or foot switch. Cycle start needs clamped.',
    params: [mP('mOn', 'Fixture clamp', 12), mP('mOff', 'Fixture unclamp', 13), timeoutP(3000)],
    define: (e) => def({ inputs: [inp('VSPBI', 'Fixture clamp foot switch / button'), inp('VSCLI', 'Fixture clamped confirm'), inp('VSUCI', 'Fixture unclamped confirm')], outputs: [out('VSCLO', 'Fixture clamp solenoid')], mcodes: [{ code: e.p('mOn'), label: 'Fixture clamp' }, { code: e.p('mOff'), label: 'Fixture unclamp' }], alarms: [al('VSTOAL', 'FIXTURE CLAMP TIMEOUT')] }),
    nets: (c) => { c.permit(c.x('VSCLI')); return twoPos(c, { st: 'VSR', name: 'Fixture clamp', mOn: c.p('mOn'), mOff: c.p('mOff'), pb: c.x('VSPBI'), outOn: c.y('VSCLO'), sensOn: c.x('VSCLI'), sensOff: c.x('VSUCI'), alarm: 'VSTOAL', timeout: c.p('timeout') }) } },
  { id: 'rotclamp', group: 'Workholding', name: 'Rotary table clamp (4th / 5th axis)', desc: 'Rotary axis brake by M-code; clamp confirm interlocks cycle start.',
    params: [mP('mOn', 'Rotary clamp', 78), mP('mOff', 'Rotary unclamp', 79), timeoutP(3000)],
    define: (e) => def({ inputs: [inp('RTCLI', 'Rotary table clamped'), inp('RTUCI', 'Rotary table unclamped')], outputs: [out('RTCLO', 'Rotary table clamp solenoid')], mcodes: [{ code: e.p('mOn'), label: 'Rotary clamp' }, { code: e.p('mOff'), label: 'Rotary unclamp' }], alarms: [al('RTTOAL', 'ROTARY TABLE CLAMP TIMEOUT')] }),
    nets: (c) => twoPos(c, { st: 'RTR', name: 'Rotary clamp', mOn: c.p('mOn'), mOff: c.p('mOff'), outOn: c.y('RTCLO'), sensOn: c.x('RTCLI'), sensOff: c.x('RTUCI'), alarm: 'RTTOAL', timeout: c.p('timeout') }) },
  { id: 'vacuum', group: 'Workholding', name: 'Vacuum table', desc: 'Vacuum pump by M-code or button; vacuum switch must be OK to start / feed.',
    params: [mP('mOn', 'Vacuum ON', 70), mP('mOff', 'Vacuum OFF', 71)],
    define: (e) => def({ inputs: [inp('VACPBI', 'Vacuum ON/OFF push button', 'panel'), inp('VACOKI', 'Vacuum OK switch')], outputs: [out('VACO', 'Vacuum pump / valve')], mcodes: [{ code: e.p('mOn'), label: 'Vacuum ON' }, { code: e.p('mOff'), label: 'Vacuum OFF' }], alarms: [al('VACAL', 'VACUUM LOST')] }),
    nets: (c) => {
      const st = c.r('VACR', 'Vacuum ON'); c.mfin(c.p('mOn'), c.x('VACOKI')); c.permit(c.x('VACOKI'))
      return [...onOff(c, { st, sym: 'VACR', name: 'Vacuum', mOn: [c.p('mOn')], mOff: [c.p('mOff')], pb: c.x('VACPBI') }), N('Vacuum pump', [rd(st), wrt(c.y('VACO'))]), N('Vacuum lost during operation', [rd(st), and(g('OP')), andn(c.x('VACOKI')), wrt(c.a('VACAL'))])]
    } },
  { id: 'magchuck', group: 'Workholding', name: 'Magnetic chuck (grinder)', desc: 'Magnetize / demagnetize by M-code or button; magnetized confirm interlocks start.',
    params: [mP('mOn', 'Magnetize', 72), mP('mOff', 'Demagnetize', 73)],
    define: (e) => def({ inputs: [inp('MAGPBI', 'Magnetic chuck push button', 'panel'), inp('MAGOKI', 'Chuck magnetized confirm')], outputs: [out('MAGO', 'Magnetic chuck ON')], mcodes: [{ code: e.p('mOn'), label: 'Magnetize' }, { code: e.p('mOff'), label: 'Demagnetize' }] }),
    nets: (c) => { c.permit(c.x('MAGOKI')); return twoPos(c, { st: 'MAGR', name: 'Magnetic chuck', mOn: c.p('mOn'), mOff: c.p('mOff'), pb: c.x('MAGPBI'), outOn: c.y('MAGO'), sensOn: c.x('MAGOKI') }) } },

  /* ---------------- Coolant & lube ---------------- */
  { id: 'coolant', group: 'Coolant & lube', name: 'Flood coolant (M08 / M09)', desc: 'M08/M09 + panel button toggle, OFF on reset / M30. Pump overload and level messages.',
    define: () => def({
      inputs: [inp('COOLPBI', 'Coolant ON/OFF push button', 'panel'), inp('COOLOLI', 'Coolant pump overload OK (NC)'), inp('COOLLVLI', 'Coolant tank level OK')],
      outputs: [out('COOLO', 'Coolant pump contactor'), out('COOLL', 'Coolant lamp', 'panel')],
      mcodes: [{ code: 8, label: 'Coolant ON' }, { code: 9, label: 'Coolant OFF', shared: true }],
      alarms: [al('COOLOLMS', 'COOLANT PUMP OVERLOAD', 'operator'), al('COOLLVMS', 'COOLANT LEVEL LOW', 'operator')],
    }),
    nets: (c) => {
      const st = c.r('COOLR', 'Coolant ON')
      return [...onOff(c, { st, sym: 'COOLR', name: 'Coolant', mOn: [8], mOff: [9], pb: c.x('COOLPBI'), reset: true, m30: true }),
        N('Coolant pump + lamp', [rd(st), and(c.x('COOLOLI')), wrt(c.y('COOLO')), wrt(c.y('COOLL'))]),
        N('Coolant pump overload message', [rdn(c.x('COOLOLI')), wrt(c.a('COOLOLMS'))]),
        N('Coolant level low message', [rdn(c.x('COOLLVLI')), wrt(c.a('COOLLVMS'))])]
    } },
  { id: 'mist', group: 'Coolant & lube', name: 'Mist coolant / air blow (M07)', desc: 'M07 ON, M09 OFF (shared with flood coolant), push button toggle.',
    define: () => def({ inputs: [inp('MISTPBI', 'Mist / air blow push button', 'panel')], outputs: [out('MISTO', 'Mist / air blow valve')], mcodes: [{ code: 7, label: 'Mist ON' }, { code: 9, label: 'Coolant OFF', shared: true }] }),
    nets: (c) => { const st = c.r('MISTR', 'Mist ON'); return [...onOff(c, { st, sym: 'MISTR', name: 'Mist', mOn: [7], mOff: [9], pb: c.x('MISTPBI'), reset: true, m30: true }), N('Mist valve', [rd(st), wrt(c.y('MISTO'))])] } },
  { id: 'tsc', group: 'Coolant & lube', name: 'Through-spindle coolant (M88 / M89)', desc: 'High-pressure pump with pressure-OK completion, low-pressure alarm and filter message.',
    params: [mP('mOn', 'TSC ON', 88), mP('mOff', 'TSC OFF', 89), { key: 'prsDelay', label: 'Pressure check delay', unit: 'ms', default: 3000, min: 0, max: 30000 }],
    define: (e) => def({ inputs: [inp('TSCPRSI', 'TSC pressure OK'), inp('TSCFLTI', 'TSC filter clogged (ON = clogged)')], outputs: [out('TSCO', 'TSC pump')], mcodes: [{ code: e.p('mOn'), label: 'TSC ON' }, { code: e.p('mOff'), label: 'TSC OFF' }], alarms: [al('TSCPRAL', 'THROUGH-SPINDLE COOLANT PRESSURE LOW'), al('TSCFLMS', 'TSC FILTER CLOGGED', 'operator')] }),
    nets: (c) => {
      const st = c.r('TSCR', 'TSC ON'), TO = c.r('TSCPL', 'TSC pressure low timer')
      c.mfin(c.p('mOn'), c.x('TSCPRSI'))
      return [...onOff(c, { st, sym: 'TSCR', name: 'TSC', mOn: [c.p('mOn')], mOff: [c.p('mOff'), 9], reset: true, m30: true }),
        N('TSC pump', [rd(st), wrt(c.y('TSCO'))]),
        N('TSC pressure low timer', [rd(st), andn(c.x('TSCPRSI')), tmrb(c, c.p('prsDelay')), wrt(TO)]),
        latchAlarm(c, [rd(TO)], 'TSCPRAL', 'TSC pressure low alarm'),
        N('TSC filter clogged message', [rd(c.x('TSCFLTI')), wrt(c.a('TSCFLMS'))])]
    } },
  { id: 'lube', group: 'Coolant & lube', name: 'Way lubrication (pump, pressure, float, timer)', desc: 'Interval timer while servo ready → pump for discharge time; pressure check alarm, level message, manual button.',
    params: [{ key: 'interval', label: 'Lube interval', unit: 'ms', default: 600000, min: 10000, max: 3600000 }, { key: 'discharge', label: 'Pump ON time', unit: 'ms', default: 10000, min: 500, max: 120000 }, { key: 'prsCheck', label: 'Pressure check time', unit: 'ms', default: 8000, min: 500, max: 120000 }],
    define: () => def({ inputs: [inp('LUBPRSI', 'Lube pressure switch'), inp('LUBLVLI', 'Lube oil level OK (float)'), inp('LUBPBI', 'Manual lube push button', 'panel')], outputs: [out('LUBO', 'Lube pump')], alarms: [al('LUBPRAL', 'LUBRICATION PRESSURE LOW'), al('LUBLVMS', 'LUBRICATION OIL LEVEL LOW', 'operator')] }),
    nets: (c) => {
      const LO = c.y('LUBO'), IV = c.r('LUBIV', 'Lube interval elapsed'), DS = c.r('LUBDS', 'Lube discharge complete'), PL = c.r('LUBPL', 'Lube pressure not reached')
      return [
        N('Lube interval timer (servo ready, pump OFF)', [rd(g('SA')), andn(LO), tmrb(c, c.p('interval')), wrt(IV)]),
        N('Lube pump (interval or manual button)', [rd(IV), or(c.x('LUBPBI')), or(LO), andn(DS), and(g('*ESP')), wrt(LO)]),
        N('Lube discharge time', [rd(LO), tmrb(c, c.p('discharge')), wrt(DS)]),
        N('Lube pressure check timer', [rd(LO), andn(c.x('LUBPRSI')), tmrb(c, c.p('prsCheck')), wrt(PL)]),
        latchAlarm(c, [rd(PL)], 'LUBPRAL', 'Lube pressure low alarm'),
        N('Lube level low message', [rdn(c.x('LUBLVLI')), wrt(c.a('LUBLVMS'))]),
      ]
    } },

  /* ---------------- Hydraulics / pneumatics ---------------- */
  { id: 'hydraulic', group: 'Hydraulics/pneumatics', name: 'Hydraulic unit', desc: 'Pump runs when E-stop released; pressure / overload alarms, level / temperature message. Start needs pressure OK.',
    params: [{ key: 'prsDelay', label: 'Pressure build-up time', unit: 'ms', default: 3000, min: 0, max: 30000 }],
    define: () => def({ inputs: [inp('HYDPRSI', 'Hydraulic pressure switch'), inp('HYDOLI', 'Hydraulic motor overload OK (NC)'), inp('HYDLVLI', 'Hydraulic oil level OK'), inp('HYDTMPI', 'Hydraulic oil temperature high')], outputs: [out('HYDO', 'Hydraulic pump contactor')], alarms: [al('HYDPRAL', 'HYDRAULIC PRESSURE LOW'), al('HYDOLAL', 'HYDRAULIC MOTOR OVERLOAD'), al('HYDLVMS', 'HYDRAULIC OIL LEVEL LOW / TEMPERATURE HIGH', 'operator')] }),
    nets: (c) => {
      const PL = c.r('HYDPL', 'Hydraulic pressure low timer'); c.permit(c.x('HYDPRSI'))
      return [
        N('Hydraulic pump (E-stop released, no overload)', [rd(g('*ESP')), and(c.x('HYDOLI')), wrt(c.y('HYDO'))]),
        N('Hydraulic pressure low timer', [rd(c.y('HYDO')), andn(c.x('HYDPRSI')), tmrb(c, c.p('prsDelay')), wrt(PL)]),
        latchAlarm(c, [rd(PL)], 'HYDPRAL', 'Hydraulic pressure low alarm'),
        N('Hydraulic motor overload alarm', [rdn(c.x('HYDOLI')), wrt(c.a('HYDOLAL'))]),
        N('Hydraulic oil level / temperature message', [rdn(c.x('HYDLVLI')), or(c.x('HYDTMPI')), wrt(c.a('HYDLVMS'))]),
      ]
    } },
  { id: 'air', group: 'Hydraulics/pneumatics', name: 'Air pressure switch', desc: 'Low air pressure (after delay) → alarm; cycle start needs air OK.',
    params: [{ key: 'delay', label: 'Low pressure delay', unit: 'ms', default: 2000, min: 0, max: 30000 }],
    define: () => def({ inputs: [inp('AIRPRSI', 'Air pressure switch (ON = OK)')], alarms: [al('AIRPRAL', 'AIR PRESSURE LOW')] }),
    nets: (c) => { const T = c.r('AIRPL', 'Air pressure low timer'); c.permit(c.x('AIRPRSI')); return [N('Air pressure low timer', [rdn(c.x('AIRPRSI')), tmrb(c, c.p('delay')), wrt(T)]), N('Air pressure low alarm', [rd(T), wrt(c.a('AIRPRAL'))])] } },

  /* ---------------- Chip handling ---------------- */
  { id: 'chipconv', group: 'Chip handling', name: 'Chip conveyor (fwd / rev / overload)', desc: 'Forward by M-code or button toggle, reverse while button held, overload message.',
    params: [mP('mOn', 'Conveyor forward', 31), mP('mOff', 'Conveyor stop', 33)],
    define: (e) => def({ inputs: [inp('CHPFWPBI', 'Chip conveyor forward push button', 'panel'), inp('CHPRVPBI', 'Chip conveyor reverse push button (hold)', 'panel'), inp('CHPOLI', 'Chip conveyor overload OK (NC)')], outputs: [out('CHPFWO', 'Chip conveyor forward'), out('CHPRVO', 'Chip conveyor reverse')], mcodes: [{ code: e.p('mOn'), label: 'Conveyor forward' }, { code: e.p('mOff'), label: 'Conveyor stop' }], alarms: [al('CHPOLMS', 'CHIP CONVEYOR OVERLOAD', 'operator')] }),
    nets: (c) => {
      const st = c.r('CHPR', 'Chip conveyor forward ON')
      return [...onOff(c, { st, sym: 'CHPR', name: 'Chip conveyor', mOn: [c.p('mOn')], mOff: [c.p('mOff')], pb: c.x('CHPFWPBI'), extraOff: [and(g('*ESP'))] }),
        N('Chip conveyor forward', [rd(st), and(c.x('CHPOLI')), andn(c.x('CHPRVPBI')), wrt(c.y('CHPFWO'))]),
        N('Chip conveyor reverse (while held)', [rd(c.x('CHPRVPBI')), and(c.x('CHPOLI')), and(g('*ESP')), wrt(c.y('CHPRVO'))]),
        N('Chip conveyor overload message', [rdn(c.x('CHPOLI')), wrt(c.a('CHPOLMS'))])]
    } },
  { id: 'dust', group: 'Chip handling', name: 'Dust extraction', desc: 'Extractor runs while the spindle runs or in automatic operation.',
    define: () => def({ outputs: [out('DUSTO', 'Dust extractor')] }),
    nets: (c) => [N('Dust extractor', [rd(g('OP')), ...(c.has('spindle') ? [or(c.r('SPRUN', 'Spindle running (CW or CCW)'))] : []), wrt(c.y('DUSTO'))])] },
  { id: 'mistcoll', group: 'Chip handling', name: 'Mist collector', desc: 'Runs during automatic operation or while coolant is ON.',
    define: () => def({ outputs: [out('MSTCO', 'Mist collector')] }),
    nets: (c) => [N('Mist collector', [rd(g('OP')), ...(c.has('coolant') ? [or(c.r('COOLR', 'Coolant ON'))] : []), wrt(c.y('MSTCO'))])] },

  /* ---------------- Doors ---------------- */
  { id: 'door', group: 'Doors', name: 'Door interlock (safety door switch + lock)', desc: 'Lock in AUTO / spindle running; door must be closed & locked to start. Opening → feed hold, interlock, spindle stop. Setup key overrides.',
    define: () => def({ inputs: [inp('DRCLSI', 'Door closed switch'), inp('DRLCKI', 'Door locked confirm'), inp('DRKEYI', 'Door interlock override key (setup)', 'panel')], outputs: [out('DRLCKO', 'Door lock solenoid')], alarms: [al('DROPNMS', 'DOOR OPEN - CLOSE DOOR TO START', 'operator')] }),
    nets: (c) => {
      const OK = c.r('DROK', 'Door closed & locked (or override)')
      c.permit(OK); c.hold(OK, true); c.inter(OK, true); c.spStop(OK, true)
      return [
        N('Door lock (AUTO mode or spindle running)', [rd(c.auto()), ...(c.has('spindle') ? [or(c.r('SPRUN', 'Spindle running (CW or CCW)'))] : []), and(c.x('DRCLSI')), wrt(c.y('DRLCKO'))]),
        N('Door closed & locked (or setup override)', [rd(c.x('DRCLSI')), and(c.x('DRLCKI')), or(c.x('DRKEYI')), wrt(OK)]),
        N('Door open message', [rdn(c.x('DRCLSI')), andn(c.x('DRKEYI')), wrt(c.a('DROPNMS'))]),
      ]
    } },
  { id: 'autodoor', group: 'Doors', name: 'Automatic door (M80 / M81)', desc: 'Door cylinder open/close by M-code or push button; FIN on limit switch.',
    params: [mP('mOn', 'Door open', 80), mP('mOff', 'Door close', 81), timeoutP(8000)],
    define: (e) => def({ inputs: [inp('ADPBI', 'Auto door open/close push button', 'panel'), inp('ADOPNI', 'Auto door open LS'), inp('ADCLSI', 'Auto door closed LS')], outputs: [out('ADOPNO', 'Auto door open solenoid'), out('ADCLSO', 'Auto door close solenoid')], mcodes: [{ code: e.p('mOn'), label: 'Door open' }, { code: e.p('mOff'), label: 'Door close' }], alarms: [al('ADTOAL', 'AUTO DOOR TIMEOUT')] }),
    nets: (c) => twoPos(c, { st: 'ADR', name: 'Auto door', mOn: c.p('mOn'), mOff: c.p('mOff'), pb: c.x('ADPBI'), outOn: c.y('ADOPNO'), outOff: c.y('ADCLSO'), sensOn: c.x('ADOPNI'), sensOff: c.x('ADCLSI'), alarm: 'ADTOAL', timeout: c.p('timeout') }) },

  /* ---------------- Automation ---------------- */
  { id: 'partcatcher', group: 'Automation', name: 'Parts catcher', desc: 'Advance / retract by M-code; FIN on limit switch.',
    params: [mP('mOn', 'Parts catcher advance', 36), mP('mOff', 'Parts catcher retract', 37), timeoutP(5000)],
    define: (e) => def({ inputs: [inp('PCADVI', 'Parts catcher advanced'), inp('PCRETI', 'Parts catcher retracted')], outputs: [out('PCADVO', 'Parts catcher advance solenoid')], mcodes: [{ code: e.p('mOn'), label: 'Parts catcher advance' }, { code: e.p('mOff'), label: 'Parts catcher retract' }], alarms: [al('PCTOAL', 'PARTS CATCHER TIMEOUT')] }),
    nets: (c) => twoPos(c, { st: 'PCR', name: 'Parts catcher', mOn: c.p('mOn'), mOff: c.p('mOff'), outOn: c.y('PCADVO'), sensOn: c.x('PCADVI'), sensOff: c.x('PCRETI'), alarm: 'PCTOAL', timeout: c.p('timeout') }) },
  { id: 'barfeeder', group: 'Automation', name: 'Bar feeder interface', desc: 'Bar change M-code waits for bar feed complete; bar end message; bar feeder alarm blocks start.',
    params: [mP('mBar', 'Bar change / push', 60)],
    define: (e) => def({ inputs: [inp('BFALMI', 'Bar feeder OK (NC alarm contact)'), inp('BFENDI', 'Bar end'), inp('BFDNI', 'Bar feed complete')], outputs: [out('BFAUTO', 'CNC in automatic operation → bar feeder'), out('BFREQO', 'Bar change request → bar feeder')], mcodes: [{ code: e.p('mBar'), label: 'Bar change' }], alarms: [al('BFALMAL', 'BAR FEEDER ALARM'), al('BFENDMS', 'BAR END - LOAD NEW BARS', 'operator')] }),
    nets: (c) => {
      const m = c.m(c.p('mBar')); c.mfin(c.p('mBar'), c.x('BFDNI')); c.permit(c.x('BFALMI'))
      return [
        N('Automatic operation → bar feeder', [rd(g('OP')), wrt(c.y('BFAUTO'))]),
        N('Bar change request (until bar feed complete)', [rd(m), andn(c.x('BFDNI')), wrt(c.y('BFREQO'))]),
        N('Bar feeder alarm', [rdn(c.x('BFALMI')), wrt(c.a('BFALMAL'))]),
        N('Bar end message', [rd(c.x('BFENDI')), wrt(c.a('BFENDMS'))]),
      ]
    } },
  { id: 'robot', group: 'Automation', name: 'Robot / loader interface', desc: 'Handshake: machine ready, load/unload request by M-code, robot clear interlock, remote cycle start, robot alarm.',
    params: [mP('mReq', 'Robot load/unload request', 62)],
    define: (e) => def({
      inputs: [inp('RBSTI', 'Robot cycle start request'), inp('RBOUTI', 'Robot clear of machine'), inp('RBALMI', 'Robot OK (NC alarm contact)'), inp('RBDNI', 'Robot load/unload complete')],
      outputs: [out('RBRDYO', 'Machine ready for robot'), out('RBREQO', 'Load/unload request → robot')],
      mcodes: [{ code: e.p('mReq'), label: 'Robot request' }], alarms: [al('RBALMAL', 'ROBOT ALARM'), al('RBOUTMS', 'ROBOT INSIDE MACHINE AREA', 'operator')],
    }),
    nets: (c) => {
      const m = c.m(c.p('mReq')); c.mfin(c.p('mReq'), c.x('RBDNI')); c.permit(c.x('RBOUTI')); c.inter(c.x('RBOUTI'), true); c.startSrc(c.x('RBSTI'))
      return [
        N('Machine ready for robot (AUTO, no alarm, not running)', [rd(c.auto()), andn(g('AL')), andn(g('OP')), wrt(c.y('RBRDYO'))]),
        N('Load/unload request (until robot complete)', [rd(m), andn(c.x('RBDNI')), wrt(c.y('RBREQO'))]),
        N('Robot alarm', [rdn(c.x('RBALMI')), wrt(c.a('RBALMAL'))]),
        N('Robot inside machine message', [rdn(c.x('RBOUTI')), and(g('OP')), wrt(c.a('RBOUTMS'))]),
      ]
    } },
  { id: 'apc', group: 'Automation', name: 'Pallet changer (2-pallet rotary APC)', desc: 'M-code sequence: unclamp → lift → rotate 180° → lower → clamp. Needs the "pallet ready" button at the setup station.',
    params: [mP('mApc', 'Pallet change', 50), timeoutP(30000)],
    define: (e) => def({
      inputs: [inp('PLUCLI', 'Pallet unclamped'), inp('PLCLI', 'Pallet clamped'), inp('APCUPI', 'APC lifted'), inp('APCDNI', 'APC down'), inp('APC0I', 'APC at 0°'), inp('APC180I', 'APC at 180°'), inp('APCRDYPBI', 'Pallet ready push button (setup station)', 'panel')],
      outputs: [out('PLUCO', 'Pallet unclamp solenoid'), out('APCUPO', 'APC lift solenoid'), out('APC180O', 'APC rotate to 180°'), out('APC0O', 'APC rotate to 0°')],
      mcodes: [{ code: e.p('mApc'), label: 'Pallet change' }], alarms: [al('APCTOAL', 'PALLET CHANGER TIMEOUT'), al('APCRDMS', 'APC: PRESS PALLET READY', 'operator')],
    }),
    nets: (c) => {
      const m = c.m(c.p('mApc')), RDY = c.r('APCRDY', 'Pallet ready'), REQ = c.r('APCREQ', 'APC request'), DIR = c.r('APCDIR', 'APC rotate direction (1 = to 180°)'), RD = c.r('APCRD', 'APC rotation reached'), TO = c.r('APCTO', 'APC timeout timer')
      const seq = stepSeq(c, 'APC', 'APC', REQ, [{ cond: c.x('PLUCLI'), label: 'unclamp' }, { cond: c.x('APCUPI'), label: 'lift' }, { cond: RD, label: 'rotate' }, { cond: c.x('APCDNI'), label: 'lower' }, { cond: c.x('PLCLI'), label: 'clamp' }])
      const S = seq.steps
      c.mfin(c.p('mApc'), seq.DN); c.permit(c.x('PLCLI')); c.inter(REQ)
      return [
        N('Pallet ready (button, cleared after change)', [rd(c.x('APCRDYPBI')), or(RDY), andn(seq.DN), wrt(RDY)]),
        N('APC request (M-code + pallet ready)', [rd(m), and(RDY), andn(seq.DN), andn(RSTF()), wrt(REQ)]),
        N('APC: waiting for pallet ready message', [rd(m), andn(RDY), wrt(c.a('APCRDMS'))]),
        ...seq.nets,
        N('APC: direction = to 180° when at 0°', [rd(S[1]), and(c.x('APC0I')), set(DIR)]),
        N('APC: direction = to 0° when at 180°', [rd(S[1]), and(c.x('APC180I')), rst(DIR)]),
        N('APC: rotation reached', [...anyOf([[rd(DIR), and(c.x('APC180I'))], [rdn(DIR), and(c.x('APC0I'))]]), wrt(RD)]),
        N('APC: pallet unclamp (steps 1–4)', [...anyStep(S.slice(0, 4)), wrt(c.y('PLUCO'))]),
        N('APC: lift (steps 2–3)', [rd(S[1]), or(S[2]), wrt(c.y('APCUPO'))]),
        N('APC: rotate to 180°', [rd(S[2]), and(DIR), wrt(c.y('APC180O'))]),
        N('APC: rotate to 0°', [rd(S[2]), andn(DIR), wrt(c.y('APC0O'))]),
        N('APC: timeout timer', [rd(REQ), tmrb(c, c.p('timeout')), wrt(TO)]),
        latchAlarm(c, [rd(TO)], 'APCTOAL', 'APC timeout alarm'),
      ]
    } },

  /* ---------------- Measurement ---------------- */
  { id: 'probe', group: 'Measurement', name: 'Touch probe (skip X4.7)', desc: 'Probe signal on the fixed SKIP input; probe ON/OFF by M-code with start-up delay; battery / error messages.',
    params: [mP('mOn', 'Probe ON', 58), mP('mOff', 'Probe OFF', 59), { key: 'delay', label: 'Probe start-up delay', unit: 'ms', default: 1000, min: 0, max: 10000 }],
    define: (e) => def({ inputs: [inp('PRBSKPI', 'Probe trigger — SKIP fixed input', 'machine', { fixed: 'X4.7' }), inp('PRBLBI', 'Probe battery low'), inp('PRBERRI', 'Probe error')], outputs: [out('PRBONO', 'Probe start / ON')], mcodes: [{ code: e.p('mOn'), label: 'Probe ON' }, { code: e.p('mOff'), label: 'Probe OFF' }], alarms: [al('PRBERRAL', 'PROBE ERROR'), al('PRBLBMS', 'PROBE BATTERY LOW', 'operator')] }),
    nets: (c) => {
      const st = c.r('PRBR', 'Probe ON'), RDY = c.r('PRBRDY', 'Probe ready'); c.mfin(c.p('mOn'), RDY)
      return [...onOff(c, { st, sym: 'PRBR', name: 'Probe', mOn: [c.p('mOn')], mOff: [c.p('mOff')], reset: true, m30: true }),
        N('Probe ON output', [rd(st), wrt(c.y('PRBONO'))]),
        N('Probe start-up delay', [rd(st), tmrb(c, c.p('delay')), wrt(RDY)]),
        N('Probe error alarm', [rd(st), and(c.x('PRBERRI')), wrt(c.a('PRBERRAL'))]),
        N('Probe battery low message', [rd(c.x('PRBLBI')), wrt(c.a('PRBLBMS'))])]
    } },
  { id: 'presetter', group: 'Measurement', name: 'Tool presetter arm (lathe, XAE)', desc: 'Arm down/up by M-code or button; touch sensor on fixed XAE1/XAE2 (X4.0/X4.1). Spindle stop while arm is down.',
    params: [mP('mOn', 'Arm down', 38), mP('mOff', 'Arm up', 39), timeoutP(5000)],
    define: (e) => def({ inputs: [inp('XAE1I', 'Tool setter X touch — XAE1 fixed input', 'machine', { fixed: 'X4.0' }), inp('XAE2I', 'Tool setter Z touch — XAE2 fixed input', 'machine', { fixed: 'X4.1' }), inp('TSARMPBI', 'Tool setter arm push button', 'panel'), inp('TSARMDNI', 'Tool setter arm down'), inp('TSARMUPI', 'Tool setter arm up')], outputs: [out('TSARMO', 'Tool setter arm down solenoid')], mcodes: [{ code: e.p('mOn'), label: 'Setter arm down' }, { code: e.p('mOff'), label: 'Setter arm up' }], alarms: [al('TSARMAL', 'TOOL SETTER ARM TIMEOUT')] }),
    nets: (c) => { c.spStop(c.x('TSARMUPI'), true); return twoPos(c, { st: 'TSARMR', name: 'Tool setter arm', mOn: c.p('mOn'), mOff: c.p('mOff'), pb: c.x('TSARMPBI'), outOn: c.y('TSARMO'), sensOn: c.x('TSARMDNI'), sensOff: c.x('TSARMUPI'), alarm: 'TSARMAL', timeout: c.p('timeout') }) } },
  { id: 'workcounter', group: 'Measurement', name: 'Work counter', desc: 'Counts M30/M02 with CTRB; target reached → message and start blocked until reset button.',
    params: [{ key: 'target', label: 'Target count', unit: 'count', default: 100, min: 1, max: 32767 }],
    define: () => def({ inputs: [inp('WCRSTPBI', 'Work counter reset push button', 'panel')], alarms: [al('WCDNMS', 'WORK COUNT REACHED - RESET COUNTER', 'operator')] }),
    nets: (c) => {
      const P = c.r('WCP', 'Program end pulse'), UP = c.r('WCUP', 'Work count reached'); c.permit(UP, true)
      return [
        pulse(c, [rd(g('DM30')), or(g('DM02'))], P, 'Work counter: program end edge (DIFU)'),
        N('Work counter (CTRB: CN0, UPDOWN, RST, ACT)', [rd(OFF), rds(OFF), rds(c.x('WCRSTPBI')), rds(P), fn('CTRB', [c.counter(), c.p('target')]), wrt(UP)]),
        N('Work count reached message', [rd(UP), wrt(c.a('WCDNMS'))]),
      ]
    } },

  /* ---------------- Misc ---------------- */
  { id: 'signaltower', group: 'Misc', name: 'Signal tower lamps + buzzer', desc: 'Red = alarm (AL), amber = feed hold / M00 / M01, green = automatic operation (OP). Buzzer on alarm until silenced.',
    define: () => def({ inputs: [inp('BUZSTPBI', 'Buzzer stop push button', 'panel')], outputs: [out('TWRREDL', 'Signal tower red'), out('TWRYELL', 'Signal tower amber'), out('TWRGRNL', 'Signal tower green'), out('BUZZO', 'Alarm buzzer')] }),
    nets: (c) => {
      const S = c.r('BUZSTP', 'Buzzer silenced')
      return [
        N('Signal tower red (alarm)', [rd(g('AL')), wrt(c.y('TWRREDL'))]),
        N('Signal tower amber (feed hold / M00 / M01)', [rd(g('SPL')), or(g('DM00')), or(g('DM01')), wrt(c.y('TWRYELL'))]),
        N('Signal tower green (automatic operation)', [rd(g('OP')), wrt(c.y('TWRGRNL'))]),
        N('Buzzer silenced (until alarm clears)', [rd(c.x('BUZSTPBI')), or(S), and(g('AL')), wrt(S)]),
        N('Alarm buzzer', [rd(g('AL')), andn(S), wrt(c.y('BUZZO'))]),
      ]
    } },
  { id: 'worklight', group: 'Misc', name: 'Work light', desc: 'Push button toggles the work light.',
    define: () => def({ inputs: [inp('WKLTPBI', 'Work light push button', 'panel')], outputs: [out('WKLTO', 'Work light')] }),
    nets: (c) => onOff(c, { st: c.y('WKLTO'), sym: 'WKLT', name: 'Work light', pb: c.x('WKLTPBI') }) },
  { id: 'panelcooler', group: 'Misc', name: 'Electrical cabinet cooler', desc: 'Cabinet over-temperature / cooler alarm → operator message.',
    define: () => def({ inputs: [inp('PNLTMPI', 'Cabinet temperature high / cooler alarm')], alarms: [al('PNLTMPMS', 'ELECTRICAL CABINET TEMPERATURE HIGH', 'operator')] }),
    nets: (c) => [N('Cabinet temperature message', [rd(c.x('PNLTMPI')), wrt(c.a('PNLTMPMS'))])] },
]

const MODES = [
  { k: 'EDIT', n: 'EDIT', f: 'MEDT' }, { k: 'AUTO', n: 'AUTO (MEM)', f: 'MMEM' }, { k: 'MDI', n: 'MDI', f: 'MMDI' }, { k: 'DNC', n: 'DNC (RMT)', f: 'MRMT' },
  { k: 'JOG', n: 'JOG', f: 'MJ' }, { k: 'HND', n: 'HANDLE', f: 'MH' }, { k: 'REF', n: 'REF return', f: 'MREF' },
]
const PRG = [
  { k: 'SBK', n: 'Single block', s: 'SBK' }, { k: 'BDT', n: 'Block skip', s: 'BDT1' },
  { k: 'DRN', n: 'Dry run', s: 'DRN' }, { k: 'MLK', n: 'Machine lock', s: 'MLK' },
]

/** Second serial spindle (sub-spindle / live tool) on G74. */
function spindle2(c: Ctx, pre: string, name: string): NetDef[] {
  const mCw = c.m(c.p('mCw')), mCcw = c.m(c.p('mCcw')), mStop = c.m(c.p('mStop'))
  const CW = c.r(`${pre}CW`, `${name} CW`), CCW = c.r(`${pre}CCW`, `${name} CCW`), FIN = c.r(`${pre}FIN`, `${name} completion`), RUN = c.r(`${pre}RUN`, `${name} running`)
  c.mfin(c.p('mCw'), FIN); c.mfin(c.p('mCcw'), FIN); c.mfin(c.p('mStop'), RUN, true)
  return [
    N(`${name} *ESPB follows *ESP`, [rd(g('*ESP')), wrt(g('*ESPB'))], 1),
    N(`${name} CW`, [rd(mCw), or(CW), andn(mCcw), andn(mStop), andn(RSTF()), and(g('*ESP')), wrt(CW)]),
    N(`${name} CCW`, [rd(mCcw), or(CCW), andn(mCw), andn(mStop), andn(RSTF()), and(g('*ESP')), wrt(CCW)]),
    N(`${name} SFRB`, [rd(CW), wrt(g('SFRB'))]),
    N(`${name} SRVB`, [rd(CCW), wrt(g('SRVB'))]),
    N(`${name} MRDYB`, [rd(ON), wrt(g('MRDYB'))]),
    N(`${name} running`, [rd(CW), or(CCW), wrt(RUN)]),
    N(`${name} FIN delay`, [rd(RUN), tmrb(c, c.p('finDelay')), wrt(FIN)]),
  ]
}

export const accessoryById = (id: string) => ACCESSORIES.find((a) => a.id === id)

/** Default parameter values for an accessory. */
export const accParam = (a: Accessory, key: string, params: Record<string, number>) => params[`${a.id}.${key}`] ?? a.params?.find((p) => p.key === key)?.default ?? 0
