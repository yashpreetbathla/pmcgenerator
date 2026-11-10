import { isOutput } from './types'
import { applyMachine, defaultConfig, generateProject, planIo, validateIo, pmcOf, type BuildConfig } from './generator'
import { MACHINE_TYPES } from '@/data/machineTypes'
import { ACCESSORIES } from '@/data/accessories'

const opts = { id: 'test', now: 1_700_000_000_000 }

describe('generator', () => {
  it('is deterministic', () => {
    const cfg = defaultConfig('vmc')
    expect(JSON.stringify(generateProject(cfg, opts))).toBe(JSON.stringify(generateProject(structuredClone(cfg), opts)))
  })

  it('puts the E-stop in Level 1 before END1, and ends with END2/END', () => {
    const p = generateProject(defaultConfig('lathe'), opts)
    const esp = p.nets.find((n) => n.instructions.some((i) => i.kind === 'basic' && i.op === 'WRT' && i.address === 'G8.4'))
    expect(esp?.level).toBe(1)
    expect(esp?.instructions[0]).toMatchObject({ op: 'RD', address: 'X8.4' })
    const names = p.nets.map((n) => (n.instructions[0].kind === 'sub' ? n.instructions[0].name : ''))
    const end1 = names.indexOf('END1'), end2 = names.indexOf('END2')
    expect(end1).toBeGreaterThan(p.nets.indexOf(esp!))
    expect(end2).toBeGreaterThan(end1)
    expect(names[names.length - 1]).toBe('END')
    expect(p.origin).toBe('generated')
  })

  it.each(MACHINE_TYPES.map((m) => m.id))('%s: every coil has a symbol, no X/Y double assignment, valid I/O', (id) => {
    const cfg = defaultConfig(id)
    const p = generateProject(cfg, opts)
    const sym = new Set(p.symbols.map((s) => s.address))
    for (const n of p.nets) for (const i of n.instructions) if (isOutput(i) && i.kind === 'basic') expect(sym.has(i.address!), `${i.address} in net ${n.id}`).toBe(true)
    const rows = planIo(cfg)
    const addrs = rows.map((r) => r.address)
    expect(new Set(addrs).size).toBe(addrs.length)
    expect(validateIo(rows, pmcOf(cfg))).toEqual({})
    expect(p.warnings.some((w) => w.startsWith('Double coil'))).toBe(false)
    expect(p.warnings.some((w) => w.startsWith('Conflicting'))).toBe(false)
    if (id !== 'custom') expect(p.messages.length).toBeGreaterThan(0)
  })

  it('every accessory generates without errors', () => {
    const cfg: BuildConfig = { ...defaultConfig('custom'), accessories: ACCESSORIES.map((a) => a.id), axes: ['X', 'Y', 'Z', 'A'] }
    cfg.modules = cfg.modules.map((m) => ({ ...m, xBytes: 60, yBytes: 40, xStart: m.role === 'panel' ? 100 : 0, yStart: m.role === 'panel' ? 60 : 0 }))
    const p = generateProject(cfg, opts)
    expect(p.nets.length).toBeGreaterThan(100)
    expect(p.warnings.some((w) => w.startsWith('Conflicting options'))).toBe(true)
  })

  it('warns when I/O capacity is exceeded', () => {
    const cfg = defaultConfig('hmc')
    cfg.modules = [{ ...cfg.modules[0], xBytes: 2, yBytes: 1 }]
    const p = generateProject(cfg, opts)
    expect(p.warnings.some((w) => w.startsWith('I/O capacity exceeded'))).toBe(true)
  })

  it('keeps fixed standard inputs and user overrides', () => {
    let cfg = applyMachine(defaultConfig('vmc'), 'vmc')
    cfg = { ...cfg, overrides: { 'coolant.COOLPBI': { address: 'X30.7', symbol: 'COOLSW' } } }
    const rows = planIo(cfg)
    expect(rows.find((r) => r.id === 'estop.EMGPBI')?.address).toBe('X8.4')
    expect(rows.find((r) => r.id === 'decdog.XDECI')?.address).toBe('X9.0')
    expect(rows.find((r) => r.id === 'coolant.COOLPBI')).toMatchObject({ address: 'X30.7', symbol: 'COOLSW' })
    const ov = rows.filter((r) => r.id.startsWith('feedovr.')).map((r) => r.address)
    expect(ov.map((a) => a.split('.')[1])).toEqual(['0', '1', '2', '3', '4'])
  })

  it('generates custom devices with M-code outputs and alarms', () => {
    const cfg = defaultConfig('spm')
    cfg.customDevices = [{ id: 'd1', name: 'Clamp A', inputs: [{ symbol: 'CLAI', comment: 'Clamp A closed' }], outputs: [{ symbol: 'CLAO', comment: 'Clamp A valve', onM: 140, offM: 141 }], alarms: [{ text: 'Clamp A not closed', kind: 'alarm', trigger: 'CLAI', when: 'off' }] }]
    const p = generateProject(cfg, opts)
    expect(p.symbols.some((s) => s.symbol === 'CLAO')).toBe(true)
    expect(p.messages.some((m) => m.text === 'CLAMP A NOT CLOSED')).toBe(true)
    expect(p.symbols.some((s) => s.symbol === 'M140')).toBe(true)
  })
})
