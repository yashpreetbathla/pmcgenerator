/** Cross reference: where is an address used in the ladder (contact, coil, functional instruction parameter)? */
import { parseAddress, type Instruction, type Net } from './types'

export type RefRole = 'contact' | 'coil' | 'param'

export interface XRef {
  netId: number
  /** index of the net in the project's nets array */
  netIndex: number
  /** instruction index inside the net */
  step: number
  role: RefRole
  /** "RD.NOT", "WRT", "SUB 24 TMRB" … */
  op: string
  /** the address exactly as written in the instruction */
  address: string
}

export type XRefIndex = Map<string, XRef[]>

const byteOf = (a: string) => {
  const p = parseAddress(a)
  return p ? `${p.area}${p.byte}` : a
}

/** Addresses referenced by one instruction, with their role. */
export function instructionRefs(ins: Instruction): { address: string; role: RefRole }[] {
  if (ins.kind === 'basic') {
    if (!ins.address) return []
    const coil = ins.op === 'WRT' || ins.op === 'WRT.NOT' || ins.op === 'SET' || ins.op === 'RST'
    return [{ address: ins.address, role: coil ? 'coil' : 'contact' }]
  }
  return ins.params.filter((p): p is string => typeof p === 'string' && parseAddress(p) !== null).map((address) => ({ address, role: 'param' as const }))
}

export const opLabel = (ins: Instruction) => (ins.kind === 'basic' ? ins.op : `SUB ${ins.sub} ${ins.name}`)

/** Build an index keyed by exact address ("X8.4", "R302"). */
export function buildXRef(nets: Net[]): XRefIndex {
  const idx: XRefIndex = new Map()
  nets.forEach((net, netIndex) => {
    net.instructions.forEach((ins, step) => {
      for (const { address, role } of instructionRefs(ins)) {
        let list = idx.get(address)
        if (!list) idx.set(address, (list = []))
        list.push({ netId: net.id, netIndex, step, role, op: opLabel(ins), address })
      }
    })
  })
  return idx
}

/**
 * Look up all references for an address. A bit address ("R302.1") also matches byte-wide parameters ("R302");
 * a byte address ("R302") also matches every bit of that byte.
 */
export function findRefs(idx: XRefIndex, query: string): XRef[] {
  const p = parseAddress(query)
  if (!p) return []
  const exact = p.bit === undefined ? `${p.area}${p.byte}` : `${p.area}${p.byte}.${p.bit}`
  const byte = `${p.area}${p.byte}`
  const out: XRef[] = []
  for (const [addr, refs] of idx) {
    if (addr === exact || (p.bit !== undefined && addr === byte) || (p.bit === undefined && byteOf(addr) === byte)) out.push(...refs)
  }
  return out.sort((a, b) => a.netIndex - b.netIndex || a.step - b.step)
}

/** Group refs by role for display. */
export function groupRefs(refs: XRef[]) {
  return {
    coil: refs.filter((r) => r.role === 'coil'),
    contact: refs.filter((r) => r.role === 'contact'),
    param: refs.filter((r) => r.role === 'param'),
  }
}

/** Set of every address used anywhere in the ladder (also byte addresses of bit references). */
export function usedAddresses(idx: XRefIndex): Set<string> {
  const s = new Set<string>()
  for (const a of idx.keys()) { s.add(a); s.add(byteOf(a)) }
  return s
}
