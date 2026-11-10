/**
 * SYNTHETIC demo project — a small, hand-written ladder for a generic 2-axis (X/Z) CNC lathe.
 * Written from scratch using standard FANUC interface signals; it is NOT taken from any real
 * machine backup. It exists so new users can explore the viewer without a file.
 */
import type { AlarmMessage, BasicOp, Instruction, MemoryArea, Net, PmcProject, SymbolEntry } from '@/core/types'
import { subByName } from '@/core/subs'

type Line = string | Instruction

/** "RD X8.4" | "AND.STK" → basic instruction. Functional instructions are passed as objects. */
const ins = (l: Line): Instruction => {
  if (typeof l !== 'string') return l
  const [op, address] = l.trim().split(/\s+/)
  return address ? { kind: 'basic', op: op as BasicOp, address } : { kind: 'basic', op: op as BasicOp }
}
const sub = (name: string, params: (number | string)[], table?: number[]): Instruction => ({ kind: 'sub', sub: subByName(name), name, params, ...(table ? { table } : {}) })

type NetDef = { level: Net['level']; comment: string; lines: Line[] }
const L1 = (comment: string, ...lines: Line[]): NetDef => ({ level: 1, comment, lines })
const L2 = (comment: string, ...lines: Line[]): NetDef => ({ level: 2, comment, lines })

/* Feed override rotary switch: 16 positions → 0…150 %. *FV0–*FV7 are negative logic, so store 255 − %. */
const FOV_TABLE = Array.from({ length: 16 }, (_, i) => 255 - i * 10)

