/**
 * Decoder for FANUC PMC memory-card ladder backups (FANUCROM container, verified on 0i-D PMC/L).
 * Reverse-engineered — not FANUC documentation. Runs entirely in the browser; files never leave the device.
 */
import type { AlarmMessage, Instruction, MemoryArea, Net, PmcProject, SymbolEntry, BasicOp } from './types'
import { subName } from './subs'

interface MapRec { letter: string; off: number; seg: number; size: number; start: number }

const BASIC: Record<number, BasicOp> = {
  0x04: 'RD', 0x08: 'RD.NOT', 0x0c: 'RD.STK', 0x10: 'RD.NOT.STK', 0x14: 'AND', 0x18: 'AND.NOT', 0x1c: 'AND.STK',
  0x20: 'OR', 0x24: 'OR.NOT', 0x28: 'OR.STK', 0x30: 'SET', 0x34: 'RST', 0x38: 'WRT', 0x3c: 'WRT.NOT',
}
/** Ladder code reads through mirror areas. */
const CODE_ALIAS: Record<string, string> = { V: 'X', U: 'F', W: 'M' }
/** Parameter indices that are plain numbers (not addresses) per instruction. */
const NUMERIC: Record<string, number[]> = {
  TMRB: [0, 1], TMR: [0], NUMEB: [0, 1], CODB: [0, 1], COD: [0], DIFU: [0], DIFD: [0], CTR: [0], JMP: [0, 1],
  DISPB: [0], COIN: [0], COMP: [0], COMPB: [0], ADDB: [0], ROT: [0], MOVE: [0, 1], SUB: [0], SUBB: [0], MULB: [0], DIVB: [0],
}

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('')
const isPrint = (c: number) => c >= 32 && c < 127

export class PmcDecodeError extends Error {}

export function isFanucBackup(buf: ArrayBuffer | Uint8Array): boolean {
  const d = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return latin1(d.subarray(0, 8)) === 'FANUCROM'
}

