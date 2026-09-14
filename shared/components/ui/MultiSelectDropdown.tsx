import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

export interface MultiSelectOption {
  value: string
  label: string
}

const selectClass = 'h-9 border border-border rounded-[10px] bg-card text-[13px] text-foreground px-3 py-2 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15'

export function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder,
  countLabel,
}: {
  options: MultiSelectOption[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder: string
  countLabel: string
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

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((x) => x !== value) : [...selected, value])
  }

  const label = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? placeholder
      : `${countLabel}: ${selected.length}`

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(selectClass, 'flex min-w-[150px] max-w-[200px] items-center justify-between gap-2 text-left')}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1.5 max-h-64 w-max min-w-[240px] max-w-[min(420px,70vw)] overflow-y-auto rounded-[10px] border border-border bg-card p-1.5 shadow-lg">
          <button
            type="button"
            onClick={() => onChange([])}
            className="mb-1 w-full rounded-[8px] px-2.5 py-1.5 text-left text-[13px] font-medium text-primary hover:bg-muted"
          >
            {placeholder}
          </button>
          {options.map((o) => {
            const checked = selected.includes(o.value)
            return (
              <label
                key={o.value}
                className="flex cursor-pointer items-start gap-2 rounded-[8px] px-2.5 py-1.5 text-[13px] text-foreground hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(o.value)}
                  className="mt-[3px] h-3.5 w-3.5 shrink-0 rounded border-border accent-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="whitespace-normal break-words leading-snug">{o.label}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
