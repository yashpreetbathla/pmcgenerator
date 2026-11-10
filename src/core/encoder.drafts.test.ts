import { generateProject, defaultConfig, applyMachine } from './generator'
import { encodePmcBinary } from './encoder'
import { decodePmcBackup } from './decoder'
import { MACHINE_TYPES } from '@/data/machineTypes'
it('every machine type draft encodes and decodes back', () => {
  for (const m of MACHINE_TYPES) {
    const p = generateProject(applyMachine(defaultConfig(), m.id), { id: 'x', now: 1 })
    const r = encodePmcBinary(p)
    const back = decodePmcBackup(r.bytes)
    expect(back.stats.unknownWords).toBe(0)
    expect(back.stats.instructions).toBe(p.stats.instructions)
  }
})
