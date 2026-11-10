import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, RotateCcw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button, PageTitle } from '@/components/ui'
import { generateProject } from '@/core/generator'
import { useProjects } from '@/store/projects'
import { cn } from '@/lib/utils'
import { useWizard } from './store'
import { StepControl } from './StepControl'
import { StepMachine } from './StepMachine'
import { StepOptions } from './StepOptions'
import { StepCustom } from './StepCustom'
import { StepIo } from './StepIo'
import { StepCards } from './iocards/StepCards'
import { StepSummary } from './StepSummary'

const STEPS = ['Control', 'Machine', 'Options', 'Custom devices', 'I/O cards', 'I/O review', 'Generate'] as const

export default function BuildPage() {
  const { config, step: rawStep, setStep, reset } = useWizard()
  const save = useProjects((s) => s.save)
  const navigate = useNavigate()
  const step = Math.min(Math.max(rawStep, 0), STEPS.length - 1)
  const last = step === STEPS.length - 1

  useEffect(() => { window.scrollTo({ top: 0 }) }, [step])

  const generate = () => {
    try {
      const p = generateProject(config)
      save(p)
      toast.success(`Generated ${p.stats.nets} nets · ${p.symbols.length} symbols`)
      navigate(`/project/${p.id}`)
    } catch (e) {
      toast.error(`Could not generate: ${(e as Error).message}`)
    }
  }

  return (
    <div className="min-w-0">
      <PageTitle title="Build PMC" subtitle="Answer a few questions — get a complete ladder draft with Symbol Comment, Message and I/O Module data."
        actions={<Button variant="ghost" onClick={() => { if (confirm('Start over? Your current choices will be cleared.')) reset() }}><RotateCcw />Start over</Button>} />

      {/* Step indicator */}
      <div className="mb-5">
        <div className="flex items-center justify-between text-sm sm:hidden">
          <span className="font-semibold">{STEPS[step]}</span>
          <span className="tabular text-muted">Step {step + 1} of {STEPS.length}</span>
        </div>
        <div className="mt-2 flex gap-1 sm:hidden" aria-hidden>
          {STEPS.map((s, i) => <div key={s} className={cn('h-1.5 flex-1 rounded-full', i <= step ? 'bg-accent' : 'bg-surface-2')} />)}
        </div>
        <ol className="hidden gap-1 sm:flex" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s} className="min-w-0 flex-1">
              <button onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}
                className={cn('flex h-11 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm font-medium transition-colors',
                  i === step ? 'border-accent bg-accent-soft text-link' : i < step ? 'border-border bg-surface text-fg hover:bg-surface-2' : 'border-border bg-surface text-muted hover:bg-surface-2')}>
                <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] tabular', i < step ? 'bg-accent text-on-accent' : i === step ? 'bg-accent text-on-accent' : 'bg-surface-2')}>
                  {i < step ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                </span>
                <span className="truncate">{s}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="min-w-0 pb-4">
        {step === 0 && <StepControl />}
        {step === 1 && <StepMachine />}
        {step === 2 && <StepOptions />}
        {step === 3 && <StepCustom />}
        {step === 4 && <StepCards />}
        {step === 5 && <StepIo onGo={setStep} />}
        {step === 6 && <StepSummary onGo={setStep} />}
      </div>

      {/* Sticky Back / Next bar (sits above the phone bottom nav) */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur md:bottom-0 md:mx-0 md:rounded-xl md:border">
        <div className="flex items-center gap-2">
          <Button size="lg" onClick={() => setStep(step - 1)} disabled={step === 0} className="min-w-24"><ChevronLeft />Back</Button>
          <span className="hidden flex-1 text-center text-sm text-muted sm:block">{step + 1} / {STEPS.length} · {STEPS[step]}</span>
          <span className="flex-1 sm:hidden" />
          {last
            ? <Button size="lg" variant="primary" onClick={generate} className="min-w-40"><Sparkles />Generate PMC</Button>
            : <Button size="lg" variant="primary" onClick={() => setStep(step + 1)} className="min-w-32">Next<ChevronRight /></Button>}
        </div>
      </div>
    </div>
  )
}