const NETS: NetDef[] = [
  /* ---------- Level 1 ---------- */
  L1('Emergency stop to CNC (*ESP, negative logic)', 'RD X8.4', 'WRT G8.4'),
  L1('End of level 1', sub('END1', [])),

  /* ---------- Mode select (MD4/MD2/MD1 + ZRN) ---------- */
  L2('Mode select MD1: AUTO, EDIT, JOG, REF', 'RD X0.0', 'OR X0.1', 'OR X0.3', 'OR X0.5', 'WRT G43.0'),
  L2('Mode select MD2: EDIT', 'RD X0.1', 'WRT G43.1'),
  L2('Mode select MD4: HANDLE, JOG, REF', 'RD X0.4', 'OR X0.3', 'OR X0.5', 'WRT G43.2'),
  L2('Reference return select ZRN', 'RD X0.5', 'WRT G43.7'),

  /* ---------- Cycle control ---------- */
  L2('Cycle start — only with door closed and no CNC alarm', 'RD X0.6', 'AND R4.0', 'AND.NOT F1.0', 'WRT G7.2'),
  L2('Feed hold (NC push button → *SP)', 'RD X0.7', 'WRT G8.5'),
  L2('Single block switch', 'RD X1.5', 'WRT G46.1'),
  L2('Cycle start lamp', 'RD F0.5', 'WRT Y0.0'),
  L2('Feed hold lamp', 'RD F0.4', 'WRT Y0.1'),

  /* ---------- Jog / reference return ---------- */
  L2('+X reference return latch (REF mode, until ZP1)', 'RD X1.0', 'AND F4.5', 'OR R10.0', 'AND.NOT F94.0', 'AND.NOT F1.1', 'WRT R10.0'),
  L2('+X jog: JOG mode push button or REF latch', 'RD X1.0', 'AND F3.2', 'OR R10.0', 'WRT G100.0'),
  L2('−X jog', 'RD X1.1', 'AND F3.2', 'WRT G102.0'),
  L2('+Z reference return latch (REF mode, until ZP2)', 'RD X1.2', 'AND F4.5', 'OR R10.2', 'AND.NOT F94.1', 'AND.NOT F1.1', 'WRT R10.2'),
  L2('+Z jog: JOG mode push button or REF latch', 'RD X1.2', 'AND F3.2', 'OR R10.2', 'WRT G100.1'),
  L2('−Z jog', 'RD X1.3', 'AND F3.2', 'WRT G102.1'),
  L2('Manual rapid traverse', 'RD X1.4', 'WRT G19.7'),

  /* ---------- Feed override via CODB ---------- */
  L2('Feed override switch code (X4.0–X4.3) → R100', 'RD R9091.1', sub('AND', [1, 'X4', 15, 'R100'])),
  L2('Feed override: switch position → *FV0–*FV7 (table)', 'RD R9091.1', sub('CODB', [1, 16, 'R100', 'G12'], FOV_TABLE), 'WRT R3.7'),

  /* ---------- M code decode ---------- */
  L2('Decode M03–M10 → R1.0–R1.7', 'RD F7.0', sub('DECB', [1, 'F10', 3, 'R1'])),
  L2('Decode M11–M18 → R2.0–R2.7', 'RD F7.0', sub('DECB', [1, 'F10', 11, 'R2'])),

  /* ---------- Spindle ---------- */
  L2('Spindle amplifier ready / emergency stop', 'RD X8.4', 'WRT G71.1', 'WRT G70.7'),
  L2('Spindle stop signal *SSTP released', 'RD R9091.1', 'WRT G29.6'),
  L2('Spindle forward (M03 or manual CW) — needs chuck clamped',
    'RD R1.0', 'RD.STK X2.0', 'AND F3.2', 'OR.STK', 'OR G70.5', 'AND.NOT R1.2', 'AND.NOT R1.1', 'AND.NOT X2.2', 'AND.NOT F1.1', 'AND X3.0', 'AND X8.4', 'WRT G70.5'),
  L2('Spindle reverse (M04 or manual CCW) — needs chuck clamped',
    'RD R1.1', 'RD.STK X2.1', 'AND F3.2', 'OR.STK', 'OR G70.4', 'AND.NOT R1.2', 'AND.NOT R1.0', 'AND.NOT X2.2', 'AND.NOT F1.1', 'AND X3.0', 'AND X8.4', 'WRT G70.4'),

  /* ---------- Coolant ---------- */
  L2('Coolant push button one-shot', 'RD X2.3', sub('DIFU', [1]), 'WRT R2.1'),
  L2('Coolant pump: M08 on / M09 off / push button toggles',
    'RD R1.5', 'RD.STK R2.1', 'AND.NOT Y1.0', 'OR.STK', 'RD.STK Y1.0', 'AND.NOT R2.1', 'AND.NOT R1.6', 'AND.NOT F1.1', 'OR.STK', 'AND X8.4', 'WRT Y1.0'),

  /* ---------- Chuck ---------- */
  L2('Chuck foot switch one-shot — ignored during cycle or while spindle runs', 'RD X2.4', 'AND.NOT F0.5', 'AND.NOT G70.5', 'AND.NOT G70.4', sub('DIFU', [2]), 'WRT R2.2'),
  L2('Chuck clamp: M10 / foot switch toggle / M11 unclamp. Stays clamped in e-stop.',
    'RD R1.7', 'RD.STK R2.2', 'AND.NOT Y1.1', 'OR.STK', 'RD.STK Y1.1', 'AND.NOT R2.2', 'AND.NOT R2.0', 'OR.STK', 'WRT Y1.1'),
  L2('Chuck unclamp solenoid (double-solenoid valve)', 'RD.NOT Y1.1', 'WRT Y1.2'),

  /* ---------- Turret ---------- */
  L2('Turret position code (X5.0–X5.3) → R102', 'RD R9091.1', sub('AND', [1, 'X5', 15, 'R102'])),
  L2('Compare commanded tool (T code) with turret position', 'RD F7.3', sub('COMPB', [1, 'F26', 'R102']), 'WRT R3.1'),
  L2('Turret at commanded position', 'RD R9000.0', 'AND F7.3', 'WRT R3.2'),
  L2('Turret unlock while not at position', 'RD F7.3', 'AND.NOT R3.2', 'AND X8.4', 'AND.NOT A0.1', 'AND.NOT A0.4', 'WRT Y1.3'),
  L2('Turret motor CW once unlocked', 'RD Y1.3', 'AND X3.3', 'AND.NOT X4.6', 'WRT Y1.4'),
  L2('Turret index time-out (5 s)', 'RD Y1.3', 'AND.NOT X3.2', sub('TMRB', [1, 5000]), 'WRT R3.0'),
  L2('ALARM 1001 turret index time-out (held until reset)', 'RD R3.0', 'OR A0.1', 'AND.NOT F1.1', 'WRT A0.1'),

  /* ---------- Door ---------- */
  L2('Door interlock OK', 'RD X2.5', 'WRT R4.0'),
  L2('MSG 2000 door open', 'RD.NOT X2.5', 'WRT A1.0'),
  L2('Door lock while spindle runs', 'RD G70.5', 'OR G70.4', 'WRT Y1.7'),

  /* ---------- Lubrication ---------- */
  L2('Lube interval timer (30 min)', 'RD.NOT Y1.5', 'AND R9091.1', sub('TMRB', [2, 1800000]), 'WRT R3.4'),
  L2('Lube pump on until lube time elapsed', 'RD R3.4', 'OR Y1.5', 'AND.NOT R3.5', 'AND X8.4', 'WRT Y1.5'),
  L2('Lube run time (10 s)', 'RD Y1.5', sub('TMRB', [3, 10000]), 'WRT R3.5'),
  L2('MSG 2001 lube oil level low', 'RD.NOT X2.6', 'WRT A1.1'),
  L2('ALARM 1002 lube pressure not detected (8 s)', 'RD Y1.5', 'AND.NOT X2.7', sub('TMRB', [4, 8000]), 'WRT A0.2'),

  /* ---------- Other alarms ---------- */
  L2('ALARM 1000 emergency stop', 'RD.NOT X8.4', 'WRT A0.0'),
  L2('ALARM 1003 hydraulic pressure low (3 s)', 'RD.NOT X4.7', 'AND X8.4', sub('TMRB', [5, 3000]), 'WRT A0.3'),
  L2('ALARM 1004 turret motor overload', 'RD X4.6', 'WRT A0.4'),
  L2('ALARM 1005 chuck not clamped while spindle running', 'RD G70.5', 'OR G70.4', 'AND.NOT X3.0', 'WRT A0.5'),
  L2('ALARM 1006 spindle amplifier alarm', 'RD F45.0', 'WRT A0.6'),
  L2('MSG 2002 chuck unclamped', 'RD X3.1', 'WRT A1.2'),
  L2('Axis interlock *IT on hydraulic / turret alarms', 'RD.NOT A0.1', 'AND.NOT A0.3', 'AND.NOT A0.4', 'WRT G8.0'),

  /* ---------- Completion ---------- */
  L2('M code complete (chuck M10/M11 wait for confirmation)',
    'RD F7.0', 'AND.NOT R1.7', 'AND.NOT R2.0', 'RD.STK F7.0', 'AND R1.7', 'AND X3.0', 'OR.STK', 'RD.STK F7.0', 'AND R2.0', 'AND X3.1', 'OR.STK', 'WRT R5.0'),
  L2('T code complete (turret at position and locked)', 'RD F7.3', 'AND R3.2', 'AND X3.2', 'AND.NOT Y1.3', 'WRT R5.1'),
  L2('FIN to CNC', 'RD R5.0', 'OR R5.1', 'WRT G4.3'),

  /* ---------- Tower lamps ---------- */
  L2('Red tower lamp: CNC or PMC alarm', 'RD F1.0', 'OR A0.0', 'OR A0.1', 'OR A0.2', 'OR A0.3', 'OR A0.4', 'WRT Y0.2'),
  L2('Green tower lamp: CNC ready and no alarm', 'RD F1.7', 'AND.NOT F1.0', 'WRT Y0.3'),
  L2('End of level 2', sub('END2', [])),
]

