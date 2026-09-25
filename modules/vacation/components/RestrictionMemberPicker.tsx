import { useEffect, useMemo, useState } from 'react'
import { Search, Check } from 'lucide-react'
import { toast } from 'sonner'
import { MultiSelectDropdown } from '@/shared/components/ui/MultiSelectDropdown'
import { apiGet } from '@/shared/lib/apiClient'
import { cn, getErrorMessage } from '@/shared/lib/utils'
import type { RestrictionScopeEmployee } from '@/shared/types'

interface UserSearchRow {
  id: number
  first_name: string
  last_name: string
  middle_name: string | null
  position: string | null
  department_id: number | null
  department_name: string | null
  tags: Array<{ id: number; name: string }>
}

function toScopeEmployee(row: UserSearchRow): RestrictionScopeEmployee {
  return {
    id: String(row.id),
    firstName: row.first_name,
    lastName: row.last_name,
    middleName: row.middle_name,
    position: row.position || '',
    departmentId: row.department_id === null ? null : String(row.department_id),
    departmentName: row.department_name,
    tags: (row.tags || []).map((t) => ({ id: String(t.id), name: t.name })),
  }
}

function EmployeeRow({
  employee,
  checked,
  showDepartment,
  onToggle,
}: {
  employee: RestrictionScopeEmployee
  checked: boolean
  showDepartment: boolean
  onToggle: (id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(employee.id)}
      className={cn(
        'flex w-full items-center gap-2.5 border-b border-border/60 px-4 py-2 text-left transition-colors last:border-0 hover:bg-muted/40',
        checked && 'bg-primary/5',
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
        )}
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">
          {employee.lastName} {employee.firstName}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {[employee.position, showDepartment ? employee.departmentName : null].filter(Boolean).join(' · ')}
        </span>
      </span>
    </button>
  )
}

interface RestrictionMemberPickerProps {
  employees: RestrictionScopeEmployee[]
  employeesLoading: boolean
  selected: string[]
  onChange: (ids: string[]) => void
  skillsEnabled: boolean
}

export function RestrictionMemberPicker({ employees, employeesLoading, selected, onChange, skillsEnabled }: RestrictionMemberPickerProps) {
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [tagMembers, setTagMembers] = useState<RestrictionScopeEmployee[]>([])
  const [tagMembersLoading, setTagMembersLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [positionFilter, setPositionFilter] = useState<string[]>([])

  useEffect(() => {
    if (selectedTagIds.length === 0) {
      setTagMembers([])
      return
    }
    let cancelled = false
    setTagMembersLoading(true)
    apiGet<UserSearchRow[]>(`/users/search?tagId=${selectedTagIds.join(',')}`)
      .then((rows) => { if (!cancelled) setTagMembers(rows.map(toScopeEmployee)) })
      .catch((err: unknown) => {
        if (cancelled) return
        setTagMembers([])
        toast.error(getErrorMessage(err))
      })
      .finally(() => { if (!cancelled) setTagMembersLoading(false) })
    return () => { cancelled = true }
  }, [selectedTagIds])

  const tagOptions = useMemo(() => {
    const map = new Map<string, string>()
    employees.forEach((e) => e.tags.forEach((t) => map.set(t.id, t.name)))
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru'))
  }, [employees])

  const positionOptions = useMemo(
    () =>
      Array.from(new Set(employees.map((u) => u.position).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'ru'))
        .map((p) => ({ value: p, label: p })),
    [employees],
  )

  const showDepartment = useMemo(() => new Set(employees.map((e) => e.departmentId)).size > 1, [employees])

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter((u) => {
      if (positionFilter.length > 0 && !positionFilter.includes(u.position)) return false
      if (!q) return true
      return `${u.lastName} ${u.firstName}`.toLowerCase().includes(q) || u.position.toLowerCase().includes(q)
    })
  }, [employees, search, positionFilter])

  const hasFilters = search !== '' || positionFilter.length > 0
  const allFilteredSelected = filteredUsers.length > 0 && filteredUsers.every((u) => selected.includes(u.id))

  const toggleEmployee = (employeeId: string) => {
    onChange(selected.includes(employeeId) ? selected.filter((id) => id !== employeeId) : [...selected, employeeId])
  }

  const toggleAllFiltered = () => {
    const ids = filteredUsers.map((u) => u.id)
    onChange(allFilteredSelected ? selected.filter((id) => !ids.includes(id)) : Array.from(new Set([...selected, ...ids])))
  }

  return (
    <>
      {skillsEnabled && tagOptions.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm font-medium">Теги</label>
          <MultiSelectDropdown
            options={tagOptions}
            selected={selectedTagIds}
            onChange={setSelectedTagIds}
            placeholder="Теги не выбраны"
            countLabel="Теги"
          />
          <p className="text-xs text-muted-foreground">Показаны теги, которые есть у ваших сотрудников</p>
          {selectedTagIds.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Работники с выбранными тегами{tagMembers.length > 0 && ` (${tagMembers.length})`}
              </p>
              <div className="max-h-60 overflow-y-auto rounded-xl border border-border">
                {tagMembersLoading ? (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">Загрузка…</div>
                ) : tagMembers.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">Никто не найден</div>
                ) : (
                  tagMembers.map((employee) => (
                    <EmployeeRow
                      key={employee.id}
                      employee={employee}
                      checked={selected.includes(employee.id)}
                      showDepartment
                      onToggle={toggleEmployee}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium">Работники</label>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по ФИО или должности…"
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MultiSelectDropdown
            options={positionOptions}
            selected={positionFilter}
            onChange={setPositionFilter}
            placeholder="Все должности"
            countLabel="Должности"
          />
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setPositionFilter([])
              }}
              className="text-sm text-muted-foreground underline hover:text-foreground"
            >
              Сбросить фильтры
            </button>
          )}
        </div>

        <div className="max-h-60 overflow-y-auto rounded-xl border border-border">
          {employeesLoading ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">Загрузка…</div>
          ) : filteredUsers.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">Работники не найдены</div>
          ) : (
            filteredUsers.map((employee) => (
              <EmployeeRow
                key={employee.id}
                employee={employee}
                checked={selected.includes(employee.id)}
                showDepartment={showDepartment}
                onToggle={toggleEmployee}
              />
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>Выбрано: {selected.length}</span>
          <div className="flex items-center gap-3">
            {filteredUsers.length > 0 && (
              <button type="button" onClick={toggleAllFiltered} className="underline hover:text-foreground">
                {allFilteredSelected ? 'Снять выбор со списка' : 'Выбрать всех в списке'}
              </button>
            )}
            {selected.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="underline hover:text-foreground">
                Очистить
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
