import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpDown, ChevronDown, ChevronUp, Filter, Search } from 'lucide-react'
import { SearchableCheckList, type CheckListItem } from '@/shared/components/ui/SearchableCheckList'
import { Card } from '@/shared/components/ui/Card'
import { cn } from '@/shared/lib/utils'

type IconType = React.ComponentType<{ className?: string }>

export const TH = 'whitespace-nowrap px-4 py-2.5 font-medium'
export const TD = 'px-4 py-2.5 text-[13px]'
export const TR = 'border-b border-border/50 last:border-0 transition-colors hover:bg-muted/30'

export function TableCard({ icon: Icon, title, subtitle, children }: { icon: IconType; title: string; subtitle: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <div className="space-y-5 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-primary/10 text-primary">
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
    </Card>
  )
}

export function TableSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-[220px] flex-1">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-[10px] border border-border bg-card pl-9 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
      />
    </div>
  )
}

export function TableFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}

export function TableHeadRow({ children }: { children: React.ReactNode }) {
  return <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">{children}</tr>
}

export function useTableSort<K extends string>(initial: K, initialDir: 'asc' | 'desc' = 'asc') {
  const [key, setKey] = useState<K>(initial)
  const [dir, setDir] = useState<'asc' | 'desc'>(initialDir)
  const toggle = (next: K) => {
    if (next === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setKey(next)
      setDir('asc')
    }
  }
  const sorted = <T,>(rows: T[], value: (row: T, key: K) => string | number) =>
    [...rows].sort((a, b) => {
      const va = value(a, key)
      const vb = value(b, key)
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ru')
      return dir === 'asc' ? cmp : -cmp
    })
  return { key, dir, toggle, sorted }
}

export function SortButton({ label, active, dir, onClick }: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 hover:text-foreground">
      {label}
      {active ? (dir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />}
    </button>
  )
}

export function TableEmpty({ icon: Icon, title, hint }: { icon: IconType; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-12 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/40" />
      <p className="mt-3 text-sm text-muted-foreground">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  )
}

export function TableSkeleton() {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
      ))}
    </div>
  )
}

export function RowAction({ icon: Icon, label, onClick, danger }: { icon: IconType; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        'grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors',
        danger ? 'hover:bg-destructive/10 hover:text-destructive' : 'hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}

export function CountBadge({ count }: { count: number }) {
  return (
    <span className={cn('inline-flex min-w-[2rem] justify-center rounded-full px-2 py-0.5 text-xs font-semibold', count === 0 ? 'bg-muted text-muted-foreground/60' : 'bg-primary/10 text-primary')}>
      {count}
    </span>
  )
}

const FILTER_POPOVER_WIDTH = 320

export function FilterHeader({
  label,
  sortActive,
  sortDir,
  onSort,
  filterOptions,
  selected,
  onFilterChange,
  searchPlaceholder,
}: {
  label: string
  sortActive?: boolean
  sortDir?: 'asc' | 'desc'
  onSort?: () => void
  filterOptions: CheckListItem[]
  selected: string[]
  onFilterChange: (values: string[]) => void
  searchPlaceholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    const close = () => setOpen(false)
    const onScroll = (e: Event) => {
      if (popoverRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const toggleOpen = () => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = ref.current?.getBoundingClientRect()
    if (rect) {
      const width = Math.min(FILTER_POPOVER_WIDTH, window.innerWidth - 32)
      setPos({ left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)), top: rect.bottom + 6 })
    }
    setOpen(true)
  }

  const activeCount = selected.length

  return (
    <div ref={ref} className="relative inline-flex items-center gap-1">
      <button
        type="button"
        onClick={toggleOpen}
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground',
          activeCount > 0 && 'text-primary font-semibold'
        )}
      >
        {label}
        <Filter className={cn('h-3 w-3', activeCount > 0 ? 'text-primary' : 'opacity-30')} />
        {activeCount > 0 && (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {activeCount}
          </span>
        )}
      </button>
      {onSort && (
        <button type="button" onClick={onSort} className="text-muted-foreground hover:text-foreground">
          {sortActive ? (sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />}
        </button>
      )}
      {open && pos && createPortal(
        <div
          ref={popoverRef}
          style={{ left: pos.left, top: pos.top, width: `min(${FILTER_POPOVER_WIDTH}px, calc(100vw - 2rem))` }}
          className="fixed z-[70] rounded-xl border border-border bg-card p-2.5 text-left font-normal normal-case tracking-normal shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <SearchableCheckList
            items={filterOptions}
            selected={selected}
            onChange={onFilterChange}
            searchPlaceholder={searchPlaceholder}
          />
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => onFilterChange([])}
              className="mt-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Сбросить фильтр
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}

export function TableEmptyRow({ colSpan, icon: Icon, title }: { colSpan: number; icon: IconType; title: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-12 text-center">
        <Icon className="mx-auto h-8 w-8 text-muted-foreground/40" />
        <p className="mt-3 text-sm text-muted-foreground">{title}</p>
      </td>
    </tr>
  )
}

export const matchesFilter = (selected: string[], value: string | string[]) =>
  selected.length === 0 || (Array.isArray(value) ? value.some((v) => selected.includes(v)) : selected.includes(value))

export const filterOptionsOf = (values: string[]) =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b, 'ru')).map((v) => ({ id: v, label: v }))