const sym = (address: string, symbol: string, comment: string, group: string): SymbolEntry => ({ address, symbol, comment, group, source: 'custom' })

const SYMBOLS: SymbolEntry[] = [
  // Operator panel inputs
  sym('X8.4', 'EMGPBI', 'Emergency stop push button (NC)', 'Safety'),
  sym('X0.0', 'MEMKSI', 'Mode switch: AUTO (MEM)', 'Operator panel'),
  sym('X0.1', 'EDTKSI', 'Mode switch: EDIT', 'Operator panel'),
  sym('X0.2', 'MDIKSI', 'Mode switch: MDI', 'Operator panel'),
  sym('X0.3', 'JOGKSI', 'Mode switch: JOG', 'Operator panel'),
  sym('X0.4', 'HNDKSI', 'Mode switch: HANDLE', 'Operator panel'),
  sym('X0.5', 'REFKSI', 'Mode switch: REF return', 'Operator panel'),
  sym('X0.6', 'CSTPBI', 'Cycle start push button', 'Operator panel'),
  sym('X0.7', 'FHLDPBI', 'Feed hold push button (NC)', 'Operator panel'),
  sym('X1.0', '+XDIRI', 'Jog +X push button', 'Operator panel'),
  sym('X1.1', '-XDIRI', 'Jog -X push button', 'Operator panel'),
  sym('X1.2', '+ZDIRI', 'Jog +Z push button', 'Operator panel'),
  sym('X1.3', '-ZDIRI', 'Jog -Z push button', 'Operator panel'),
  sym('X1.4', 'RAPIDI', 'Rapid traverse push button', 'Operator panel'),
  sym('X1.5', 'SBKKSI', 'Single block switch', 'Operator panel'),
  sym('X2.0', 'SPCWPBI', 'Spindle CW push button (manual)', 'Spindle'),
  sym('X2.1', 'SPCCWPBI', 'Spindle CCW push button (manual)', 'Spindle'),
  sym('X2.2', 'SPSTPPBI', 'Spindle stop push button', 'Spindle'),
  sym('X2.3', 'CLTPBI', 'Coolant on/off push button', 'Coolant'),
  sym('X4.0', 'FOVAI', 'Feed override switch bit A', 'Operator panel'),
  sym('X4.1', 'FOVBI', 'Feed override switch bit B', 'Operator panel'),
  sym('X4.2', 'FOVCI', 'Feed override switch bit C', 'Operator panel'),
  sym('X4.3', 'FOVDI', 'Feed override switch bit D', 'Operator panel'),
  // Machine inputs
  sym('X2.4', 'CHKFSI', 'Chuck foot switch', 'Chuck'),
  sym('X2.5', 'DOORCLI', 'Front door closed limit switch', 'Safety'),
  sym('X2.6', 'LUBLVLI', 'Lube oil level OK (NC float)', 'Lubrication'),
  sym('X2.7', 'LUBPRSI', 'Lube pressure switch', 'Lubrication'),
  sym('X3.0', 'CHKCLI', 'Chuck clamped confirm', 'Chuck'),
  sym('X3.1', 'CHKUCLI', 'Chuck unclamped confirm', 'Chuck'),
  sym('X3.2', 'TURLKI', 'Turret locked confirm', 'Turret'),
  sym('X3.3', 'TURULI', 'Turret unlocked confirm', 'Turret'),
  sym('X4.6', 'TUROLI', 'Turret motor overload relay', 'Turret'),
  sym('X4.7', 'HYDPRSI', 'Hydraulic pressure OK', 'Hydraulic'),
  sym('X5.0', 'TCD1I', 'Turret position code bit 1', 'Turret'),
  sym('X5.1', 'TCD2I', 'Turret position code bit 2', 'Turret'),
  sym('X5.2', 'TCD4I', 'Turret position code bit 4', 'Turret'),
  sym('X5.3', 'TCD8I', 'Turret position code bit 8', 'Turret'),
  // Outputs
  sym('Y0.0', 'CSTLY', 'Cycle start lamp', 'Operator panel'),
  sym('Y0.1', 'FHLDLY', 'Feed hold lamp', 'Operator panel'),
  sym('Y0.2', 'TWRREDY', 'Tower lamp red (alarm)', 'Signal tower'),
  sym('Y0.3', 'TWRGRNY', 'Tower lamp green (ready)', 'Signal tower'),
  sym('Y1.0', 'CLTONY', 'Coolant pump contactor', 'Coolant'),
  sym('Y1.1', 'CHKCLY', 'Chuck clamp solenoid', 'Chuck'),
  sym('Y1.2', 'CHKUCY', 'Chuck unclamp solenoid', 'Chuck'),
  sym('Y1.3', 'TURULY', 'Turret unlock solenoid', 'Turret'),
  sym('Y1.4', 'TURCWY', 'Turret motor CW contactor', 'Turret'),
  sym('Y1.5', 'LUBONY', 'Lube pump', 'Lubrication'),
  sym('Y1.7', 'DOORLKY', 'Door lock solenoid', 'Safety'),
  // Internal relays
  sym('R1.0', 'M03', 'M03 spindle CW decoded', 'M codes'),
  sym('R1.1', 'M04', 'M04 spindle CCW decoded', 'M codes'),
  sym('R1.2', 'M05', 'M05 spindle stop decoded', 'M codes'),
  sym('R1.5', 'M08', 'M08 coolant on decoded', 'M codes'),
  sym('R1.6', 'M09', 'M09 coolant off decoded', 'M codes'),
  sym('R1.7', 'M10', 'M10 chuck clamp decoded', 'M codes'),
  sym('R2.0', 'M11', 'M11 chuck unclamp decoded', 'M codes'),
  sym('R2.1', 'CLTPLS', 'Coolant push button one-shot', 'Coolant'),
  sym('R2.2', 'CHKPLS', 'Chuck foot switch one-shot', 'Chuck'),
  sym('R3.0', 'TURTMO', 'Turret index time-out', 'Turret'),
  sym('R3.1', 'TCMPW1', 'COMPB executed', 'Turret'),
  sym('R3.2', 'TPOSOK', 'Turret at commanded position', 'Turret'),
  sym('R3.4', 'LUBINT', 'Lube interval elapsed', 'Lubrication'),
  sym('R3.5', 'LUBEND', 'Lube run time elapsed', 'Lubrication'),
  sym('R3.7', 'FOVERR', 'CODB error (override table)', 'Operator panel'),
  sym('R4.0', 'DOOROK', 'Door interlock OK', 'Safety'),
  sym('R5.0', 'MFINR', 'M code complete', 'M codes'),
  sym('R5.1', 'TFINR', 'T code complete', 'Turret'),
  sym('R10.0', '+XMOVL', '+X reference return latch', 'Axes'),
  sym('R10.2', '+ZMOVL', '+Z reference return latch', 'Axes'),
  sym('R100', 'FOVCOD', 'Feed override switch code (byte)', 'Operator panel'),
  sym('R102', 'TURPOS', 'Turret position (byte)', 'Turret'),
]

