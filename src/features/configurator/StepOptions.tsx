import { useMemo, useState } from 'react'
import { AlertTriangle, Lock } from 'lucide-react'
import { Badge, Button, Card, Select } from '@/components/ui'
import { ACCESSORIES, ACCESSORY_GROUPS, accParam, type Accessory } from '@/data/accessories'
import { resolveAccessories, type BuildConfig } from '@/core/generator'
import { useWizard } from './store'
import { Choice, NumInput, SearchBox, StepHeader } from './parts'

function counts(a: Accessory, cfg: BuildConfig) {
  const d = a.define({ axes: cfg.axes, paths: cfg.paths, p: (k) => accParam(a, k, cfg.params) })
  return { i: d.inputs.length, o: d.outputs.length, m: d.mcodes.filter((m) => ![0, 1, 2, 30].includes(m.code)).map((m) => `M${String(m.code).padStart(2, '0')}`), al: d.alarms.length }
}

export function StepOptions() {
  const { config, update } = useWizard()
  const [q, setQ] = useState('')
  const sel = new Set(config.accessories)
  const { added } = resolveAccessories(config.accessories)
  const addedSet = new Set(added)

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase()
    const hit = ACCESSORIES.filter((a) => !s || `${a.name} ${a.desc} ${a.group}`.toLowerCase().includes(s))
    return ACCESSORY_GROUPS.map((g) => ({ group: g, items: hit.filter((a) => a.group === g) })).filter((g) => g.items.length)
  }, [q])

  const toggle = (a: Accessory) => {
    if (a.required) return
    update((c) => ({ ...c, accessories: sel.has(a.id) ? c.accessories.filter((x) => x !== a.id) : [...c.accessories, a.id] }))
  }
  const setGroup = (items: Accessory[], on: boolean) =>
    update((c) => ({ ...c, accessories: on ? [...new Set([...c.accessories, ...items.map((a) => a.id)])] : c.accessories.filter((id) => items.find((a) => a.id === id)?.required || !items.some((a) => a.id === id)) }))
  const setParam = (a: Accessory, key: string, v: number | undefined) =>
    update((c) => { const params = { ...c.params }; if (v === undefined) delete params[`${a.id}.${key}`]; else params[`${a.id}.${key}`] = v; return { ...c, params } })

  return (
    <div>
      <StepHeader title="Options" text={<>Defaults for your machine type are ticked. <span className="tabular font-medium text-fg">{sel.size}</span> selected.</>} />
      <div className="sticky top-14 z-10 -mx-1 mb-3 bg-bg/95 px-1 py-2 backdrop-blur">
        <SearchBox value={q} onChange={setQ} placeholder="Search options — chuck, ATC, coolant, door…" />
      </div>
      <div className="space-y-5">
        {groups.map(({ group, items }) => {
          const all = items.every((a) => sel.has(a.id) || a.required)
          const n = items.filter((a) => sel.has(a.id)).length
          return (
            <section key={group}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-muted">{group} <span className="tabular font-normal">· {n}/{items.length}</span></h3>
                <Button size="sm" variant="ghost" className="h-11 sm:h-9" onClick={() => setGroup(items, !all)}>{all ? 'Clear group' : 'Select all in group'}</Button>
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                {items.map((a) => {
                  const on = sel.has(a.id) || addedSet.has(a.id)
                  const k = counts(a, config)
                  const clash = (a.conflicts ?? []).filter((c) => sel.has(c))
                  return (
                    <div key={a.id} className="min-w-0">
                      <Choice selected={on} onClick={() => toggle(a)} disabled={a.required} title={a.required ? 'Always included' : undefined}>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{a.name}</span>
                          {a.required && <Badge><Lock className="size-3" />Required</Badge>}
                          {addedSet.has(a.id) && <Badge tone="accent">Auto-added</Badge>}
                          {on && clash.length > 0 && <Badge tone="warning"><AlertTriangle className="size-3" />Conflicts</Badge>}
                        </span>
                        <span className="mt-0.5 block text-sm text-muted">{a.desc}</span>
                        <span className="mt-1.5 flex flex-wrap gap-1">
                          {k.i > 0 && <Badge>{k.i} in</Badge>}
                          {k.o > 0 && <Badge>{k.o} out</Badge>}
                          {k.al > 0 && <Badge>{k.al} msg</Badge>}
                          {k.m.slice(0, 4).map((m) => <Badge key={m} tone="accent">{m}</Badge>)}
                        </span>
                      </Choice>
                      {on && a.params && a.params.length > 0 && (
                        <Card className="-mt-1 rounded-t-none border-t-0 bg-surface-2/60 px-3 pt-3 pb-3">
                          <p className="mb-2 text-xs font-semibold text-muted">Settings</p>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {a.params.map((p) => (
                              <label key={p.key} className="block min-w-0">
                                <span className="mb-1 block truncate text-xs text-muted" title={p.label}>{p.label}{p.unit === 'ms' ? ' (ms)' : ''}</span>
                                {p.choices ? (
                                  <Select value={accParam(a, p.key, config.params)} aria-label={p.label} onChange={(e) => setParam(a, p.key, Number(e.target.value))}>
                                    {p.choices.map((ch, i) => <option key={ch} value={i}>{ch}</option>)}
                                  </Select>
                                ) : (
                                <div className="relative">
                                  {p.unit === 'M' && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">M</span>}
                                  <NumInput value={accParam(a, p.key, config.params)} min={p.min} max={p.max} ariaLabel={p.label} className={p.unit === 'M' ? 'pl-7' : ''} onCommit={(v) => setParam(a, p.key, v)} />
                                </div>
                                )}
                              </label>
                            ))}
                          </div>
                        </Card>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
        {!groups.length && <p className="py-8 text-center text-sm text-muted">Nothing matches “{q}”. Add it as a custom device in the next step.</p>}
      </div>
    </div>
  )
}
