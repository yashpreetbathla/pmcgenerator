/**
 * Independent verification: MOP presets (MP 225, MP1010) applied to an operator panel card, then a lathe project generated.
 */
import { describe, expect, it } from 'vitest'
import { applyMopPlan, planMop, type MopPlan } from './mop'
import { defaultConfig, generateProject, planIo, pmcOf, validateCards, validateIo, type BuildConfig } from './generator'
import { mopById } from '@/data/mopPresets'
import { makeCard } from '@/data/ioCards'

const opts = { id: 'test', now: 1_700_000_000_000 }

/** Lathe with the operator panel module (CE56/CE57) at X16 / Y8 as card "m2". */
function lathe(): BuildConfig {
  const cfg = defaultConfig('lathe')
  const p = cfg.modules.find((m) => m.templateId === 'op-ce56')!
  expect(p).toMatchObject({ id: 'm2', xStart: 16, yStart: 8 })
  return cfg
}
const rowOf = (plan: MopPlan, conn: string, sno: number) => {
  const r = plan.rows.find((x) => x.conn === conn && x.sno === sno)
  if (!r) throw new Error(`no row ${conn}/${sno}`)
  return r
}

describe('MP 225 on the operator panel module at X16 / Y8', () => {
  const mop = mopById('mp225')!
  const cfg = lathe()
  const plan = planMop(cfg, 'm2', mop.pins, { enable: mop.enable, params: mop.params })

  it('maps inputs to the right addresses and functions', () => {
    expect(rowOf(plan, 'CE56', 3)).toMatchObject({ kind: 'DI', address: 'X16.0', status: 'matched', sig: 'moderot.MDSW1I' })
    expect(rowOf(plan, 'CE56', 4)).toMatchObject({ address: 'X16.1', sig: 'moderot.MDSW2I' })
    expect(rowOf(plan, 'CE56', 5)).toMatchObject({ address: 'X16.2', sig: 'moderot.MDSW4I' })
    expect(rowOf(plan, 'CE56', 17)).toMatchObject({ kind: 'DI', address: 'X17.6', status: 'matched', sig: 'cycle.CYSTPBI' })
    expect(rowOf(plan, 'CE56', 14)).toMatchObject({ kind: 'DI', address: 'X17.3', status: 'matched', sig: 'jog.-XDIRI' })
    expect(rowOf(plan, 'CE57', 7)).toMatchObject({ kind: 'DI', address: 'X19.4', status: 'matched', sig: 'jog.+XDIRI' })
  })

  it('maps lamps to outputs', () => {
    expect(rowOf(plan, 'CE56', 31)).toMatchObject({ kind: 'DO', address: 'Y8.0', status: 'matched', sig: 'pf-zpall.ZPALLL' })
    const cs = rowOf(plan, 'CE56', 38)
    expect(cs).toMatchObject({ kind: 'DO', address: 'Y8.7', status: 'matched' })
    expect(['cycle.CYSTL', 'pf-stl.STLL']).toContain(cs.sig)
  })

  it('enables mode-by-rotary-switch (and not push-button mode)', () => {
    const final = applyMopPlan(cfg, plan, 'mp225', 'm2')
    expect(final.accessories).toContain('moderot')
    expect(final.accessories).not.toContain('mode')
  })

  it('spare inputs stay spare (no signal assigned)', () => {
    for (const s of mop.spares.in) {
      const [conn, sno] = s.split('/')
      const r = rowOf(plan, conn, Number(sno))
      expect(r.status, s).toBe('spare')
      expect(r.sig, s).toBeUndefined()
      expect(plan.assignments[r.key!]?.sig, s).toBeUndefined()
    }
    for (const s of mop.spares.out) {
      const [conn, sno] = s.split('/')
      const r = rowOf(plan, conn, Number(sno))
      expect(r.status, s).toBe('spare')
      expect(plan.assignments[r.key!]?.sig, s).toBeUndefined()
    }
  })

  it('power / NC / 24E pins never carry a signal', () => {
    for (const p of mop.pins) {
      if (!/^(0V|24V|NC|24E)$/.test(p.label)) continue
      const r = rowOf(plan, p.conn, p.sno)
      expect(r.sig, `${p.conn}/${p.sno}`).toBeUndefined()
      expect(['power', 'unused', 'mismatch'], `${p.conn}/${p.sno} ${r.status}`).toContain(r.status)
      if (r.key) expect(plan.assignments[r.key]?.sig).toBeUndefined()
    }
    // NC / 0V labels must land on non-I/O pins (sheet consistent with the card)
    expect(plan.rows.filter((r) => r.status === 'mismatch')).toEqual([])
  })

  it('no signal is assigned to two pins and no new cards are needed', () => {
    const sigs = Object.values(plan.assignments).map((a) => a.sig).filter(Boolean)
    expect(new Set(sigs).size).toBe(sigs.length)
    expect(plan.newCards).toEqual([])
    expect(plan.rows.filter((r) => r.status === 'nopin')).toEqual([])
  })

  it('generated lathe project: symbols at the pinned addresses, unique X/Y, no pin conflicts', () => {
    const final = applyMopPlan(cfg, plan, 'mp225', 'm2')
    const p = generateProject(final, opts)
    const sym = new Map(p.symbols.map((s) => [s.address, s]))
    const expectSym = (a: string, re: RegExp) => {
      const s = sym.get(a)
      expect(s, `symbol at ${a}`).toBeDefined()
      expect(s!.comment ?? '', `${a} comment`).toMatch(re)
    }
    expectSym('X16.0', /mode/i)
    expectSym('X17.6', /cycle start/i)
    expectSym('X17.3', /-X/i)
    expectSym('X19.4', /\+X/i)
    expectSym('Y8.0', /refer/i)
    expectSym('Y8.7', /cycle start/i)

    const rows = planIo(final)
    const addrs = rows.map((r) => r.address)
    const dup = addrs.filter((a, i) => addrs.indexOf(a) !== i)
    expect(dup).toEqual([])
    expect(validateIo(rows, pmcOf(final))).toEqual({})
    expect(rows.filter((r) => r.pinError)).toEqual([])
    expect(validateCards(final, pmcOf(final), rows)).toEqual([])
    expect(p.warnings.filter((w) => /^I\/O cards|Double coil|Conflicting/.test(w))).toEqual([])
    // pinned rows really sit on their pin
    const byId = new Map(rows.map((r) => [r.id, r]))
    for (const [key, a] of Object.entries(plan.assignments)) {
      if (!a.sig) continue
      const pr = plan.rows.find((r) => r.key === key)!
      expect(byId.get(a.sig)?.address, `${a.sig} on ${key}`).toBe(pr.address)
    }
    // spare inputs become spare signals on their own pin addresses, not function signals
    for (const s of mop.spares.in) {
      const [conn, sno] = s.split('/')
      const r = rowOf(plan, conn, Number(sno))
      const io = rows.find((x) => x.address === r.address)
      expect(io?.id, s).toBe(`pin.${r.key}`)
    }
  })
})

