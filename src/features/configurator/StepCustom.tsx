import type { ReactNode } from 'react'
import { Plus, Trash2, Wrench } from 'lucide-react'
import { Button, Card, Empty, Input, Select } from '@/components/ui'
import { tag, type CustomAlarm, type CustomDevice, type CustomIo, type CustomOutput } from '@/core/generator'
import { uid } from '@/lib/utils'
import { useWizard } from './store'
import { NumInput, StepHeader } from './parts'

const EXAMPLES = ['Pallet clamp', 'Coolant filter', 'Oil skimmer', 'Part present sensor', 'Air blow', 'Door curtain']

function Section({ title, onAdd, addLabel, children, count }: { title: string; onAdd: () => void; addLabel: string; children: ReactNode; count: number }) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold">{title} <span className="tabular font-normal text-muted">{count}</span></h4>
        <Button size="sm" variant="ghost" className="h-11 sm:h-9" onClick={onAdd}><Plus />{addLabel}</Button>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

const DelBtn = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <Button size="icon" variant="ghost" className="shrink-0 text-muted hover:text-danger" onClick={onClick} aria-label={label}><Trash2 /></Button>
)

function DeviceCard({ dev, onChange, onRemove }: { dev: CustomDevice; onChange: (d: CustomDevice) => void; onRemove: () => void }) {
  const base = tag(dev.name) || 'DEV'
  const inSyms = dev.inputs.map((io, i) => tag(io.symbol) || `${base}I${i + 1}`)
  const setIn = (i: number, p: Partial<CustomIo>) => onChange({ ...dev, inputs: dev.inputs.map((x, k) => (k === i ? { ...x, ...p } : x)) })
  const setOut = (i: number, p: Partial<CustomOutput>) => onChange({ ...dev, outputs: dev.outputs.map((x, k) => (k === i ? { ...x, ...p } : x)) })
  const setAl = (i: number, p: Partial<CustomAlarm>) => onChange({ ...dev, alarms: dev.alarms.map((x, k) => (k === i ? { ...x, ...p } : x)) })

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Input value={dev.name} onChange={(e) => onChange({ ...dev, name: e.target.value })} placeholder="Device name, e.g. Pallet clamp" aria-label="Device name" className="font-medium" />
        <DelBtn onClick={onRemove} label={`Remove ${dev.name || 'device'}`} />
      </div>

      <Section title="Inputs (X)" count={dev.inputs.length} addLabel="Input" onAdd={() => onChange({ ...dev, inputs: [...dev.inputs, { symbol: '', comment: '' }] })}>
        {dev.inputs.map((io, i) => (
          <div key={i} className="flex gap-2">
            <Input value={io.symbol} onChange={(e) => setIn(i, { symbol: e.target.value.toUpperCase() })} placeholder={`${base}I${i + 1}`} aria-label="Input symbol" className="w-32 shrink-0 font-mono sm:w-40" maxLength={16} />
            <Input value={io.comment} onChange={(e) => setIn(i, { comment: e.target.value })} placeholder="Comment, e.g. Clamp closed" aria-label="Input comment" />
            <DelBtn onClick={() => onChange({ ...dev, inputs: dev.inputs.filter((_, k) => k !== i) })} label="Remove input" />
          </div>
        ))}
      </Section>

      <Section title="Outputs (Y)" count={dev.outputs.length} addLabel="Output" onAdd={() => onChange({ ...dev, outputs: [...dev.outputs, { symbol: '', comment: '' }] })}>
        {dev.outputs.map((io, i) => (
          <div key={i} className="rounded-lg border border-border p-2">
            <div className="flex gap-2">
              <Input value={io.symbol} onChange={(e) => setOut(i, { symbol: e.target.value.toUpperCase() })} placeholder={`${base}O${i + 1}`} aria-label="Output symbol" className="w-32 shrink-0 font-mono sm:w-40" maxLength={16} />
              <Input value={io.comment} onChange={(e) => setOut(i, { comment: e.target.value })} placeholder="Comment, e.g. Clamp valve" aria-label="Output comment" />
              <DelBtn onClick={() => onChange({ ...dev, outputs: dev.outputs.filter((_, k) => k !== i) })} label="Remove output" />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <label className="min-w-0"><span className="mb-1 block text-xs text-muted">ON by M-code</span><NumInput value={io.onM} min={0} max={9999} placeholder="—" ariaLabel="ON M-code" onCommit={(v) => setOut(i, { onM: v })} /></label>
              <label className="min-w-0"><span className="mb-1 block text-xs text-muted">OFF by M-code</span><NumInput value={io.offM} min={0} max={9999} placeholder="—" ariaLabel="OFF M-code" onCommit={(v) => setOut(i, { offM: v })} /></label>
              <label className="col-span-2 min-w-0 sm:col-span-1"><span className="mb-1 block text-xs text-muted">or follow input</span>
                <Select value={io.follow ?? ''} onChange={(e) => setOut(i, { follow: e.target.value || undefined })} aria-label="Follow input">
                  <option value="">—</option>
                  {inSyms.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </label>
            </div>
          </div>
        ))}
      </Section>

      <Section title="Alarms & messages" count={dev.alarms.length} addLabel="Message" onAdd={() => onChange({ ...dev, alarms: [...dev.alarms, { text: '', kind: 'alarm', when: 'on' }] })}>
        {dev.alarms.map((m, i) => (
          <div key={i} className="rounded-lg border border-border p-2">
            <div className="flex gap-2">
              <Input value={m.text} onChange={(e) => setAl(i, { text: e.target.value.toUpperCase() })} placeholder="TEXT, e.g. PALLET NOT CLAMPED" aria-label="Message text" maxLength={32} />
              <DelBtn onClick={() => onChange({ ...dev, alarms: dev.alarms.filter((_, k) => k !== i) })} label="Remove message" />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Select value={m.kind} onChange={(e) => setAl(i, { kind: e.target.value as CustomAlarm['kind'] })} aria-label="Message type">
                <option value="alarm">Alarm (1000s)</option>
                <option value="operator">Operator message (2000s)</option>
              </Select>
              <Select value={m.trigger ?? ''} onChange={(e) => setAl(i, { trigger: e.target.value || undefined })} aria-label="Trigger input">
                <option value="">Trigger: add logic later</option>
                {inSyms.map((s) => <option key={s} value={s}>When {s}</option>)}
              </Select>
              <Select value={m.when ?? 'on'} onChange={(e) => setAl(i, { when: e.target.value as 'on' | 'off' })} aria-label="Trigger state" disabled={!m.trigger} className="col-span-2 sm:col-span-1">
                <option value="on">is ON</option>
                <option value="off">is OFF</option>
              </Select>
            </div>
          </div>
        ))}
      </Section>
    </Card>
  )
}

