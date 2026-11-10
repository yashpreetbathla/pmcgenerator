/**
 * Shared PMC project model. BOTH the backup decoder and the configurator produce a PmcProject,
 * and every viewer screen renders a PmcProject — so generated drafts and decoded backups look identical.
 */

export type AreaLetter = 'X' | 'Y' | 'F' | 'G' | 'R' | 'A' | 'K' | 'D' | 'T' | 'C' | 'E' | 'M' | 'N' | 'L' | 'P' | 'V' | 'U' | 'W'

/** e.g. "X8.4", "R605.2", "D100" (byte address when bit is undefined) */
export interface PmcAddress {
  area: AreaLetter | string
  byte: number
  bit?: number
}

export interface MemoryArea {
  letter: string
  start: number
  size: number // bytes
  description?: string
}

export interface SymbolEntry {
  address: string // canonical "X8.4"
  symbol: string // machine tag, e.g. "EMGPBI", "+XMOVL"
  comment: string
  /** where it comes from */
  source: 'decoded' | 'standard' | 'generated' | 'custom'
  group?: string // e.g. "Turret", "Chuck"
}

export interface AlarmMessage {
  address: string // "A0.1"
  number: string // "1001" (1000-1999 alarm, 2000-2099 operator message on FANUC)
  text: string
  kind: 'alarm' | 'operator'
}

export type BasicOp =
  | 'RD' | 'RD.NOT' | 'RD.STK' | 'RD.NOT.STK'
  | 'AND' | 'AND.NOT' | 'AND.STK'
  | 'OR' | 'OR.NOT' | 'OR.STK'
  | 'WRT' | 'WRT.NOT' | 'SET' | 'RST'

export interface BasicInstruction {
  kind: 'basic'
  op: BasicOp
  address?: string // absent for AND.STK / OR.STK
  offset?: number // byte offset in source file (decoded only)
}

export interface FunctionalInstruction {
  kind: 'sub'
  sub: number // SUB number
  name: string // TMRB, CODB...
  params: (number | string)[] // numbers or address strings ("R302")
  table?: number[] // CODB/COD conversion table
  offset?: number
}

export type Instruction = BasicInstruction | FunctionalInstruction

/** One rung (FANUC "net"). */
export interface Net {
  id: number // 1-based net number
  level: 1 | 2 | 3 | 'sub'
  instructions: Instruction[]
  comment?: string
}

export interface PmcProject {
  id: string
  name: string
  origin: 'decoded' | 'generated' | 'demo'
  createdAt: number
  info: {
    builder?: string
    machine?: string
    control?: string // "FANUC 0i Mate-TD"
    pmcType?: string // "0i-D PMC/L"
    ladderVersion?: string
    date?: string
    memo?: string
    fileName?: string
    fileSize?: number
  }
  memoryMap: MemoryArea[]
  symbols: SymbolEntry[]
  messages: AlarmMessage[]
  nets: Net[]
  /** Non-fatal decoder/generator notes shown to the user. */
  warnings: string[]
  stats: { nets: number; instructions: number; unknownWords: number }
  /**
   * Optional: opaque parts of the memory-card file this project was decoded from, kept LOCALLY so
   * "Export PMC (.000)" can rebuild a byte-identical copy. Never contains data from any other file.
   */
  source?: PmcBinarySource
}

/** Passthrough data captured by the decoder (see core/pmcLayout.ts). All fields except format/fingerprint optional. */
export interface PmcBinarySource {
  format: 'fanucrom-0iD-PMCL'
  /** base64 of file bytes 0x0000–0x21A0: FANUCROM + PMC header (incl. unknown 68-byte block), memory map, I/O tables */
  header?: string
  /** base64 of the raw 256-byte title block */
  title?: string
  /** raw message strings per A-bit index ("1001 NEED ZERO RETURN"), incl. number-only entries the viewer hides */
  messages?: [number, string][]
  /** raw addresses of symbol records that have neither symbol nor comment (hidden by the viewer) */
  blankSymbols?: number[]
  fileSize: number
  /** FNV-1a 32 of the original file — an export matching it is a verified exact copy */
  fingerprint: string
}

export function formatAddress(a: PmcAddress): string {
  return a.bit === undefined ? `${a.area}${a.byte}` : `${a.area}${a.byte}.${a.bit}`
}

export function parseAddress(s: string): PmcAddress | null {
  const m = /^([A-Z])(\d+)(?:\.(\d))?$/.exec(s.trim().toUpperCase())
  if (!m) return null
  return { area: m[1], byte: Number(m[2]), bit: m[3] === undefined ? undefined : Number(m[3]) }
}

/** Whether an instruction writes its operand (coil). */
export const isOutput = (i: Instruction) => i.kind === 'basic' && (i.op === 'WRT' || i.op === 'WRT.NOT' || i.op === 'SET' || i.op === 'RST')
