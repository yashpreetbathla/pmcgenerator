import type { ReactNode } from 'react'
import { Check, Search, X } from 'lucide-react'
import { Input } from '@/components/ui'
import { cn } from '@/lib/utils'

export function StepHeader({ title, text, right }: { title: string; text?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {text && <p className="mt-0.5 text-sm text-muted">{text}</p>}
      </div>
      {right}
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pr-10 pl-9" type="search" aria-label={placeholder} />
      {value && (
        <button onClick={() => onChange('')} className="absolute top-1/2 right-0 flex size-11 -translate-y-1/2 items-center justify-center text-muted hover:text-fg" aria-label="Clear search">
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

/** Big tappable row/tile with a check mark when selected. */
export function Choice({ selected, onClick, children, className, disabled, title }: { selected: boolean; onClick: () => void; children: ReactNode; className?: string; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={selected}
      className={cn(
        'relative flex min-h-11 w-full min-w-0 items-start gap-3 rounded-xl border bg-surface p-3 text-left transition-colors hover:border-accent/50 disabled:cursor-not-allowed',
        selected ? 'border-accent bg-accent-soft/60 ring-1 ring-accent/30' : 'border-border',
        className,
      )}
    >
      <span className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border', selected ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface')}>
        {selected && <Check className="size-3.5" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  )
}

/** Compact number input that commits on blur / Enter. */
export function NumInput({ value, onCommit, min, max, className, ariaLabel, placeholder }: { value: number | undefined; onCommit: (v: number | undefined) => void; min?: number; max?: number; className?: string; ariaLabel: string; placeholder?: string }) {
  return (
    <Input
      key={value ?? ''}
      type="number"
      inputMode="numeric"
      defaultValue={value ?? ''}
      min={min}
      max={max}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={cn('tabular', className)}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      onBlur={(e) => {
        const raw = e.target.value.trim()
        if (raw === '') return onCommit(undefined)
        let n = Math.round(Number(raw))
        if (!Number.isFinite(n)) return
        if (min !== undefined) n = Math.max(min, n)
        if (max !== undefined) n = Math.min(max, n)
        onCommit(n)
      }}
    />
  )
}