export function decodePmcBackup(buf: ArrayBuffer | Uint8Array, fileName = 'backup'): PmcProject {
  const d = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  if (!isFanucBackup(d)) throw new PmcDecodeError('Not a FANUC memory-card PMC backup (missing "FANUCROM" header).')
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const u32 = (o: number) => (o + 4 <= d.length ? dv.getUint32(o, true) : 0)
  const u16 = (o: number) => dv.getUint16(o, true)
  const warnings: string[] = []

  /* ---------- memory map ---------- */
  const mp: MapRec[] = []
  let o = 0x5a4
  while (o + 16 <= d.length && d[o + 2] >= 65 && d[o + 2] <= 90) {
    mp.push({ letter: String.fromCharCode(d[o + 2]), off: u16(o + 4), seg: u16(o + 6), size: u32(o + 8), start: u32(o + 12) })
    o += 16
  }
  if (!mp.length) throw new PmcDecodeError('Memory map not found — this PMC type/layout is not supported yet.')

  const fmtAddr = (area: number, lo: number, bit = true, alias = false): string => {
    const seg = area >> 3, byte = lo >> 3, b = lo & 7
    let best: MapRec | undefined
    for (const m of mp) {
      if (m.seg === seg && m.letter !== 'L' && m.letter !== 'P' && m.off <= byte && byte < m.off + m.size) {
        if (!best || m.off > best.off) best = m
      }
    }
    if (!best) return `?${area.toString(16)}:${lo.toString(16)}`
    const L = alias ? CODE_ALIAS[best.letter] ?? best.letter : best.letter
    const n = best.start + byte - best.off
    return bit ? `${L}${n}.${b}` : `${L}${n}`
  }

  /* ---------- title block ---------- */
  const title = latin1(d.subarray(0x21a0, 0x22a0))
  const field = (i: number, len = 32) => title.slice(i, i + len).trim()
  const info: PmcProject['info'] = {
    builder: field(0), machine: field(32), pmcType: field(64).split(' - ')[0], control: field(64).split(' - ')[1]?.trim(),
    ladderVersion: field(96), date: field(134, 20), memo: title.slice(160).replace(/\s{2,}/g, ' ').trim(), fileName, fileSize: d.length,
  }

  /* ---------- symbols: [name16][commentOffset][address of NEXT record] ---------- */
  const recs: { name: string; c: number; a: number }[] = []
  o = 0x4ea4
  while (o + 24 <= d.length && d.subarray(o, o + 16).every(isPrint)) {
    recs.push({ name: latin1(d.subarray(o, o + 16)).trim(), c: u32(o + 16), a: u32(o + 20) }); o += 24
  }
  const syms = recs.slice(1).map((r, i) => ({ name: r.name, c: r.c, raw: recs[i].a }))

  /* ---------- comment block: longest reversed printable run before ladder code ---------- */
  let bestRun = { s: 0, e: 0 }, runStart = -1
  const scanFrom = Math.min(0xf100, d.length), scanTo = Math.min(0x18500, d.length)
  for (let k = scanFrom; k <= scanTo; k++) {
    const p = k < scanTo && isPrint(d[k])
    if (p && runStart < 0) runStart = k
    if (!p && runStart >= 0) { if (k - runStart > bestRun.e - bestRun.s) bestRun = { s: runStart, e: k }; runStart = -1 }
  }
  // Last byte of the run is the first ladder word's low byte → code starts at e-1 aligned.
  const commentBlock = latin1(d.subarray(bestRun.s, bestRun.e)).split('').reverse().join('').slice(1)
  const codeStart = (bestRun.e - 1) & ~3

  const symbols: SymbolEntry[] = []
  syms.forEach((s, i) => {
    const end = i + 1 < syms.length ? syms[i + 1].c : commentBlock.length
    const comment = commentBlock.slice(s.c, end).trim()
    if (s.name || comment) symbols.push({ address: fmtAddr(s.raw >> 16, s.raw & 0xffff), symbol: s.name, comment, source: 'decoded' })
  })

  /* ---------- messages (A area) ---------- */
  const messages: AlarmMessage[] = []
  const mStart = indexOf(d, enc(')2.21A('), 0) // fallback anchor
  const mEnd = indexOf(d, enc('10010001'), Math.max(0, mStart)) + 8
  const firstFF = (() => { let k = 0x4400; while (k < d.length && d[k] === 0xff) k++; return k })()
  if (mEnd > 8 && firstFF < mEnd) {
    const block = latin1(d.subarray(firstFF, mEnd)).split('').reverse().join('')
    const idx: number[] = []
    for (let k = 0; k < 2000; k++) idx.push(u32(0x22a0 + 4 * k))
    for (let n = 0; n + 1 < idx.length && idx[n + 1] >= idx[n] && idx[n] < block.length; n++) {
      const t = block.slice(idx[n], idx[n + 1])
      const text = t.slice(4).trim()
      if (text) messages.push({ address: `A${n >> 3}.${n & 7}`, number: t.slice(0, 4), text, kind: t.startsWith('2') ? 'operator' : 'alarm' })
    }
  } else warnings.push('Alarm message block not found.')

  /* ---------- ladder ---------- */
  const nets: Net[] = []
  let level: Net['level'] = 1, cur: Instruction[] = [], newNet = true, unknownWords = 0, count = 0
  const flush = () => { if (cur.length) nets.push({ id: nets.length + 1, level, instructions: cur }); cur = [] }
  o = codeStart
  const end = Math.min(d.length, 0x18500)
  while (o + 4 <= end) {
    const w = u32(o), b3 = w >>> 24, area = ((b3 & 3) << 8) | ((w >>> 16) & 0xff), lo = w & 0xffff
    if (b3 & 0x80 && b3 !== 0xff) {
      const inline = (b3 & 0xc0) === 0xc0
      const n = inline ? 0 : ((w >>> 16) & 0xff) - 1
      const name = subName(lo)
      const raw = Array.from({ length: n }, (_, k) => u32(o + 4 * (k + 1)))
      const params = inline ? [(w >>> 16) & 0xff] : raw.map((p, k) =>
        (NUMERIC[name]?.includes(k) || p < 0x10000) ? (p >= 2 ** 31 ? p - 2 ** 32 : p) : fmtAddr((p >>> 16) & 0x3ff, p & 0xffff, false, true))
      const ins: Instruction = { kind: 'sub', sub: lo, name, params, offset: o }
      o += 4 * (n + 1)
      let tw = 0, width = 2, entries = 0
      if (name === 'CODB' && n >= 2) { width = Math.max(2, raw[0]); entries = raw[1]; tw = Math.ceil(width * entries / 4) }
      if (name === 'COD' && n >= 1 && raw[0] < 1000) { entries = raw[0]; tw = Math.ceil(entries * 2 / 4) }
      if (tw) {
        ins.table = []
        for (let k = 0; k < entries; k++) ins.table.push(width === 4 ? u32(o + 4 * k) : u16(o + 2 * k))
        o += 4 * tw
      }
      cur.push(ins); count++
      if (name === 'END1' || name === 'END2' || name === 'END3' || name === 'END') {
        flush(); level = name === 'END1' ? 2 : name === 'END2' ? 3 : level
      } else { flush() } // functional instructions terminate a net
      newNet = true
      if (name === 'END') break
      continue
    }
    const op = BASIC[b3 & 0xfc]
    if (!op) { unknownWords++; o += 4; continue }
    if (op === 'RD' && newNet) flush()
    newNet = op === 'WRT' || op === 'WRT.NOT' || op === 'SET' || op === 'RST'
    cur.push(op === 'AND.STK' || op === 'OR.STK' ? { kind: 'basic', op, offset: o } : { kind: 'basic', op, address: fmtAddr(area, lo, true, true), offset: o })
    count++; o += 4
  }
  flush()
  if (unknownWords) warnings.push(`${unknownWords} ladder words could not be decoded and were skipped.`)

  const memoryMap: MemoryArea[] = mp.filter((m) => !['V', 'U', 'W'].includes(m.letter)).map((m) => ({ letter: m.letter, start: m.start, size: m.size }))

  return {
    id: `dec_${Date.now().toString(36)}`, name: info.machine || fileName, origin: 'decoded', createdAt: Date.now(),
    info, memoryMap, symbols, messages, nets, warnings,
    stats: { nets: nets.length, instructions: count, unknownWords },
  }
}

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0))
function indexOf(h: Uint8Array, n: Uint8Array, from: number) {
  outer: for (let i = from; i <= h.length - n.length; i++) {
    for (let j = 0; j < n.length; j++) if (h[i + j] !== n[j]) continue outer
    return i
  }
  return -1
}
