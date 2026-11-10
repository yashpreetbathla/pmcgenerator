/** Plain-language explanations of FANUC LADDER-III / PMC terms. */
export interface GlossaryTerm {
  term: string
  also?: string
  category: 'Program' | 'Ladder' | 'Address' | 'Tools'
  description: string
}

export const GLOSSARY: GlossaryTerm[] = [
  /* Program structure */
  { term: 'Title', category: 'Program', description: 'Header data of a PMC program: machine-tool builder, machine name, PMC/control type, program number, version, author and date. Shown on the PMC title screen.' },
  { term: 'System Parameter', category: 'Program', description: 'Program-wide settings stored with the ladder, e.g. counter data type (BCD/binary), message language, and execution options for the PMC.' },
  { term: 'Symbol Comment', also: 'Symbol table', category: 'Program', description: 'Table that gives an address (e.g. X8.4) a short symbol (EMGPBI) and a longer comment (“Emergency stop push button”). Makes the ladder readable; it does not change logic.' },
  { term: 'Message', also: 'Alarm / operator message', category: 'Program', description: 'Text shown on the CNC alarm screen when the matching A-relay bit turns on. Numbers 1000–1999 are alarms (stop the machine), 2000–2999 are operator messages.' },
  { term: 'I/O Module', also: 'I/O Link assignment', category: 'Program', description: 'Assignment of physical I/O Link modules (group/base/slot) to X and Y addresses. Wrong assignment means inputs/outputs appear at unexpected addresses.' },
  { term: 'Ladder', category: 'Program', description: 'The PMC sequence program itself, drawn as relay rungs between two power rails. Executed cyclically by the PMC.' },
  { term: 'Level 1', category: 'Program', description: 'High-speed part of the ladder, executed every 8 ms (4 ms on some controls). Keep it short: emergency stop and time-critical signals only. Ends with END1.' },
  { term: 'Level 2', category: 'Program', description: 'Main part of the ladder. Divided and executed over several cycles, so long programs give a longer scan time. Ends with END2.' },
  { term: 'Level 3', category: 'Program', description: 'Low-priority part executed when time remains, used for slow logic such as lamps or statistics. Ends with END3 (optional).' },
  { term: 'Subprogram', also: 'P address', category: 'Program', description: 'Reusable block of ladder (P1, P2…) started with SP and finished with SPE, called from Level 2 with CALL (conditional) or CALLU (unconditional).' },

  /* Ladder elements */
  { term: 'Net', also: 'Rung', category: 'Ladder', description: 'One rung of ladder logic: input conditions on the left, output(s) on the right. Nets are numbered in order.' },
  { term: 'Contact (A)', also: 'Normally open', category: 'Ladder', description: 'Passes power when the bit is 1. Mnemonic RD / AND / OR.' },
  { term: 'Contact (B)', also: 'Normally closed', category: 'Ladder', description: 'Passes power when the bit is 0. Mnemonic RD.NOT / AND.NOT / OR.NOT.' },
  { term: 'Coil', category: 'Ladder', description: 'Output of a net. WRT writes the result, WRT.NOT writes the inverse, SET latches the bit on and RST clears it.' },
  { term: 'Functional Instruction', also: 'SUB', category: 'Ladder', description: 'Box instruction with a SUB number, e.g. TMRB (SUB 24) timer, CTR counter, DECB decode, CODB table conversion, MOVB move, COMPB compare. ACT input enables it.' },
  { term: 'Mnemonic', category: 'Ladder', description: 'Text form of the ladder: RD, AND, OR, WRT, RD.STK, AND.STK, SUB 24 … One line per instruction. Useful for printing and for comparing programs.' },

  /* Addresses */
  { term: 'X', also: 'Input', category: 'Address', description: 'Inputs from the machine (push buttons, limit switches, sensors) via I/O Link. X8.4 is normally the hardwired emergency stop.' },
  { term: 'Y', also: 'Output', category: 'Address', description: 'Outputs to the machine (solenoids, contactors, lamps) via I/O Link.' },
  { term: 'F', also: 'CNC → PMC', category: 'Address', description: 'Status signals written by the CNC and read by the ladder, e.g. F0.5 STL cycle start lamp, F7.0 MF M-code strobe.' },
  { term: 'G', also: 'PMC → CNC', category: 'Address', description: 'Command signals written by the ladder and read by the CNC, e.g. G8.4 *ESP, G7.2 ST cycle start, G43 mode select.' },
  { term: 'Internal relay R', category: 'Address', description: 'Working bits/bytes inside the PMC, cleared at power-on. R9000+ is the system relay area (e.g. R9091.1 always ON on many controls).' },
  { term: 'Extra relay E', category: 'Address', description: 'Additional internal relays, similar to R. Often used by machine builders for options or shared with subprograms.' },
  { term: 'Keep relay K', category: 'Address', description: 'Non-volatile bits kept through power-off, set on the PMC KEEP RELAY screen. Used for machine options and settings. K900+ are system keep relays.' },
  { term: 'Data table D', category: 'Address', description: 'Non-volatile data area (bytes/words) for tool tables, positions and parameters set on the DATA TABLE screen.' },
  { term: 'Timer T', category: 'Address', description: 'Preset area for variable timers (TMR). Each timer uses 2 bytes. Fixed timers (TMRB) keep their preset in the program instead.' },
  { term: 'Counter C', category: 'Address', description: 'Preset and current values for counters (CTR). Each counter uses 4 bytes.' },
  { term: 'Message A', also: 'Message request relay', category: 'Address', description: 'Bit that requests a message: A0.0 = message 1, A0.1 = message 2, … Turning the bit on shows the text on the CNC.' },

  /* Tools */
  { term: 'Cross Reference', category: 'Tools', description: 'List of every net where an address is used, showing contacts and coils. The fastest way to answer “what turns this output on?”.' },
  { term: 'Signal Trace', category: 'Tools', description: 'PMC tool that records selected signals over time (like an oscilloscope) to catch short pulses and timing problems.' },
]
