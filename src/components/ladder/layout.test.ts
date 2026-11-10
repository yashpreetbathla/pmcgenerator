import type { BasicOp, Instruction } from '@/core/types'
import { layoutNet, primAddresses, type LayoutOpts, type Prim } from './layout'

const b = (op: BasicOp, address?: string): Instruction => ({ kind: 'basic', op, address })
const sub = (n: number, name: string, params: (number | string)[] = []): Instruction => ({ kind: 'sub', sub: n, name, params })
const opts: LayoutOpts = { cols: 6, boxCols: 2, boxRows: (i) => 1 + Math.ceil(i.params.length / 2) }
const of = <K extends Prim['k']>(ps: Prim[], k: K) => ps.filter((p): p is Extract<Prim, { k: K }> => p.k === k)

describe('layoutNet', () => {
  it('series contacts left, coil right-aligned to the rail, wire in between', () => {
    const l = layoutNet([b('RD', 'X1.0'), b('AND.NOT', 'X1.1'), b('WRT', 'Y1.0')], opts)
    expect(l.w).toBe(6)
    expect(l.h).toBe(1)
    expect(of(l.prims, 'contact').map((c) => [c.x, c.negated])).toEqual([[0, false], [1, true]])
    expect(of(l.prims, 'coil')[0]).toMatchObject({ x: 5, y: 0, address: 'Y1.0' })
    expect(of(l.prims, 'h')).toContainEqual({ k: 'h', y: 0, x0: 2, x1: 5 })
  })

  it('parallel branch gets two rows and vertical connectors on both sides', () => {
    const l = layoutNet([b('RD', 'X0.0'), b('AND', 'X0.1'), b('OR', 'Y0.0'), b('WRT', 'Y0.0')], opts)
    expect(l.h).toBe(2)
    const v = of(l.prims, 'v')
    expect(v).toContainEqual({ k: 'v', x: 0, y0: 0, y1: 1 })
    expect(v).toContainEqual({ k: 'v', x: 2, y0: 0, y1: 1 })
    // the shorter branch is padded with a wire up to the right connector
    expect(of(l.prims, 'h')).toContainEqual({ k: 'h', y: 1, x0: 1, x1: 2 })
  })

  it('multiple coils stack as output branches with conditions', () => {
    const l = layoutNet([b('RD', 'X0.0'), b('WRT', 'Y0.0'), b('AND', 'X0.1'), b('SET', 'R0.0')], opts)
    expect(of(l.prims, 'coil').map((c) => [c.x, c.y, c.op])).toEqual([[5, 0, 'WRT'], [5, 1, 'SET']])
    expect(of(l.prims, 'contact').find((c) => c.address === 'X0.1')).toMatchObject({ y: 1 })
    expect(l.h).toBe(2)
  })

  it('long series wraps onto continuation rows; the last row ends at the coil', () => {
    const ins: Instruction[] = [b('RD', 'X0.0'), ...Array.from({ length: 9 }, (_, i) => b('AND', `X1.${i % 8}`)), b('WRT', 'Y0.0')]
    const l = layoutNet(ins, opts)
    expect(l.w).toBe(6)
    const cont = of(l.prims, 'cont')
    expect(cont.filter((c) => c.dir === 'out')).toHaveLength(cont.filter((c) => c.dir === 'in').length)
    expect(cont.length).toBeGreaterThan(0)
    expect(of(l.prims, 'contact').every((c) => c.x < 5)).toBe(true)
    expect(of(l.prims, 'coil')[0]).toMatchObject({ x: 5, y: l.h - 1 })
  })

  it('functional instruction box sits left of the coil column with its output coil', () => {
    const l = layoutNet([b('RD', 'X0.0'), sub(24, 'TMRB', [1, 500]), b('WRT', 'R0.1')], opts)
    const box = of(l.prims, 'box')[0]
    expect(box).toMatchObject({ x: 3, y: 0, w: 2, out: true, act: true })
    expect(box.h).toBe(2)
    expect(of(l.prims, 'coil')[0]).toMatchObject({ x: 5, address: 'R0.1' })
  })

  it('multi-input box gets one pin per input line', () => {
    const l = layoutNet([b('RD', 'R0.0'), b('RD.STK', 'R0.1'), b('RD.STK', 'R0.2'), b('RD.STK', 'R0.3'), sub(5, 'CTR', [1]), b('WRT', 'R1.0')], opts)
    const box = of(l.prims, 'box')[0]
    expect(box.pins.map((p) => p.name)).toEqual(['CN0', 'UPDOWN', 'RST', 'ACT'])
    expect(box.h).toBe(4)
    expect(primAddresses(l)).toContain('R1.0')
  })

  it('unwrappable wide parallel block widens the net and keeps coils on its rail', () => {
    const wide: Instruction[] = [b('RD', 'X0.0'), ...Array.from({ length: 7 }, () => b('AND', 'X0.1')), b('RD.STK', 'X0.2'), b('OR.STK'), b('WRT', 'Y0.0')]
    const l = layoutNet(wide, opts)
    expect(l.w).toBe(9)
    expect(of(l.prims, 'coil')[0].x).toBe(8)
  })

  it('END1 without inputs and nets without outputs do not throw', () => {
    expect(of(layoutNet([sub(1, 'END1')], opts).prims, 'box')).toHaveLength(1)
    expect(of(layoutNet([b('RD', 'X0.0')], opts).prims, 'note')).toHaveLength(1)
  })
})
