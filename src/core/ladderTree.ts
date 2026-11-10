/**
 * Converts a net's stack-based instruction list (FANUC mnemonic order) into a series/parallel tree
 * that can be drawn as a ladder diagram.
 *
 * Semantics (FANUC PMC basic instructions):
 *  - RD / RD.NOT         start a new logic line (net start)
 *  - RD.STK / RD.NOT.STK push the current result and start a new branch
 *  - AND / AND.NOT       series contact with the current branch
 *  - OR / OR.NOT         parallel contact with the current branch
 *  - AND.STK / OR.STK    combine the top two stack entries in series / parallel
 *  - WRT / WRT.NOT / SET / RST  coil driven by the current result (several coils per net allowed;
 *                        AND after a coil adds a condition that only applies to the following coils)
 *  - Functional instructions (SUB n) take every stack entry as an input, bottom = first input,
 *    top = ACT (e.g. CTR: CN0, UPDOWN, RST, ACT).
 */
import { isOutput, type BasicInstruction, type FunctionalInstruction, type Instruction, type Net } from './types'

export type LNode =
  | { t: 'contact'; address: string; negated: boolean; index: number }
  | { t: 'series'; items: LNode[] }
  | { t: 'parallel'; items: LNode[] }

export type CoilOp = 'WRT' | 'WRT.NOT' | 'SET' | 'RST'

export type LOutput =
  | LCoil
  | { t: 'func'; ins: FunctionalInstruction; index: number; /** coils written by the instruction's output (W1) */ coils: LCoil[] }

export interface LCoil { t: 'coil'; op: CoilOp; address: string; index: number }

export interface LOutputBranch {
  /** Extra series condition that only applies to this output (AND after a previous coil). */
  cond: LNode | null
  out: LOutput
}

export interface LRung {
  /** Input logic lines. Length 1 for normal rungs; >1 for multi-input functional instructions; 0 for e.g. END1. */
  inputs: (LNode | null)[]
  outputs: LOutputBranch[]
}

export interface LadderTree {
  rungs: LRung[]
  /** Non-fatal structural problems (e.g. stack underflow) — the diagram is best effort. */
  issues: string[]
}

const contact = (i: BasicInstruction, index: number, negated: boolean): LNode => ({ t: 'contact', address: i.address ?? '?', negated, index })

/** Series combine, flattening nested series. */
export function series(a: LNode | null, b: LNode | null): LNode | null {
  if (!a) return b
  if (!b) return a
  const items = [...(a.t === 'series' ? a.items : [a]), ...(b.t === 'series' ? b.items : [b])]
  return { t: 'series', items }
}
/** Parallel combine, flattening nested parallels. */
export function parallel(a: LNode | null, b: LNode | null): LNode | null {
  if (!a) return b
  if (!b) return a
  const items = [...(a.t === 'parallel' ? a.items : [a]), ...(b.t === 'parallel' ? b.items : [b])]
  return { t: 'parallel', items }
}

export function buildLadderTree(instructions: Instruction[]): LadderTree {
  const rungs: LRung[] = []
  const issues: string[] = []
  let stack: (LNode | null)[] = []
  /** Open coil group: outputs sharing the same base logic. */
  let group: { base: LNode | null; outputs: LOutputBranch[]; extra: LNode | null } | null = null
  /** Last functional instruction — coils directly after it are driven by its output. */
  let lastFunc: Extract<LOutput, { t: 'func' }> | null = null

  const closeGroup = () => {
    if (group) rungs.push({ inputs: [group.base], outputs: group.outputs })
    group = null
  }
  const top = () => (stack.length ? stack[stack.length - 1] : null)
  const setTop = (n: LNode | null) => { if (stack.length) stack[stack.length - 1] = n; else stack.push(n) }

  instructions.forEach((ins, index) => {
    if (ins.kind === 'sub') {
      const out = { t: 'func' as const, ins, index, coils: [] }
      lastFunc = out
      if (group && stack.length <= 1) {
        group.outputs.push({ cond: group.extra, out })
        return
      }
      closeGroup()
      rungs.push({ inputs: stack.slice(), outputs: [{ cond: null, out }] })
      stack = []
      return
    }
    const op = ins.op
    const isCoil = op === 'WRT' || op === 'WRT.NOT' || op === 'SET' || op === 'RST'
    if (isCoil && lastFunc && !stack.length) {
      lastFunc.coils.push({ t: 'coil', op, address: ins.address ?? '?', index })
      return
    }
    lastFunc = null
    if (isCoil) {
      if (!stack.length) issues.push(`Coil at step ${index + 1} has no input logic.`)
      if (stack.length > 1) issues.push(`Coil at step ${index + 1}: ${stack.length - 1} unclosed branch(es).`)
      if (!group) group = { base: top(), outputs: [], extra: null }
      group.outputs.push({ cond: group.extra, out: { t: 'coil', op, address: ins.address ?? '?', index } })
      return
    }
    if (group && (op === 'AND' || op === 'AND.NOT')) {
      const c = contact(ins, index, op === 'AND.NOT')
      group.extra = series(group.extra, c)
      setTop(series(top(), c))
      return
    }
    if (group) {
      // Anything else after a coil starts a new rung within the same net.
      const keep = op === 'RD' || op === 'RD.NOT' ? null : top()
      closeGroup()
      stack = keep ? [keep] : []
    }
    switch (op) {
      case 'RD': case 'RD.NOT':
        if (stack.length) { closeDangling(stack, rungs); stack = [] }
        stack.push(contact(ins, index, op === 'RD.NOT'))
        break
      case 'RD.STK': case 'RD.NOT.STK':
        stack.push(contact(ins, index, op === 'RD.NOT.STK'))
        break
      case 'AND': case 'AND.NOT':
        if (!stack.length) issues.push(`${op} at step ${index + 1} without a preceding RD.`)
        setTop(series(top(), contact(ins, index, op === 'AND.NOT')))
        break
      case 'OR': case 'OR.NOT':
        if (!stack.length) issues.push(`${op} at step ${index + 1} without a preceding RD.`)
        setTop(parallel(top(), contact(ins, index, op === 'OR.NOT')))
        break
      case 'AND.STK': case 'OR.STK': {
        if (stack.length < 2) { issues.push(`${op} at step ${index + 1}: stack underflow.`); break }
        const b = stack.pop()!, a = stack.pop()!
        stack.push(op === 'AND.STK' ? series(a, b) : parallel(a, b))
        break
      }
    }
  })
  if (group) { closeGroup(); stack = [] }
  if (stack.some(Boolean)) {
    issues.push('Net ends without an output.')
    closeDangling(stack, rungs)
  }
  return { rungs, issues }
}

