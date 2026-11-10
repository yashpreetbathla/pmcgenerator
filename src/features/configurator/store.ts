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
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: (old, version) => {
        const s = old as WizardState | undefined
        // v1 → v2: I/O Modules become I/O cards (pin tables); the I/O step moved one place to the right.
        if (version === 1 && s?.config?.modules) {
          const tpl: Record<string, string> = { 'conn-basic': 'conn-cb', 'conn-ext': 'conn-cb', 'op-panel': 'op-ce56' }
          const modules = s.config.modules.map((m, i) => ({ ...m, templateId: m.templateId ?? tpl[m.typeId], group: m.group ?? (m.role === 'panel' ? 0 : i + 1), base: m.base ?? 0, slot: m.slot ?? 1 }))
          return { config: { ...s.config, modules, pinMap: s.config.pinMap ?? {} }, step: s.step >= 4 ? s.step + 1 : s.step } as WizardState
        }
        return { config: defaultConfig('lathe'), step: 0 } as unknown as WizardState
      },
    },
  ),
)