const MESSAGES: AlarmMessage[] = [
  { address: 'A0.0', number: '1000', text: 'EMERGENCY STOP', kind: 'alarm' },
  { address: 'A0.1', number: '1001', text: 'TURRET INDEX TIME-OUT', kind: 'alarm' },
  { address: 'A0.2', number: '1002', text: 'LUBE PRESSURE NOT DETECTED', kind: 'alarm' },
  { address: 'A0.3', number: '1003', text: 'HYDRAULIC PRESSURE LOW', kind: 'alarm' },
  { address: 'A0.4', number: '1004', text: 'TURRET MOTOR OVERLOAD', kind: 'alarm' },
  { address: 'A0.5', number: '1005', text: 'CHUCK NOT CLAMPED', kind: 'alarm' },
  { address: 'A0.6', number: '1006', text: 'SPINDLE AMPLIFIER ALARM', kind: 'alarm' },
  { address: 'A1.0', number: '2000', text: 'DOOR OPEN - CLOSE DOOR TO START', kind: 'operator' },
  { address: 'A1.1', number: '2001', text: 'LUBE OIL LEVEL LOW', kind: 'operator' },
  { address: 'A1.2', number: '2002', text: 'CHUCK UNCLAMPED', kind: 'operator' },
]

/** Typical 0i-F PMC memory map (sizes in bytes). */
const MEMORY_MAP: MemoryArea[] = [
  { letter: 'X', start: 0, size: 128, description: 'Input (I/O Link)' },
  { letter: 'Y', start: 0, size: 128, description: 'Output (I/O Link)' },
  { letter: 'F', start: 0, size: 768, description: 'CNC → PMC' },
  { letter: 'G', start: 0, size: 768, description: 'PMC → CNC' },
  { letter: 'R', start: 0, size: 8000, description: 'Internal relay' },
  { letter: 'R', start: 9000, size: 500, description: 'System relay' },
  { letter: 'E', start: 0, size: 10000, description: 'Extra relay' },
  { letter: 'A', start: 0, size: 250, description: 'Message request' },
  { letter: 'T', start: 0, size: 500, description: 'Variable timer' },
  { letter: 'C', start: 0, size: 400, description: 'Counter' },
  { letter: 'K', start: 0, size: 100, description: 'Keep relay' },
  { letter: 'K', start: 900, size: 100, description: 'System keep relay' },
  { letter: 'D', start: 0, size: 10000, description: 'Data table' },
]