describe('MP1010 on the operator panel module at X16 / Y8', () => {
  const mop = mopById('mp1010')!
  const cfg = lathe()
  const plan = planMop(cfg, 'm2', mop.pins, { enable: mop.enable, params: mop.params })

  it('AUTO key is an input, AUTO LED an output', () => {
    expect(rowOf(plan, 'CE56', 3)).toMatchObject({ kind: 'DI', address: 'X16.0', status: 'matched', sig: 'mode.AUTOPBI' })
    expect(rowOf(plan, 'CE56', 31)).toMatchObject({ kind: 'DO', address: 'Y8.0', status: 'matched', sig: 'mode.AUTOL' })
  })

  it('FEED16 present on CE57/26 → 5-bit feed override', () => {
    const r = rowOf(plan, 'CE57', 26)
    expect(r).toMatchObject({ kind: 'DI', address: 'X21.7', status: 'matched', sig: 'feedovr.OV16I' })
    expect(plan.params['feedovr.bits']).toBe(5)
  })

  it('mode push buttons replace the rotary mode option', () => {
    const final = applyMopPlan(cfg, plan, 'mp1010', 'm2')
    expect(final.accessories).toContain('mode')
    expect(final.accessories).not.toContain('moderot')
  })

  it('MKDS3/8 gets a new 8-DO terminal card; TOOL1..8 are outputs on its byte', () => {
    expect(plan.newCards).toHaveLength(1)
    const nc = plan.newCards[0]
    expect(nc.templateId).toBe('mkds8')
    const y = nc.yStart
    expect([1, 2, 3, 4].map((s) => rowOf(plan, 'MKDS3/8', s).address)).toEqual([0, 1, 2, 3].map((b) => `Y${y}.${b}`))
    for (const s of [1, 2, 3, 4]) {
      const r = rowOf(plan, 'MKDS3/8', s)
      expect(r.kind).toBe('DO')
      expect(['matched', 'spare']).toContain(r.status)
      if (r.status === 'matched') expect(r.sig).toMatch(/^pf-tooldisp\.TDSP[1248]O$/)
    }
    // new card must not overlap existing modules
    for (const m of cfg.modules) expect(y >= m.yStart + m.yBytes || y + nc.yBytes <= m.yStart, m.id).toBe(true)
  })

  it('P24 pins carry no signal; generated project is clean', () => {
    for (const p of mop.pins.filter((x) => x.label === 'P24' || x.label === '0V' || x.label === 'NC')) expect(rowOf(plan, p.conn, p.sno).sig).toBeUndefined()
    const final = applyMopPlan(cfg, plan, 'mp1010', 'm2')
    const rows = planIo(final)
    const addrs = rows.map((r) => r.address)
    expect(addrs.filter((a, i) => addrs.indexOf(a) !== i)).toEqual([])
    expect(validateIo(rows, pmcOf(final))).toEqual({})
    const p = generateProject(final, opts)
    expect(p.warnings.filter((w) => /^I\/O cards|Double coil|Conflicting/.test(w))).toEqual([])
  })
})

describe('non-zero start operator card', () => {
  it('MP 225 on a CE56 card at X40 / Y20 shifts all addresses', () => {
    const cfg = lathe()
    cfg.modules = [...cfg.modules, makeCard('op-ce56', 'm9', { xStart: 40, yStart: 20, group: 2, slot: 1, role: 'panel' })]
    const mop = mopById('mp225')!
    const plan = planMop(cfg, 'm9', mop.pins, { enable: mop.enable, params: mop.params })
    expect(rowOf(plan, 'CE56', 3).address).toBe('X40.0')
    expect(rowOf(plan, 'CE56', 17).address).toBe('X41.6')
    expect(rowOf(plan, 'CE57', 7).address).toBe('X43.4')
    expect(rowOf(plan, 'CE56', 31).address).toBe('Y20.0')
    expect(rowOf(plan, 'CE56', 38).address).toBe('Y20.7')
    expect(rowOf(plan, 'CE56', 3).card).toBe('m9')
  })
})
