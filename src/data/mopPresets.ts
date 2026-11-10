/**
 * Machine operator panels (MOP): pin sheets (connector, S.No, label) + front-panel layout,
 * and the label → signal synonym table used to apply a MOP to an I/O card.
 */
import { ACCESSORIES, accessoryById } from './accessories'
import { panelFuncById } from './panelFunctions'

export interface MopPin { conn: string; sno: number; label: string; /** panel reference, e.g. SW11 / L11 */ ref?: string }
/** One item on the front-panel drawing. in / lamp = [connector, S.No]. */
export interface MopItem {
  type: 'key' | 'knob' | 'lamp' | 'switch' | 'button' | 'hard' | 'blank' | 'display'
  label: string
  in?: [string, number]
  lamp?: [string, number]
  /** knob / display code bits */
  bits?: [string, number][]
  positions?: string[]
  note?: string
  /** wide item (grid columns) */
  span?: number
}
export interface MopSection { title: string; cols: number; items: MopItem[] }
export interface MopPreset {
  id: string
  name: string
  desc: string
  /** card template the main connectors live on */
  template: string
  pins: MopPin[]
  /** options this panel needs (conflicting options are switched off) */
  enable: string[]
  params?: Record<string, number>
  spares: { in: string[]; out: string[] }
  panel: MopSection[]
}

const sheet = (conn: string, rows: Record<number, string>, refs: Record<number, string> = {}): MopPin[] =>
  Object.entries(rows).map(([sno, label]) => ({ conn, sno: Number(sno), label, ...(refs[Number(sno)] ? { ref: refs[Number(sno)] } : {}) }))
const range = (a: number, b: number, label: string) => Object.fromEntries(Array.from({ length: b - a + 1 }, (_, i) => [a + i, label]))

/* ------------------------------------------------------------------ */
/* MP 225                                                              */
/* ------------------------------------------------------------------ */
const MP225_CE56 = {
  1: '0V', 2: '24V', 3: 'MODE 1', 4: 'MODE 2', 5: 'MODE 4', 6: 'SPINDLE 1', 7: 'SPINDLE 2', 8: 'SPINDLE 4', 9: 'FEED 1', 10: 'FEED 2', 11: 'FEED 4', 12: 'FEED 8',
  13: 'DUMMY (SW41)', 14: '-X', 15: 'DUMMY (SW43)', 16: 'RESET', 17: 'CYCLE START', 18: 'CYCLE STOP', 19: 'TURRET', 20: 'COOLANT', 21: 'TLSK', 22: 'DRN', 23: 'SBK',
  24: 'EDIT LOCK', 25: 'MLK', 26: 'BDT', 27: '0V', 28: 'NC', 29: 'NC', 30: 'NC', 31: 'AXES REF', 32: 'OPT', 33: 'LUB MAN', 34: 'OP/SP 1', 35: 'SPN OFF', 36: 'ALARM',
  37: 'PROG END', 38: 'CYCLE START', 39: 'OP/SP 2', 40: 'DRN', 41: 'SBK', 42: 'MLK', 43: 'BDT', 44: 'TURRET', 45: 'COOLANT', 46: 'TLSK', ...range(47, 50, '24E'),
}
const MP225_CE57 = {
  1: '0V', 2: '24V', 3: 'IN/SP 4', 4: 'DUMMY (SW21)', 5: 'RPD', 6: 'DUMMY (SW23)', 7: '+X', 8: '+Z', 9: 'AUTO REF', 10: 'LUB MAN', 11: '-Z', 12: 'OPT', 13: 'IN/SP 1',
  14: 'IN/SP 2', 15: 'IN/SP 3', 16: 'IN/SP 5', 17: 'IN/SP 6', 18: 'IN/SP 7', 19: 'DUMMY', 20: 'IN/SP 8', 21: 'IN/SP 9', 22: 'IN/SP 10', 23: 'SPN ON', 24: 'SPN OFF',
  25: 'CHUCK ID', 26: 'CHUCK OD', 27: 'NC', 28: '0V', 29: 'NC', 30: 'NC', 31: 'DUMMY (L21)', 32: 'RPD', 33: 'DUMMY (L23)', 34: '+X', 35: '+Z', 36: 'AUTO REF', 37: '-Z',
  38: 'RESET', 39: 'OP/SP 3', 40: 'CYCLE STOP', 41: 'SPN ON', 42: 'DUMMY (L41)', 43: '-X', 44: 'DUMMY (L43)', 45: 'OP/SP 4', 46: 'OP/SP 5', ...range(47, 50, '24E'),
}
const k = (label: string, i: [string, number] | undefined, l?: [string, number]): MopItem => ({ type: 'key', label, ...(i ? { in: i } : {}), ...(l ? { lamp: l } : {}) })

