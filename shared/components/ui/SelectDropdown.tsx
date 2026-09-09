import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

export interface SelectDropdownOption {
  value: string
  label: string
}

const selectClass = 'h-9 border border-border rounded-[10px] bg-card text-[13px] text-foreground px-3 py-2 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15'

export function SelectDropdown({
  options,
  value,
  onChange,
  className,
}: {
  options: SelectDropdownOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const label = options.find((o) => o.value === value)?.label ?? ''

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(selectClass, 'flex min-w-[140px] items-center justify-between gap-2 text-left cursor-pointer', className)}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1.5 max-h-64 w-60 overflow-y-auto rounded-[10px] border border-border bg-card p-1.5 shadow-lg">
          {options.map((o) => {
            const active = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false) }}
                className={cn(
                  'block w-full truncate rounded-[8px] px-2.5 py-1.5 text-left text-[13px] hover:bg-muted',
                  active ? 'font-semibold text-primary' : 'text-foreground'
                )}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
