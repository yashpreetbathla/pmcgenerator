import { forwardRef, useEffect, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { AlertTriangle, ChevronDown, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/* Big, touch-friendly controls by default (44px+ on phones). */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none select-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent font-semibold hover:bg-[#F2B400] active:translate-y-px shadow-[inset_0_-2px_0_rgba(0,0,0,0.18)]',
        secondary: 'bg-surface border border-border text-fg hover:bg-surface-2',
        ghost: 'text-fg hover:bg-surface-2',
        danger: 'bg-danger text-white hover:bg-danger/90',
      },
      size: { sm: 'h-9 px-3 text-sm', md: 'h-11 px-4 text-sm', lg: 'h-12 px-5 text-base', icon: 'size-11' },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>>(
  ({ className, variant, size, type = 'button', ...p }, ref) => <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...p} />,
)
Button.displayName = 'Button'

export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div className={cn('rounded-xl border border-border bg-surface', className)} {...p} />

const field = 'w-full rounded-lg border border-border bg-surface px-3 text-base sm:text-sm text-fg placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 h-11'
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cn(field, className)} {...p} />)
Input.displayName = 'Input'
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <span className="relative block w-full">
    <select ref={ref} className={cn(field, 'cursor-pointer appearance-none pr-11', className)} {...p} />
    <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted" />
  </span>
))
Select.displayName = 'Select'

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block min-w-0', className)}>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export const badge = cva('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: { tone: { neutral: 'bg-surface-2 text-muted', accent: 'bg-accent-soft text-link', success: 'bg-success-soft text-success', warning: 'bg-warning-soft text-warning', danger: 'bg-danger-soft text-danger' } },
  defaultVariants: { tone: 'neutral' },
})
export const Badge = ({ className, tone, ...p }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) => <span className={cn(badge({ tone }), className)} {...p} />

export function Callout({ tone = 'info', title, children }: { tone?: 'info' | 'warning'; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={cn('flex gap-3 rounded-xl border p-3.5 text-sm', tone === 'warning' ? 'border-warning/30 bg-warning-soft' : 'border-accent/20 bg-accent-soft')}>
      {tone === 'warning' ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> : <Info className="mt-0.5 size-4 shrink-0 text-link" />}
      <div className="min-w-0">{title && <p className="font-semibold">{title}</p>}{children && <div className="text-fg/80">{children}</div>}</div>
    </div>
  )
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>{subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Tabs<T extends string>({ items, value, onChange }: { items: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {items.map((it) => (
        <button key={it.value} role="tab" aria-selected={value === it.value} onClick={() => onChange(it.value)}
          className={cn('flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-muted hover:text-fg', value === it.value && 'bg-bezel text-bezel-fg hover:text-bezel-fg')}>
          {it.label}{it.count !== undefined && <span className="tabular text-xs opacity-70">{it.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted [&_svg]:size-8">{icon}</div>}
      <p className="font-semibold">{title}</p>{text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}{action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Dialog: bottom sheet on phones, centred panel on larger screens. */
export function Sheet({ open, onClose, title, subtitle, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    const o = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = o }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}
        className={cn('flex max-h-[92dvh] w-full min-w-0 flex-col rounded-t-2xl border border-border bg-surface shadow-xl sm:rounded-xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-start gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1"><h2 className="text-lg font-semibold">{title}</h2>{subtitle && <p className="text-sm text-muted">{subtitle}</p>}</div>
          <Button size="icon" variant="ghost" className="-mr-2 shrink-0" onClick={onClose} aria-label="Close"><X /></Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
        {footer && <div className="safe-bottom border-t border-border px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}
