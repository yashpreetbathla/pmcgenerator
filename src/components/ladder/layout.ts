/**
 * Grid layout for the FANUC-style ladder canvas.
 *
 * Every element occupies one grid cell (column × row). Wires run through the vertical middle of a row,
 * vertical connectors sit on column boundaries. Coils are right-aligned against the right power rail,
 * functional-instruction boxes sit just left of the coil column (like LADDER-III). A top-level series
 * that is wider than the row is wrapped onto continuation rows (marked with numbered arrows).
 *
 * Pure functions only — the canvas computes every net's height from this without rendering it.
 */
import { buildLadderTree, pinNames, type CoilOp, type LNode, type LOutput, type LRung, type LadderTree } from '@/core/ladderTree'
import type { FunctionalInstruction, Instruction } from '@/core/types'

export type Prim =
  | { k: 'contact'; x: number; y: number; address: string; negated: boolean }
  | { k: 'coil'; x: number; y: number; address: string; op: CoilOp }
  /** horizontal wire on row y from column boundary x0 to x1 */
  | { k: 'h'; y: number; x0: number; x1: number }
  /** vertical connector on column boundary x between the wires of rows y0 and y1 */
  | { k: 'v'; x: number; y0: number; y1: number }
  /** functional instruction box; pin rows are relative to the box's top row */
  | { k: 'box'; x: number; y: number; w: number; h: number; ins: FunctionalInstruction; pins: { y: number; name: string }[]; out: boolean; act: boolean }
  /** continuation arrow: 'out' at the end of a wrapped row, 'in' at the start of the next one */
  | { k: 'cont'; x: number; y: number; dir: 'out' | 'in'; label: string }
  | { k: 'note'; x: number; y: number; text: string }

export interface LayoutOpts {
  /** columns between the power rails (the last one is the coil column) */
  cols: number
  /** width of a functional instruction box in columns */
  boxCols: number
  /** rows a box needs for its header + parameter lines */
  boxRows: (ins: FunctionalInstruction) => number
}

export interface NetLayout { w: number; h: number; prims: Prim[]; issues: string[] }

interface Block { w: number; h: number; prims: Prim[] }

function put(into: Prim[], b: Block, dx: number, dy: number) {
  for (const p of b.prims) {
    switch (p.k) {
      case 'h': into.push({ ...p, y: p.y + dy, x0: p.x0 + dx, x1: p.x1 + dx }); break
      case 'v': into.push({ ...p, x: p.x + dx, y0: p.y0 + dy, y1: p.y1 + dy }); break
      default: into.push({ ...p, x: p.x + dx, y: p.y + dy })
    }
  }
}

const wire = (y: number, x0: number, x1: number): Prim[] => (x1 > x0 ? [{ k: 'h', y, x0, x1 }] : [])

export function nodeBlock(n: LNode | null): Block {
  if (!n) return { w: 1, h: 1, prims: wire(0, 0, 1) }
  if (n.t === 'contact') return { w: 1, h: 1, prims: [{ k: 'contact', x: 0, y: 0, address: n.address, negated: n.negated }] }
  if (n.t === 'series') {
    const prims: Prim[] = []
    let x = 0, h = 1
    for (const it of n.items) { const b = nodeBlock(it); put(prims, b, x, 0); x += b.w; h = Math.max(h, b.h) }
    return { w: x, h, prims }
  }
  const bs = n.items.map(nodeBlock)
  const w = Math.max(...bs.map((b) => b.w))
  const prims: Prim[] = []
  let y = 0, last = 0
  for (const b of bs) { put(prims, b, 0, y); prims.push(...wire(y, b.w, w)); last = y; y += b.h }
  if (last > 0) prims.push({ k: 'v', x: 0, y0: 0, y1: last }, { k: 'v', x: w, y0: 0, y1: last })
  return { w, h: y, prims }
}

function outputBlock(out: LOutput, o: LayoutOpts): Block {
  if (out.t === 'coil') return { w: 1, h: 1, prims: [{ k: 'coil', x: 0, y: 0, address: out.address, op: out.op }] }
  const h = Math.max(o.boxRows(out.ins), out.coils.length || 1)
  const prims: Prim[] = [{ k: 'box', x: 0, y: 0, w: o.boxCols, h, ins: out.ins, pins: [], out: out.coils.length > 0, act: true }]
  out.coils.forEach((c, i) => prims.push({ k: 'coil', x: o.boxCols, y: i, address: c.address, op: c.op }))
  if (out.coils.length > 1) prims.push({ k: 'v', x: o.boxCols, y0: 0, y1: out.coils.length - 1 })
  // A box without output coils still reserves the coil column (left empty, no wire to the rail).
  return { w: o.boxCols + 1, h, prims }
}

const isFuncOnly = (r: LRung) => r.outputs.length === 1 && r.outputs[0].out.t === 'func' && !r.outputs[0].cond

