/**
 * Standard FANUC CNC <-> PMC interface signals (path 1).
 *
 * Addresses are the commonly documented ones for path 1 of the 0i-D/0i-F and 30i/31i/32i series.
 * They MUST be verified against the Connection Manual (Function) for the specific control, option set
 * and parameter settings before use. Where a bit was uncertain it has been omitted rather than guessed.
 *
 *   G = PMC -> CNC (the ladder writes it)
 *   F = CNC -> PMC (the ladder reads it)
 */
export interface StandardSignal {
  address: string
  symbol: string
  name: string
  description: string
  direction: 'G' | 'F'
  category: string
  machine: ('T' | 'M')[]
}

export const SIGNALS_NOTE =
  'Addresses are for path 1 of 0i-D/0i-F and 30i-series controls. Always verify against the FANUC Connection Manual (Function) for your control — options and parameters can move or disable signals.'

const TM: ('T' | 'M')[] = ['T', 'M']

const s = (address: string, symbol: string, name: string, description: string, category: string, machine: ('T' | 'M')[] = TM): StandardSignal => ({
  address, symbol, name, description, category, machine, direction: address.startsWith('G') ? 'G' : 'F',
})

/** Expand a run of bits: e.g. bits('G', 10, 0, 16, i => `*JV${i}`) → G10.0 … G11.7 */
function bits(area: 'G' | 'F', byte: number, count: number, sym: (i: number) => string, name: (i: number) => string, description: string, category: string, machine: ('T' | 'M')[] = TM, first = 0) {
  return Array.from({ length: count }, (_, k) => {
    const i = k + first
    return s(`${area}${byte + (k >> 3)}.${k & 7}`, sym(i), name(i), description, category, machine)
  })
}

/** Per-axis signals: one bit per controlled axis (1..4). */
const axes = (area: 'G' | 'F', byte: number, sym: string, name: string, description: string, category: string, machine: ('T' | 'M')[] = TM) =>
  [1, 2, 3, 4].map((n) => s(`${area}${byte}.${n - 1}`, sym.replace('#', String(n)), `${name} (axis ${n})`, description, category, machine))

const pad2 = (n: number) => String(n).padStart(2, '0')

const C = {
  safety: 'Emergency stop & reset',
  mode: 'Mode select',
  cycle: 'Cycle control',
  check: 'Program check',
  feed: 'Feedrate & override',
  jog: 'Jog & handle',
  ref: 'Reference return',
  interlock: 'Interlock & limits',
  aux: 'M/S/T/B functions',
  spindle: 'Spindle',
  serial: 'Serial spindle',
  status: 'CNC status',
  axis: 'Axis status',
  macro: 'Custom macro',
  ext: 'External data',
} as const

export const SIGNAL_CATEGORIES = Object.values(C)

