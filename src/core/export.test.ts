import { existsSync, readFileSync } from 'node:fs'
import { decodePmcBackup } from './decoder'
import { buildLadderTree, mergeFuncOutputNets } from './ladderTree'
import { exportBaseName, messagesCsv, mnemonicText, projectJson, symbolsCsv } from './export'
import type { PmcProject } from './types'

const project: PmcProject = {
  id: 'p1', name: 'Test Lathe #1', origin: 'generated', createdAt: 0,
  info: { pmcType: '0i-D PMC/L' }, memoryMap: [],
  symbols: [{ address: 'X8.4', symbol: 'ESP', comment: 'Emergency "stop"', source: 'generated' }],
  messages: [{ address: 'A0.0', number: '1001', text: 'Lube low, check', kind: 'alarm' }],
  nets: [
    { id: 1, level: 1, instructions: [{ kind: 'basic', op: 'RD', address: 'X8.4' }, { kind: 'basic', op: 'WRT', address: 'G8.4' }] },
    { id: 2, level: 1, instructions: [{ kind: 'sub', sub: 1, name: 'END1', params: [] }] },
    { id: 3, level: 2, instructions: [{ kind: 'basic', op: 'RD', address: 'R0.0' }, { kind: 'sub', sub: 24, name: 'TMRB', params: [1, 1000] }, ] },
  ],
  warnings: [], stats: { nets: 3, instructions: 5, unknownWords: 0 },
}

describe('export', () => {
  it('symbol CSV quotes and escapes', () => {
    expect(symbolsCsv(project)).toBe('address,symbol,comment\n"X8.4","ESP","Emergency ""stop"""')
  })
  it('message CSV', () => {
    expect(messagesCsv(project).split('\n')[1]).toBe('"A0.0","1001","Lube low, check","alarm"')
  })
  it('mnemonic text has one instruction per line and net separators', () => {
    const t = mnemonicText(project)
    expect(t).toMatch(/^RD\s+X8\.4$/m)
    expect(t).toMatch(/^WRT\s+G8\.4$/m)
    expect(t).toMatch(/^SUB\s+24 TMRB$/m)
    expect(t).toMatch(/^\s+1000$/m)
    expect(t).toContain('; ---- N0001')
    expect(t).toContain('; ===== Level 2 =====')
    expect(t).toContain('DRAFT')
  })
  it('json round-trips and file names are safe', () => {
    expect(JSON.parse(projectJson(project)).nets).toHaveLength(3)
    expect(exportBaseName(project)).toBe('Test_Lathe_1')
  })
})

// Optional local smoke test against a real backup (never committed). Set PMC_SAMPLE=/path/to/PMC1.000
const sample = process.env.PMC_SAMPLE
describe.skipIf(!sample || !existsSync(sample))('real backup', () => {
  it('every net converts to a ladder tree and exports', () => {
    const p = decodePmcBackup(readFileSync(sample!))
    let issues = 0
    const nets = mergeFuncOutputNets(p.nets)
    for (const n of nets) issues += buildLadderTree(n.instructions).issues.length ? 1 : 0
    console.log(`nets=${p.nets.length} netsWithIssues=${issues}`)
    expect(issues / nets.length).toBeLessThan(0.02)
    expect(mnemonicText(p).length).toBeGreaterThan(1000)
  })
})