const MP225: MopPreset = {
  id: 'mp225', name: 'MP 225', template: 'op-ce56',
  desc: 'Lathe panel: mode / feed / spindle rotary switches (binary code), jog keys with LEDs, CE56 + CE57.',
  pins: [...sheet('CE56', MP225_CE56), ...sheet('CE57', MP225_CE57)],
  enable: ['moderot'],
  params: { 'feedovr.bits': 4 },
  spares: { in: ['CE57/13', 'CE57/14', 'CE57/15', 'CE57/3', 'CE57/16', 'CE57/17', 'CE57/18', 'CE57/20', 'CE57/21', 'CE57/22'], out: ['CE56/34', 'CE56/39', 'CE57/39', 'CE57/45', 'CE57/46'] },
  panel: [
    { title: 'Selectors and lamps', cols: 3, items: [
      { type: 'knob', label: 'Mode selector', bits: [['CE56', 3], ['CE56', 4], ['CE56', 5]], positions: ['EDIT', 'AUTO', 'MDI', 'JOG', 'X1', 'X10', 'X100', 'REF'] },
      { type: 'knob', label: 'Feed override', bits: [['CE56', 9], ['CE56', 10], ['CE56', 11], ['CE56', 12]], positions: ['0 … 120 %'] },
      { type: 'knob', label: 'Spindle override', bits: [['CE56', 6], ['CE56', 7], ['CE56', 8]], positions: ['50 … 120 %'] },
      { type: 'lamp', label: 'Axis ref', lamp: ['CE56', 31] }, { type: 'lamp', label: 'Prog end', lamp: ['CE56', 37] }, { type: 'lamp', label: 'Alarm', lamp: ['CE56', 36] },
    ] },
    { title: 'Keys', cols: 6, items: [
      k('RESET', ['CE56', 16], ['CE57', 38]), k('LUB MAN', ['CE57', 10], ['CE56', 33]), k('+X', ['CE57', 7], ['CE57', 34]), k('-X', ['CE56', 14], ['CE57', 43]), k('+Z', ['CE57', 8], ['CE57', 35]), k('-Z', ['CE57', 11], ['CE57', 37]),
      k('RPD', ['CE57', 5], ['CE57', 32]), k('AUTO REF', ['CE57', 9], ['CE57', 36]), k('OPT', ['CE57', 12], ['CE56', 32]), k('SBK', ['CE56', 23], ['CE56', 41]), k('DRN', ['CE56', 22], ['CE56', 40]), k('BDT', ['CE56', 26], ['CE56', 43]),
      k('MLK', ['CE56', 25], ['CE56', 42]), k('COOLANT', ['CE56', 20], ['CE56', 45]), k('TLSK', ['CE56', 21], ['CE56', 46]), k('TURRET', ['CE56', 19], ['CE56', 44]), k('SPN OFF', ['CE57', 24], ['CE56', 35]), k('SPN ON', ['CE57', 23], ['CE57', 41]),
      ...Array.from({ length: 6 }, (): MopItem => ({ type: 'blank', label: 'Spare key', note: 'Blank key — wire it to a spare input (IN/SP) and give that pin a function.' })),
    ] },
    { title: 'Switches and push buttons', cols: 4, items: [
      { type: 'switch', label: 'Program edit', in: ['CE56', 24], positions: ['OFF', 'ON'] },
      { type: 'switch', label: 'Chuck ID / OD', in: ['CE57', 25], bits: [['CE57', 25], ['CE57', 26]], positions: ['ID', 'OD'] },
      { type: 'button', label: 'Cycle stop', in: ['CE56', 18], lamp: ['CE57', 40] },
      { type: 'button', label: 'Cycle start', in: ['CE56', 17], lamp: ['CE56', 38] },
      { type: 'hard', label: 'CNC ON', note: 'Hard-wired to the CNC power ON circuit — no PMC input.' },
      { type: 'hard', label: 'CNC OFF', note: 'Hard-wired to the CNC power OFF circuit — no PMC input.' },
      { type: 'hard', label: 'Emergency stop', note: 'Hard-wired in the E-stop chain → *ESP fixed input X8.4 (not on CE56 / CE57).', span: 2 },
    ] },
  ],
}

