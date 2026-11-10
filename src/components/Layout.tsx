import { Suspense, useEffect } from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'
import { Toaster } from 'sonner'
import { BookOpen, FileSearch, Home, Moon, Sun, Wrench, FolderOpen } from 'lucide-react'
import { useProjects } from '@/store/projects'
import { cn } from '@/lib/utils'

export const NAV = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/open', label: 'Open Backup', icon: FileSearch },
  { to: '/build', label: 'Build PMC', icon: Wrench },
  { to: '/projects', label: 'My Projects', icon: FolderOpen },
  { to: '/signals', label: 'Signals', icon: BookOpen },
] as const

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-7" />
      <span className="font-display text-lg font-bold">PMC Generator</span>
      <span className="hidden rounded-sm bg-fanuc px-1.5 py-0.5 text-[11px] font-bold text-on-accent sm:inline">FANUC</span>
    </Link>
  )
}

export function Layout() {
  const { theme, setTheme } = useProjects()
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark') }, [theme])
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-bezel text-bezel-fg shadow-[inset_0_-3px_0_var(--color-fanuc)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Logo />
          <nav className="ml-4 hidden flex-1 gap-1 md:flex" aria-label="Main">
            {NAV.map(({ to, label }) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cn('rounded-md px-3 py-2 text-sm font-medium text-bezel-fg/70 hover:text-bezel-fg', isActive && 'bg-bezel-2 text-fanuc')}>{label}</NavLink>
            ))}
          </nav>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="ml-auto flex size-11 items-center justify-center rounded-md text-bezel-fg hover:bg-bezel-2" aria-label="Toggle dark mode">
            {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 pb-28 md:pb-10">
        <Suspense fallback={<div className="py-20 text-center text-muted">Loading…</div>}><Outlet /></Suspense>
      </main>
      {/* Phone/tablet bottom bar */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 bg-bezel text-bezel-fg md:hidden" aria-label="Main">
        <div className="grid grid-cols-5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-bezel-fg/60', isActive && 'text-fanuc')}>
              <Icon className="size-5" /><span className="truncate">{label.replace('Open Backup', 'Open').replace('Build PMC', 'Build').replace('My Projects', 'Projects')}</span>
            </NavLink>
          ))}
        </div>
      </nav>
      <Toaster position="top-center" richColors />
    </div>
  )
}