export function StepCustom() {
  const { config, update } = useWizard()
  const devs = config.customDevices
  const add = (name = '') => update((c) => ({ ...c, customDevices: [...c.customDevices, { id: uid('dev'), name, inputs: [{ symbol: '', comment: '' }], outputs: [{ symbol: '', comment: '' }], alarms: [] }] }))
  const set = (id: string, d: CustomDevice) => update((c) => ({ ...c, customDevices: c.customDevices.map((x) => (x.id === id ? d : x)) }))
  const remove = (id: string) => update((c) => {
    const overrides = Object.fromEntries(Object.entries(c.overrides).filter(([k]) => !k.startsWith(`cd.${id}.`)))
    return { ...c, overrides, customDevices: c.customDevices.filter((x) => x.id !== id) }
  })

  return (
    <div>
      <StepHeader title="Custom devices" text="Add anything that isn't in the options list — any number of inputs, outputs and messages. Skip if you don't need it."
        right={devs.length > 0 && <Button variant="primary" onClick={() => add()}><Plus />Add device</Button>} />
      {devs.length === 0 ? (
        <Empty icon={<Wrench />} title="No custom devices" text="Each device gets X/Y addresses, symbols and nets automatically. Outputs can be switched by M-codes."
          action={
            <div className="flex flex-col items-center gap-3">
              <Button variant="primary" onClick={() => add()}><Plus />Add device</Button>
              <div className="flex flex-wrap justify-center gap-1.5">
                {EXAMPLES.map((e) => <Button key={e} size="sm" className="h-11 sm:h-9" onClick={() => add(e)}>{e}</Button>)}
              </div>
            </div>
          } />
      ) : (
        <div className="space-y-3">
          {devs.map((d) => <DeviceCard key={d.id} dev={d} onChange={(x) => set(d.id, x)} onRemove={() => remove(d.id)} />)}
        </div>
      )}
    </div>
  )
}
