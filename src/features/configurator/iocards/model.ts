import { useMemo } from 'react'
import { pmcOf, planIo, validateCards, validateIo, type BuildConfig, type IoRow } from '@/core/generator'
import type { PinAssign } from '@/data/ioCards'
import { useWizard } from '../store'

/** Set / clear one pin. A signal moved to a new pin is removed from its old pin (and its typed address override). */
export function setPinIn(c: BuildConfig, key: string, pa?: PinAssign): BuildConfig {
  const pinMap = { ...(c.pinMap ?? {}) }
  let overrides = c.overrides
  if (pa?.sig) {
    for (const [k, v] of Object.entries(pinMap)) if (v.sig === pa.sig) delete pinMap[k]
    if (overrides[pa.sig]?.address) { const o = { ...overrides[pa.sig], address: undefined }; overrides = { ...overrides, [pa.sig]: o } }
  }
  if (pa) pinMap[key] = pa
  else delete pinMap[key]
  return { ...c, pinMap, overrides }
}

/** Everything the I/O cards screens need, memoised on the config. */
export function useCardsModel() {
  const { config, update } = useWizard()
  const pmc = pmcOf(config)
  const rows = useMemo(() => planIo(config), [config])
  const errors = useMemo(() => validateIo(rows, pmc), [rows, pmc])
  const issues = useMemo(() => validateCards(config, pmc, rows), [config, pmc, rows])
  const byAddr = useMemo(() => new Map(rows.map((r) => [r.address, r] as [string, IoRow])), [rows])
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r] as [string, IoRow])), [rows])
  const setPin = (key: string, pa?: PinAssign) => update((c) => setPinIn(c, key, pa))
  return { config, update, rows, errors, issues, byAddr, byId, setPin, pmc }
}
export type CardsModel = ReturnType<typeof useCardsModel>
