import * as React from 'react'
import { cn } from '@/shared/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

const Button = React.memo(React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 interactive'

    const variants = {
      default: 'gradient-primary text-white shadow-md shadow-primary/15 hover:shadow-lg hover:shadow-primary/25 hover:brightness-110 active:brightness-100',
      destructive: 'bg-destructive text-white shadow-sm hover:bg-destructive/90 hover:shadow-md',
      outline: 'border border-input bg-background hover:bg-muted/60 hover:border-primary/25',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      ghost: 'hover:bg-muted/60 hover:text-foreground',
      link: 'text-primary underline-offset-4 hover:underline',
    }

    const sizes = {
      default: 'h-9 px-4 py-2',
      sm: 'h-8 rounded-lg px-3 text-xs',
      lg: 'h-12 rounded-xl px-6',
      icon: 'h-9 w-9',
    }

    return (
      <button
        className={cn(base, variants[variant], sizes[size], className)}
        ref={ref}
        {...props}
      />
    )
  }
))
Button.displayName = 'Button'

export { Button }
