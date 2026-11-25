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
          aria-label={searchPlaceholder}
          placeholder={searchPlaceholder}
          className="h-10 w-full rounded-xl border border-input bg-card py-2 pl-9 pr-3 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground hover:border-primary/35 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
      </div>
      <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-card p-1.5 scrollbar-thin overscroll-contain">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">{emptyText}</p>
        ) : (
          filtered.map((item) => {
            const checked = selected.includes(item.id)
            return (
              <label
                key={item.id}
                className={cn(
                  'flex min-h-10 cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted focus-within:bg-muted',
                  checked && 'bg-primary/5 font-medium text-primary'
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(item.id)}
                  className="mt-[3px] h-3.5 w-3.5 shrink-0 rounded border-border accent-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="min-w-0 whitespace-normal break-words leading-snug">{item.label}</span>
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