/* ------------------------------------------------------------------ */
/* MP1010-01-ST                                                        */
/* ------------------------------------------------------------------ */
const MP1010_CE56 = {
  1: '0V', 2: '24V', 3: 'AUTO', 4: 'EDIT', 5: 'MDI', 6: 'JOG', 7: 'MPG', 8: 'ZRN', 9: 'SBK', 10: 'BDT', 11: 'DRN', 12: 'OPT', 13: 'MLK', 14: 'PROG CHECK', 15: 'X MPG',
  16: 'Z MPG', 17: '1', 18: '10', 19: '100', 20: 'CONTROL ON', 21: 'X+ LATCH', 22: 'COOL', 23: 'RAPID 0%', 24: 'RAPID 25%', 25: 'RAPID 50%', 26: 'RAPID 100%',
  27: '0V', 28: '0V', 29: 'NC', 30: 'NC', 31: 'AUTO LED', 32: 'EDIT LED', 33: 'MDI LED', 34: 'JOG LED', 35: 'MPG LED', 36: 'ZRN LED', 37: 'SBK LED', 38: 'BDT LED',
  39: 'DRN LED', 40: 'OPT LED', 41: 'MLK LED', 42: 'PROG CHECK LED', 43: 'X MPG LED', 44: 'Z MPG LED', 45: '1 LED', 46: '10 LED', ...range(47, 50, 'P24'),
}
const MP1010_CE56_REF = { 3: 'SW11', 4: 'SW12', 5: 'SW13', 6: 'SW14', 7: 'SW15', 8: 'SW16', 9: 'SW21', 10: 'SW22', 11: 'SW23', 12: 'SW24', 13: 'SW25', 14: 'SW26', 15: 'SW31', 16: 'SW32', 17: 'SW33', 18: 'SW34', 19: 'SW35', 20: 'SW36', 22: 'SW42', 23: 'SW43', 24: 'SW44', 25: 'SW45', 26: 'SW46',
  31: 'L11', 32: 'L12', 33: 'L13', 34: 'L14', 35: 'L15', 36: 'L16', 37: 'L21', 38: 'L22', 39: 'L23', 40: 'L24', 41: 'L25', 42: 'L26', 43: 'L31', 44: 'L32', 45: 'L33', 46: 'L34' }
const MP1010_CE57 = {
  1: '0V', 2: '24V', 3: 'Z- LATCH', 4: 'RAPID LATCH', 5: 'Z+ LATCH', 6: 'TURRET CCW', 7: 'TURRET CW', 8: 'CONVEYER FWD', 9: 'CONVEYER REV', 10: 'LUB SHOT', 11: 'X- LATCH',
  12: 'SPDL CCW', 13: 'SPDL STOP', 14: 'SPDL CW', 15: 'SPDL START STOP', 16: 'CYCLE START', 17: 'FEED HOLD', 18: 'EDIT KEY', 19: 'SPINDLE1', 20: 'SPINDLE2', 21: 'SPINDLE3',
  22: 'FEED1', 23: 'FEED2', 24: 'FEED4', 25: 'FEED8', 26: 'FEED16', 27: '0V', 28: '0V', 29: 'NC', 30: 'NC', 31: '100 LED', 32: 'CONTROL ON LED', 33: 'COOL LED',
  34: 'RAPID 0% LED', 35: 'RAPID 25% LED', 36: 'RAPID 50% LED', 37: 'RAPID 100% LED', 38: 'CONVEYER FWD LED', 39: 'CONVEYER REV LED', 40: 'LUB SHOT LED',
  41: 'SPDL CCW LED', 42: 'SPDL CW LED', 43: 'SPDL START STOP LED', 44: 'X REF LED', 45: 'Z REF LED', 46: 'PROG END LED', ...range(47, 50, 'P24'),
}
const MP1010_CE57_REF = { 3: 'SW51', 4: 'SW52', 5: 'SW53', 6: 'SW54', 7: 'SW55', 8: 'SW56', 9: 'SW57', 10: 'SW58', 12: 'SW62', 13: 'SW63', 14: 'SW64', 15: 'SW65',
  31: 'L35', 32: 'L36', 33: 'L42', 34: 'L43', 35: 'L44', 36: 'L45', 37: 'L46', 38: 'L56', 39: 'L57', 40: 'L58', 41: 'L62', 42: 'L64', 43: 'L65', 44: 'L71', 45: 'L72', 46: 'L73' }
