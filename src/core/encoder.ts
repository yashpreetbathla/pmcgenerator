/**
 * Encoder for FANUC memory-card PMC files (FANUCROM container, 0i-D PMC/L layout) — the inverse of decoder.ts.
 * Reverse-engineered, research grade. Runs entirely in the browser.
 *
 * Exact copies: when the project still carries `source` (captured from the user's own file at decode time) and its
 * content is unchanged, the rebuilt file is byte-identical to the original (verified by fingerprint).
 * Anything else is EXPERIMENTAL: a 68-byte header block (0x22C–0x270) and a few header constants are not understood.
 */
import { subByName } from './subs'
import type { Instruction, PmcProject } from './types'
import {
  FILE_SIZE, H, HDR, MSG_REL, PASSTHROUGH_END, SECTION_ALIGN, TITLE_REL, TITLE_SIZE,
  buildTitle, defaultPmcLMap, fnv1a, fromB64, latin1, readMap, titleInfo, toLatin1, writeMap, type MapRec,
} from './pmcLayout'

export class PmcEncodeError extends Error {}

export interface EncodeResult {
  bytes: Uint8Array
  /** true only when the output is verified byte-identical to the file the project was decoded from */
  exact: boolean
  warnings: string[]
}

export interface EncodeOptions {
  /** Ignore the captured passthrough data (research: shows what the encoder can compute on its own). */
  ignoreSource?: boolean
}

export const EXPERIMENTAL_WARNING = 'Experimental: checksum fields unknown — LADDER-III may reject this file. Please report the error message.'

const BASIC_OP: Record<string, number> = {
  RD: 0x04, 'RD.NOT': 0x08, 'RD.STK': 0x0c, 'RD.NOT.STK': 0x10, AND: 0x14, 'AND.NOT': 0x18, 'AND.STK': 0x1c,
  OR: 0x20, 'OR.NOT': 0x24, 'OR.STK': 0x28, SET: 0x30, RST: 0x34, WRT: 0x38, 'WRT.NOT': 0x3c,
}
/** Inline (no parameter word) functional instructions: SUB → [high 2 bits of b3, default inline byte]. */
const INLINE: Record<number, [number, number]> = { 9: [0, 0x10], 29: [0, 0x20], 30: [3, 0x80], 64: [3, 0x80] }
/** Functional instructions written with header 0xA0 instead of 0x80 (observed: MOVE, JMP, COMPB, NUMEB; MOVOR/NUMB assumed). */
const FLAG_A0 = new Set([8, 10, 23, 28, 32, 40])
/** Level 2+ reads inputs through mirror areas; Level 1 (high-speed) reads them directly. */
const MIRROR: Record<string, string> = { X: 'V', F: 'U', M: 'W' }

const alignUp = (n: number, a: number) => Math.ceil(n / a) * a

