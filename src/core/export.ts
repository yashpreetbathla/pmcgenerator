/** Export helpers. All pure string builders — the UI passes the result to saveFile(). */
import { toCsv } from '@/lib/utils'
import { mergeFuncOutputNets } from './ladderTree'
import type { Instruction, PmcProject } from './types'

const slug = (s: string) => (s || 'pmc').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'pmc'
export const exportBaseName = (p: PmcProject) => slug(p.name || p.info.fileName || 'pmc')

export function symbolsCsv(p: PmcProject): string {
  return toCsv(p.symbols.map((s) => ({ ...s })), ['address', 'symbol', 'comment'])
}

export function messagesCsv(p: PmcProject): string {
  return toCsv(p.messages.map((m) => ({ ...m })), ['address', 'number', 'text', 'kind'])
}

const pad = (s: string, n: number) => (s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length))

/** One instruction → mnemonic lines (functional instructions are followed by one line per parameter). */
export function mnemonicLines(ins: Instruction): string[] {
  if (ins.kind === 'basic') return [ins.address ? pad(ins.op, 12) + ins.address : ins.op]
  const lines = [`${pad('SUB', 12)}${ins.sub} ${ins.name}`]
  ins.params.forEach((p) => lines.push(`${pad('', 12)}${p}`))
  if (ins.table?.length) lines.push(`${pad('', 12)}; table: ${ins.table.join(' ')}`)
  return lines
}

const levelLabel = (l: PmcProject['nets'][number]['level']) => (l === 'sub' ? 'Subprogram' : `Level ${l}`)

/** LADDER-III style mnemonic listing with net separators. */
export function mnemonicText(p: PmcProject): string {
  const head = [
    `; PMC mnemonic list — ${p.name}`,
    p.info.pmcType ? `; PMC type: ${p.info.pmcType}` : '',
    `; ${p.stats.nets} nets, ${p.stats.instructions} instructions`,
    p.origin === 'generated' ? '; DRAFT — verify in FANUC LADDER-III before use' : '',
    `; Exported by PMC Generator (browser). Reference only — not a LADDER-III import file.`,
  ].filter(Boolean)
  const body: string[] = []
  let lastLevel: string | undefined
  // Same net numbering as the viewer (functional instruction + its output coil = one net).
  for (const n of mergeFuncOutputNets(p.nets)) {
    const lvl = levelLabel(n.level)
    if (lvl !== lastLevel) { body.push('', `; ===== ${lvl} =====`); lastLevel = lvl }
    body.push(`; ---- N${String(n.id).padStart(4, '0')}${n.comment ? ' ' + n.comment : ''}`)
    for (const ins of n.instructions) body.push(...mnemonicLines(ins))
  }
  return [...head, ...body, ''].join('\n')
}

export function projectJson(p: PmcProject): string {
  return JSON.stringify(p, null, 2)
}
