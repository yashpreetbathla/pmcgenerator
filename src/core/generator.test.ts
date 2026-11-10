import { isOutput } from './types'
import { applyMachine, defaultConfig, generateProject, planIo, planMessages, validateIo, pmcOf, MSG_MAX, type BuildConfig } from './generator'
import type { PmcProject } from './types'
import { MACHINE_TYPES } from '@/data/machineTypes'
import { ACCESSORIES, accParam } from '@/data/accessories'
import { type MachineTypeId } from '@/data/machineTypes'

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

  it('marks custom device alarms as latched alarms with an optional timeout', () => {
    const cfg = defaultConfig('spm')
    cfg.customDevices = [{ id: 'd1', name: 'Clamp A', inputs: [{ symbol: 'CLAI', comment: 'Clamp A closed' }], outputs: [], alarms: [
      { text: '  clamp a   not closed ', kind: 'alarm', trigger: 'CLAI', when: 'off', timeout: 3000 },
      { text: 'Clamp A check', kind: 'operator', trigger: 'NOPE' },
    ] }]
    const p = generateProject(cfg, opts)
    const al = p.messages.find((m) => m.text === 'CLAMP A NOT CLOSED')!
    const op = p.messages.find((m) => m.text === 'CLAMP A CHECK')!
    expect(al.kind).toBe('alarm')
    expect(Number(op.number)).toBeGreaterThanOrEqual(2001)
    const net = p.nets.find((n) => n.instructions.some((i) => i.kind === 'basic' && i.op === 'WRT' && i.address === al.address))!
    expect(net.instructions).toContainEqual({ kind: 'basic', op: 'OR', address: al.address })
    expect(net.instructions).toContainEqual({ kind: 'basic', op: 'AND.NOT', address: 'F1.1' })
    expect(p.nets.some((n) => n.instructions.some((i) => i.kind === 'sub' && i.name === 'TMRB' && i.params[1] === 3000))).toBe(true)
    expect(p.warnings.some((w) => w.includes('"NOPE"'))).toBe(true)
  })

  it('custom devices with the same name get unique message symbols', () => {
    const cfg = defaultConfig('custom')
    const dev = (id: string) => ({ id, name: 'Gripper', inputs: [], outputs: [], alarms: [{ text: 'Gripper fault', kind: 'alarm' as const }] })
    cfg.customDevices = [dev('a'), dev('b')]
    const p = generateProject(cfg, opts)
    const syms = p.symbols.filter((s) => s.address.startsWith('A')).map((s) => s.symbol)
    expect(new Set(syms).size).toBe(syms.length)
  })
})