export const STANDARD_SIGNALS: StandardSignal[] = [
  /* ---------------- G: PMC -> CNC ---------------- */
  s('G8.4', '*ESP', 'Emergency stop', 'Negative logic. 0 = emergency stop. Also read directly by the CNC from X8.4 on most controls.', C.safety),
  s('G8.7', 'ERS', 'External reset', '1 = reset the CNC (same as the MDI RESET key).', C.safety),
  s('G8.6', 'RRW', 'Reset & rewind', '1 = reset and rewind the program to its head.', C.safety),
  s('G8.5', '*SP', 'Feed hold', 'Negative logic. 0 = feed hold (automatic operation stops).', C.cycle),
  s('G7.2', 'ST', 'Cycle start', 'Automatic operation starts on the falling edge (1 → 0).', C.cycle),
  s('G7.1', 'STLK', 'Start lock', '1 = automatic operation start is inhibited.', C.cycle, ['T']),
  s('G8.0', '*IT', 'Interlock (all axes)', 'Negative logic. 0 = all axis movement is interlocked.', C.interlock),
  s('G8.1', '*CSL', 'Cutting block start interlock', 'Negative logic. 0 = cutting blocks do not start.', C.interlock),
  s('G8.3', '*BSL', 'Block start interlock', 'Negative logic. 0 = next block does not start.', C.interlock),
  s('G6.0', 'SRN', 'Program restart', '1 = program restart mode.', C.cycle),
  s('G6.2', '*ABSM', 'Manual absolute', 'Negative logic. 0 = manual absolute ON.', C.cycle),
  s('G6.4', 'OVC', 'Override cancel', '1 = feedrate override is fixed at 100%.', C.feed),
  s('G5.6', 'AFL', 'Auxiliary function lock', '1 = M/S/T/B codes are not output to the PMC.', C.check),

  s('G43.0', 'MD1', 'Mode select 1', 'MD4/MD2/MD1: 000 MDI, 001 MEM, 011 EDIT, 100 HANDLE/INC, 101 JOG, 110 TEACH-JOG, 111 TEACH-HANDLE. REF = JOG + ZRN, DNC = MEM + DNCI.', C.mode),
  s('G43.1', 'MD2', 'Mode select 2', 'See MD1 for the mode table.', C.mode),
  s('G43.2', 'MD4', 'Mode select 4', 'See MD1 for the mode table.', C.mode),
  s('G43.5', 'DNCI', 'DNC operation select', '1 with MEM mode = DNC (remote) operation.', C.mode),
  s('G43.7', 'ZRN', 'Manual reference return select', '1 with JOG mode = reference return (REF) mode.', C.mode),

  s('G4.3', 'FIN', 'Completion signal', 'End of M/S/T/B function processing.', C.aux),
  s('G5.0', 'MFIN', 'M function completion', 'High-speed M/S/T/B interface completion for M codes.', C.aux),
  s('G5.2', 'SFIN', 'S function completion', 'High-speed interface completion for S codes.', C.aux),
  s('G5.3', 'TFIN', 'T function completion', 'High-speed interface completion for T codes.', C.aux),
  s('G5.7', 'BFIN', 'B function completion', 'High-speed interface completion for B (2nd auxiliary) codes.', C.aux),

  s('G44.0', 'BDT1', 'Optional block skip', '1 = blocks starting with "/" are skipped.', C.check),
  s('G44.1', 'MLK', 'All-axis machine lock', '1 = axes do not move but positions update.', C.check),
  s('G46.1', 'SBK', 'Single block', '1 = stop after each block.', C.check),
  s('G46.7', 'DRN', 'Dry run', '1 = dry run feedrate is used instead of programmed F.', C.check),
  s('G46.3', 'KEY1', 'Memory protect key 1', '1 = program/tool offset editing allowed (exact meaning depends on parameters).', C.check),
  s('G46.4', 'KEY2', 'Memory protect key 2', 'Memory protection key.', C.check),
  s('G46.5', 'KEY3', 'Memory protect key 3', 'Memory protection key (program protect).', C.check),
  s('G46.6', 'KEY4', 'Memory protect key 4', 'Memory protection key.', C.check),
  s('G7.6', 'EXLM', 'Stored stroke limit select', '1 = second set of stored stroke limits is used.', C.interlock),
  s('G7.7', 'RLSOT', 'Stroke limit release', '1 = stored stroke check is disabled.', C.interlock),
  s('G7.5', '*FLWU', 'Follow-up', 'Negative logic. 0 = position follow-up while servo off / e-stop.', C.interlock),

  ...bits('G', 12, 8, (i) => `*FV${i}`, (i) => `Feedrate override bit ${i}`, 'Negative-logic binary feedrate override (0–254%). All 1s = 0%. Usually written from a rotary switch via CODB.', C.feed),
  ...bits('G', 10, 16, (i) => `*JV${i}`, (i) => `Manual feedrate override bit ${i}`, 'Negative-logic binary jog feedrate override (G10–G11).', C.feed),
  s('G14.0', 'ROV1', 'Rapid override 1', 'ROV2/ROV1: 00 100%, 01 50%, 10 25%, 11 F0.', C.feed),
  s('G14.1', 'ROV2', 'Rapid override 2', 'See ROV1.', C.feed),
  s('G96.7', 'HROV', '1% rapid override select', '1 = rapid override in 1% steps from *HROV0–*HROV6.', C.feed),
  ...bits('G', 30, 8, (i) => `SOV${i}`, (i) => `Spindle speed override bit ${i}`, 'Binary spindle speed override (0–254%).', C.feed),

  ...[1, 2, 3, 4].map((n) => s(`G100.${n - 1}`, `+J${n}`, `Jog + (axis ${n})`, 'Feed axis and direction select, plus direction.', C.jog)),
  ...[1, 2, 3, 4].map((n) => s(`G102.${n - 1}`, `-J${n}`, `Jog − (axis ${n})`, 'Feed axis and direction select, minus direction.', C.jog)),
  s('G19.7', 'RT', 'Manual rapid traverse', '1 = jog moves at rapid traverse rate.', C.jog),
  s('G19.4', 'MP1', 'Handle / increment multiplier 1', 'MP2/MP1: 00 ×1, 01 ×10, 10 ×m, 11 ×n (parameter).', C.jog),
  s('G19.5', 'MP2', 'Handle / increment multiplier 2', 'See MP1.', C.jog),
  s('G18.0', 'HS1A', '1st handle axis select A', 'HS1D–HS1A binary: axis number for manual pulse generator 1.', C.jog),
  s('G18.1', 'HS1B', '1st handle axis select B', 'See HS1A.', C.jog),
  s('G18.2', 'HS1C', '1st handle axis select C', 'See HS1A.', C.jog),
  s('G18.3', 'HS1D', '1st handle axis select D', 'See HS1A.', C.jog),
  s('G18.4', 'HS2A', '2nd handle axis select A', 'Axis select for manual pulse generator 2.', C.jog),
  s('G18.5', 'HS2B', '2nd handle axis select B', 'See HS2A.', C.jog),

  ...axes('G', 130, '*IT#', 'Interlock', 'Negative logic. 0 = this axis is interlocked.', C.interlock),
  ...axes('G', 114, '*+L#', 'Overtravel +', 'Negative logic. 0 = plus-direction overtravel limit reached.', C.interlock),
  ...axes('G', 116, '*-L#', 'Overtravel −', 'Negative logic. 0 = minus-direction overtravel limit reached.', C.interlock),
  ...axes('G', 132, '+MIT#', 'Interlock + direction', '1 = movement in the plus direction is interlocked.', C.interlock),
  ...axes('G', 134, '-MIT#', 'Interlock − direction', '1 = movement in the minus direction is interlocked.', C.interlock),
  ...axes('G', 108, 'MLK#', 'Machine lock', '1 = machine lock for this axis.', C.check),
  ...axes('G', 106, 'MI#', 'Mirror image', '1 = mirror image for this axis.', C.check),
  ...axes('G', 124, 'DTCH#', 'Controlled axis detach', '1 = axis is detached.', C.axis),
  ...axes('G', 126, 'SVF#', 'Servo off', '1 = servo off for this axis.', C.axis),
  ...axes('G', 136, 'EAX#', 'PMC axis select', '1 = axis is controlled by the PMC (axis control by PMC).', C.axis),

  s('G29.6', '*SSTP', 'Spindle stop', 'Negative logic. 0 = spindle speed command is 0.', C.spindle),
  s('G29.5', 'SOR', 'Spindle orientation', '1 = spindle rotates at the orientation speed (gear change).', C.spindle),
  s('G29.4', 'SAR', 'Spindle speed arrival', '1 = spindle at commanded speed; cutting feed may start (when enabled by parameter).', C.spindle),
  s('G28.1', 'GR1', 'Gear select 1', 'Gear in use (input) for spindle speed calculation.', C.spindle),
  s('G28.2', 'GR2', 'Gear select 2', 'See GR1.', C.spindle),
  s('G27.0', 'SWS1', 'Spindle 1 select', '1 = S command is output to spindle 1 (multi-spindle).', C.spindle),
  s('G27.1', 'SWS2', 'Spindle 2 select', '1 = S command is output to spindle 2.', C.spindle),
  s('G27.3', '*SSTP1', 'Spindle 1 stop', 'Negative logic, individual spindle stop.', C.spindle),
  s('G27.4', '*SSTP2', 'Spindle 2 stop', 'Negative logic, individual spindle stop.', C.spindle),
  s('G61.0', 'RGTAP', 'Rigid tapping', '1 = rigid tapping mode (M29 handled by the ladder).', C.spindle),

  s('G70.7', 'MRDYA', 'Machine ready (spindle 1)', '1 = serial spindle amplifier may run.', C.serial),
  s('G70.6', 'ORCMA', 'Orientation command (spindle 1)', '1 = orient the spindle.', C.serial),
  s('G70.5', 'SFRA', 'Spindle forward (spindle 1)', '1 = rotate CW (M03).', C.serial),
  s('G70.4', 'SRVA', 'Spindle reverse (spindle 1)', '1 = rotate CCW (M04).', C.serial),
  s('G70.3', 'CTH1A', 'Clutch/gear signal 1 (spindle 1)', 'Gear range selection for spindle parameters.', C.serial),
  s('G70.2', 'CTH2A', 'Clutch/gear signal 2 (spindle 1)', 'See CTH1A.', C.serial),
  s('G70.1', 'TLMHA', 'Torque limit high (spindle 1)', '1 = torque limit (high).', C.serial),
  s('G70.0', 'TLMLA', 'Torque limit low (spindle 1)', '1 = torque limit (low).', C.serial),
  s('G71.1', '*ESPA', 'Spindle emergency stop (spindle 1)', 'Negative logic. 0 = spindle amplifier emergency stop.', C.serial),
  s('G71.0', 'ARSTA', 'Spindle alarm reset (spindle 1)', '1 = reset spindle amplifier alarm.', C.serial),
  s('G71.2', 'SPSLA', 'Spindle select (spindle 1)', 'Spindle switching (main/sub winding).', C.serial),
  s('G71.4', 'SOCNA', 'Soft start/stop cancel (spindle 1)', '1 = soft start/stop cancelled.', C.serial),
  s('G72.2', 'NRROA', 'Short-cut orientation (spindle 1)', '1 = orientation by shortest path.', C.serial),
  s('G74.7', 'MRDYB', 'Machine ready (spindle 2)', '1 = second serial spindle may run.', C.serial),
  s('G74.6', 'ORCMB', 'Orientation command (spindle 2)', '1 = orient spindle 2.', C.serial),
  s('G74.5', 'SFRB', 'Spindle forward (spindle 2)', '1 = rotate spindle 2 CW.', C.serial),
  s('G74.4', 'SRVB', 'Spindle reverse (spindle 2)', '1 = rotate spindle 2 CCW.', C.serial),
  s('G75.1', '*ESPB', 'Spindle emergency stop (spindle 2)', 'Negative logic.', C.serial),
  s('G75.0', 'ARSTB', 'Spindle alarm reset (spindle 2)', '1 = reset spindle 2 alarm.', C.serial),

  s('G9.0', 'PN1', 'Workpiece number search 1', 'External program number search (binary PN16–PN1).', C.ext),
  s('G9.1', 'PN2', 'Workpiece number search 2', 'See PN1.', C.ext),
  s('G9.2', 'PN4', 'Workpiece number search 4', 'See PN1.', C.ext),
  s('G9.3', 'PN8', 'Workpiece number search 8', 'See PN1.', C.ext),
  s('G9.4', 'PN16', 'Workpiece number search 16', 'See PN1.', C.ext),
  s('G58.0', 'MINP', 'External program input start', '1 = start reading a program from an external device.', C.ext),
  s('G58.1', 'EXRD', 'External read start', '1 = start external read.', C.ext),
  s('G58.2', 'EXSTP', 'External read/punch stop', '1 = stop external read/punch.', C.ext),
  s('G58.3', 'EXWT', 'External punch start', '1 = start external punch.', C.ext),

  ...bits('G', 54, 16, (i) => `UI${String(i).padStart(3, '0')}`, (i) => `Custom macro input #${1000 + i}`, 'Custom macro input signal, read in a macro as system variable #1000–#1015.', C.macro),

  /* ---------------- F: CNC -> PMC ---------------- */
  s('F0.7', 'OP', 'Automatic operation', '1 = automatic operation in progress (cycle start lamp or feed hold).', C.status),
  s('F0.6', 'SA', 'Servo ready', '1 = servo is ready (after power-on, no servo alarm).', C.status),
  s('F0.5', 'STL', 'Cycle start lamp', '1 = automatic operation is running (cycle start lamp).', C.status),
  s('F0.4', 'SPL', 'Feed hold lamp', '1 = automatic operation is in feed hold.', C.status),
  s('F0.0', 'RWD', 'Rewinding', '1 = program rewinding.', C.status),
  s('F1.0', 'AL', 'Alarm', '1 = the CNC is in an alarm state.', C.status),
  s('F1.1', 'RST', 'Resetting', '1 = CNC reset in progress (RESET key, ERS, RRW or M30 reset).', C.status),
  s('F1.2', 'BAL', 'Battery alarm', '1 = CNC memory backup battery voltage low.', C.status),
  s('F1.3', 'DEN', 'Distribution end', '1 = move command finished; M/S/T/B may be completed.', C.status),
  s('F1.4', 'ENB', 'Spindle enable', '1 = spindle speed command is non-zero.', C.spindle),
  s('F1.5', 'TAP', 'Tapping', '1 = in tapping mode (G84/G74 or G63).', C.spindle),
  s('F1.7', 'MA', 'CNC ready', '1 = CNC is ready (power on, no system alarm).', C.status),
  s('F2.0', 'INCH', 'Inch input', '1 = inch input (G20) is selected.', C.status),
  s('F2.1', 'RPDO', 'Rapid traversing', '1 = rapid traverse in progress (automatic).', C.status),
  s('F2.2', 'CSS', 'Constant surface speed', '1 = constant surface speed (G96) mode.', C.status),
  s('F2.3', 'THRD', 'Thread cutting', '1 = thread cutting in progress.', C.status),
  s('F2.4', 'SRNMV', 'Program restart sequence', '1 = moving to the restart position.', C.status),
  s('F2.6', 'CUT', 'Cutting feed', '1 = cutting feed in progress.', C.status),
  s('F2.7', 'MDRN', 'Dry run check', '1 = dry run is active.', C.check),

  s('F3.0', 'MINC', 'Incremental feed mode', '1 = INC mode selected (mode check signal).', C.mode),
  s('F3.1', 'MH', 'Handle mode', '1 = HANDLE mode selected.', C.mode),
  s('F3.2', 'MJ', 'Jog mode', '1 = JOG mode selected.', C.mode),
  s('F3.3', 'MMDI', 'MDI mode', '1 = MDI mode selected.', C.mode),
  s('F3.4', 'MRMT', 'DNC mode', '1 = DNC (remote) mode selected.', C.mode),
  s('F3.5', 'MMEM', 'Memory (auto) mode', '1 = MEM mode selected.', C.mode),
  s('F3.6', 'MEDT', 'Edit mode', '1 = EDIT mode selected.', C.mode),
  s('F4.5', 'MREF', 'Reference return mode', '1 = REF mode selected.', C.mode),
  s('F4.0', 'MBDT1', 'Optional block skip check', '1 = BDT1 is active.', C.check),
  s('F4.1', 'MMLK', 'Machine lock check', '1 = all-axis machine lock is active.', C.check),
  s('F4.2', 'MABSM', 'Manual absolute check', '1 = manual absolute is active.', C.check),
  s('F4.3', 'MSBK', 'Single block check', '1 = single block is active.', C.check),
  s('F4.4', 'MAFL', 'Aux function lock check', '1 = auxiliary function lock is active.', C.check),

  s('F7.0', 'MF', 'M function strobe', '1 = an M code is output on F10–F13; read the code then return FIN.', C.aux),
  s('F7.2', 'SF', 'S function strobe', '1 = an S code is output on F22–F25.', C.aux),
  s('F7.3', 'TF', 'T function strobe', '1 = a T code is output on F26–F29.', C.aux),
  s('F7.7', 'BF', 'B function strobe', '1 = a B (2nd auxiliary) code is output on F30–F33.', C.aux),
  s('F9.7', 'DM00', 'M00 decoded', '1 = M00 (program stop) commanded.', C.aux),
  s('F9.6', 'DM01', 'M01 decoded', '1 = M01 (optional stop) commanded.', C.aux),
  s('F9.5', 'DM02', 'M02 decoded', '1 = M02 (end of program) commanded.', C.aux),
  s('F9.4', 'DM30', 'M30 decoded', '1 = M30 (end of program and rewind) commanded.', C.aux),
  ...bits('F', 10, 32, (i) => `M${pad2(i)}`, (i) => `M code bit ${i}`, 'Binary M code value (F10–F13), valid while MF = 1. Usually decoded with DECB.', C.aux),
  ...bits('F', 22, 32, (i) => `S${pad2(i)}`, (i) => `S code bit ${i}`, 'Binary S code value (F22–F25), valid while SF = 1.', C.aux),
  ...bits('F', 26, 32, (i) => `T${pad2(i)}`, (i) => `T code bit ${i}`, 'Binary T code value (F26–F29), valid while TF = 1.', C.aux),
  ...bits('F', 30, 8, (i) => `B${pad2(i)}`, (i) => `B code bit ${i}`, 'Binary B code value (F30–F33, first byte shown), valid while BF = 1.', C.aux, ['M']),

  s('F34.0', 'GR1O', 'Gear select output 1', 'Gear to select, decided by the CNC from the S code (M-series gear change).', C.spindle, ['M']),
  s('F34.1', 'GR2O', 'Gear select output 2', 'See GR1O.', C.spindle, ['M']),
  s('F34.2', 'GR3O', 'Gear select output 3', 'See GR1O.', C.spindle, ['M']),
  s('F35.0', 'SPAL', 'Spindle speed fluctuation alarm', '1 = actual speed deviates from the command beyond the allowed range.', C.spindle),
  ...bits('F', 40, 16, (i) => `AR${i}`, (i) => `Actual spindle speed bit ${i}`, 'Binary actual spindle speed (F40–F41).', C.spindle, ['T']),

  s('F45.0', 'ALMA', 'Spindle alarm (spindle 1)', '1 = serial spindle amplifier alarm.', C.serial),
  s('F45.1', 'SSTA', 'Speed zero (spindle 1)', '1 = spindle speed is zero.', C.serial),
  s('F45.2', 'SDTA', 'Speed detect (spindle 1)', '1 = spindle speed below the detection level.', C.serial),
  s('F45.3', 'SARA', 'Speed arrival (spindle 1)', '1 = spindle reached the commanded speed.', C.serial),
  s('F45.4', 'LDT1A', 'Load detect 1 (spindle 1)', '1 = load above detection level 1.', C.serial),
  s('F45.5', 'LDT2A', 'Load detect 2 (spindle 1)', '1 = load above detection level 2.', C.serial),
  s('F45.6', 'TLMA', 'Torque limiting (spindle 1)', '1 = spindle torque is being limited.', C.serial),
  s('F45.7', 'ORARA', 'Orientation complete (spindle 1)', '1 = spindle orientation completed.', C.serial),
  s('F49.0', 'ALMB', 'Spindle alarm (spindle 2)', '1 = spindle 2 amplifier alarm.', C.serial),
  s('F49.1', 'SSTB', 'Speed zero (spindle 2)', '1 = spindle 2 speed is zero.', C.serial),
  s('F49.3', 'SARB', 'Speed arrival (spindle 2)', '1 = spindle 2 reached commanded speed.', C.serial),
  s('F49.7', 'ORARB', 'Orientation complete (spindle 2)', '1 = spindle 2 orientation completed.', C.serial),

  s('F62.7', 'PRTSF', 'Required parts count reached', '1 = parts count reached the required count.', C.status),
  s('F64.0', 'TLCH', 'Tool change (tool life)', '1 = tool life of a group expired.', C.status, ['M']),

  ...bits('F', 54, 16, (i) => `UO${String(i).padStart(3, '0')}`, (i) => `Custom macro output #${1100 + i}`, 'Custom macro output signal, written in a macro via system variables #1100–#1115.', C.macro),

  ...axes('F', 94, 'ZP#', 'Reference position return end', '1 = axis is at the reference position.', C.ref),
  ...axes('F', 96, 'ZP2#', '2nd reference position', '1 = axis is at the 2nd reference position.', C.ref),
  ...axes('F', 120, 'ZRF#', 'Reference position established', '1 = reference position has been established.', C.ref),
  ...axes('F', 102, 'MV#', 'Axis moving', '1 = axis is moving.', C.axis),
  ...axes('F', 104, 'INP#', 'In-position', '1 = axis is in position.', C.axis),
  ...axes('F', 106, 'MVD#', 'Axis moving direction', '1 = axis is moving in the minus direction.', C.axis),
  ...axes('F', 110, 'MDTCH#', 'Controlled axis detach status', '1 = axis is detached.', C.axis),
  ...axes('F', 112, 'EADEN#', 'PMC axis distribution end', '1 = PMC axis control distribution completed.', C.axis),
]