export function encodePmcBinary(p: PmcProject, opts: EncodeOptions = {}): EncodeResult {
  const warnings: string[] = []
  const src = !opts.ignoreSource && p.source?.format === 'fanucrom-0iD-PMCL' ? p.source : undefined
  const d = new Uint8Array(FILE_SIZE).fill(0xff)
  const dv = new DataView(d.buffer)
  const setH = (k: number, v: number) => dv.setUint32(HDR + k, v >>> 0, true)

  /* ---------- container + PMC header (0x000–0x21A0) ---------- */
  const srcHeader = src?.header ? fromB64(src.header) : undefined
  let map: MapRec[]
  if (srcHeader && srcHeader.length === PASSTHROUGH_END) {
    d.set(srcHeader, 0)
    map = readMap(d)
  } else {
    writeDefaultHeader(d)
    map = defaultPmcLMap()
    writeMap(d, map)
    if (p.info.pmcType && !/0i-?D.*PMC\/?L/i.test(p.info.pmcType)) warnings.push(`Memory layout is 0i-D PMC/L; project PMC type is "${p.info.pmcType}".`)
  }
  const enc = makeAddressEncoder(map)

  /* ---------- title ---------- */
  const srcTitle = src?.title ? latin1(fromB64(src.title)) : undefined
  const title = srcTitle && sameInfo(titleInfo(srcTitle), p.info) ? srcTitle : buildTitle(p.info)
  d.set(toLatin1(title).subarray(0, TITLE_SIZE), HDR + TITLE_REL)

  /* ---------- messages: u32 index per A bit, text block reversed at section end ---------- */
  const aBits = (map.find((m) => m.letter === 'A' && m.start === 0)?.size ?? 250) * 8
  const raw = new Map<number, string>(src?.messages ?? [])
  const msgs = new Map<number, string>()
  for (const [n, t] of raw) if (!t.slice(4).trim()) msgs.set(n, t) // number-only entries (hidden in the viewer)
  for (const m of p.messages) {
    const a = /^A(\d+)\.([0-7])$/.exec(m.address)
    const n = a ? Number(a[1]) * 8 + Number(a[2]) : -1
    if (n < 0 || n >= aBits) { warnings.push(`Message ${m.address} is outside the A area — skipped.`); continue }
    const r = raw.get(n)
    msgs.set(n, r && r.slice(0, 4) === m.number && r.slice(4).trim() === m.text ? r : `${m.number.padStart(4, '0').slice(0, 4)} ${m.text}`)
  }
  let text = ''
  const msgStart = HDR + MSG_REL
  for (let n = 0; n < aBits; n++) { dv.setUint32(msgStart + 4 * n, text.length, true); text += msgs.get(n) ?? '' }
  const msgSec = alignUp(aBits * 4 + text.length, SECTION_ALIGN)
  const msgEnd = msgStart + msgSec
  d.set(toLatin1(text).reverse(), msgEnd - text.length)
  setH(H.title, TITLE_REL); setH(H.msgStart, MSG_REL); setH(H.msgEnd, MSG_REL + msgSec - 1); setH(H.msgNegLen, -text.length)

  /* ---------- symbols: [address u32][name 16][comment offset u32], sorted by raw address ---------- */
  type Rec = { raw: number; name: string; comment: string }
  const recs: Rec[] = []
  const used = new Set<number>()
  let longNames = 0, badSym = 0
  for (const s of p.symbols) {
    const r = enc(s.address, false)
    if (r === undefined) { badSym++; continue }
    if (s.symbol.length > 16) longNames++
    recs.push({ raw: r, name: s.symbol, comment: s.comment }); used.add(r)
  }
  for (const r of src?.blankSymbols ?? []) if (!used.has(r)) recs.push({ raw: r, name: '', comment: '' })
  recs.sort((a, b) => a.raw - b.raw)
  if (badSym) warnings.push(`${badSym} symbol(s) have addresses outside the PMC/L memory map — skipped.`)
  if (longNames) warnings.push(`${longNames} symbol name(s) longer than 16 characters were truncated.`)

  const symRel = MSG_REL + msgSec, symStart = HDR + symRel
  let comments = ''
  recs.forEach((r, k) => {
    const o = symStart + 24 * k
    dv.setUint32(o, r.raw, true)
    d.set(toLatin1(r.name.slice(0, 16).padEnd(16, ' ')), o + 4)
    dv.setUint32(o + 20, comments.length, true)
    comments += r.comment
  })
  const symSec = alignUp(recs.length * 24, SECTION_ALIGN)
  setH(H.symStart, symRel); setH(H.symCount, recs.length); setH(H.symEnd, symRel + recs.length * 24)

  /* ---------- symbol comments: [? u32][length u32] … text reversed at section end ---------- */
  const cmtRel = symRel + symSec
  const cmtSec = alignUp(comments.length + 8, SECTION_ALIGN)
  dv.setUint32(HDR + cmtRel + 4, comments.length, true)
  d.set(toLatin1(comments).reverse(), HDR + cmtRel + cmtSec - comments.length)
  setH(H.cmtEnd, cmtRel + cmtSec - 1); setH(H.cmtLen, comments.length)

  /* ---------- ladder object code ---------- */
  const codeRel = cmtRel + cmtSec
  const words = encodeCode(p, enc, warnings)
  const codeBytes = words.code.length * 4
  if (HDR + codeRel + codeBytes > FILE_SIZE) throw new PmcEncodeError(`Program too large for a 0i-D PMC/L memory-card image (${codeBytes} bytes of code).`)
  words.code.forEach((w, i) => dv.setUint32(HDR + codeRel + 4 * i, w >>> 0, true))
  setH(H.codeSize, codeBytes); setH(H.codeStart, codeRel); setH(H.codeEnd, codeRel + codeBytes); setH(H.level1Size, words.level1Bytes)

  const exact = !!src && src.fileSize === FILE_SIZE && fnv1a(d) === src.fingerprint
  if (!exact) warnings.unshift(EXPERIMENTAL_WARNING)
  return { bytes: d, exact, warnings }
}

/** Header constants as seen on 0i-D PMC/L; meaning mostly unknown. The 68-byte opaque block stays zero. */
function writeDefaultHeader(d: Uint8Array) {
  const dv = new DataView(d.buffer)
  const ascii = (o: number, s: string) => d.set(toLatin1(s), o)
  d.fill(0x20, 0, 0x80); ascii(0, 'FANUCROM'); ascii(0x3a, '00')
  d.fill(0, 0x180, PASSTHROUGH_END)
  ascii(0x180, 'PMC1    00'); d[0x18b] = 1
  const h = (k: number, v: number) => dv.setUint32(HDR + k, v, true)
  h(0x00, 0x800); h(0x04, 0x30007); h(0x08, 0xa55a); h(0x64, 0xd0000)
  ascii(HDR + 0x78, '40B005') // PMC series/edition id?
  h(0x80, 0x4500) // unknown (matches code start & 0xFFFF in the reference file)
  h(0x174, 0x10001); h(0x178, 0x20000); h(0x17c, 3); h(0x1ac, 0x400); h(0x1b0, 6)
  d.fill(0x20, HDR + 0x1c0, HDR + 0x1cc)
  h(0x1dc, 0x10000); h(0x1e0, 0xff00)
}