/* ------------------------------------------------------------------ */
/* Message coverage                                                    */
/* ------------------------------------------------------------------ */
const allOptions = (machine: MachineTypeId, axes?: string[]): BuildConfig => {
  const base = defaultConfig(machine)
  const cfg: BuildConfig = { ...base, accessories: ACCESSORIES.map((a) => a.id), axes: axes ?? base.axes }
  cfg.modules = cfg.modules.map((m) => ({ ...m, xBytes: 60, yBytes: 40, xStart: m.role === 'panel' ? 100 : 0, yStart: m.role === 'panel' ? 60 : 0 }))
  cfg.customDevices = [{ id: 'cd1', name: 'Gripper', inputs: [{ symbol: 'GRPI', comment: 'Gripper closed' }], outputs: [{ symbol: 'GRPO', comment: 'Gripper valve', onM: 140, offM: 141 }],
    alarms: [{ text: 'Gripper not closed', kind: 'alarm', trigger: 'GRPI', when: 'off', timeout: 2000 }, { text: 'Gripper open', kind: 'operator', trigger: 'GRPI', when: 'off' }] }]
  return cfg
}
const writers = (p: PmcProject) => {
  const w = new Set<string>()
  for (const n of p.nets) for (const i of n.instructions) if (i.kind === 'basic' && i.address && (i.op === 'WRT' || i.op === 'WRT.NOT' || i.op === 'SET')) w.add(i.address)
  return w
}
const readers = (p: PmcProject) => {
  const r = new Set<string>()
  for (const n of p.nets) for (const i of n.instructions) if (i.kind === 'basic' && i.address && !isOutput(i)) r.add(i.address)
  return r
}
function checkMessages(p: PmcProject) {
  const addrs = p.messages.map((m) => m.address), nums = p.messages.map((m) => m.number)
  expect(new Set(addrs).size, 'unique A addresses').toBe(addrs.length)
  expect(new Set(nums).size, 'unique numbers').toBe(nums.length)
  const w = writers(p)
  for (const m of p.messages) {
    expect(m.address, m.text).toMatch(/^A\d+\.[0-7]$/)
    expect(m.text.trim().length, m.address).toBeGreaterThan(0)
    expect(m.text, m.text).toBe(m.text.toUpperCase())
    const n = Number(m.number)
    if (m.kind === 'alarm') expect(n, m.text).toBeGreaterThanOrEqual(1000)
    if (m.kind === 'alarm') expect(n, m.text).toBeLessThanOrEqual(1999)
    if (m.kind === 'operator') expect(n, m.text).toBeGreaterThanOrEqual(2000)
    if (m.kind === 'operator') expect(n, m.text).toBeLessThanOrEqual(2999)
    expect(w.has(m.address), `orphan message ${m.number} ${m.text} (${m.address}) is never written`).toBe(true)
    expect(p.symbols.some((s) => s.address === m.address), `symbol for ${m.address}`).toBe(true)
  }
  // contiguous: alarms from A0.0, operator messages from the next byte, no holes inside a block
  const bit = (a: string) => { const [b, i] = a.slice(1).split('.').map(Number); return b * 8 + i }
  const al = p.messages.filter((m) => m.kind === 'alarm').map((m) => bit(m.address))
  const op = p.messages.filter((m) => m.kind === 'operator').map((m) => bit(m.address))
  al.forEach((b, i) => expect(b).toBe(i))
  const opStart = Math.ceil(al.length / 8) * 8
  op.forEach((b, i) => expect(b).toBe(opStart + i))
  p.messages.filter((m) => m.kind === 'alarm').forEach((m, i) => expect(Number(m.number)).toBe(1001 + i))
  p.messages.filter((m) => m.kind === 'operator').forEach((m, i) => expect(Number(m.number)).toBe(2001 + i))
  // DISPB covers every message bit
  const dispb = p.nets.flatMap((n) => n.instructions).find((i) => i.kind === 'sub' && i.name === 'DISPB')
  const top = Math.max(...p.messages.map((m) => bit(m.address))) + 1
  expect(dispb && dispb.kind === 'sub' ? Number(dispb.params[0]) : 0).toBeGreaterThanOrEqual(top)
}