const MKDS = { 1: 'TOOL1', 2: 'TOOL2', 3: 'TOOL4', 4: 'TOOL8', 5: 'FEED HOLD LED', 6: 'LUBE FAULT', 7: 'CYCLE START LED', 8: 'FEED HOLD LED' }

const MP1010: MopPreset = {
  id: 'mp1010', name: 'MP1010-01-ST', template: 'op-ce56',
  desc: 'Lathe panel with mode, MPG, rapid override keys (LED per key), Gray-code feed / spindle override, plus an 8-output terminal MKDS3/8.',
  pins: [...sheet('CE56', MP1010_CE56, MP1010_CE56_REF), ...sheet('CE57', MP1010_CE57, MP1010_CE57_REF), ...sheet('MKDS3/8', MKDS, { 5: 'L74', 6: 'L75' })],
  enable: ['mode', 'mpgkeys', 'rapidkeys'],
  params: { 'feedovr.bits': 5 },
  spares: { in: [], out: [] },
  panel: [
    { title: 'Mode and program keys', cols: 6, items: [
      k('AUTO', ['CE56', 3], ['CE56', 31]), k('EDIT', ['CE56', 4], ['CE56', 32]), k('MDI', ['CE56', 5], ['CE56', 33]), k('JOG', ['CE56', 6], ['CE56', 34]), k('MPG', ['CE56', 7], ['CE56', 35]), k('ZRN', ['CE56', 8], ['CE56', 36]),
      k('SBK', ['CE56', 9], ['CE56', 37]), k('BDT', ['CE56', 10], ['CE56', 38]), k('DRN', ['CE56', 11], ['CE56', 39]), k('OPT', ['CE56', 12], ['CE56', 40]), k('MLK', ['CE56', 13], ['CE56', 41]), k('PROG CHECK', ['CE56', 14], ['CE56', 42]),
      k('X MPG', ['CE56', 15], ['CE56', 43]), k('Z MPG', ['CE56', 16], ['CE56', 44]), k('×1', ['CE56', 17], ['CE56', 45]), k('×10', ['CE56', 18], ['CE56', 46]), k('×100', ['CE56', 19], ['CE57', 31]), k('CONTROL ON', ['CE56', 20], ['CE57', 32]),
    ] },
    { title: 'Jog, rapid and machine keys', cols: 6, items: [
      k('X+', ['CE56', 21]), k('COOL', ['CE56', 22], ['CE57', 33]), k('RAPID 0%', ['CE56', 23], ['CE57', 34]), k('RAPID 25%', ['CE56', 24], ['CE57', 35]), k('RAPID 50%', ['CE56', 25], ['CE57', 36]), k('RAPID 100%', ['CE56', 26], ['CE57', 37]),
      k('Z-', ['CE57', 3]), k('RAPID', ['CE57', 4]), k('Z+', ['CE57', 5]), k('X-', ['CE57', 11]), k('TURRET CCW', ['CE57', 6]), k('TURRET CW', ['CE57', 7]),
      k('CONV FWD', ['CE57', 8], ['CE57', 38]), k('CONV REV', ['CE57', 9], ['CE57', 39]), k('LUB SHOT', ['CE57', 10], ['CE57', 40]), k('SPDL CCW', ['CE57', 12], ['CE57', 41]), k('SPDL STOP', ['CE57', 13]), k('SPDL CW', ['CE57', 14], ['CE57', 42]),
      k('SPDL START STOP', ['CE57', 15], ['CE57', 43]),
    ] },
    { title: 'Overrides, lamps and buttons', cols: 4, items: [
      { type: 'knob', label: 'Spindle override', bits: [['CE57', 19], ['CE57', 20], ['CE57', 21]], positions: ['50 … 120 %'] },
      { type: 'knob', label: 'Feed override', bits: [['CE57', 22], ['CE57', 23], ['CE57', 24], ['CE57', 25], ['CE57', 26]], positions: ['0 … 120 %'] },
      { type: 'switch', label: 'Program edit key', in: ['CE57', 18], positions: ['OFF', 'ON'] },
      { type: 'display', label: 'Tool no. display', bits: [['MKDS3/8', 1], ['MKDS3/8', 2], ['MKDS3/8', 3], ['MKDS3/8', 4]] },
      { type: 'lamp', label: 'X ref', lamp: ['CE57', 44] }, { type: 'lamp', label: 'Z ref', lamp: ['CE57', 45] }, { type: 'lamp', label: 'Prog end', lamp: ['CE57', 46] }, { type: 'lamp', label: 'Lube fault', lamp: ['MKDS3/8', 6] },
      { type: 'button', label: 'Cycle start', in: ['CE57', 16], lamp: ['MKDS3/8', 7] }, { type: 'button', label: 'Feed hold', in: ['CE57', 17], lamp: ['MKDS3/8', 8] },
      { type: 'lamp', label: 'Feed hold (L74)', lamp: ['MKDS3/8', 5] },
    ] },
  ],
}

