/**
 * Shared layout knowledge for FANUC memory-card PMC files (FANUCROM container, 0i-D PMC/L layout).
 * Reverse-engineered from the structure of a user backup — NOT FANUC documentation, and contains no bytes
 * copied from any file: everything here is generated from the layout rules.
 *
 * Section offsets in the PMC header are relative to HDR (0x1A0). Sections are sized in 1 KiB steps.
 */
import type { PmcBinarySource, PmcProject } from './types'

export const FILE_SIZE = 0x20080 // 128 KiB image + 0x80 container header
export const HDR = 0x1a0
export const MAP_COUNT = HDR + 0x400
export const MAP_START = MAP_COUNT + 4
export const TITLE_REL = 0x2000
export const TITLE_SIZE = 0x100
export const MSG_REL = TITLE_REL + TITLE_SIZE
export const PASSTHROUGH_END = HDR + TITLE_REL // 0x21A0: everything before the title block
export const SECTION_ALIGN = 0x400

/** Header field offsets (relative to HDR). */
export const H = {
  title: 0x18, msgStart: 0x20, msgEnd: 0x24, msgNegLen: 0x28,
  symStart: 0x30, symCount: 0x34, symEnd: 0x38,
  cmtEnd: 0x40, cmtLen: 0x44,
  codeSize: 0x50, codeStart: 0x54, level1Size: 0x58,
  /** 68 bytes, meaning unknown (checksum / signature / password?) — only ever copied from the user's own file */
  opaque: 0x8c, opaqueLen: 0x44,
  codeEnd: 0xd0,
} as const

export interface MapRec { flags: number; letter: string; off: number; seg: number; size: number; start: number }

/** 0i-D PMC/L memory map, generated from the layout rules (segment = area >> 3). */
export function defaultPmcLMap(): MapRec[] {
  const m: MapRec[] = []
  const r = (flags: number, letter: string, off: number, seg: number, size: number, start: number) => m.push({ flags, letter, off, seg, size, start })
  r(0x00, 'A', 4, 0x00, 250, 0); r(0x80, 'A', 4, 0x02, 250, 9000)
  r(0x00, 'R', 0, 0x04, 1500, 0); r(0x80, 'R', 0, 0x06, 500, 9000)
  r(0xe0, 'L', 1, 0x07, 9999, 1); r(0xe0, 'P', 0x8001, 0x07, 512, 1)
  r(0x00, 'T', 0, 0x08, 80, 0); r(0x00, 'T', 0, 0x0a, 80, 9000)
  r(0x00, 'K', 0, 0x0c, 20, 0); r(0x00, 'K', 0, 0x0e, 100, 900)
  r(0x00, 'C', 0, 0x10, 80, 0); r(0x00, 'C', 0, 0x12, 40, 5000)
  r(0x00, 'D', 0, 0x14, 3000, 0)
  r(0x00, 'E', 0, 0x18, 10000, 0)
  ;[0, 200, 400, 600, 1000].forEach((start, i) => {
    const seg = 0x1a + 2 * i
    r(0x00, 'Y', 0, seg, 128, start); r(0x80, 'X', 128, seg, 128, start); r(0x80, 'V', 512, seg, 128, start)
  })
  r(0x00, 'N', 0, 0x24, 768, 0); r(0x80, 'M', 0, 0x26, 768, 0); r(0x80, 'W', 768, 0x26, 768, 0)
  for (let p = 0; p < 10; p++) {
    const seg = 0x28 + 2 * p
    r(0x00, 'G', 0, seg, 768, 1000 * p); r(0x80, 'F', 768, seg, 768, 1000 * p); r(0x80, 'U', 1536, seg, 768, 1000 * p)
  }
  return m
}

export function readMap(d: Uint8Array): MapRec[] {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const out: MapRec[] = []
  for (let o = MAP_START; o + 16 <= d.length && d[o + 2] >= 65 && d[o + 2] <= 90; o += 16) {
    out.push({ flags: d[o], letter: String.fromCharCode(d[o + 2]), off: dv.getUint16(o + 4, true), seg: dv.getUint16(o + 6, true), size: dv.getUint32(o + 8, true), start: dv.getUint32(o + 12, true) })
  }
  return out
}

export function writeMap(d: Uint8Array, map: MapRec[]) {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
  dv.setUint32(MAP_COUNT, map.length, true)
  map.forEach((m, i) => {
    const o = MAP_START + 16 * i
    d[o] = m.flags; d[o + 1] = 0; d[o + 2] = m.letter.charCodeAt(0); d[o + 3] = 0
    dv.setUint16(o + 4, m.off, true); dv.setUint16(o + 6, m.seg, true); dv.setUint32(o + 8, m.size, true); dv.setUint32(o + 12, m.start, true)
  })
  d.fill(0, MAP_START + 16 * map.length, MAP_START + 16 * (map.length + 1))
}

/* ---------- title block ---------- */
export const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('')

