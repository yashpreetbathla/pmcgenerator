import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { PmcProject } from '@/core/types'
import { toast } from 'sonner'

/** localStorage wrapper that reports quota errors instead of silently losing data. */
const safeStorage = {
  getItem: (k: string) => localStorage.getItem(k),
  setItem: (k: string, v: string) => {
    try { localStorage.setItem(k, v) } catch {
      toast.error('Device storage is full', { description: 'Export or delete older projects in My Projects, then try again.' })
    }
  },
  removeItem: (k: string) => localStorage.removeItem(k),
}

/**
 * Projects saved on THIS device (localStorage). Decoded backups and generated drafts both live here.
 * Nothing is uploaded anywhere.
 */
interface ProjectsState {
  projects: PmcProject[]
  activeId?: string
  theme: 'light' | 'dark'
  save: (p: PmcProject) => void
  remove: (id: string) => void
  setActive: (id?: string) => void
  setTheme: (t: 'light' | 'dark') => void
}

export const useProjects = create<ProjectsState>()(
  persist(
    (set) => ({
      projects: [],
      theme: 'light',
      save: (p) => set((s) => ({ projects: [p, ...s.projects.filter((x) => x.id !== p.id)], activeId: p.id })),
      remove: (id) => set((s) => ({ projects: s.projects.filter((x) => x.id !== id), activeId: s.activeId === id ? undefined : s.activeId })),
      setActive: (activeId) => set({ activeId }),
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'pmcgenerator-projects', storage: createJSONStorage(() => safeStorage) },
  ),
)

export const useActiveProject = () => useProjects((s) => s.projects.find((p) => p.id === s.activeId))
