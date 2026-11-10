import { STANDARD_SIGNALS } from '@/data/standardSignals'
import { DEMO_PROJECT, createDemoProject } from '@/data/demoProject'
import { GLOSSARY } from '@/data/glossary'
import { parseAddress, isOutput } from '@/core/types'
import { parseProjectJson } from '@/features/home/projectIO'

describe('standard signals', () => {
  it('has a useful number of signals with valid, unique addresses', () => {
    expect(STANDARD_SIGNALS.length).toBeGreaterThanOrEqual(150)
    const seen = new Set<string>()
    for (const s of STANDARD_SIGNALS) {
      const a = parseAddress(s.address)
      expect(a, s.address).not.toBeNull()
      expect(a!.bit, s.address).toBeDefined()
      expect(s.address[0]).toBe(s.direction)
      expect(seen.has(s.address), `duplicate ${s.address}`).toBe(false)
      seen.add(s.address)
    }
  })
  it('contains key signals at the documented addresses', () => {
    const at = (sym: string) => STANDARD_SIGNALS.find((s) => s.symbol === sym)?.address
    expect(at('*ESP')).toBe('G8.4')
    expect(at('ST')).toBe('G7.2')
    expect(at('FIN')).toBe('G4.3')
    expect(at('MF')).toBe('F7.0')
    expect(at('ZP1')).toBe('F94.0')
    expect(at('*FV7')).toBe('G12.7')
    expect(at('*JV15')).toBe('G11.7')
    expect(at('M31')).toBe('F13.7')
  })
})

describe('demo project', () => {
  it('is synthetic, well-formed and balanced', () => {
    expect(DEMO_PROJECT.origin).toBe('demo')
    expect(DEMO_PROJECT.nets.length).toBeGreaterThanOrEqual(25)
    expect(DEMO_PROJECT.symbols.length).toBeGreaterThanOrEqual(60)
    expect(DEMO_PROJECT.messages).toHaveLength(10)
    const addrs = new Set<string>()
    for (const s of DEMO_PROJECT.symbols) {
      expect(parseAddress(s.address), s.address).not.toBeNull()
      expect(addrs.has(s.address), `duplicate symbol ${s.address}`).toBe(false)
      addrs.add(s.address)
    }
    for (const n of DEMO_PROJECT.nets) {
      let depth = 0
      for (const i of n.instructions) {
        if (i.kind === 'sub') { expect(i.sub, i.name).toBeGreaterThan(0); continue }
        if (i.op.endsWith('.STK') && i.op.startsWith('RD')) depth++
        if (i.op === 'AND.STK' || i.op === 'OR.STK') depth--
        expect(depth, `net ${n.id}`).toBeGreaterThanOrEqual(0)
        if (i.address) expect(parseAddress(i.address), i.address).not.toBeNull()
      }
      expect(depth, `net ${n.id} unbalanced`).toBe(0)
      expect(n.instructions.some((i) => i.kind === 'sub' || isOutput(i)), `net ${n.id} has no output`).toBe(true)
    }
  })
  it('creates independent copies', () => {
    const a = createDemoProject('x1')
    a.nets[0].comment = 'changed'
    expect(DEMO_PROJECT.nets[0].comment).not.toBe('changed')
    expect(a.id).toBe('x1')
  })
})

describe('project import', () => {
  it('round-trips a project and rejects junk', () => {
    const p = parseProjectJson(JSON.parse(JSON.stringify(DEMO_PROJECT)))
    expect(p.nets.length).toBe(DEMO_PROJECT.nets.length)
    expect(p.origin).toBe('demo')
    expect(() => parseProjectJson({ foo: 1 })).toThrow()
    expect(() => parseProjectJson(null)).toThrow()
  })
})

it('glossary covers the core terms', () => {
  const terms = GLOSSARY.map((g) => g.term)
  for (const t of ['Title', 'Symbol Comment', 'Level 1', 'Keep relay K', 'Cross Reference', 'X', 'G']) expect(terms).toContain(t)
})