describe('messages', () => {
  it('every option keeps its messages short, upper case and unique per option', () => {
    const cfg = allOptions('custom', ['X', 'Y', 'Z', 'A'])
    for (const m of planMessages(cfg).list) if (!m.custom) expect(m.text.length, m.text).toBeLessThanOrEqual(MSG_MAX)
  })

  it.each(MACHINE_TYPES.map((m) => m.id))('%s, every option: complete, unique, contiguous messages written by the ladder', (id) => {
    const cfg = allOptions(id)
    const p = generateProject(cfg, opts)
    checkMessages(p)
    // every message of every option is present
    const plan = planMessages(cfg)
    expect(p.messages.map((m) => m.address)).toEqual(plan.list.map((m) => m.address))
    const env = (a: (typeof ACCESSORIES)[number]) => ({ axes: cfg.axes, paths: cfg.paths, p: (k: string) => accParam(a, k, cfg.params), has: () => true })
    for (const a of ACCESSORIES) expect(plan.list.filter((m) => m.id.startsWith(`${a.id}.`)).map((m) => m.id).sort(), a.id).toEqual(a.define(env(a)).alarms.map((m) => `${a.id}.${m.key}`).sort())
    expect(p.messages.some((m) => m.text === 'GRIPPER NOT CLOSED' && m.kind === 'alarm')).toBe(true)
    expect(p.messages.filter((m) => m.kind === 'alarm').length).toBeGreaterThan(80)
    expect(p.messages.filter((m) => m.kind === 'operator').length).toBeGreaterThan(40)
  })

  it.each(MACHINE_TYPES.map((m) => m.id))('%s defaults: messages valid, alarms feed hold + start inhibit', (id) => {
    const p = generateProject(defaultConfig(id), opts)
    checkMessages(p)
    expect(p.warnings.some((w) => w.startsWith('Message request area exceeded'))).toBe(false)
    const any = p.symbols.find((s) => s.symbol === 'ALMANY')!
    expect(any).toBeDefined()
    const sp = p.nets.find((n) => n.instructions.some((i) => i.kind === 'basic' && i.op === 'WRT' && i.address === 'G8.5'))!
    expect(sp.instructions).toContainEqual({ kind: 'basic', op: 'AND.NOT', address: any.address })
    const st = p.nets.find((n) => n.instructions.some((i) => i.kind === 'basic' && i.op === 'WRT' && i.address === 'G7.2'))
    if (st) expect(st.instructions).toContainEqual({ kind: 'basic', op: 'AND.NOT', address: any.address })
  })

  it('is deterministic with every option', () => {
    const cfg = allOptions('hmc')
    expect(JSON.stringify(generateProject(cfg, opts))).toBe(JSON.stringify(generateProject(structuredClone(cfg), opts)))
  })

  it('every option with messages has an alarm or operator message referenced in its nets', () => {
    const cfg = allOptions('custom', ['X', 'Y', 'Z', 'A'])
    const p = generateProject(cfg, opts)
    const plan = planMessages(cfg).list
    const w = writers(p)
    for (const m of plan) expect(w.has(m.address), m.id).toBe(true)
    // spindle-stop and interlock alarms are collected into *SSTP / *IT
    const syms = new Map(p.symbols.map((s) => [s.symbol, s.address]))
    expect(readers(p).has(syms.get('ALMSP')!)).toBe(true)
    expect(readers(p).has(syms.get('ALMIT')!)).toBe(true)
  })

  it('two-position devices cover timeout, sensor fault, position lost and rejected commands', () => {
    const p = generateProject(allOptions('lathe'), opts)
    const t = new Set(p.messages.map((m) => m.text))
    for (const x of ['TAILSTOCK ADVANCE TIMEOUT', 'TAILSTOCK RETRACT TIMEOUT', 'TAILSTOCK SENSOR FAULT', 'TAILSTOCK POSITION LOST', 'TAILSTOCK RETRACT: SP RUNNING',
      'CHUCK CLAMP TIMEOUT', 'CHUCK UNCLAMPED IN CYCLE', 'CHUCK UNCLAMP: SP RUNNING', 'SPINDLE START: CHUCK OPEN', 'TURRET INDEX TIMEOUT', 'T-CODE OUT OF RANGE',
      'UNDEFINED M-CODE', 'M-CODE FIN TIMEOUT', 'SPINDLE AMPLIFIER ALARM', 'EMERGENCY STOP', '+X OVERTRAVEL - JOG X -', 'DOOR LOCK FAULT', 'AIR PRESSURE LOW']) expect(t.has(x), x).toBe(true)
  })

  it('names the E-stop button when monitor contacts are configured', () => {
    const cfg = { ...defaultConfig('lathe'), params: { 'estop.buttons': 3 } }
    const p = generateProject(cfg, opts)
    expect(p.messages.filter((m) => /^E-STOP BUTTON \d PRESSED$/.test(m.text))).toHaveLength(3)
    checkMessages(p)
  })

  it('disables FIN timeout alarms when the timeout is 0', () => {
    const cfg = { ...defaultConfig('vmc'), params: { 'mcode.finTimeout': 0, 'tcode.finTimeout': 0 } }
    const p = generateProject(cfg, opts)
    expect(p.messages.some((m) => m.text.includes('FIN TIMEOUT'))).toBe(false)
    checkMessages(p)
  })

  it('warns when the PMC A area is too small', () => {
    const cfg = { ...allOptions('custom', ['X', 'Y', 'Z', 'A']), pmcId: 'pmc-sa1' }
    expect(generateProject(cfg, opts).warnings.some((w) => w.startsWith('Message request area exceeded'))).toBe(false)
    cfg.customDevices = [{ id: 'big', name: 'Cell', inputs: [], outputs: [], alarms: Array.from({ length: 60 }, (_, i) => ({ text: `Cell fault ${i + 1}`, kind: 'alarm' as const })) }]
    const p = generateProject(cfg, opts)
    checkMessages(p)
    expect(p.warnings.some((w) => w.startsWith('Message request area exceeded'))).toBe(true)
  })
})
