import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui'
import type { PmcProject } from '@/core/types'
import { createDemoProject } from '@/data/demoProject'
import { useProjects } from '@/store/projects'
import { uid } from '@/lib/utils'

const ORIGIN = {
  decoded: { label: 'Decoded', tone: 'accent' },
  generated: { label: 'Generated', tone: 'success' },
  demo: { label: 'Demo', tone: 'warning' },
} as const

export function OriginBadge({ origin }: { origin: PmcProject['origin'] }) {
  const o = ORIGIN[origin] ?? ORIGIN.decoded
  return <Badge tone={o.tone}>{o.label}</Badge>
}

export const projectType = (p: PmcProject) => [p.info.control, p.info.pmcType].filter(Boolean).join(' · ') || 'Unknown control'

export const netCount = (p: PmcProject) => p.stats?.nets ?? p.nets?.length ?? 0

export function formatDate(ts: number) {
  try {
    return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

/** Save a fresh copy of the synthetic demo and open it. */
export function useOpenDemo() {
  const save = useProjects((s) => s.save)
  const navigate = useNavigate()
  return () => {
    const p = createDemoProject(uid('demo'))
    save(p)
    navigate(`/project/${p.id}`)
  }
}