export const MOP_PRESETS: MopPreset[] = [MP225, MP1010]
export const mopById = (id?: string) => MOP_PRESETS.find((m) => m.id === id)

/* ================================================================== */
/* Label → function synonyms                                           */
/* ================================================================== */
export type PinClass = 'power' | 'none' | 'spare' | 'fn'

/** Normalized label: upper case, no LED / LAMP / LATCH words, no panel refs. */
export const normLabel = (s: string) => s.toUpperCase().replace(/\((SW|L)\d+\)/g, '').replace(/\b(LED|LAMP|LATCH|PB|SW\d+|L\d+)\b/g, ' ').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()

export function classify(label: string): PinClass {
  const n = label.toUpperCase().trim()
  if (/^(0 ?V|24 ?V|\+24 ?V|24E|P24|DOCOM|COM\d*|DICOM)$/.test(n)) return 'power'
  if (/^(NC|N\.C\.|DUMMY\b.*|UNUSED|-|—)$/.test(n) || n === '') return 'none'
  if (/^(IN|OP|OUT)\s*\/\s*SP\b|^SPARE\b/.test(n)) return 'spare'
  return 'fn'
}

interface Rule { re: RegExp; in?: string[]; out?: string[] }
const AX = '([XYZABCUVW])'
/** Candidates in order; "{A}" = axis letter, "{N}" = number from the label. */
const RULES: Rule[] = [
  { re: /^MODE ?(1|2|4)$/, in: ['moderot.MDSW{N}I'] },
  { re: /^(SPINDLE|SPDL|SP|SOV) ?(OVR )?(1|2|3|4)$/, in: ['spovr.SOV{N3}I'] },
  { re: /^(FEED|FOV|OVR) ?(OVR )?(1|2|4|8|16)$/, in: ['feedovr.OV{N}I'] },
  { re: new RegExp(`^([+-]) ?${AX}$`), in: ['jog.{S}{A}DIRI'], out: ['jog.{S}{A}MOVL'] },
  { re: new RegExp(`^${AX} ?([+-])$`), in: ['jog.{S}{A}DIRI'], out: ['jog.{S}{A}MOVL'] },
  { re: /^(RPD|RAPID|RAPID TRAVERSE)$/, in: ['jog.RAPIDPBI'], out: ['pf-rapidl.RPDL'] },
  { re: /^RAPID (F0|0) ?%?$/, in: ['rapidkeys.ROVF0PBI'], out: ['rapidkeys.ROVF0L'] },
  { re: /^RAPID (25|50|100) ?%?$/, in: ['rapidkeys.ROV{N}PBI'], out: ['rapidkeys.ROV{N}L'] },
  { re: /^(RESET|RST)$/, in: ['reset.RSTPBI'], out: ['pf-resetl.RSTL'] },
  { re: /^(CYCLE START|CYCLE ST|CYST|ST)$/, in: ['cycle.CYSTPBI'], out: ['cycle.CYSTL', 'pf-stl.STLL'] },
  { re: /^(CYCLE STOP|FEED HOLD|FEEDHOLD|FH)$/, in: ['cycle.FHLDPBI'], out: ['cycle.FHLDL', 'pf-spl.SPLL'] },
  { re: /^(TURRET|TURRET CW|TURRET INDEX)$/, in: ['turret.TMANPBI'], out: ['pf-turl.TURL'] },
  { re: /^(COOLANT|COOL|COOLANT ON)$/, in: ['coolant.COOLPBI'], out: ['coolant.COOLL'] },
  { re: /^(TLSK|TAILSTOCK|TAIL STOCK|T\/S)$/, in: ['tailstock.TSPBI'], out: ['pf-tsl.TSL'] },
  { re: /^(SBK|SINGLE BLOCK)$/, in: ['prgfunc.SBKPBI'], out: ['prgfunc.SBKL'] },
  { re: /^(DRN|DRY RUN)$/, in: ['prgfunc.DRNPBI'], out: ['prgfunc.DRNL'] },
  { re: /^(MLK|MACHINE LOCK)$/, in: ['prgfunc.MLKPBI'], out: ['prgfunc.MLKL'] },
  { re: /^(BDT|BLOCK DELETE|BLOCK SKIP)$/, in: ['prgfunc.BDTPBI'], out: ['prgfunc.BDTL'] },
  { re: /^(OPT|OPTIONAL STOP|OPT STOP|M01)$/, in: ['pf-optstop.OPTPBI'], out: ['pf-optstop.OPTL'] },
  { re: /^(EDIT LOCK|EDIT KEY|PROGRAM EDIT|PROG EDIT|PROGRAM EDIT KEY|PROGRAM PROTECT|MEMORY PROTECT|KEY)$/, in: ['memkey.KEYSWI'] },
  { re: /^(AUTO|MEM|MEMORY)$/, in: ['mode.AUTOPBI'], out: ['mode.AUTOL'] },
  { re: /^EDIT$/, in: ['mode.EDITPBI', 'memkey.KEYSWI'], out: ['mode.EDITL'] },
  { re: /^MDI$/, in: ['mode.MDIPBI'], out: ['mode.MDIL'] },
  { re: /^(DNC|RMT|REMOTE)$/, in: ['mode.DNCPBI'], out: ['mode.DNCL'] },
  { re: /^JOG$/, in: ['mode.JOGPBI'], out: ['mode.JOGL'] },
  { re: /^(MPG|HANDLE|HND)$/, in: ['mode.HNDPBI'], out: ['mode.HNDL'] },
  { re: /^(ZRN|REF|REF RETURN|ZERO RETURN|HOME)$/, in: ['mode.REFPBI'], out: ['mode.REFL', 'pf-refl.REFML'] },
  { re: /^(AUTO REF|AUTO ZRN)$/, out: ['pf-refl.REFML'] },
  { re: /^(AXES REF|AXIS REF|ALL REF|REF OK)$/, out: ['pf-zpall.ZPALLL'] },
  { re: new RegExp(`^${AX} (REF|ZRN|HOME)$`), out: ['refdone.{A}ZRNL'] },
  { re: new RegExp(`^${AX} (MPG|HANDLE)$`), in: ['mpgkeys.H{A}PBI', 'mpg.H{A}SELI'], out: ['mpgkeys.H{A}L'] },
  { re: /^(MPG )?[X×]? ?(1|10|100)$/, in: ['mpgkeys.MPX{N}PBI', 'mpg.MPX{N}I'], out: ['mpgkeys.MPX{N}L'] },
  { re: /^(LUB MAN|LUB SHOT|LUBE|LUB|MANUAL LUBE|LUBE MAN)$/, in: ['lube.LUBPBI'], out: ['pf-lubl.LUBL'] },
  { re: /^(LUBE FAULT|LUB FAULT|LUBE ALARM|LUB LOW)$/, out: ['pf-lubflt.LUBFLTL'] },
  { re: /^(SPN ON|SPDL CW|SPINDLE CW|SPINDLE ON|SP CW)$/, in: ['spindle.SPCWPBI'], out: ['spindle.SPCWL'] },
  { re: /^(SPN OFF|SPDL STOP|SPINDLE STOP|SPINDLE OFF|SP STOP)$/, in: ['spindle.SPSTPBI'], out: ['spindle.SPSTPL'] },
  { re: /^(SPDL CCW|SPINDLE CCW|SP CCW)$/, in: ['spindle.SPCCWPBI'], out: ['spindle.SPCCWL'] },
  { re: /^(CHUCK ID|CHUCK ID\/OD|ID\/OD)$/, in: ['chuck.CHKIDSWI'], out: ['pf-chkidl.CHKIDL'] },
  { re: /^(ALARM|ALM|ALARM LAMP)$/, out: ['pf-alarm.ALARML'] },
  { re: /^(PROG END|PROGRAM END|END)$/, out: ['pf-progend.PRGENDL'] },
  { re: /^(CONVEYER|CONVEYOR|CHIP CONV|CHIP) ?(FWD|FORWARD)$/, in: ['chipconv.CHPFWPBI'], out: ['pf-chpfwl.CHPFWL'] },
  { re: /^(CONVEYER|CONVEYOR|CHIP CONV|CHIP) ?(REV|REVERSE)$/, in: ['chipconv.CHPRVPBI'], out: ['pf-chprvl.CHPRVL'] },
  { re: /^TOOL ?(1|2|4|8)$/, out: ['pf-tooldisp.TDSP{N}O'] },
  { re: /^(WORK LIGHT|LIGHT)$/, in: ['worklight.WKLTPBI'] },
]

