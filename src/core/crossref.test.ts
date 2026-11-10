import { buildXRef, findRefs, groupRefs, usedAddresses } from './crossref'
import type { Net } from './types'

const nets: Net[] = [
  { id: 1, level: 1, instructions: [{ kind: 'basic', op: 'RD', address: 'X8.4' }, { kind: 'basic', op: 'WRT', address: 'R10.0' }] },
  { id: 2, level: 2, instructions: [{ kind: 'basic', op: 'RD.NOT', address: 'R10.0' }, { kind: 'basic', op: 'AND', address: 'X8.4' }, { kind: 'basic', op: 'SET', address: 'Y2.1' }] },
  { id: 3, level: 2, instructions: [{ kind: 'basic', op: 'RD', address: 'R10.1' }, { kind: 'sub', sub: 43, name: 'MOVB', params: ['R10', 'D100'] }] },
]

describe('crossref', () => {
  const idx = buildXRef(nets)
  it('finds contacts and coils for a bit', () => {
    const g = groupRefs(findRefs(idx, 'R10.0'))
    expect(g.coil.map((r) => r.netId)).toEqual([1])
    expect(g.contact.map((r) => [r.netId, r.op])).toEqual([[2, 'RD.NOT']])
    // byte-wide parameter R10 also touches R10.0
    expect(g.param.map((r) => [r.netId, r.op])).toEqual([[3, 'SUB 43 MOVB']])
  })
  it('byte query matches all bits', () => {
    expect(findRefs(idx, 'R10').map((r) => r.netId)).toEqual([1, 2, 3, 3])
  })
  it('is case-insensitive and rejects junk', () => {
    expect(findRefs(idx, 'x8.4')).toHaveLength(2)
    expect(findRefs(idx, 'hello')).toEqual([])
  })
  it('usedAddresses includes byte forms', () => {
    const u = usedAddresses(idx)
    expect(u.has('X8')).toBe(true)
    expect(u.has('D100')).toBe(true)
    expect(u.has('Y3')).toBe(false)
  })
})