const norm = (s?: string) => (s ?? '').trim()
function sameInfo(a: ReturnType<typeof titleInfo>, b: PmcProject['info']) {
  return (['builder', 'machine', 'pmcType', 'control', 'ladderVersion', 'date', 'memo'] as const).every((k) => norm(a[k]) === norm(b[k]))
}

/** Address string → raw u32 ([segment·8 + bitAddr>>16 : 10 bits][bitAddr : 16 bits]). */
function makeAddressEncoder(map: MapRec[]) {
  return (addr: string, mirror: boolean): number | undefined => {
    const q = /^\?([0-9a-f]+):([0-9a-f]+)$/i.exec(addr) // decoder's "unknown address" form
    if (q) return ((parseInt(q[1], 16) << 16) | parseInt(q[2], 16)) >>> 0
    const m = /^([A-Z])(\d+)(?:\.([0-7]))?$/.exec(addr.trim().toUpperCase())
    if (!m) return undefined
    const letter = mirror ? MIRROR[m[1]] ?? m[1] : m[1], n = Number(m[2]), bit = Number(m[3] ?? 0)
    const rec = map.find((r) => r.letter === letter && r.start <= n && n < r.start + r.size)
    if (!rec) return undefined
    return ((rec.seg << 19) + (rec.off + n - rec.start) * 8 + bit) >>> 0
  }
}

function encodeCode(p: PmcProject, enc: ReturnType<typeof makeAddressEncoder>, warnings: string[]) {
  const code: number[] = []
  let level1 = true, level1Bytes = 0, sawEnd = false
  const bad: string[] = []
  const addr = (a: string) => {
    const r = enc(a, !level1)
    if (r === undefined) { bad.push(a); return 0 }
    return r
  }
  const all: Instruction[] = p.nets.flatMap((n) => n.instructions)
  for (const ins of all) {
    if (sawEnd) { warnings.push('Instructions after END were not written.'); break }
    if (ins.kind === 'basic') {
      const op = BASIC_OP[ins.op]
      code.push(((op << 24) | (ins.address ? addr(ins.address) : 0)) >>> 0)
      continue
    }
    const sub = ins.sub || subByName(ins.name)
    const inline = INLINE[sub]
    if (inline) {
      const v = typeof ins.params[0] === 'number' && ins.params[0] >= 0 && ins.params[0] < 256 ? ins.params[0] : inline[1]
      code.push((((0xc0 | inline[0]) << 24) | (v << 16) | sub) >>> 0)
    } else {
      const head = FLAG_A0.has(sub) ? 0xa0 : 0x80
      code.push(((head << 24) | ((1 + ins.params.length) << 16) | sub) >>> 0)
      ins.params.forEach((prm, k) => code.push(typeof prm === 'number' ? prm >>> 0 : numericString(ins.name, k, prm) ?? addr(prm)))
      const table = tableWords(ins.name, ins.params, ins.table ?? [])
      code.push(...table)
    }
    if (ins.name === 'END1') { level1 = false; level1Bytes = code.length * 4 }
    if (ins.name === 'END') sawEnd = true
  }
  if (bad.length) throw new PmcEncodeError(`${bad.length} ladder address(es) cannot be encoded for 0i-D PMC/L: ${[...new Set(bad)].slice(0, 8).join(', ')}`)
  if (!sawEnd) warnings.push('Program has no END instruction.')
  if (level1) warnings.push('Program has no END1 instruction.')
  return { code, level1Bytes }
}

/** Constants written as strings: MOVE masks ("1111" → 0x1111, one nibble per bit) or plain decimal ("-5"). */
function numericString(name: string, k: number, s: string): number | undefined {
  const t = s.trim()
  if ((name === 'MOVE' || name === 'MOVOR') && k < 2 && /^[01]{1,4}$/.test(t)) return parseInt(t, 16)
  return /^-?\d+$/.test(t) ? Number(t) >>> 0 : undefined
}

/** CODB/COD conversion tables: 2-byte entries (4-byte for CODB format 4), padded to whole words with zeros. */
function tableWords(name: string, params: (number | string)[], table: number[]): number[] {
  const num = (i: number) => (typeof params[i] === 'number' ? (params[i] as number) : 0)
  let width = 2, entries = 0
  if (name === 'CODB' && params.length >= 2) { width = Math.max(2, num(0)); entries = num(1) }
  else if (name === 'COD' && params.length >= 1 && num(0) < 1000) entries = num(0)
  if (!entries) return []
  const bytes = new Uint8Array(Math.ceil((width * entries) / 4) * 4)
  const dv = new DataView(bytes.buffer)
  for (let k = 0; k < entries; k++) {
    const v = table[k] ?? 0
    if (width === 4) dv.setUint32(4 * k, v >>> 0, true)
    else dv.setUint16(2 * k, v & 0xffff, true)
  }
  return Array.from({ length: bytes.length / 4 }, (_, i) => dv.getUint32(4 * i, true))
}