/** Option id of a signal id ("jog.+XDIRI" → "jog"). */
export const optionOf = (sig: string) => sig.slice(0, sig.indexOf('.'))
/** Display name of a signal's option (catalog or panel function). */
export const optionName = (id: string) => accessoryById(id)?.name ?? panelFuncById(id)?.name ?? id

/** Ordered candidate signal ids for a MOP label on a DI (in) or DO (out) pin. */
export function candidates(label: string, dir: 'in' | 'out', axes: string[]): string[] {
  const n = normLabel(label)
  const out: string[] = []
  for (const r of RULES) {
    const m = r.re.exec(n)
    if (!m) continue
    const list = dir === 'in' ? r.in : r.out
    if (!list) continue
    const sign = m.slice(1).find((x) => x === '+' || x === '-') ?? ''
    const axis = m.slice(1).find((x) => x && /^[XYZABCUVW]$/.test(x)) ?? ''
    const num = [...m.slice(1)].reverse().find((x) => x && /^\d+$/.test(x)) ?? ''
    for (const t of list) {
      if (t.includes('{A}') && !axes.includes(axis)) continue
      out.push(t.replace('{S}', sign).replace('{A}', axis).replace('{N3}', num === '3' ? '4' : num).replace('{N}', num))
    }
  }
  return [...new Set(out)]
}

