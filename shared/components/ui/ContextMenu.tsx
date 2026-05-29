import * as React from 'react'
import { cn } from '@/shared/lib/utils'

interface ContextMenuProps {
  children: React.ReactNode
  items: { label: string; onClick: () => void; danger?: boolean; icon?: React.ReactNode }[]
}

export function ContextMenu({ children, items }: ContextMenuProps) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(!open)} className="cursor-pointer">
        {children}
      </div>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-border/60 bg-popover p-1 shadow-lg animate-scale-in">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => { item.onClick(); setOpen(false) }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-150',
                item.danger
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'hover:bg-muted'
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
