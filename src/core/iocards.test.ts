import { defaultConfig, generateProject, planIo, pmcOf, validateCards, validateIo, type BuildConfig } from './generator'
import { applyMopPlan, planMop } from './mop'
import { makeCard, pinKey } from '@/data/ioCards'
import { mopById, parseMopTable } from '@/data/mopPresets'

const opts = { id: 't', now: 0 }
const withMop = (id: string, cfg: BuildConfig = defaultConfig('lathe')) => {
  const mop = mopById(id)!
  const plan = planMop(cfg, 'm2', mop.pins, { enable: mop.enable, params: mop.params })
  return { plan, cfg: applyMopPlan(cfg, plan, id, 'm2') }
}

describe('I/O cards + MOP', () => {
  it('MP 225 gives exact X/Y per pin and a valid project', () => {
    const { cfg } = withMop('mp225')
    const rows = planIo(cfg)
    const at = (id: string) => rows.find((r) => r.id === id)?.address
    expect(at('moderot.MDSW1I')).toBe('X16.0')
    expect(at('feedovr.OV8I')).toBe('X17.1')
    expect(at('cycle.CYSTPBI')).toBe('X17.6')
    expect(at('jog.+XDIRI')).toBe('X19.4')
    expect(at('chuck.CHKIDSWI')).toBe('X21.6')
    expect(at('pf-zpall.ZPALLL')).toBe('Y8.0')
    expect(at('cycle.CYSTL')).toBe('Y8.7')
    expect(at('cycle.FHLDL')).toBe('Y11.1')
    expect(rows.find((r) => r.id === 'jog.+XDIRI')?.pin).toMatchObject({ conn: 'CE57', sno: 7, name: 'A04' })
    expect(cfg.accessories).toContain('moderot')
    expect(cfg.accessories).not.toContain('mode')
    expect(validateIo(rows, pmcOf(cfg))).toEqual({})
    expect(validateCards(cfg)).toEqual([])
    const p = generateProject(cfg, opts)
    expect(p.warnings.some((w) => w.startsWith('Double coil'))).toBe(false)
    expect(p.symbols.find((s) => s.address === 'X16.0')?.symbol).toBe('MDSW1I')
    // DUMMY pins stay empty, never auto-assigned
    expect(rows.some((r) => r.address === 'X17.2')).toBe(false)
  })

  it('unmatched labels become spare signals with the label as comment', () => {
    const { cfg } = withMop('mp225')
    const rows = planIo(cfg)
    const sp = rows.find((r) => r.address === 'X20.2')!
    expect(sp).toMatchObject({ comment: 'IN/SP 1', symbol: 'IN/SP1', custom: true })
    expect(rows.find((r) => r.address === 'X19.6')?.comment).toBe('AUTO REF')
    const p = generateProject(cfg, opts)
    expect(p.symbols.find((s) => s.address === 'Y8.3')?.comment).toBe('OP/SP 1')
  })

  it('MP1010 adds the MKDS3/8 output terminal and validates', () => {
    const { cfg, plan } = withMop('mp1010')
    expect(plan.newCards).toHaveLength(1)
    const rows = planIo(cfg)
    expect(validateIo(rows, pmcOf(cfg))).toEqual({})
    expect(validateCards(cfg)).toEqual([])
    expect(rows.find((r) => r.id === 'pf-tooldisp.TDSP1O')?.address).toBe(`Y${plan.newCards[0].yStart}.0`)
    expect(cfg.params['feedovr.bits']).toBe(5)
  })

  it('detects overlapping X/Y ranges, duplicate slots and wrong-direction pins', () => {
    const cfg = defaultConfig('lathe')
    cfg.modules = [...cfg.modules, makeCard('generic-16', 'm3', { group: 1, slot: 1, xStart: 4, yStart: 20 })]
    const issues = validateCards(cfg).map((i) => i.text)
    expect(issues.some((t) => /overlap/.test(t))).toBe(true)
    expect(issues.some((t) => /slot 1/.test(t))).toBe(true)
    cfg.pinMap = { [pinKey('m2', 'CE56', 3)]: { sig: 'coolant.COOLL' } }
    const err = validateIo(planIo(cfg), pmcOf(cfg))
    expect(err['coolant.COOLL']).toMatch(/input \(DI\) pin/)
  })

  it('one signal on two pins is an error', () => {
    const cfg = defaultConfig('lathe')
    cfg.pinMap = { [pinKey('m2', 'CE56', 3)]: { sig: 'coolant.COOLPBI' }, [pinKey('m2', 'CE56', 4)]: { sig: 'coolant.COOLPBI' } }
    expect(validateIo(planIo(cfg), pmcOf(cfg))['coolant.COOLPBI']).toMatch(/two pins/)
  })

  it('multiple groups: a second panel module in group 2 takes its own addresses', () => {
    const cfg = defaultConfig('lathe')
    cfg.modules = [...cfg.modules, makeCard('op-ce56', 'm3', { name: 'Pendant', group: 2, xStart: 40, yStart: 20 })]
    cfg.pinMap = { [pinKey('m3', 'CE57', 7)]: { sig: 'jog.+XDIRI' }, [pinKey('m3', 'CE56', 31)]: { label: 'BEACON' } }
    const rows = planIo(cfg)
    expect(rows.find((r) => r.id === 'jog.+XDIRI')?.address).toBe('X43.4')
    expect(rows.find((r) => r.address === 'Y20.0')?.comment).toBe('BEACON')
    expect(validateCards(cfg)).toEqual([])
    expect(validateIo(rows, pmcOf(cfg))).toEqual({})
  })

  it('is deterministic with a MOP applied', () => {
    const { cfg } = withMop('mp225')
    expect(JSON.stringify(generateProject(cfg, opts))).toBe(JSON.stringify(generateProject(structuredClone(cfg), opts)))
  })

  it('parses pasted MOP tables', () => {
    const { pins, skipped } = parseMopTable('CE56,3,MODE 1\nCE56 4 MODE 2\nCE57\n3 AUTO SW11\n47-50 24E\nInput spares: CE57/13, 14\nCE56/5 MODE 4')
    const get = (c: string, n: number) => pins.find((p) => p.conn === c && p.sno === n)
    expect(get('CE56', 3)?.label).toBe('MODE 1')
    expect(get('CE56', 4)?.label).toBe('MODE 2')
    expect(get('CE57', 3)).toMatchObject({ label: 'AUTO', ref: 'SW11' })
    expect(get('CE57', 49)?.label).toBe('24E')
    expect(get('CE57', 14)?.label).toBe('SPARE')
    expect(get('CE56', 5)?.label).toBe('MODE 4')
    expect(skipped).toEqual([])
  })
})
