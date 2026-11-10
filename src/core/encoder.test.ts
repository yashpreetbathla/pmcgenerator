import { existsSync, readFileSync } from 'node:fs'
import { decodePmcBackup } from './decoder'
import { encodePmcBinary, EXPERIMENTAL_WARNING, PmcEncodeError } from './encoder'
import { FILE_SIZE } from './pmcLayout'
import type { PmcProject } from './types'

// Real backups are proprietary and never committed. Set PMC_SAMPLE to run the round-trip locally.
const sample = process.env.PMC_SAMPLE
const has = !!sample && existsSync(sample)

const draft = (over: Partial<PmcProject> = {}): PmcProject => ({
  id: 'g1', name: 'Draft', origin: 'generated', createdAt: 0,
  info: { builder: 'ACME', machine: 'LATHE 1', pmcType: '0i-D PMC/L', control: 'FANUC 0i-TD', ladderVersion: 'V1', date: '10 NOV 2026', memo: 'TEST' },
  memoryMap: [],
  symbols: [{ address: 'X8.4', symbol: '*ESP', comment: 'EMERGENCY STOP', source: 'generated' }, { address: 'G8.4', symbol: '*ESP', comment: 'ESP TO CNC', source: 'generated' }],
  messages: [{ address: 'A0.1', number: '1001', text: 'NEED ZERO RETURN', kind: 'alarm' }],
  nets: [
    { id: 1, level: 1, instructions: [{ kind: 'basic', op: 'RD', address: 'X8.4' }, { kind: 'basic', op: 'WRT', address: 'G8.4' }] },
    { id: 2, level: 1, instructions: [{ kind: 'sub', sub: 1, name: 'END1', params: [] }] },
    { id: 3, level: 2, instructions: [
      { kind: 'basic', op: 'RD', address: 'X8.4' }, { kind: 'basic', op: 'AND.NOT', address: 'F1.1' },
      { kind: 'sub', sub: 24, name: 'TMRB', params: [1, 500] }, { kind: 'basic', op: 'WRT', address: 'R100.0' },
    ] },
    { id: 4, level: 2, instructions: [
      { kind: 'basic', op: 'RD', address: 'R9091.1' },
      { kind: 'sub', sub: 27, name: 'CODB', params: [2, 3, 'R302', 'D10'], table: [10, 20, 30] }, { kind: 'basic', op: 'WRT', address: 'R100.1' },
    ] },
    { id: 5, level: 2, instructions: [{ kind: 'sub', sub: 2, name: 'END2', params: [] }, { kind: 'sub', sub: 64, name: 'END', params: [] }] },
  ],
  warnings: [], stats: { nets: 5, instructions: 12, unknownWords: 0 },
  ...over,
})

/** Summarise differing byte ranges (research output). */
function diffRanges(a: Uint8Array, b: Uint8Array) {
  const out: [number, number][] = []
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue
    const last = out[out.length - 1]
    if (last && i - last[1] <= 4) last[1] = i
    else out.push([i, i])
  }
  return out
}

