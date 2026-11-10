import type { PmcProject } from '@/core/types'
import { uid } from '@/lib/utils'

/** Validate an imported JSON value as a PmcProject and fill safe defaults. Throws a readable error. */
export function parseProjectJson(value: unknown): PmcProject {
  const v = (value && typeof value === 'object' && 'project' in value ? (value as { project: unknown }).project : value) as Record<string, unknown> | null
  if (!v || typeof v !== 'object') throw new Error('File is not a project.')
  const arr = (k: string) => {
    if (v[k] === undefined) return []
    if (!Array.isArray(v[k])) throw new Error(`"${k}" must be a list.`)
    return v[k] as unknown[]
  }
  if (!Array.isArray(v.nets)) throw new Error('Missing ladder nets — this does not look like a PMC Generator project.')
  const nets = v.nets as PmcProject['nets']
  if (nets.some((n) => !n || typeof n !== 'object' || !Array.isArray((n as { instructions?: unknown }).instructions))) throw new Error('Some nets are damaged.')
  const origin = v.origin === 'generated' || v.origin === 'demo' ? v.origin : 'decoded'
  const info = (v.info && typeof v.info === 'object' ? v.info : {}) as PmcProject['info']
  const stats = v.stats && typeof v.stats === 'object' ? (v.stats as PmcProject['stats']) : undefined
  return {
    id: typeof v.id === 'string' && v.id ? v.id : uid('imp'),
    name: typeof v.name === 'string' && v.name.trim() ? v.name.trim() : info.machine || 'Imported project',
    origin,
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : Date.now(),
    info,
    memoryMap: arr('memoryMap') as PmcProject['memoryMap'],
    symbols: arr('symbols') as PmcProject['symbols'],
    messages: arr('messages') as PmcProject['messages'],
    nets,
    warnings: (arr('warnings') as unknown[]).filter((w): w is string => typeof w === 'string'),
    stats: {
      nets: stats?.nets ?? nets.length,
      instructions: stats?.instructions ?? nets.reduce((a, n) => a + n.instructions.length, 0),
      unknownWords: stats?.unknownWords ?? 0,
    },
  }
}
