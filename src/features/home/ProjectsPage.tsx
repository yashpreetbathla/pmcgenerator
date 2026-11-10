import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Check, Copy, Download, FileSearch, FolderOpen, HardDrive, Pencil, PlayCircle, Trash2, Upload, Wrench, X } from 'lucide-react'
import { Button, Card, Empty, Input, PageTitle, buttonVariants } from '@/components/ui'
import type { PmcProject } from '@/core/types'
import { useProjects } from '@/store/projects'
import { cn, saveFile, uid } from '@/lib/utils'
import { OriginBadge, formatDate, netCount, projectType, useOpenDemo } from './projectMeta'
import { parseProjectJson } from './projectIO'

const STORAGE_KEY = 'pmcgenerator-projects'
const STORAGE_LIMIT = 5 * 1024 * 1024 // typical localStorage quota (~5 MB, counted in UTF-16 chars × 2 on most browsers)

const slug = (s: string) => s.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'project'

function storageUsed() {
  try {
    return (localStorage.getItem(STORAGE_KEY)?.length ?? 0) * 2
  } catch {
    return 0
  }
}

const fmtBytes = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)

export default function ProjectsPage() {
  const { projects, save, remove } = useProjects()
  const openDemo = useOpenDemo()
  const fileRef = useRef<HTMLInputElement>(null)
  const used = useMemo(storageUsed, [projects])

  const exportProject = async (p: PmcProject) => {
    const r = await saveFile(JSON.stringify(p, null, 1), `${slug(p.name)}.pmcproj.json`, 'application/json')
    if (r === 'downloaded') toast.success('Project file downloaded')
    if (r === 'shared') toast.success('Project shared')
  }

  const duplicate = (p: PmcProject) => {
    const copy: PmcProject = { ...structuredClone(p), id: uid(p.origin.slice(0, 3)), name: `${p.name} (copy)`, createdAt: Date.now() }
    save(copy)
    toast.success('Project duplicated')
  }

  const del = (p: PmcProject) => {
    if (!confirm(`Delete "${p.name}" from this device?\n\nThis cannot be undone. Export it first if you may need it again.`)) return
    remove(p.id)
    toast.success('Project deleted')
  }

  const onImport = async (files: FileList | null) => {
    const list = Array.from(files ?? [])
    for (const f of list) {
      try {
        if (f.size > 20 * 1024 * 1024) throw new Error('File is too large (max 20 MB).')
        const p = parseProjectJson(JSON.parse(await f.text()))
        if (useProjects.getState().projects.some((x) => x.id === p.id)) p.id = uid('imp')
        save(p)
        toast.success(`Imported “${p.name}”`)
      } catch (e) {
        toast.error(`${f.name}: ${e instanceof SyntaxError ? 'not a valid JSON file.' : (e as Error).message}`)
      }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const pct = Math.min(100, (used / STORAGE_LIMIT) * 100)

  return (
    <div>
      <PageTitle
        title="My Projects"
        subtitle="Saved on this device only. Nothing is uploaded."
        actions={
          <>
            <Button onClick={() => fileRef.current?.click()} className="flex-1 sm:flex-none">
              <Upload /> Import project
            </Button>
            <input ref={fileRef} type="file" accept=".json,application/json" multiple hidden onChange={(e) => onImport(e.target.files)} />
          </>
        }
      />

      {projects.length === 0 ? (
        <Empty
          icon={<FolderOpen />}
          title="No projects yet"
          text="Open a PMC backup or build a new PMC — it will be saved here automatically."
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link to="/open" className={buttonVariants({ variant: 'primary' })}><FileSearch /> Open a backup</Link>
              <Link to="/build" className={buttonVariants({ variant: 'secondary' })}><Wrench /> Build a PMC</Link>
              <Button variant="ghost" onClick={openDemo}><PlayCircle /> Try the demo</Button>
            </div>
          }
        />
      ) : (
        <ul className="grid gap-3">
          {projects.map((p) => (
            <ProjectRow key={p.id} p={p} onRename={(name) => save({ ...p, name })} onExport={() => exportProject(p)} onDuplicate={() => duplicate(p)} onDelete={() => del(p)} />
          ))}
        </ul>
      )}

      <div className="mt-6 rounded-xl bg-surface-2 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <HardDrive className="size-4 text-muted" /> Storage on this device
          <span className="tabular ml-auto text-xs text-muted">{fmtBytes(used)} of ~5 MB</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
          <div className={cn('h-full rounded-full', pct > 80 ? 'bg-danger' : pct > 50 ? 'bg-warning' : 'bg-success')} style={{ width: `${Math.max(pct, 1)}%` }} />
        </div>
        <p className="mt-2 text-muted">
          Browsers allow roughly 5 MB per site. Large backups use a lot of space — export projects you want to keep and delete old ones.
          Clearing browser data also removes these projects.
        </p>
      </div>
    </div>
  )
}

function ProjectRow({ p, onRename, onExport, onDuplicate, onDelete }: {
  p: PmcProject
  onRename: (name: string) => void
  onExport: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(p.name)

  const commit = () => {
    const n = name.trim()
    if (n && n !== p.name) { onRename(n); toast.success('Renamed') }
    setEditing(false)
  }

  return (
    <li>
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            {editing ? (
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); commit() }}>
                <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" maxLength={80}
                  onKeyDown={(e) => { if (e.key === 'Escape') { setName(p.name); setEditing(false) } }} />
                <Button type="submit" size="icon" variant="primary" aria-label="Save name"><Check /></Button>
                <Button size="icon" variant="ghost" aria-label="Cancel rename" onClick={() => { setName(p.name); setEditing(false) }}><X /></Button>
              </form>
            ) : (
              <Link to={`/project/${p.id}`} className="group block min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate text-base font-semibold group-hover:text-accent">{p.name || 'Untitled'}</span>
                  <OriginBadge origin={p.origin} />
                </div>
                <p className="mt-0.5 truncate text-sm text-muted">{projectType(p)}</p>
                <p className="tabular mt-0.5 text-xs text-muted">
                  {netCount(p)} nets · {p.symbols?.length ?? 0} symbols · {p.messages?.length ?? 0} messages · {formatDate(p.createdAt)}
                </p>
              </Link>
            )}
          </div>
          {!editing && (
            <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap lg:flex-nowrap">
              <Link to={`/project/${p.id}`} className={cn(buttonVariants({ variant: 'primary' }), 'col-span-4 sm:col-span-1')}>
                <FolderOpen /> Open
              </Link>
              <Button size="icon" className="w-full sm:size-11" onClick={() => { setName(p.name); setEditing(true) }} aria-label="Rename" title="Rename"><Pencil /></Button>
              <Button size="icon" className="w-full sm:size-11" onClick={onDuplicate} aria-label="Duplicate" title="Duplicate"><Copy /></Button>
              <Button size="icon" className="w-full sm:size-11" onClick={onExport} aria-label="Export project file" title="Export / share"><Download /></Button>
              <Button size="icon" className="w-full text-danger hover:bg-danger-soft sm:size-11" onClick={onDelete} aria-label="Delete" title="Delete"><Trash2 /></Button>
            </div>
          )}
        </div>
      </Card>
    </li>
  )
}
