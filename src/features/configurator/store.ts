import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { defaultConfig, type BuildConfig } from '@/core/generator'

/** In-progress Build PMC wizard — persisted so a phone refresh doesn't lose work. */
interface WizardState {
  config: BuildConfig
  step: number
  update: (fn: (c: BuildConfig) => BuildConfig) => void
  setStep: (n: number) => void
  reset: () => void
}

export const useWizard = create<WizardState>()(
  persist(
    (set) => ({
      config: defaultConfig('lathe'),
      step: 0,
      update: (fn) => set((s) => ({ config: fn(s.config) })),
      setStep: (step) => set({ step }),
      reset: () => set({ config: defaultConfig('lathe'), step: 0 }),
    }),
    {
      name: 'pmcgenerator-build-wizard',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      migrate: () => ({ config: defaultConfig('lathe'), step: 0 }) as unknown as WizardState,
    },
  ),
)