export function titleInfo(raw: string) {
  const field = (i: number, len = 32) => raw.slice(i, i + len).trim()
  return {
    builder: field(0), machine: field(32), pmcType: field(64).split(' - ')[0], control: field(64).split(' - ')[1]?.trim(),
    ladderVersion: field(96), date: field(134, 20), memo: raw.slice(160).replace(/\s{2,}/g, ' ').trim(),
  }
}

/** Build a 256-byte title so that titleInfo() reads the same fields back (FANUC field boundaries approximated). */
export function buildTitle(info: PmcProject['info']): string {
  const put = (s: string | undefined, n: number) => (s ?? '').slice(0, n).padEnd(n, ' ')
  const type = info.control ? `${info.pmcType ?? ''} - ${info.control}` : info.pmcType ?? ''
  return put(info.builder, 32) + put(info.machine, 32) + put(type, 32) + put(info.ladderVersion, 38) + put(info.date, 26) + put(info.memo, 96)
}

/* ---------- misc ---------- */
export function fnv1a(d: Uint8Array): string {
  let h = 0x811c9dc5
  for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}

export const toB64 = (b: Uint8Array) => {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}
export const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/** Latin-1 encoding (non-Latin-1 chars → '?'). */
export const toLatin1 = (s: string) => Uint8Array.from(s, (c) => { const n = c.charCodeAt(0); return n < 256 ? n : 63 })

export interface Layout {
  msgIndex: number; aBits: number; msgText: [number, number]
  symStart: number; symCount: number
  comments: [number, number]
  code: [number, number]
}

/** Section locations from the PMC header pointers, or undefined if they don't look like the 0i-D PMC/L layout. */
export function readLayout(d: Uint8Array): Layout | undefined {
  if (d.length !== FILE_SIZE) return undefined
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const h = (k: number) => dv.getUint32(HDR + k, true)
  if (h(H.title) !== TITLE_REL || h(H.msgStart) !== MSG_REL || dv.getUint32(MAP_COUNT, true) > 200) return undefined
  const map = readMap(d)
  const aBits = (map.find((m) => m.letter === 'A')?.size ?? 0) * 8
  const msgEnd = HDR + h(H.msgEnd) + 1, msgLen = -(h(H.msgNegLen) | 0)
  const cmtEnd = HDR + h(H.cmtEnd) + 1, cmtLen = h(H.cmtLen)
  const codeStart = HDR + h(H.codeStart), codeEnd = codeStart + h(H.codeSize)
  const symStart = HDR + h(H.symStart), symCount = h(H.symCount)
  const ok = aBits > 0 && msgLen >= 0 && msgEnd - msgLen >= HDR + MSG_REL + 4 * aBits && msgEnd <= symStart &&
    symStart + 24 * symCount <= cmtEnd - cmtLen && cmtEnd <= codeStart && codeEnd <= d.length && h(H.codeEnd) === h(H.codeStart) + h(H.codeSize)
  if (!ok) return undefined
  return { msgIndex: HDR + MSG_REL, aBits, msgText: [msgEnd - msgLen, msgEnd], symStart, symCount, comments: [cmtEnd - cmtLen, cmtEnd], code: [codeStart, codeEnd] }
}

/**
 * Capture the opaque/hidden parts of a decoded file so the encoder can rebuild it byte-for-byte.
 * Returns undefined when the file doesn't follow the 0i-D PMC/L layout this encoder understands.
 */
export function captureSource(d: Uint8Array): PmcBinarySource | undefined {
  const L = readLayout(d)
  if (!L) return undefined
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
  // messages: u32 index per A bit at the section start, text reversed at the section end
  const msgLen = L.msgText[1] - L.msgText[0]
  const block = latin1(d.subarray(...L.msgText)).split('').reverse().join('')
  const idx = (n: number) => (n < L.aBits ? dv.getUint32(L.msgIndex + 4 * n, true) : msgLen)
  const messages: [number, string][] = []
  for (let n = 0; n < L.aBits; n++) if (idx(n + 1) > idx(n)) messages.push([n, block.slice(idx(n), idx(n + 1))])
  // symbol records with neither symbol nor comment
  const cmtLen = L.comments[1] - L.comments[0]
  const blankSymbols: number[] = []
  for (let k = 0; k < L.symCount; k++) {
    const o = L.symStart + 24 * k
    const next = k + 1 < L.symCount ? dv.getUint32(o + 24 + 20, true) : cmtLen
    if (d.subarray(o + 4, o + 20).every((c) => c === 32) && next === dv.getUint32(o + 20, true)) blankSymbols.push(dv.getUint32(o, true))
  }
  return {
    format: 'fanucrom-0iD-PMCL',
    header: toB64(d.subarray(0, PASSTHROUGH_END)),
    title: toB64(d.subarray(HDR + TITLE_REL, HDR + TITLE_REL + TITLE_SIZE)),
    messages, blankSymbols, fileSize: d.length, fingerprint: fnv1a(d),
  }
}
