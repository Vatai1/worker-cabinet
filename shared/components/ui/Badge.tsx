import * as React from 'react'
import { cn } from '@/shared/lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
}

const Badge = React.memo(function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'border-transparent bg-primary/10 text-primary',
    secondary: 'border-transparent bg-secondary text-secondary-foreground',
    destructive: 'border-transparent bg-destructive/10 text-destructive',
    outline: 'text-foreground border-border',
    success: 'border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    warning: 'border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400',
  }

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-medium transition-colors',
        variants[variant],
        className
      )}
      {...props}
    />
  )
})

export { Badge }
