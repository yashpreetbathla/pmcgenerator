import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronRight, FileSearch, FolderOpen, Lock, PlayCircle, ShieldAlert, Wrench } from 'lucide-react'
import { Card } from '@/components/ui'
import { useProjects } from '@/store/projects'
import { DRAFT_NOTICE } from '@/lib/utils'
import { OriginBadge, formatDate, netCount, projectType, useOpenDemo } from './projectMeta'

const STEPS = [
  { title: 'Open or build', text: 'Pick a PMC backup from your memory card (e.g. PMC1.000), or answer a few questions about your machine.' },
  { title: 'Read the ladder', text: 'Browse nets, symbols, alarm messages and cross references — on your phone or PC.' },
  { title: 'Save & share', text: 'Projects are kept on this device. Export a file or share it from your phone.' },
]

export default function HomePage() {
  const projects = useProjects((s) => s.projects)
  const openDemo = useOpenDemo()
  const recent = projects.slice(0, 4)

  return (
    <div className="space-y-8 sm:space-y-10">
      <section className="pt-2 sm:pt-6">
        <h1 className="max-w-2xl text-3xl font-bold text-balance sm:text-5xl">
          Build or read FANUC PMC ladders — right in your browser
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted sm:text-base">
          No install, no account. Choose what you want to do:
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <BigAction
          to="/open"
          icon={<FileSearch />}
          title="Open a PMC backup"
          text="Read a ladder file from the memory card, e.g. PMC1.000."
          cta="Choose file"
        />
        <BigAction
          to="/build"
          icon={<Wrench />}
          title="Build a new PMC"
          text="Answer simple questions — get a draft ladder, symbols and messages."
          cta="Start building"
        />
        <button
          onClick={openDemo}
          className="group flex min-h-14 items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-left hover:border-accent hover:bg-accent-soft sm:col-span-2"
        >
          <PlayCircle className="size-6 shrink-0 text-link" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Try the demo</span>
            <span className="block text-sm text-muted">A small synthetic 2-axis lathe ladder to explore — no file needed.</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
        </button>
      </section>

      {recent.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold">Recent projects</h2>
            <Link to="/projects" className="flex h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-link hover:bg-accent-soft">
              See all <ArrowRight className="size-4" />
            </Link>
          </div>
          <Card className="divide-y divide-border overflow-hidden">
            {recent.map((p) => (
              <Link key={p.id} to={`/project/${p.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <FolderOpen className="size-5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{p.name || 'Untitled'}</span>
                    <OriginBadge origin={p.origin} />
                  </div>
                  <p className="truncate text-xs text-muted">
                    {projectType(p)} · {netCount(p)} nets · {formatDate(p.createdAt)}
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted" />
              </Link>
            ))}
          </Card>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-semibold">How it works</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3 rounded-xl border border-border bg-surface p-4">
              <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full bg-fg text-sm font-semibold text-bg">{i + 1}</span>
              <div className="min-w-0">
                <p className="font-medium">{s.title}</p>
                <p className="mt-0.5 text-sm text-muted">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="flex gap-3 rounded-xl bg-surface-2 p-4">
          <Lock className="mt-0.5 size-4 shrink-0 text-success" />
          <p><span className="font-medium">Private.</span> <span className="text-muted">Your files never leave this device — everything runs in the browser, even offline.</span></p>
        </div>
        <div className="flex gap-3 rounded-xl bg-surface-2 p-4">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <p><span className="font-medium">Drafts only.</span> <span className="text-muted">{DRAFT_NOTICE}</span></p>
        </div>
      </section>
    </div>
  )
}

function BigAction({ to, icon, title, text, cta }: { to: string; icon: ReactNode; title: string; text: string; cta: string }) {
  return (
    <Link
      to={to}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-sm transition-colors hover:border-accent sm:min-h-52 sm:p-6"
    >
      <span className="absolute inset-x-0 top-0 h-1 bg-fanuc" aria-hidden />
      <span className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-link [&_svg]:size-6">{icon}</span>
      <span className="mt-4 text-lg font-semibold tracking-tight sm:text-xl">{title}</span>
      <span className="mt-1 text-sm text-muted">{text}</span>
      <span className="mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-semibold text-on-accent shadow-sm group-hover:bg-accent/90 sm:mt-auto sm:self-start">
        {cta} <ArrowRight className="size-4" />
      </span>
    </Link>
  )
}
