import { existsSync, readFileSync } from 'node:fs'
import { decodePmcBackup, isFanucBackup, PmcDecodeError } from './decoder'

// Real backups are proprietary and never committed. Set PMC_SAMPLE to run against one locally.
const sample = process.env.PMC_SAMPLE
const has = !!sample && existsSync(sample)

describe('decoder', () => {
  it('rejects non-FANUC files', () => {
    expect(isFanucBackup(new Uint8Array(16))).toBe(false)
    expect(() => decodePmcBackup(new Uint8Array(64))).toThrow(PmcDecodeError)
  })
  it.skipIf(!has)('decodes a real 0i-D PMC/L backup', () => {
    const p = decodePmcBackup(readFileSync(sample!))
    expect(p.stats.unknownWords).toBe(0)
    expect(p.nets.length).toBeGreaterThan(100)
    expect(p.symbols.find((s) => s.address === 'G8.4')?.symbol).toBe('*ESP')
    expect(p.messages.length).toBeGreaterThan(10)
    console.log(p.info, p.stats, p.symbols.length, p.messages.length, p.symbols.slice(0, 3), p.messages[1], p.nets[1].instructions.slice(0, 3))
  })
})
