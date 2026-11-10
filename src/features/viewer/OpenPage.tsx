import { useMemo, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ChevronDown, FileUp, HardDrive, LoaderCircle, ShieldCheck } from 'lucide-react'
import { Badge, Callout, Card } from '@/components/ui'
import { decodePmcBackup, PmcDecodeError } from '@/core/decoder'
import { cn } from '@/lib/utils'
import { useProjects } from '@/store/projects'

type State = { kind: 'idle' } | { kind: 'busy'; name: string } | { kind: 'error'; name: string; message: string }

export default function OpenPage() {
  const save = useProjects((s) => s.save)
  const projects = useProjects((s) => s.projects)
  const recent = useMemo(() => projects.filter((p) => p.origin === 'decoded').slice(0, 5), [projects])
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [drag, setDrag] = useState(false)

  async function handle(file: File | undefined) {
    if (!file) return
    setState({ kind: 'busy', name: file.name })
    try {
      const buf = await file.arrayBuffer()
      await new Promise((r) => setTimeout(r, 0)) // let the spinner paint
      const project = decodePmcBackup(buf, file.name)
      try {
        save(project)
      } catch {
        toast.warning('Opened, but it is too big to keep on this device. It will be gone after you close the page.')
      }
      toast.success(`Opened ${file.name}`, { description: `${project.stats.instructions.toLocaleString()} instructions · ${project.symbols.length} symbols` })
      navigate(`/project/${project.id}`)
    } catch (e) {
      const message = e instanceof PmcDecodeError
        ? e.message
        : 'Something went wrong while reading this file. It may be damaged or a format we do not support yet.'
      setState({ kind: 'error', name: file.name, message })
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files?.[0]) }
  const busy = state.kind === 'busy'

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Open a PMC backup</h1>
        <p className="mt-1 text-sm text-muted">See the ladder, symbols, messages and I/O of a FANUC PMC backup file — no LADDER-III needed.</p>
      </div>

      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={cn(
          'relative flex min-h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-surface px-6 py-10 text-center transition-colors hover:border-accent! hover:bg-accent-soft/40 sm:min-h-72',
          drag && 'border-accent! bg-accent-soft',
          busy && 'pointer-events-none opacity-80',
        )}
      >
        <input ref={input} type="file" className="sr-only" disabled={busy} onChange={(e) => handle(e.target.files?.[0])} />
        <span className="flex size-16 items-center justify-center rounded-2xl bg-fanuc/25 text-fg">
          {busy ? <LoaderCircle className="size-8 animate-spin" /> : <FileUp className="size-8" />}
        </span>
        {busy ? (
          <span className="text-lg font-semibold">Reading {state.name}…</span>
        ) : (
          <>
            <span className="text-lg font-semibold"><span className="sm:hidden">Tap to choose a PMC backup file</span><span className="hidden sm:inline">Drop a PMC backup here, or click to choose</span></span>
            <span className="text-sm text-muted">Any file name works, e.g. <span className="font-mono">PMC1.000</span></span>
          </>
        )}
      </label>

      <div className="flex items-start gap-2.5 rounded-xl bg-success-soft px-3.5 py-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
        <p><span className="font-semibold">Your file is processed on this device and never uploaded.</span> Opened projects are saved only in this browser.</p>
      </div>

      {state.kind === 'error' && (
        <Callout tone="warning" title={`Can't open ${state.name}`}>
          <p>{state.message}</p>
          <p className="mt-1">Currently supported: FANUC memory-card PMC backups (tested with 0i-D PMC/L). Make sure you picked the PMC ladder file, not a CNC parameter or program backup.</p>
        </Callout>
      )}

      <Card>
        <details className="group">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 font-medium">
            <HardDrive className="size-4 text-muted" />
            <span className="flex-1">How do I get a PMC backup from the machine?</span>
            <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-2 border-t border-border px-4 py-3 text-sm text-fg/80">
            <p>The exact screens depend on the control model and software — check the FANUC manual for your machine. A typical route:</p>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>Insert a memory card (or USB stick, if your control supports it) and make sure the I/O channel is set to the card.</li>
              <li><span className="font-medium">PMC I/O screen</span> (on many 0i/30i controls: SYSTEM → PMC maintenance → I/O): choose device <em>memory card</em>, function <em>write</em>, data <em>sequence program</em>, then execute.</li>
              <li><span className="font-medium">Or BOOT screen:</span> power on while holding the two rightmost soft keys, then use <em>SYSTEM DATA SAVE</em> and pick the PMC entry (often named like <span className="font-mono">PMC1</span>).</li>
              <li>Copy the file from the card to your phone or computer and open it here.</li>
            </ol>
            <p className="text-muted">Taking a backup only reads from the control, but follow your site's procedures and never change settings you are unsure about.</p>
          </div>
        </details>
      </Card>

      {recent.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">Recently opened on this device</h2>
          <Card className="divide-y divide-border overflow-hidden">
            {recent.map((p) => (
              <Link key={p.id} to={`/project/${p.id}`} className="flex min-h-12 items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted">{p.info.fileName} · {new Date(p.createdAt).toLocaleDateString()}</span>
                </span>
                {p.info.pmcType && <Badge className="hidden font-mono sm:inline-flex">{p.info.pmcType}</Badge>}
              </Link>
            ))}
          </Card>
        </section>
      )}
    </div>
  )
}