function rungBlock(r: LRung, o: LayoutOpts): Block {
  const C = o.cols
  const prims: Prim[] = []

  // Multi-input functional instruction (CTR, ROT, CODB …): one input line per pin.
  if (r.inputs.length > 1 && isFuncOnly(r)) {
    const out = r.outputs[0].out as Extract<LOutput, { t: 'func' }>
    const ob = outputBlock(out, o)
    const ins = r.inputs.map(nodeBlock)
    const names = pinNames(out.ins.name, ins.length)
    const xBox = Math.max(C - ob.w, ...ins.map((b) => b.w))
    const pins: { y: number; name: string }[] = []
    let y = 0
    ins.forEach((b, i) => { put(prims, b, 0, y); prims.push(...wire(y, b.w, xBox)); pins.push({ y, name: names[i] }); y += b.h })
    const h = Math.max(y, ob.h)
    put(prims, { ...ob, prims: ob.prims.map((p) => (p.k === 'box' ? { ...p, h, pins, act: false } : p)) }, xBox, 0)
    return { w: xBox + ob.w, h, prims }
  }

  const input = r.inputs.length ? r.inputs[0] : undefined
  const branches = r.outputs.map((br) => ({ cond: br.cond ? nodeBlock(br.cond) : null, out: outputBlock(br.out, o) }))
  const wOut = branches.length ? Math.max(...branches.map((b) => (b.cond?.w ?? 0) + b.out.w)) : 0
  const avail = Math.max(1, C - wOut)

  // Input logic, wrapped into bands when a top-level series is wider than the row.
  let yLast = 0, wLast = 0, hLast = 1
  if (input !== undefined) {
    const whole = nodeBlock(input)
    let bands: Block[][] = [[whole]]
    if (whole.w > avail && input?.t === 'series') {
      const items = input.items.map(nodeBlock)
      // Fill rows greedily from the start (leaving room for the continuation arrow), then make sure the
      // final row still fits next to the outputs — spill its tail onto one more row if not.
      bands = []
      let cur: Block[] = [], cw = 0
      for (const b of items) {
        if (cur.length && cw + b.w > C - 1) { bands.push(cur); cur = []; cw = 0 }
        cur.push(b); cw += b.w
      }
      const final: Block[] = []
      let fw = 0
      while (cur.length && (final.length === 0 || fw + cur[cur.length - 1].w <= avail)) { const b = cur.pop()!; final.unshift(b); fw += b.w }
      if (cur.length) bands.push(cur)
      bands.push(final)
    }
    let y = 0
    bands.forEach((band, j) => {
      let x = 0, h = 1
      for (const b of band) { put(prims, b, x, y); x += b.w; h = Math.max(h, b.h) }
      if (j > 0) prims.push({ k: 'cont', x: 0, y, dir: 'in', label: String(j) })
      if (j < bands.length - 1) prims.push({ k: 'cont', x, y, dir: 'out', label: String(j + 1) })
      if (j === bands.length - 1) { yLast = y; wLast = x; hLast = h }
      y += h
    })
  }

  if (!branches.length) {
    prims.push({ k: 'note', x: wLast, y: yLast, text: 'no output' })
    return { w: Math.max(C, wLast + 2), h: yLast + hLast, prims }
  }

  const W = Math.max(C, wLast + wOut)
  const xo = W - wOut
  const hasIn = input !== undefined
  if (branches.length === 1 && !branches[0].cond) {
    const ob = hasIn ? branches[0].out : { ...branches[0].out, prims: branches[0].out.prims.map((p) => (p.k === 'box' ? { ...p, act: false } : p)) }
    if (hasIn) prims.push(...wire(yLast, wLast, W - ob.w))
    put(prims, ob, W - ob.w, yLast)
    return { w: W, h: yLast + Math.max(hLast, ob.h), prims }
  }
  if (hasIn) prims.push(...wire(yLast, wLast, xo))
  let y = yLast, lastY = yLast
  for (const b of branches) {
    let x = xo
    if (b.cond) { put(prims, b.cond, xo, y); x += b.cond.w }
    prims.push(...wire(y, x, W - b.out.w))
    put(prims, b.out, W - b.out.w, y)
    lastY = y
    y += Math.max(b.cond?.h ?? 1, b.out.h)
  }
  if (lastY > yLast) prims.push({ k: 'v', x: xo, y0: yLast, y1: lastY })
  return { w: W, h: Math.max(y, yLast + hLast), prims }
}

function layoutTree(tree: LadderTree, o: LayoutOpts): NetLayout {
  const blocks = tree.rungs.map((r) => rungBlock(r, o))
  const w = Math.max(o.cols, ...blocks.map((b) => b.w))
  const prims: Prim[] = []
  let y = 0
  for (const b of blocks) { put(prims, b, 0, y); y += b.h }
  return { w, h: Math.max(1, y), prims, issues: tree.issues }
}

const trees = new WeakMap<Instruction[], LadderTree>()
export function treeOf(instructions: Instruction[]): LadderTree {
  let t = trees.get(instructions)
  if (!t) { t = buildLadderTree(instructions); trees.set(instructions, t) }
  return t
}

/** Lays out one net. A net wider than `cols` (an unwrappable parallel block) is re-laid at its own width so its coils still touch its rail. */
export function layoutNet(instructions: Instruction[], o: LayoutOpts): NetLayout {
  const tree = treeOf(instructions)
  const first = layoutTree(tree, o)
  return first.w > o.cols ? layoutTree(tree, { ...o, cols: first.w }) : first
}

/** Addresses drawn as contacts/coils (in drawing order, de-duplicated). */
export function primAddresses(l: NetLayout): string[] {
  const s = new Set<string>()
  for (const p of l.prims) if (p.k === 'contact' || p.k === 'coil') s.add(p.address)
  return [...s]
}
