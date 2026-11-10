import { buildLadderTree, mergeFuncOutputNets, nodeToString, pinNames } from './ladderTree'
import type { BasicOp, Instruction } from './types'

const b = (op: BasicOp, address?: string): Instruction => ({ kind: 'basic', op, address })
const sub = (n: number, name: string, params: (number | string)[] = []): Instruction => ({ kind: 'sub', sub: n, name, params })

describe('buildLadderTree', () => {
  it('series + parallel with single coil', () => {
    const t = buildLadderTree([b('RD', 'X1.0'), b('OR', 'Y1.0'), b('AND.NOT', 'X1.1'), b('WRT', 'Y1.0')])
    expect(t.issues).toEqual([])
    expect(t.rungs).toHaveLength(1)
    expect(nodeToString(t.rungs[0].inputs[0])).toBe('((X1.0 | Y1.0) & !X1.1)')
    expect(t.rungs[0].outputs.map((o) => o.out.t === 'coil' && o.out.address)).toEqual(['Y1.0'])
  })

  it('RD.STK + OR.STK builds parallel of two series branches', () => {
    // (A & B) | (C & !D) -> WRT R0.0
    const t = buildLadderTree([
      b('RD', 'X0.0'), b('AND', 'X0.1'),
      b('RD.STK', 'X0.2'), b('AND.NOT', 'X0.3'),
      b('OR.STK'), b('WRT', 'R0.0'),
    ])
    expect(t.issues).toEqual([])
    expect(nodeToString(t.rungs[0].inputs[0])).toBe('((X0.0 & X0.1) | (X0.2 & !X0.3))')
  })

  it('RD.STK + AND.STK builds series of two parallel blocks', () => {
    // (A | B) & (C | D) -> SET
    const t = buildLadderTree([
      b('RD', 'X0.0'), b('OR', 'X0.1'),
      b('RD.NOT.STK', 'X0.2'), b('OR', 'X0.3'),
      b('AND.STK'), b('SET', 'R1.0'),
    ])
    expect(t.issues).toEqual([])
    expect(nodeToString(t.rungs[0].inputs[0])).toBe('((X0.0 | X0.1) & (!X0.2 | X0.3))')
    expect(t.rungs[0].outputs[0].out).toMatchObject({ t: 'coil', op: 'SET', address: 'R1.0' })
  })

  it('nested stack operations', () => {
    // A & ((B & C) | D)
    const t = buildLadderTree([
      b('RD', 'A0.0'), b('RD.STK', 'A0.1'), b('AND', 'A0.2'), b('RD.STK', 'A0.3'), b('OR.STK'), b('AND.STK'), b('WRT', 'Y0.0'),
    ])
    expect(nodeToString(t.rungs[0].inputs[0])).toBe('(A0.0 & ((A0.1 & A0.2) | A0.3))')
  })

  it('multiple coils share logic; AND after coil only applies to later coils', () => {
    const t = buildLadderTree([b('RD', 'X0.0'), b('WRT', 'Y0.0'), b('WRT.NOT', 'Y0.1'), b('AND', 'X0.1'), b('RST', 'R0.0')])
    expect(t.rungs).toHaveLength(1)
    const r = t.rungs[0]
    expect(nodeToString(r.inputs[0])).toBe('X0.0')
    expect(r.outputs).toHaveLength(3)
    expect(r.outputs[0].cond).toBeNull()
    expect(r.outputs[1].cond).toBeNull()
    expect(nodeToString(r.outputs[2].cond)).toBe('X0.1')
  })

  it('functional instruction uses current logic as ACT', () => {
    const t = buildLadderTree([b('RD', 'X0.0'), b('AND', 'R0.1'), sub(24, 'TMRB', [1, 1000])])
    expect(t.rungs).toHaveLength(1)
    expect(t.rungs[0].inputs).toHaveLength(1)
    expect(nodeToString(t.rungs[0].inputs[0])).toBe('(X0.0 & R0.1)')
    expect(t.rungs[0].outputs[0].out.t).toBe('func')
  })

  it('multi-input functional instruction keeps each stack entry as an input', () => {
    const t = buildLadderTree([b('RD', 'R0.0'), b('RD.STK', 'R0.1'), b('RD.STK', 'R0.2'), b('RD.STK', 'R0.3'), sub(5, 'CTR', [1])])
    expect(t.rungs[0].inputs.map(nodeToString)).toEqual(['R0.0', 'R0.1', 'R0.2', 'R0.3'])
    expect(pinNames('CTR', 4)).toEqual(['CN0', 'UPDOWN', 'RST', 'ACT'])
  })

  it('END1 without inputs and malformed nets do not throw', () => {
    expect(buildLadderTree([sub(1, 'END1')]).rungs[0].inputs).toEqual([])
    const bad = buildLadderTree([b('AND.STK'), b('RD', 'X0.0')])
    expect(bad.issues.length).toBeGreaterThan(0)
    expect(bad.rungs[0].outputs).toEqual([])
  })

  it('coils after a functional instruction are its outputs', () => {
    const t = buildLadderTree([b('RD', 'R0.0'), sub(24, 'TMRB', [1, 500]), b('WRT', 'R0.1')])
    expect(t.issues).toEqual([])
    expect(t.rungs).toHaveLength(1)
    const out = t.rungs[0].outputs[0].out
    expect(out.t === 'func' && out.coils.map((c) => c.address)).toEqual(['R0.1'])
  })
})

describe('mergeFuncOutputNets', () => {
  it('joins a coil-first net onto the preceding SUB net and renumbers', () => {
    const merged = mergeFuncOutputNets([
      { id: 1, level: 1, instructions: [b('RD', 'R0.0'), sub(24, 'TMRB', [1, 500])] },
      { id: 2, level: 1, instructions: [b('WRT', 'R0.1')] },
      { id: 3, level: 1, instructions: [b('RD', 'R0.1'), b('WRT', 'Y0.0')] },
    ])
    expect(merged.map((n) => [n.id, n.instructions.length, n.sourceIds])).toEqual([[1, 3, [1, 2]], [2, 2, [3]]])
  })
  it('splits a net at RD.NOT after a coil', () => {
    const merged = mergeFuncOutputNets([{ id: 1, level: 1, instructions: [b('RD', 'R0.0'), b('WRT', 'R0.1'), b('RD.NOT', 'R0.2'), b('WRT', 'R0.3')] }])
    expect(merged.map((n) => [n.id, n.instructions.length, n.sourceIds])).toEqual([[1, 2, [1]], [2, 2, [1]]])
  })
})
