import * as React from 'react'
import { cn } from '@/lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'border-transparent bg-primary/10 text-primary shadow-sm',
    secondary: 'border-transparent bg-secondary text-secondary-foreground shadow-sm',
    destructive: 'border-transparent bg-destructive/15 text-destructive shadow-sm',
    outline: 'text-foreground border-border shadow-sm',
    success: 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shadow-sm',
    warning: 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400 shadow-sm',
  }

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        variants[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge }
