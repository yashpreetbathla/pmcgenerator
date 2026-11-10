import type { MemoryArea } from '@/core/types'

/**
 * FANUC controls and their PMC types.
 * All memory sizes are TYPICAL — verify against the FANUC PMC programming manual for your option set
 * (step count, extended R/D, I/O Link i channels etc. depend on the ordered PMC option).
 */
export const TYPICAL_NOTE = 'Typical values — verify against the FANUC PMC programming manual for your option set.'

export interface PmcTypeSpec {
  id: string
  name: string
  levels: 2 | 3
  steps: number
  /** number of TMRB fixed timers, DIFU/DIFD edges, CTRB counters available (typical) */
  tmrb: number
  difu: number
  ctrb: number
  areas: MemoryArea[]
  /** legacy PMC whose G/F interface differs from the i-series standard */
  legacy?: boolean
  note?: string
}

const ar = (letter: string, start: number, size: number, description: string): MemoryArea => ({ letter, start, size, description })

/** Build a memory map with the common areas. */
function mm(o: {
  x: [number, number][]
  fg: [number, number][]
  r: number
  e?: number
  a: number
  t: number
  c: number
  k: number
  d: number
  sys?: number
}): MemoryArea[] {
  const out: MemoryArea[] = []
  o.x.forEach(([s, n]) => out.push(ar('X', s, n, 'Input signal (machine → PMC)')))
  o.x.forEach(([s, n]) => out.push(ar('Y', s, n, 'Output signal (PMC → machine)')))
  o.fg.forEach(([s, n]) => out.push(ar('F', s, n, 'Input signal (CNC → PMC)')))
  o.fg.forEach(([s, n]) => out.push(ar('G', s, n, 'Output signal (PMC → CNC)')))
  out.push(ar('R', 0, o.r, 'Internal relay'))
  out.push(ar('R', 9000, o.sys ?? 500, 'System relay'))
  if (o.e) out.push(ar('E', 0, o.e, 'Extra relay'))
  out.push(ar('A', 0, o.a, 'Message display request'))
  out.push(ar('T', 0, o.t, 'Variable timer'))
  out.push(ar('C', 0, o.c, 'Counter'))
  out.push(ar('K', 0, o.k, 'Keep relay'))
  out.push(ar('K', 900, 100, 'System keep relay'))
  out.push(ar('D', 0, o.d, 'Data table'))
  return out
}

const X1: [number, number][] = [[0, 128]]
const X2: [number, number][] = [[0, 128], [200, 128]]
const X3: [number, number][] = [[0, 128], [200, 128], [400, 128]]
const X4: [number, number][] = [[0, 128], [200, 128], [400, 128], [600, 128]]
const FG1: [number, number][] = [[0, 256]]
const FG2: [number, number][] = [[0, 768], [1000, 768]]
const FG3: [number, number][] = [[0, 768], [1000, 768], [2000, 768]]
const FG10: [number, number][] = [[0, 768], [1000, 768], [2000, 768], [3000, 768]]

const pmc30i = (n: number): PmcTypeSpec => ({
  id: `30i-pmc${n}`,
  name: `30i PMC${n}`,
  levels: 3,
  steps: n === 1 ? 300000 : 100000,
  tmrb: 1500,
  difu: 3000,
  ctrb: 300,
  areas: mm({ x: X4, fg: FG10, r: n === 1 ? 60000 : 8000, e: 10000, a: n === 1 ? 1000 : 500, t: 1000, c: 800, k: n === 1 ? 900 : 100, d: n === 1 ? 60000 : 10000 }),
  note: n === 1 ? 'Main PMC. On 30i-B the system relays may be in the Z area (R9000 → Z0) — verify.' : 'Multi-path PMC (PMC2–PMC5) shares the I/O Link with PMC1 — assign X/Y per PMC in LADDER-III.',
})

export const PMC_TYPES: PmcTypeSpec[] = [
  { id: 'pmc-sa1', name: 'PMC-SA1', levels: 2, steps: 5000, tmrb: 100, difu: 256, ctrb: 100, areas: mm({ x: X1, fg: FG1, r: 1000, a: 25, t: 80, c: 80, k: 20, d: 1860, sys: 100 }) },
  { id: 'pmc-sa3', name: 'PMC-SA3', levels: 2, steps: 12000, tmrb: 100, difu: 256, ctrb: 100, areas: mm({ x: X1, fg: FG1, r: 1100, a: 25, t: 80, c: 80, k: 20, d: 1860, sys: 100 }) },
  { id: 'pmc-sa5', name: 'PMC-SA5', levels: 3, steps: 24000, tmrb: 100, difu: 512, ctrb: 100, areas: mm({ x: X1, fg: FG1, r: 1100, a: 25, t: 80, c: 80, k: 20, d: 1860, sys: 100 }) },
  { id: 'pmc-sb7', name: 'PMC-SB7', levels: 3, steps: 64000, tmrb: 1000, difu: 1000, ctrb: 100, areas: mm({ x: X2, fg: FG3, r: 8000, e: 8000, a: 250, t: 300, c: 400, k: 100, d: 10000 }) },
  { id: 'pmc-0id-l', name: '0i-D PMC/L', levels: 2, steps: 8000, tmrb: 100, difu: 256, ctrb: 100, areas: mm({ x: X1, fg: FG2, r: 1500, e: 10000, a: 250, t: 80, c: 80, k: 20, d: 3000 }) },
  { id: 'pmc-0id', name: '0i-D PMC', levels: 3, steps: 32000, tmrb: 500, difu: 1000, ctrb: 100, areas: mm({ x: X2, fg: FG2, r: 8000, e: 10000, a: 250, t: 500, c: 400, k: 100, d: 10000 }) },
  { id: 'pmc-0if', name: '0i-F PMC', levels: 3, steps: 32000, tmrb: 500, difu: 1000, ctrb: 100, areas: mm({ x: X3, fg: FG2, r: 8000, e: 10000, a: 250, t: 500, c: 400, k: 100, d: 10000 }) },
  { id: 'pmc-0if-l', name: '0i-F PMC/L', levels: 2, steps: 8000, tmrb: 100, difu: 256, ctrb: 100, areas: mm({ x: X1, fg: FG2, r: 1500, e: 10000, a: 250, t: 80, c: 80, k: 20, d: 3000 }) },
  { id: 'pmc-0ifp', name: '0i-F Plus PMC', levels: 3, steps: 64000, tmrb: 500, difu: 1000, ctrb: 100, areas: mm({ x: X3, fg: FG3, r: 8000, e: 10000, a: 250, t: 500, c: 400, k: 100, d: 10000 }) },
  pmc30i(1), pmc30i(2), pmc30i(3), pmc30i(4), pmc30i(5),
  { id: '30i-dcs', name: 'DCS PMC (Dual Check Safety)', levels: 2, steps: 5000, tmrb: 100, difu: 256, ctrb: 20, areas: mm({ x: X1, fg: FG1, r: 2000, a: 25, t: 80, c: 80, k: 20, d: 1000 }), note: 'Safety PMC — only safety I/O (doors, enabling switch, safe speed). Put the machine sequence in PMC1.' },
  { id: 'pmc-ra1', name: 'PMC-RA1 / RA3', levels: 2, steps: 5000, tmrb: 100, difu: 256, ctrb: 50, legacy: true, areas: mm({ x: X1, fg: FG1, r: 1000, a: 25, t: 80, c: 80, k: 20, d: 1860, sys: 100 }) },
  { id: 'pmc-rb5', name: 'PMC-RB5 / RB6', levels: 2, steps: 16000, tmrb: 100, difu: 256, ctrb: 100, legacy: true, areas: mm({ x: X1, fg: FG1, r: 1500, a: 125, t: 80, c: 80, k: 20, d: 3000, sys: 100 }) },
  { id: 'pmc-rc', name: 'PMC-RB3 / RB4 / RC3 / RC4', levels: 2, steps: 16000, tmrb: 50, difu: 128, ctrb: 50, legacy: true, areas: mm({ x: X1, fg: FG1, r: 1500, a: 25, t: 80, c: 80, k: 20, d: 3000, sys: 100 }) },
  { id: 'pmc-nb', name: 'PMC-NB / NB2 (Series 15)', levels: 2, steps: 16000, tmrb: 50, difu: 128, ctrb: 50, legacy: true, areas: mm({ x: X1, fg: FG1, r: 1600, a: 25, t: 80, c: 80, k: 20, d: 3000, sys: 100 }) },
  { id: 'pmc-l-0c', name: 'PMC-L / PMC-M (Series 0-C)', levels: 2, steps: 3000, tmrb: 0, difu: 0, ctrb: 20, legacy: true, areas: mm({ x: X1, fg: FG1, r: 600, a: 25, t: 48, c: 40, k: 20, d: 400, sys: 100 }), note: 'Series 0-C has a different G/F/X fixed-address layout and no TMRB/DIFU — the generated draft must be re-addressed.' },
]

export const pmcById = (id: string) => PMC_TYPES.find((p) => p.id === id)

export interface ControlSpec {
  id: string
  name: string
  family: string
  /** T = lathe, M = mill, P = punch press, TM = both */
  series: 'T' | 'M' | 'TM' | 'P'
  paths: number
  maxAxes: number
  pmc: string[] // PMC type ids (first = default)
  note?: string
}

const ALL_30I = ['30i-pmc1', '30i-pmc2', '30i-pmc3', '30i-pmc4', '30i-pmc5', '30i-dcs']

export const CONTROLS: ControlSpec[] = [
  // Series 0i
  { id: '0i-tf-plus', name: '0i-TF Plus', family: 'Series 0i-F Plus', series: 'T', paths: 2, maxAxes: 9, pmc: ['pmc-0ifp', 'pmc-0if-l', '30i-dcs'] },
  { id: '0i-mf-plus', name: '0i-MF Plus', family: 'Series 0i-F Plus', series: 'M', paths: 2, maxAxes: 9, pmc: ['pmc-0ifp', 'pmc-0if-l', '30i-dcs'] },
  { id: '0i-tf', name: '0i-TF', family: 'Series 0i-F', series: 'T', paths: 2, maxAxes: 9, pmc: ['pmc-0if', 'pmc-0if-l', '30i-dcs'] },
  { id: '0i-mf', name: '0i-MF', family: 'Series 0i-F', series: 'M', paths: 2, maxAxes: 9, pmc: ['pmc-0if', 'pmc-0if-l', '30i-dcs'] },
  { id: '0i-pf', name: '0i-PF (punch press)', family: 'Series 0i-F', series: 'P', paths: 1, maxAxes: 7, pmc: ['pmc-0if', 'pmc-0if-l'] },
  { id: '0i-td', name: '0i-TD', family: 'Series 0i-D', series: 'T', paths: 2, maxAxes: 8, pmc: ['pmc-0id', 'pmc-0id-l'] },
  { id: '0i-md', name: '0i-MD', family: 'Series 0i-D', series: 'M', paths: 1, maxAxes: 8, pmc: ['pmc-0id', 'pmc-0id-l'] },
  { id: '0i-mate-td', name: '0i Mate-TD', family: 'Series 0i-D', series: 'T', paths: 1, maxAxes: 3, pmc: ['pmc-0id-l'] },
  { id: '0i-mate-md', name: '0i Mate-MD', family: 'Series 0i-D', series: 'M', paths: 1, maxAxes: 4, pmc: ['pmc-0id-l'] },
  { id: '0i-tc', name: '0i-TC', family: 'Series 0i-C', series: 'T', paths: 1, maxAxes: 4, pmc: ['pmc-sb7', 'pmc-sa1'] },
  { id: '0i-mc', name: '0i-MC', family: 'Series 0i-C', series: 'M', paths: 1, maxAxes: 4, pmc: ['pmc-sb7', 'pmc-sa1'] },
  { id: '0i-mate-tc', name: '0i Mate-TC', family: 'Series 0i-C', series: 'T', paths: 1, maxAxes: 2, pmc: ['pmc-sa1'] },
  { id: '0i-mate-mc', name: '0i Mate-MC', family: 'Series 0i-C', series: 'M', paths: 1, maxAxes: 3, pmc: ['pmc-sa1'] },
  { id: '0i-tb', name: '0i-TB', family: 'Series 0i-B', series: 'T', paths: 1, maxAxes: 4, pmc: ['pmc-sa1', 'pmc-sb7'] },
  { id: '0i-mb', name: '0i-MB', family: 'Series 0i-B', series: 'M', paths: 1, maxAxes: 4, pmc: ['pmc-sa1', 'pmc-sb7'] },
  { id: '0i-mate-tb', name: '0i Mate-TB', family: 'Series 0i-B', series: 'T', paths: 1, maxAxes: 2, pmc: ['pmc-sa1'] },
  { id: '0i-mate-mb', name: '0i Mate-MB', family: 'Series 0i-B', series: 'M', paths: 1, maxAxes: 3, pmc: ['pmc-sa1'] },
  { id: '0i-ta', name: '0i-TA', family: 'Series 0i-A', series: 'T', paths: 1, maxAxes: 4, pmc: ['pmc-sa1', 'pmc-sa3'] },
  { id: '0i-ma', name: '0i-MA', family: 'Series 0i-A', series: 'M', paths: 1, maxAxes: 4, pmc: ['pmc-sa1', 'pmc-sa3'] },
  { id: '0i-mate-ta', name: '0i Mate-TA', family: 'Series 0i-A', series: 'T', paths: 1, maxAxes: 2, pmc: ['pmc-sa1'] },
  { id: '0i-mate-ma', name: '0i Mate-MA', family: 'Series 0i-A', series: 'M', paths: 1, maxAxes: 3, pmc: ['pmc-sa1'] },
  // Series 30i family
  { id: '30i-b-plus', name: '30i-B Plus', family: 'Series 30i/31i/32i/35i', series: 'TM', paths: 10, maxAxes: 32, pmc: ALL_30I },
  { id: '31i-b5-plus', name: '31i-B5 Plus / 31i-B Plus', family: 'Series 30i/31i/32i/35i', series: 'TM', paths: 4, maxAxes: 20, pmc: ALL_30I },
  { id: '32i-b-plus', name: '32i-B Plus', family: 'Series 30i/31i/32i/35i', series: 'TM', paths: 2, maxAxes: 9, pmc: ALL_30I },
  { id: '35i-b', name: '35i-B (transfer line)', family: 'Series 30i/31i/32i/35i', series: 'TM', paths: 4, maxAxes: 16, pmc: ALL_30I },
  { id: '30i-b', name: '30i-B', family: 'Series 30i/31i/32i/35i', series: 'TM', paths: 10, maxAxes: 32, pmc: ALL_30I },
  { id: '31i-b', name: '31i-B / 31i-B5', family: 'Series 30i/31i/32i/35i', series: 'TM', paths: 4, maxAxes: 20, pmc: ALL_30I },
  { id: '32i-b', name: '32i-B', family: 'Series 30i/31i/32i/35i', series: 'TM', paths: 2, maxAxes: 9, pmc: ALL_30I },
  { id: '30i-a', name: '30i-A / 31i-A / 32i-A', family: 'Series 30i/31i/32i/35i', series: 'TM', paths: 10, maxAxes: 32, pmc: ALL_30I },
  // Power Motion
  { id: 'pm-ia', name: 'Power Motion i-A', family: 'Power Motion', series: 'TM', paths: 4, maxAxes: 32, pmc: ['30i-pmc1', '30i-pmc2', '30i-dcs'] },
  { id: 'pm-id', name: 'Power Motion i-MODEL D', family: 'Power Motion', series: 'TM', paths: 2, maxAxes: 8, pmc: ['pmc-0id', 'pmc-0id-l'] },
  // 16i/18i/21i
  { id: '16i-b', name: '16i-B', family: 'Series 16i/18i/21i', series: 'TM', paths: 2, maxAxes: 8, pmc: ['pmc-sb7'] },
  { id: '18i-b', name: '18i-B', family: 'Series 16i/18i/21i', series: 'TM', paths: 2, maxAxes: 8, pmc: ['pmc-sb7'] },
  { id: '21i-b', name: '21i-B', family: 'Series 16i/18i/21i', series: 'TM', paths: 1, maxAxes: 5, pmc: ['pmc-sa1', 'pmc-sb7'] },
  { id: '16i-a', name: '16i-A', family: 'Series 16i/18i/21i', series: 'TM', paths: 2, maxAxes: 8, pmc: ['pmc-rb5', 'pmc-sa5'] },
  { id: '18i-a', name: '18i-A', family: 'Series 16i/18i/21i', series: 'TM', paths: 2, maxAxes: 6, pmc: ['pmc-rb5', 'pmc-sa5'] },
  { id: '21i-a', name: '21i-A', family: 'Series 16i/18i/21i', series: 'TM', paths: 1, maxAxes: 4, pmc: ['pmc-sa1', 'pmc-sa5'] },
  // Older series
  { id: '16-18-c', name: 'Series 16/18-C', family: 'Older series (15/16/18/21/0)', series: 'TM', paths: 2, maxAxes: 8, pmc: ['pmc-rc', 'pmc-rb5'] },
  { id: '16-18-b', name: 'Series 16/18-B', family: 'Older series (15/16/18/21/0)', series: 'TM', paths: 2, maxAxes: 8, pmc: ['pmc-rc'] },
  { id: '21-b', name: 'Series 21-B / 21-TB / 21-MB', family: 'Older series (15/16/18/21/0)', series: 'TM', paths: 1, maxAxes: 4, pmc: ['pmc-ra1'] },
  { id: '15-b', name: 'Series 15-B / 15i', family: 'Older series (15/16/18/21/0)', series: 'TM', paths: 2, maxAxes: 10, pmc: ['pmc-nb'] },
  { id: '0-c', name: 'Series 0-TC / 0-MC', family: 'Older series (15/16/18/21/0)', series: 'TM', paths: 1, maxAxes: 4, pmc: ['pmc-l-0c'] },
]

export const CUSTOM_CONTROL_ID = 'custom'
export const controlById = (id: string) => CONTROLS.find((c) => c.id === id)
export const CONTROL_FAMILIES = [...new Set(CONTROLS.map((c) => c.family))]

/** Area ranges of a PMC type for a letter. */
export const areaRanges = (pmc: PmcTypeSpec, letter: string) => pmc.areas.filter((a) => a.letter === letter && !(letter === 'R' && a.start >= 9000))

/* ------------------------------------------------------------------ */
/* Standard CNC ↔ PMC interface signals (i-series, path 1).           */
/* ------------------------------------------------------------------ */
export interface StdSignal { address: string; symbol: string; comment: string }

const S = (address: string, symbol: string, comment: string): StdSignal => ({ address, symbol, comment })
const axisBits = (byte: number, pre: string, comment: string, area = 'G') => Array.from({ length: 8 }, (_, i) => S(`${area}${byte}.${i}`, `${pre}${i + 1}`, `${comment} axis ${i + 1}`))

export const STANDARD_SIGNALS: StdSignal[] = [
  // Fixed X inputs
  S('X4.0', 'XAE1', 'Measuring position reached 1 (fixed input)'),
  S('X4.1', 'XAE2', 'Measuring position reached 2 (fixed input)'),
  S('X4.2', 'XAE3', 'Measuring position reached 3 (fixed input)'),
  S('X4.7', 'SKIP', 'Skip signal (fixed input)'),
  S('X8.4', '*ESP', 'Emergency stop (fixed input)'),
  ...Array.from({ length: 8 }, (_, i) => S(`X9.${i}`, `*DEC${i + 1}`, `Reference return deceleration axis ${i + 1} (fixed input)`)),
  // G — PMC → CNC
  S('G4.3', 'FIN', 'Completion signal (M/S/T/B)'),
  S('G5.0', 'MFIN', 'M function completion (high-speed M/S/T)'),
  S('G5.2', 'SFIN', 'S function completion (high-speed)'),
  S('G5.3', 'TFIN', 'T function completion (high-speed)'),
  S('G5.6', 'AFL', 'Auxiliary function lock'),
  S('G7.1', 'STLK', 'Start lock'),
  S('G7.2', 'ST', 'Cycle start'),
  S('G8.0', '*IT', 'Interlock (all axes)'),
  S('G8.4', '*ESP', 'Emergency stop'),
  S('G8.5', '*SP', 'Feed hold'),
  S('G8.6', 'RRW', 'Reset & rewind'),
  S('G8.7', 'ERS', 'External reset'),
  S('G1008.4', '*ESP#2', 'Emergency stop (path 2)'),
  S('G1008.5', '*SP#2', 'Feed hold (path 2)'),
  S('G10', '*JV0-7', 'Jog feedrate override (low byte, negative logic, 0.01%)'),
  S('G11', '*JV8-15', 'Jog feedrate override (high byte)'),
  S('G12', '*FV0-7', 'Feedrate override (negative logic, 1%)'),
  S('G14.0', 'ROV1', 'Rapid traverse override 1'),
  S('G14.1', 'ROV2', 'Rapid traverse override 2'),
  S('G18.0', 'HS1A', 'Manual handle axis select A'),
  S('G18.1', 'HS1B', 'Manual handle axis select B'),
  S('G18.2', 'HS1C', 'Manual handle axis select C'),
  S('G18.3', 'HS1D', 'Manual handle axis select D'),
  S('G19.4', 'MP1', 'Handle feed amount select 1'),
  S('G19.5', 'MP2', 'Handle feed amount select 2'),
  S('G19.7', 'RT', 'Manual rapid traverse select'),
  S('G28.1', 'GR1', 'Gear select 1'),
  S('G28.2', 'GR2', 'Gear select 2'),
  S('G29.4', 'SAR', 'Spindle speed arrival'),
  S('G29.5', 'SOR', 'Spindle orientation (stop position)'),
  S('G29.6', '*SSTP', 'Spindle stop'),
  S('G30', 'SOV0-7', 'Spindle speed override (1%)'),
  S('G43.0', 'MD1', 'Mode select 1'),
  S('G43.1', 'MD2', 'Mode select 2'),
  S('G43.2', 'MD4', 'Mode select 4'),
  S('G43.5', 'DNCI', 'DNC operation select'),
  S('G43.7', 'ZRN', 'Manual reference position return select'),
  S('G44.0', 'BDT1', 'Optional block skip'),
  S('G44.1', 'MLK', 'All-axis machine lock'),
  S('G46.1', 'SBK', 'Single block'),
  S('G46.3', 'KEY1', 'Memory protect key 1'),
  S('G46.4', 'KEY2', 'Memory protect key 2'),
  S('G46.5', 'KEY3', 'Memory protect key 3'),
  S('G46.6', 'KEY4', 'Memory protect key 4'),
  S('G46.7', 'DRN', 'Dry run'),
  S('G48.7', 'TLRST', 'Tool life reset'),
  S('G70.4', 'SRVA', 'Spindle CCW (serial spindle 1)'),
  S('G70.5', 'SFRA', 'Spindle CW (serial spindle 1)'),
  S('G70.6', 'ORCMA', 'Spindle orientation command (spindle 1)'),
  S('G70.7', 'MRDYA', 'Machine ready (spindle 1)'),
  S('G71.0', 'ARSTA', 'Spindle alarm reset (spindle 1)'),
  S('G71.1', '*ESPA', 'Spindle emergency stop (spindle 1)'),
  S('G74.4', 'SRVB', 'Spindle CCW (serial spindle 2)'),
  S('G74.5', 'SFRB', 'Spindle CW (serial spindle 2)'),
  S('G74.6', 'ORCMB', 'Spindle orientation command (spindle 2)'),
  S('G74.7', 'MRDYB', 'Machine ready (spindle 2)'),
  S('G75.1', '*ESPB', 'Spindle emergency stop (spindle 2)'),
  ...axisBits(100, '+J', 'Feed axis direction +'),
  ...axisBits(102, '-J', 'Feed axis direction −'),
  ...axisBits(114, '*+L', 'Overtravel +'),
  ...axisBits(116, '*-L', 'Overtravel −'),
  // F — CNC → PMC
  S('F0.4', 'SPL', 'Feed hold lamp'),
  S('F0.5', 'STL', 'Cycle start lamp'),
  S('F0.6', 'SA', 'Servo ready'),
  S('F0.7', 'OP', 'Automatic operation'),
  S('F1.0', 'AL', 'Alarm'),
  S('F1.1', 'RST', 'Resetting'),
  S('F1.2', 'BAL', 'Battery alarm'),
  S('F1.3', 'DEN', 'Distribution end'),
  S('F1.4', 'ENB', 'Spindle enable'),
  S('F1.7', 'MA', 'CNC ready'),
  S('F3.0', 'MINC', 'Incremental feed mode'),
  S('F3.1', 'MH', 'Handle feed mode'),
  S('F3.2', 'MJ', 'Jog mode'),
  S('F3.3', 'MMDI', 'MDI mode'),
  S('F3.4', 'MRMT', 'DNC operation mode'),
  S('F3.5', 'MMEM', 'Memory (AUTO) mode'),
  S('F3.6', 'MEDT', 'EDIT mode'),
  S('F4.5', 'MREF', 'Reference return mode'),
  S('F7.0', 'MF', 'M function strobe'),
  S('F7.2', 'SF', 'S function strobe'),
  S('F7.3', 'TF', 'T function strobe'),
  S('F9.4', 'DM30', 'Decode M30'),
  S('F9.5', 'DM02', 'Decode M02'),
  S('F9.6', 'DM01', 'Decode M01'),
  S('F9.7', 'DM00', 'Decode M00'),
  S('F10', 'M00-M07', 'M code (binary, F10–F13)'),
  S('F22', 'S00-S07', 'S code (binary, F22–F25)'),
  S('F26', 'T00-T07', 'T code (binary, F26–F29)'),
  S('F45.0', 'ALMA', 'Spindle alarm (spindle 1)'),
  S('F45.1', 'SSTA', 'Speed zero (spindle 1)'),
  S('F45.3', 'SARA', 'Speed arrival (spindle 1)'),
  S('F45.7', 'ORARA', 'Orientation complete (spindle 1)'),
  S('F64.0', 'TLCH', 'Tool change (tool life expired)'),
  ...axisBits(94, 'ZP', 'Reference position return completion', 'F'),
  ...axisBits(96, 'ZP2', '2nd reference position return completion', 'F'),
  ...axisBits(102, 'MV', 'Axis moving', 'F'),
  ...axisBits(106, 'MVD', 'Axis moving direction (1 = −)', 'F'),
  // System relays
  S('R9000.0', 'COMP.EQ', 'Operation result: equal (COMPB)'),
  S('R9000.1', 'COMP.LT', 'Operation result: A < B (COMPB)'),
  S('R9091.0', 'ALWAYS.OFF', 'System relay: always OFF'),
  S('R9091.1', 'ALWAYS.ON', 'System relay: always ON'),
]

const STD_BY_SYMBOL = new Map(STANDARD_SIGNALS.map((s) => [s.symbol, s]))
const STD_BY_ADDR = new Map(STANDARD_SIGNALS.map((s) => [s.address, s]))
export const stdAddr = (symbol: string) => {
  const s = STD_BY_SYMBOL.get(symbol)
  if (!s) throw new Error(`Unknown standard signal ${symbol}`)
  return s.address
}
export const stdByAddress = (address: string) => STD_BY_ADDR.get(address)