describe('encoder', () => {
  it('writes a generated draft that our decoder reads back', () => {
    const r = encodePmcBinary(draft())
    expect(r.bytes.length).toBe(FILE_SIZE)
    expect(r.exact).toBe(false)
    expect(r.warnings[0]).toBe(EXPERIMENTAL_WARNING)
    const back = decodePmcBackup(r.bytes)
    expect(back.stats.unknownWords).toBe(0)
    expect(back.symbols.map((s) => [s.address, s.symbol, s.comment])).toEqual([['X8.4', '*ESP', 'EMERGENCY STOP'], ['G8.4', '*ESP', 'ESP TO CNC']])
    expect(back.messages).toEqual([{ address: 'A0.1', number: '1001', text: 'NEED ZERO RETURN', kind: 'alarm' }])
    expect(back.info.builder).toBe('ACME')
    expect(back.info.machine).toBe('LATHE 1')
    expect(back.info.pmcType).toBe('0i-D PMC/L')
    expect(back.info.date).toBe('10 NOV 2026')
    expect(back.info.memo).toBe('TEST')
    const ins = back.nets.flatMap((n) => n.instructions).map(({ offset: _o, ...i }) => i)
    // inline instructions (END) decode with their inline byte as the parameter
    expect(ins).toEqual(draft().nets.flatMap((n) => n.instructions).map((i) => (i.kind === 'sub' && i.name === 'END' ? { ...i, params: [128] } : i)))
  })

  it('uses direct X/F in level 1 and mirror V/U in level 2', () => {
    const b = encodePmcBinary(draft()).bytes
    const dv = new DataView(b.buffer)
    const codeStart = 0x1a0 + dv.getUint32(0x1a0 + 0x54, true)
    const w = (i: number) => dv.getUint32(codeStart + 4 * i, true)
    expect(w(0)).toBe((0x04 << 24 | 0x1a << 19 | (128 + 8) * 8 + 4) >>> 0) // RD X8.4 (direct)
    expect(w(3)).toBe((0x04 << 24 | 0x1a << 19 | (512 + 8) * 8 + 4) >>> 0) // RD X8.4 via V mirror
  })

  it('encodes MOVE mask strings as nibble masks', () => {
    const p = draft()
    p.nets[3].instructions.splice(1, 0, { kind: 'sub', sub: 8, name: 'MOVE', params: ['1111', '0001', 'R10', 'R11'] })
    const back = decodePmcBackup(encodePmcBinary(p).bytes)
    const mv = back.nets.flatMap((n) => n.instructions).find((i) => i.kind === 'sub' && i.name === 'MOVE')
    expect(mv && mv.kind === 'sub' && mv.params).toEqual([0x1111, 0x0001, 'R10', 'R11'])
  })

  it('rejects addresses outside the memory map', () => {
    const p = draft()
    p.nets[0].instructions[0] = { kind: 'basic', op: 'RD', address: 'X9999.0' }
    expect(() => encodePmcBinary(p)).toThrow(PmcEncodeError)
  })

  it.skipIf(!has)('header-pointer decoding matches the heuristic decoder', () => {
    const orig = new Uint8Array(readFileSync(sample!))
    const noPtr = orig.slice()
    noPtr[0x1a0 + 0x18] ^= 0xff // break the title pointer → decoder falls back to heuristics
    const strip = ({ id: _i, createdAt: _c, source: _s, ...rest }: PmcProject) => rest
    expect(strip(decodePmcBackup(orig))).toEqual(strip(decodePmcBackup(noPtr)))
  })

  it.skipIf(!has)('round-trips a real 0i-D PMC/L backup byte-for-byte', () => {
    const orig = new Uint8Array(readFileSync(sample!))
    const p = decodePmcBackup(orig)
    expect(p.source).toBeDefined()
    const r = encodePmcBinary(p)
    const diff = diffRanges(r.bytes, orig)
    expect(diff).toEqual([])
    expect(r.exact).toBe(true)
    expect(r.warnings).toEqual([])

    // Research: what the encoder cannot reproduce on its own.
    const hdrOnly = encodePmcBinary({ ...p, source: { ...p.source!, header: undefined } })
    const hd = diffRanges(hdrOnly.bytes, orig)
    const bytes = hd.reduce((s, [a, b]) => s + b - a + 1, 0)
    console.log('without header passthrough:', bytes, 'bytes differ in', hd.map(([a, b]) => `0x${a.toString(16)}-0x${b.toString(16)}`))
    expect(hdrOnly.exact).toBe(false)

    const none = encodePmcBinary(p, { ignoreSource: true })
    const nd = diffRanges(none.bytes, orig)
    console.log('without any passthrough:', nd.reduce((s, [a, b]) => s + b - a + 1, 0), 'bytes differ in', nd.length, 'ranges; decodes to same ladder:',
      JSON.stringify(decodePmcBackup(none.bytes).nets.flatMap((n) => n.instructions).map(({ offset: _o, ...i }) => i)) === JSON.stringify(p.nets.flatMap((n) => n.instructions).map(({ offset: _o, ...i }) => i)))

    // Editing a symbol keeps the header passthrough but is no longer an exact copy.
    const edited = { ...p, symbols: p.symbols.map((s, i) => (i === 0 ? { ...s, comment: s.comment + ' X' } : s)) }
    const e = encodePmcBinary(edited)
    expect(e.exact).toBe(false)
    expect(decodePmcBackup(e.bytes).symbols[0].comment).toBe(p.symbols[0].comment + ' X')
  })
})