/** Logic left on the stack without an output is still shown (as an open rung). */
function closeDangling(stack: (LNode | null)[], rungs: LRung[]) {
  for (const s of stack) if (s) rungs.push({ inputs: [s], outputs: [] })
}

/** Depth-first list of contacts in a node (for tests / search). */
export function contactsOf(n: LNode | null): Extract<LNode, { t: 'contact' }>[] {
  if (!n) return []
  if (n.t === 'contact') return [n]
  return n.items.flatMap(contactsOf)
}

/** Compact text form, e.g. "(X1 & !X2 | R3)". Handy in tests and for accessibility labels. */
export function nodeToString(n: LNode | null): string {
  if (!n) return '∅'
  if (n.t === 'contact') return (n.negated ? '!' : '') + n.address
  const sep = n.t === 'series' ? ' & ' : ' | '
  return '(' + n.items.map(nodeToString).join(sep) + ')'
}

/** Known input pin names for multi-input functional instructions (top → bottom; last is ACT). */
export const FUNC_PINS: Record<string, string[]> = {
  CTR: ['CN0', 'UPDOWN', 'RST', 'ACT'],
  CTRB: ['CN0', 'UPDOWN', 'RST', 'ACT'],
  CTRC: ['CN0', 'UPDOWN', 'RST', 'ACT'],
  ROT: ['RN0', 'BYT', 'DIR', 'POS', 'INC', 'ACT'],
  ROTB: ['RN0', 'DIR', 'POS', 'INC', 'ACT'],
  CODB: ['RST', 'ACT'],
  COD: ['RST', 'ACT'],
  SFT: ['DIR', 'CONT', 'RST', 'ACT'],
  COMPB: ['ACT'],
  ADDB: ['RST', 'ACT'], SUBB: ['RST', 'ACT'], MULB: ['RST', 'ACT'], DIVB: ['RST', 'ACT'],
  DSCHB: ['RST', 'ACT'], XMOVB: ['RW', 'RST', 'ACT'], XMOV: ['RW', 'RST', 'ACT'],
  DCNVB: ['SIN', 'CNV', 'RST', 'ACT'], DCNV: ['CNV', 'RST', 'ACT'],
}
export function pinNames(name: string, count: number): string[] {
  const known = FUNC_PINS[name]
  if (known && known.length >= count) return known.slice(known.length - count)
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? 'ACT' : ''))
}

const endsWithFunc = (n: Net) => n.instructions[n.instructions.length - 1]?.kind === 'sub'
const startsWithCoil = (n: Net) => { const f = n.instructions[0]; return f?.kind === 'basic' && isOutput(f) }

/** A RD / RD.NOT after a coil always starts a new net (some decoders only split on RD). */
function splitAtNewRead(n: Net): Net[] {
  const parts: Instruction[][] = [[]]
  let afterCoil = false
  for (const ins of n.instructions) {
    const isRead = ins.kind === 'basic' && (ins.op === 'RD' || ins.op === 'RD.NOT')
    if (isRead && afterCoil && parts[parts.length - 1].length) parts.push([])
    parts[parts.length - 1].push(ins)
    afterCoil = isOutput(ins)
  }
  return parts.length === 1 ? [n] : parts.map((instructions) => ({ ...n, instructions }))
}

/**
 * Also splits nets at a RD/RD.NOT that follows a coil.
 * Some decoders split "SUB … / WRT" (functional instruction + its output coil) into two nets.
 * In LADDER-III they are one net, so re-join a coil-first net onto a preceding functional-instruction net.
 * Returns new Net objects with sequential ids; `sourceIds` keeps the original ids.
 */
export function mergeFuncOutputNets(nets: Net[]): (Net & { sourceIds: number[] })[] {
  const out: (Net & { sourceIds: number[] })[] = []
  for (const n of nets.flatMap(splitAtNewRead)) {
    const prev = out[out.length - 1]
    if (prev && prev.level === n.level && endsWithFunc(prev) && startsWithCoil(n)) {
      prev.instructions = [...prev.instructions, ...n.instructions]
      prev.sourceIds.push(n.id)
      continue
    }
    out.push({ ...n, instructions: n.instructions.slice(), sourceIds: [n.id] })
  }
  out.forEach((n, i) => { n.id = i + 1 })
  return out
}
