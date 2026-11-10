import { useMemo } from 'react'
import { buildXRef, usedAddresses, type XRefIndex } from '@/core/crossref'
import { mergeFuncOutputNets } from '@/core/ladderTree'
import type { Net, PmcProject, SymbolEntry } from '@/core/types'

export type LevelKey = '1' | '2' | '3' | 'sub'
export interface ViewNet extends Net {
  sourceIds: number[]
  levelKey: LevelKey
  /** "P12" for nets inside a subprogram */
  program?: string
}

export interface ProjectIndex {
  nets: ViewNet[]
  netById: Map<number, number>
  symbols: Map<string, SymbolEntry>
  xref: XRefIndex
  used: Set<string>
  levels: { key: LevelKey; label: string; count: number }[]
}

export const levelLabel = (k: LevelKey) => (k === 'sub' ? 'Subprograms' : `Level ${k}`)

/** Derived, memoised lookups for one project (built once per project, shared by all tabs). */
export function useProjectIndex(p: PmcProject | undefined): ProjectIndex | undefined {
  return useMemo(() => {
    if (!p) return undefined
    let inSub: string | undefined
    const nets: ViewNet[] = mergeFuncOutputNets(p.nets).map((n) => {
      const sp = n.instructions.find((i) => i.kind === 'sub' && i.name === 'SP')
      if (sp && sp.kind === 'sub') inSub = `P${sp.params[0] ?? ''}`
      const program = inSub
      const levelKey: LevelKey = n.level === 'sub' || program ? 'sub' : (String(n.level) as LevelKey)
      if (n.instructions.some((i) => i.kind === 'sub' && i.name === 'SPE')) inSub = undefined
      return { ...n, levelKey, program }
    })
    const counts = new Map<LevelKey, number>()
    for (const n of nets) counts.set(n.levelKey, (counts.get(n.levelKey) ?? 0) + 1)
    const levels = (['1', '2', '3', 'sub'] as LevelKey[]).filter((k) => counts.get(k)).map((key) => ({ key, label: levelLabel(key), count: counts.get(key)! }))
    const symbols = new Map(p.symbols.map((s) => [s.address, s]))
    const xref = buildXRef(nets)
    return { nets, netById: new Map(nets.map((n, i) => [n.id, i])), symbols, xref, used: usedAddresses(xref), levels }
  }, [p])
}

export const netLabel = (id: number) => `N${String(id).padStart(4, '0')}`
