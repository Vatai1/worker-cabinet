import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

interface PageBannerProps {
  /** Icon rendered inside the accent medallion. Ignored if iconSlot is set. */
  icon?: LucideIcon
  /** Custom node replacing the icon medallion entirely (e.g. an avatar). */
  iconSlot?: ReactNode
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** Small pills/badges rendered in a wrapped row under the title. */
  meta?: ReactNode
  /** Content pinned to the right (buttons, stat pills, controls). */
  aside?: ReactNode
  /** Full-width content below everything else (progress bar, selects, tabs). */
  extra?: ReactNode
  compact?: boolean
  className?: string
}

export function PageBanner({ icon: Icon, iconSlot, eyebrow, title, subtitle, meta, aside, extra, compact, className }: PageBannerProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm animate-slide-up',
        compact ? 'p-4' : 'p-6 lg:p-7',
        className
      )}
    >
      <div className="absolute inset-x-0 top-0 h-[3px] gradient-primary" />
      <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {(Icon || iconSlot) && (
            <div
              className={cn(
                'flex shrink-0 items-center justify-center gradient-primary text-white shadow-lg shadow-primary/25',
                compact ? 'h-9 w-9 rounded-xl' : 'h-12 w-12 rounded-2xl lg:h-14 lg:w-14'
              )}
            >
              {iconSlot ?? (Icon && <Icon className={compact ? 'h-4 w-4' : 'h-6 w-6'} />)}
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-primary/80">{eyebrow}</p>}
            <h1 className={cn('font-extrabold tracking-tight text-foreground', compact ? 'text-lg' : 'text-2xl lg:text-[28px]')} style={{ textWrap: 'balance' }}>
              {title}
            </h1>
            {subtitle && <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{subtitle}</p>}
            {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
          </div>
        </div>
        {aside && <div className="flex shrink-0 flex-wrap items-center gap-2">{aside}</div>}
      </div>
      {extra && <div className="relative mt-5">{extra}</div>}
    </div>
  )
}

const PILL_TONES = {
  default: 'border-primary/15 bg-primary/8 text-primary',
  warning: 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  neutral: 'border-border bg-muted/60 text-foreground',
} as const

export function BannerPill({
  icon: Icon,
  tone = 'default',
  children,
  className,
}: {
  icon?: LucideIcon
  tone?: keyof typeof PILL_TONES
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium', PILL_TONES[tone], className)}>
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  )
}
