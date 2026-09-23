import { useState } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

export interface CheckListItem {
  id: string
  label: string
}

export function SearchableCheckList({
  items,
  selected,
  onChange,
  searchPlaceholder = 'Поиск…',
  emptyText = 'Ничего не найдено',
  countLabel,
  className,
}: {
  items: CheckListItem[]
  selected: string[]
  onChange: (values: string[]) => void
  searchPlaceholder?: string
  emptyText?: string
  countLabel?: string
  className?: string
}) {
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? items.filter((i) => i.label.toLowerCase().includes(search.trim().toLowerCase()))
    : items

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
        />
      </div>
      <div className="max-h-48 overflow-y-auto rounded-lg border border-border scrollbar-thin overscroll-contain">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">{emptyText}</p>
        ) : (
          filtered.map((item) => {
            const checked = selected.includes(item.id)
            return (
              <label
                key={item.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 border-b border-border/50 px-3 py-2 text-sm transition-colors last:border-0 hover:bg-muted/50',
                  checked && 'bg-primary/5'
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(item.id)}
                  className="h-3.5 w-3.5 shrink-0 rounded border-border accent-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="truncate">{item.label}</span>
              </label>
            )
          })
        )}
      </div>
      {selected.length > 0 && countLabel && (
        <p className="text-xs text-muted-foreground">{countLabel}: {selected.length}</p>
      )}
    </div>
  )
}