const nets: Net[] = NETS.map((n, i) => ({ id: i + 1, level: n.level, comment: n.comment, instructions: n.lines.map(ins) }))

export const DEMO_PROJECT: PmcProject = {
  id: 'demo',
  name: 'Demo — 2-axis lathe',
  origin: 'demo',
  createdAt: Date.UTC(2026, 0, 1),
  info: {
    builder: 'Demo Machine Co. (synthetic)',
    machine: 'Generic 2-axis CNC lathe',
    control: 'FANUC 0i-TF',
    pmcType: '0i-F PMC',
    ladderVersion: 'DEMO 1.0',
    date: '2026-01-01',
    memo: 'Synthetic example written for PMC Generator. Not from a real machine — do not load onto a CNC.',
  },
  memoryMap: MEMORY_MAP,
  symbols: SYMBOLS,
  messages: MESSAGES,
  nets,
  warnings: ['This is a synthetic demo program for learning the viewer. It is not a real machine ladder.'],
  stats: { nets: nets.length, instructions: nets.reduce((a, n) => a + n.instructions.length, 0), unknownWords: 0 },
}

/** Fresh copy with a new id, ready to save into the store. */
export function createDemoProject(id: string): PmcProject {
  return { ...structuredClone(DEMO_PROJECT), id, createdAt: Date.now() }
}
