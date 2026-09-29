import { useMemo, useState } from 'react'
import { ChevronDown, GripVertical, Plus, Search } from 'lucide-react'
import { cn, personName } from '@/shared/lib/utils'
import { matchesAllWordPrefixes } from '@/shared/lib/wordSearch'

export interface MissingEmployee {
  id: number
  first_name: string
  last_name: string
  middle_name?: string | null
  position: string
  departmentName?: string
}

export const EMPLOYEE_DRAG_ID = 'reactflow-employee-id'

export function MissingEmployees({
  employees, groupByDepartment = false, onAdd,
}: {
  employees: MissingEmployee[]
  groupByDepartment?: boolean
  onAdd: (employee: MissingEmployee) => void
}) {
  const [open, setOpen] = useState(true)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim()
    if (!q) return employees
    return employees.filter((e) => matchesAllWordPrefixes(`${personName(e.last_name, e.first_name, e.middle_name)} ${e.position} ${e.departmentName ?? ''}`, q))
  }, [employees, search])

  const groups = useMemo(() => {
    if (!groupByDepartment) return [{ name: '', items: filtered }]
    const map = new Map<string, MissingEmployee[]>()
    for (const e of filtered) {
      const key = e.departmentName || 'Без отдела'
      map.set(key, [...(map.get(key) ?? []), e])
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'ru')).map(([name, items]) => ({ name, items }))
  }, [filtered, groupByDepartment])

  if (employees.length === 0) {
    return (
      <div className="pt-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Кого не хватает</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Все сотрудники на схеме</p>
      </div>
    )
  }

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground"
      >
        <ChevronDown className={cn('h-3 w-3 transition-transform', !open && '-rotate-90')} />
        Кого не хватает ({employees.length})
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          {employees.length > 6 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Найти…"
                className="h-7 w-full rounded-md border border-border bg-background pl-6 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
          )}
          <div className="max-h-[260px] space-y-1 overflow-y-auto overscroll-contain pr-0.5">
            {groups.map((g) => (
              <div key={g.name || 'all'} className="space-y-1">
                {g.name && <p className="px-0.5 pt-1 text-[10px] font-medium text-muted-foreground">{g.name}</p>}
                {g.items.map((e) => (
                  <div
                    key={e.id}
                    draggable
                    onDragStart={(ev) => {
                      ev.dataTransfer.setData('reactflow-type', 'employee')
                      ev.dataTransfer.setData(EMPLOYEE_DRAG_ID, String(e.id))
                      ev.dataTransfer.effectAllowed = 'move'
                    }}
                    title="Перетащите на холст"
                    className="flex cursor-grab items-center gap-1 rounded-lg border border-border px-1.5 py-1.5 active:cursor-grabbing hover:bg-muted/50"
                  >
                    <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{personName(e.last_name, e.first_name, e.middle_name)}</p>
                      {e.position && <p className="truncate text-[10px] text-muted-foreground">{e.position}</p>}
                    </div>
                    <button
                      type="button"
                      title="Добавить на холст"
                      onClick={() => onAdd(e)}
                      className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ))}
            {filtered.length === 0 && <p className="px-0.5 text-[11px] text-muted-foreground">Никого не найдено</p>}
          </div>
        </div>
      )}
    </div>
  )
}
