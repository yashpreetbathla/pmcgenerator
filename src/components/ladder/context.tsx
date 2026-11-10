import { createContext, useContext } from 'react'
import type { SymbolEntry } from '@/core/types'

export interface LadderCtx {
  lookup: (address: string) => SymbolEntry | undefined
  /** Called when the user taps an address (opens details / cross reference). */
  onAddress?: (address: string) => void
  /** Addresses to highlight (search hits). */
  isHit?: (address: string) => boolean
}

export const LadderContext = createContext<LadderCtx>({ lookup: () => undefined })
export const useLadder = () => useContext(LadderContext)
