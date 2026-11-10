import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ChevronDown, Download, FileJson, FileSearch, FileText, Table } from 'lucide-react'
import { Badge, Button, Callout, Empty, Tabs } from '@/components/ui'
import { LadderContext } from '@/components/ladder/context'
import { exportBaseName, messagesCsv, mnemonicText, projectJson, symbolsCsv } from '@/core/export'
import type { PmcProject } from '@/core/types'
import { DRAFT_NOTICE, saveFile } from '@/lib/utils'
import { useProjects } from '@/store/projects'
import { AddressSheet } from './shared'
import { useProjectIndex } from './useProjectIndex'
import { LadderTab } from './tabs/LadderTab'
import { MessagesTab, ParamsTab, SymbolsTab, TitleTab } from './tabs/InfoTabs'
import { IoMapTab } from './tabs/IoMapTab'
import { XRefTab } from './tabs/XRefTab'

type Tab = 'title' | 'ladder' | 'symbols' | 'messages' | 'io' | 'xref' | 'params'
const TABS: Tab[] = ['title', 'ladder', 'symbols', 'messages', 'io', 'xref', 'params']

export default function ProjectPage() {
  const { id } = useParams()
  const project = useProjects((s) => s.projects.find((p) => p.id === id))
  const setActive = useProjects((s) => s.setActive)
  useEffect(() => { if (project) setActive(project.id) }, [project, setActive])

  if (!project) {
    return (
      <Empty icon={<FileSearch />} title="Project not found"
        text="It may have been removed from this device, or it was opened in another browser. Projects are stored only on the device where you opened them."
        action={<Link to="/open"><Button variant="primary">Open a PMC backup</Button></Link>} />
    )
  }
  return <ProjectView key={project.id} p={project} />
}

function ProjectView({ p }: { p: PmcProject }) {
  const idx = useProjectIndex(p)!
  const [params, setParams] = useSearchParams()
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'ladder') as Tab
  const xrefAddr = params.get('addr') ?? undefined
  const setTab = useCallback((t: Tab, extra?: Record<string, string>) => setParams({ tab: t, ...extra }, { replace: false }), [setParams])

  const [sheet, setSheet] = useState<string>()
  const [focus, setFocus] = useState<{ netId: number; nonce: number }>()
  const jump = useCallback((netId: number) => { setFocus({ netId, nonce: Date.now() }); setTab('ladder') }, [setTab])
  const openXref = useCallback((a: string) => setTab('xref', { addr: a }), [setTab])

  const ctx = useMemo(() => ({ lookup: (a: string) => idx.symbols.get(a), onAddress: setSheet }), [idx])
  const i = p.info

  const items = [
    { value: 'title' as const, label: 'Title' },
    { value: 'ladder' as const, label: 'Ladder', count: idx.nets.length },
    { value: 'symbols' as const, label: 'Symbol Comment', count: p.symbols.length },
    { value: 'messages' as const, label: 'Message', count: p.messages.length },
    { value: 'io' as const, label: 'I/O Map' },
    { value: 'xref' as const, label: 'Cross Reference' },
    { value: 'params' as const, label: 'System Parameter' },
  ]

  return (
    <LadderContext.Provider value={ctx}>
      <div className="min-w-0 space-y-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              {p.origin === 'generated' ? <Badge tone="warning">Generated draft</Badge> : p.origin === 'demo' ? <Badge>Demo</Badge> : <Badge tone="success">Decoded backup</Badge>}
              {i.pmcType && <Badge className="font-mono">{i.pmcType}</Badge>}
              {i.control && <Badge>{i.control}</Badge>}
            </div>
            <h1 className="break-words text-xl font-semibold tracking-tight sm:text-2xl">{p.name}</h1>
            <p className="mt-1 text-sm text-muted tabular">
              {idx.nets.length} nets · {p.stats.instructions.toLocaleString()} instructions · {p.symbols.length.toLocaleString()} symbols · {p.messages.length} messages
            </p>
          </div>
          <ExportMenu p={p} />
        </header>

        {p.origin !== 'decoded' && <Callout tone="warning" title={p.origin === 'demo' ? 'Demo project' : 'Generated draft'}>{DRAFT_NOTICE}</Callout>}

        <div className="sticky top-14 z-20 -mx-4 border-b border-border bg-bg/95 px-4 pt-1 backdrop-blur">
          <Tabs items={items} value={tab} onChange={(t) => setTab(t)} />
        </div>

        <div className="min-w-0">
          {tab === 'title' && <TitleTab p={p} />}
          {tab === 'ladder' && <LadderTab idx={idx} focus={focus} />}
          {tab === 'symbols' && <SymbolsTab p={p} idx={idx} onAddress={setSheet} />}
          {tab === 'messages' && <MessagesTab p={p} onAddress={setSheet} />}
          {tab === 'io' && <IoMapTab p={p} idx={idx} onAddress={setSheet} />}
          {tab === 'xref' && <XRefTab key={xrefAddr} idx={idx} address={xrefAddr} onAddress={(a) => setTab('xref', { addr: a })} onJump={jump} />}
          {tab === 'params' && <ParamsTab p={p} />}
        </div>
      </div>
      {sheet && <AddressSheet address={sheet} idx={idx} onClose={() => setSheet(undefined)} onJump={jump} onXref={openXref} />}
    </LadderContext.Provider>
  )
}

function ExportMenu({ p }: { p: PmcProject }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    addEventListener('pointerdown', close); addEventListener('keydown', esc)
    return () => { removeEventListener('pointerdown', close); removeEventListener('keydown', esc) }
  }, [open])

  const base = exportBaseName(p)
  const run = async (make: () => string, file: string, mime: string) => {
    setOpen(false)
    try {
      const r = await saveFile(make(), file, mime)
      if (r !== 'cancelled') toast.success(r === 'shared' ? `Shared ${file}` : `Saved ${file}`)
    } catch {
      toast.error('Could not save the file')
    }
  }
  const options = [
    { icon: Table, label: 'Symbol Comment', hint: 'CSV', disabled: !p.symbols.length, go: () => run(() => symbolsCsv(p), `${base}_symbols.csv`, 'text/csv') },
    { icon: Table, label: 'Messages', hint: 'CSV', disabled: !p.messages.length, go: () => run(() => messagesCsv(p), `${base}_messages.csv`, 'text/csv') },
    { icon: FileText, label: 'Mnemonic list', hint: 'TXT', disabled: !p.nets.length, go: () => run(() => mnemonicText(p), `${base}_mnemonic.txt`, 'text/plain') },
    { icon: FileJson, label: 'Project', hint: 'JSON', disabled: false, go: () => run(() => projectJson(p), `${base}.json`, 'application/json') },
  ]
  return (
    <div ref={ref} className="relative shrink-0">
      <Button onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" className="w-full sm:w-auto"><Download /> Export <ChevronDown /></Button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-full min-w-60 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-lg sm:w-64">
          {options.map((o) => (
            <button key={o.label} role="menuitem" type="button" disabled={o.disabled} onClick={o.go}
              className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-surface-2 disabled:opacity-40">
              <o.icon className="size-4 text-muted" /><span className="flex-1">{o.label}</span><span className="text-xs text-muted">{o.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