/** Every catalog option id (for conflict lookups). */
const ALL = new Map(ACCESSORIES.map((a) => [a.id, a]))
export const conflictsOf = (id: string) => [...(ALL.get(id)?.conflicts ?? []), ...ACCESSORIES.filter((a) => a.conflicts?.includes(id)).map((a) => a.id)]

/* ================================================================== */
/* Paste parser                                                        */
/* ================================================================== */
const CONN_RE = /^(CE\d+|CB\d+|CN\d+|MKDS[\w/.-]*|[A-Z]{1,4}\d{1,3})$/i

/**
 * Parse a pasted MOP table. Accepts CSV / TSV / spaced lines: "CE56,3,MODE 1", "CE56 3 MODE 1", "CE56/3 MODE 1",
 * connector header lines ("CE56" or "CE56:") followed by "3 AUTO SW11" lines, and ranges "47-50 24E".
 * Lines without a label ("CE57 / 13" in a spare list) mark the pin as SPARE when it has no label yet.
 */
export function parseMopTable(text: string, defaultConn = 'CE56'): { pins: MopPin[]; skipped: string[] } {
  const pins = new Map<string, MopPin>()
  const skipped: string[] = []
  let conn = defaultConn
  const add = (c: string, sno: number, label: string, ref?: string) => {
    const key = `${c}/${sno}`
    if (!label) { if (!pins.has(key)) pins.set(key, { conn: c, sno, label: 'SPARE' }); return }
    pins.set(key, { conn: c, sno, label, ...(ref ? { ref } : {}) })
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/["']/g, '').trim()
    if (!line) continue
    if (/spare/i.test(line) && /[A-Z]+[\w.-]*\d\s*\/\s*\d+/i.test(line)) {
      // "Input spares: CE57/13, 14, 15, CE56/34"
      let sc = conn
      for (const m of line.replace(/^[^:]*:/, '').matchAll(/([A-Z]+[\w.-]*\d)\s*\/\s*(\d+)|(\d+)/gi)) {
        if (m[1]) { sc = m[1].toUpperCase(); add(sc, Number(m[2]), '') } else add(sc, Number(m[3]), '')
      }
      continue
    }
    const cells = line.split(/\s*[,;\t]\s*/).filter((x, i, a) => x !== '' || i < a.length - 1)
    let toks: string[] = cells.length >= 2 ? cells : line.split(/\s+/)
    // "CE56/3" or "CE56 / 3"
    const slash = /^([A-Z]+[\w.-]*\d)\s*\/\s*(\d+)(?:\s+(.*))?$/i.exec(line)
    if (slash && CONN_RE.test(slash[1])) {
      // spare lists may contain several refs: "CE57/13, CE57/14"
      const refs = [...line.matchAll(/([A-Z]+[\w.-]*\d)\s*\/\s*(\d+)/gi)]
      if (refs.length > 1) { for (const r of refs) add(r[1].toUpperCase(), Number(r[2]), ''); continue }
      toks = [slash[1], slash[2], ...(slash[3] ? [slash[3]] : [])]
    }
    if (toks.length === 1 || (toks.length === 1 && /:$/.test(toks[0]))) {
      const c = toks[0].replace(/:$/, '')
      if (CONN_RE.test(c) && !/^\d+$/.test(c)) { conn = c.toUpperCase(); continue }
    }
    if (/:$/.test(toks[0]) && CONN_RE.test(toks[0].slice(0, -1))) { conn = toks[0].slice(0, -1).toUpperCase(); toks = toks.slice(1); if (!toks.length) continue }
    let c = conn
    if (toks.length >= 2 && CONN_RE.test(toks[0]) && /^\d+(\s*[-–]\s*\d+)?$/.test(toks[1])) { c = toks[0].toUpperCase(); toks = toks.slice(1) }
    const num = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(toks[0] ?? '')
    if (!num) { if (!/^(S\.?\s*NO|PIN|CONNECTOR)/i.test(line)) skipped.push(raw); continue }
    let rest = toks.slice(1).join(' ').trim()
    // trailing panel reference SW11 / L11
    const refM = /\s+((?:SW|L)\d+)$/i.exec(rest)
    const ref = refM ? refM[1].toUpperCase() : undefined
    if (refM) rest = rest.slice(0, refM.index).trim()
    const a = Number(num[1]), b = num[2] ? Number(num[2]) : a
    if (b < a || b - a > 60 || a < 1) { skipped.push(raw); continue }
    for (let s = a; s <= b; s++) add(c, s, rest, ref)
  }
  return { pins: [...pins.values()], skipped }
}
