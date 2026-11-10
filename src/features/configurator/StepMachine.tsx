import { useState } from 'react'
import { Bot, Boxes, Copy, Cylinder, Disc3, Drill, Factory, Hammer, LayoutGrid, Orbit, Plus, Shapes, X, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, Field, Input, Select } from '@/components/ui'
import { MACHINE_TYPES, type MachineTypeId } from '@/data/machineTypes'
import { controlById } from '@/data/controls'
import { applyMachine } from '@/core/generator'
import { cn } from '@/lib/utils'
import { useWizard } from './store'
import { StepHeader } from './parts'

const ICONS: Record<MachineTypeId, LucideIcon> = {
  lathe: Disc3, turnmill: Orbit, twin: Copy, vmc: Drill, hmc: Boxes, fiveaxis: Shapes, grinder: Cylinder, gantry: LayoutGrid, press: Hammer, spm: Factory, custom: Bot,
}

export function StepMachine() {
  const { config, update } = useWizard()
  const [axis, setAxis] = useState('')
  const maxPaths = controlById(config.controlId)?.paths ?? 10

  const pick = (id: MachineTypeId) => {
    if (id === config.machineId) return
    update((c) => applyMachine(c, id))
    toast.success(`${MACHINE_TYPES.find((m) => m.id === id)?.name}: default options selected`)
  }
  const addAxis = () => {
    const a = axis.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)
    if (!a) return
    if (config.axes.includes(a)) { toast.error(`Axis ${a} already exists`); return }
    update((c) => ({ ...c, axes: [...c.axes, a] }))
    setAxis('')
  }

  return (
    <div>
      <StepHeader title="Machine type" text="Sets the axes and pre-selects sensible options. You can change everything in the next steps." />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {MACHINE_TYPES.map((m) => {
          const Icon = ICONS[m.id]
          const on = config.machineId === m.id
          return (
            <button key={m.id} type="button" onClick={() => pick(m.id)} aria-pressed={on}
              className={cn('flex min-h-32 flex-col items-start rounded-xl border bg-surface p-3.5 text-left transition-colors hover:border-accent/50', on ? 'border-accent bg-accent-soft/60 ring-1 ring-accent/30' : 'border-border')}>
              <span className={cn('mb-3 flex size-10 items-center justify-center rounded-lg', on ? 'bg-accent text-white' : 'bg-surface-2 text-fg')}><Icon className="size-5" /></span>
              <span className="font-semibold leading-tight">{m.name}</span>
              <span className="mt-1 line-clamp-2 text-xs text-muted">{m.desc}</span>
            </button>
          )
        })}
      </div>

      <Card className="mt-5 p-4">
        <h3 className="font-semibold">Axes</h3>
        <p className="mt-0.5 text-sm text-muted">Order = CNC axis number (1st axis → +J1, *DEC1, ZP1…).</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {config.axes.map((a, i) => (
            <span key={a} className="inline-flex h-11 items-center gap-1 rounded-lg border border-border bg-surface-2 pr-1 pl-3 text-sm font-semibold">
              <span className="mr-1 text-xs font-normal text-muted">{i + 1}</span>{a}
              <button onClick={() => update((c) => ({ ...c, axes: c.axes.filter((x) => x !== a) }))} className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-danger" aria-label={`Remove axis ${a}`}><X className="size-4" /></button>
            </span>
          ))}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addAxis() }}>
            <Input value={axis} onChange={(e) => setAxis(e.target.value)} placeholder="Add axis" className="w-28" aria-label="New axis name" maxLength={3} />
            <Button type="submit" size="icon" aria-label="Add axis"><Plus /></Button>
          </form>
        </div>
        <div className="mt-4 max-w-xs">
          <Field label="Paths" hint="Path 2 gets its own E-stop / feed hold (G1008).">
            <Select value={config.paths} onChange={(e) => update((c) => ({ ...c, paths: Number(e.target.value) }))}>
              {Array.from({ length: Math.min(maxPaths, 4) }, (_, i) => <option key={i} value={i + 1}>{i + 1} path{i ? 's' : ''}</option>)}
            </Select>
          </Field>
        </div>
      </Card>
    </div>
  )
}
