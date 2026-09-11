import { useEffect, useMemo, useState } from 'react'
import { Users, Search, Check, Trash2, Plus, GitCompareArrows, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/core/auth/store/authStore'
import { useVacationStore } from '@/modules/vacation/store/vacationStore'
import { Button } from '@/shared/components/ui/Button'
import { Card } from '@/shared/components/ui/Card'
import { MultiSelectDropdown } from '@/shared/components/ui/MultiSelectDropdown'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { cn } from '@/shared/lib/utils'

interface DepartmentUser {
  id: string
  firstName: string
  lastName: string
  position: string
}

export function VacationRestrictions() {
  const user = useAuthStore((state) => state.user)
  const departmentRequests = useVacationStore((state) => state.departmentRequests)
  const restrictions = useVacationStore((state) => state.restrictions)
  const fetchRestrictions = useVacationStore((state) => state.fetchRestrictions)

  const [restrictionType, setRestrictionType] = useState<'pair' | 'group'>('pair')
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([])
  const [maxConcurrent, setMaxConcurrent] = useState<number>(1)
  const [description, setDescription] = useState('')

  const [search, setSearch] = useState('')
  const [positionFilter, setPositionFilter] = useState<string[]>([])
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('')

  const departments = useMemo(() => {
    const map = new Map<string, string>()
    departmentRequests.forEach((r) => {
      if (r.departmentId) map.set(r.departmentId, r.userDepartment || `Отдел ${r.departmentId}`)
    })
    if (user?.departmentId && !map.has(user.departmentId)) {
      map.set(user.departmentId, 'Мой отдел')
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru'))
  }, [departmentRequests, user?.departmentId])

  useEffect(() => {
    if (departments.length === 0) return
    setSelectedDepartmentId((prev) => {
      if (prev && departments.some((d) => d.value === prev)) return prev
      if (user?.departmentId && departments.some((d) => d.value === user.departmentId)) return user.departmentId
      return departments[0].value
    })
  }, [departments, user?.departmentId])

  useEffect(() => {
    if (selectedDepartmentId) fetchRestrictions(selectedDepartmentId)
  }, [selectedDepartmentId, fetchRestrictions])

  const departmentUsers = useMemo<DepartmentUser[]>(() => {
    const uniqueUsers = new Map<string, DepartmentUser>()
    departmentRequests
      .filter((request) => !selectedDepartmentId || request.departmentId === selectedDepartmentId)
      .forEach((request) => {
        const key = `${request.userId}-${request.userLastName}-${request.userFirstName}`
        if (!uniqueUsers.has(key)) {
          uniqueUsers.set(key, {
            id: request.userId,
            firstName: request.userFirstName,
            lastName: request.userLastName,
            position: request.userPosition,
          })
        }
      })
    return Array.from(uniqueUsers.values()).sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'ru'),
    )
  }, [departmentRequests, selectedDepartmentId])

  const positionOptions = useMemo(
    () =>
      Array.from(new Set(departmentUsers.map((u) => u.position).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'ru'))
        .map((p) => ({ value: p, label: p })),
    [departmentUsers],
  )

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return departmentUsers.filter((u) => {
      if (positionFilter.length > 0 && !positionFilter.includes(u.position)) return false
      if (!q) return true
      return `${u.lastName} ${u.firstName}`.toLowerCase().includes(q) || u.position.toLowerCase().includes(q)
    })
  }, [departmentUsers, search, positionFilter])

  const handleCreateRestriction = async () => {
    if (!selectedDepartmentId || selectedEmployees.length === 0) return

    if (restrictionType === 'pair' && selectedEmployees.length !== 2) {
      toast.error('Для парного ограничения нужно выбрать ровно 2 сотрудника')
      return
    }

    if (restrictionType === 'group' && selectedEmployees.length < 2) {
      toast.error('Для группового ограничения нужно выбрать минимум 2 сотрудника')
      return
    }

    try {
      await useVacationStore.getState().createRestriction(selectedDepartmentId, {
        type: restrictionType,
        employeeIds: selectedEmployees,
        maxConcurrent: restrictionType === 'group' ? maxConcurrent : undefined,
        description: description || undefined,
      })
      await fetchRestrictions(selectedDepartmentId)
      setSelectedEmployees([])
      setMaxConcurrent(1)
      setDescription('')
      toast.success('Ограничение создано')
    } catch {
      // handled in store
    }
  }

  const handleDeleteRestriction = async (restrictionId: string) => {
    try {
      await useVacationStore.getState().deleteRestriction(restrictionId)
      if (selectedDepartmentId) await fetchRestrictions(selectedDepartmentId)
    } catch {
      // handled in store
    }
  }

  const toggleEmployee = (employeeId: string) => {
    setSelectedEmployees((prev) => {
      if (prev.includes(employeeId)) return prev.filter((id) => id !== employeeId)
      if (restrictionType === 'pair' && prev.length >= 2) return [prev[0], employeeId]
      return [...prev, employeeId]
    })
  }

  const getEmployeeName = (employeeId: string) => {
    const employee = departmentUsers.find((u) => u.id === employeeId)
    return employee ? `${employee.lastName} ${employee.firstName}` : employeeId
  }

  const selectedDepartmentLabel = departments.find((d) => d.value === selectedDepartmentId)?.label ?? ''

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight">Пересечения отпусков</h2>
            <p className="text-xs text-muted-foreground">Кто не может быть в отпуске одновременно</p>
          </div>
        </div>
        {departments.length > 1 ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Отдел:</span>
            <SelectDropdown
              options={departments}
              value={selectedDepartmentId}
              onChange={(v) => {
                setSelectedDepartmentId(v)
                setSelectedEmployees([])
                setSearch('')
                setPositionFilter([])
              }}
            />
          </div>
        ) : (
          selectedDepartmentLabel && (
            <div className="text-sm text-muted-foreground">Отдел: {selectedDepartmentLabel}</div>
          )
        )}
      </div>

      <div className="p-5">
        {!selectedDepartmentId ? (
          <div className="rounded-xl border border-dashed border-border/60 py-10 text-center text-sm text-muted-foreground">
            Нет данных по отделам
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground/70">Новое ограничение</h3>

              <div className="space-y-2">
                <label className="block text-sm font-medium">Тип ограничения</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRestrictionType('pair')
                      setSelectedEmployees((prev) => prev.slice(0, 2))
                    }}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors',
                      restrictionType === 'pair'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted/50',
                    )}
                  >
                    <Link2 className="h-4 w-4" />
                    Парное
                  </button>
                  <button
                    type="button"
                    onClick={() => setRestrictionType('group')}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors',
                      restrictionType === 'group'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted/50',
                    )}
                  >
                    <GitCompareArrows className="h-4 w-4" />
                    Групповое
                  </button>
                </div>
              </div>

              <div
                className={cn(
                  'rounded-xl border px-3.5 py-2.5 text-sm',
                  restrictionType === 'pair'
                    ? 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                    : 'border-primary/20 bg-primary/5 text-foreground',
                )}
              >
                {restrictionType === 'pair'
                  ? 'Два выбранных сотрудника не могут одновременно находиться в отпуске.'
                  : `Максимум ${maxConcurrent} ${maxConcurrent === 1 ? 'сотрудник' : 'сотрудника'} из группы могут одновременно находиться в отпуске.`}
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">Сотрудники</label>

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
                  {(search || positionFilter.length > 0) && (
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
                  {filteredUsers.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">Сотрудники не найдены</div>
                  ) : (
                    filteredUsers.map((employee) => {
                      const isChecked = selectedEmployees.includes(employee.id)
                      const atPairLimit = restrictionType === 'pair' && selectedEmployees.length >= 2 && !isChecked
                      return (
                        <button
                          key={employee.id}
                          type="button"
                          onClick={() => toggleEmployee(employee.id)}
                          title={
                            atPairLimit
                              ? 'Для парного ограничения выбирается ровно 2 сотрудника — выбор заменит одного из выбранных'
                              : undefined
                          }
                          className={cn(
                            'flex w-full items-center gap-2.5 border-b border-border/60 px-4 py-2 text-left transition-colors last:border-0 hover:bg-muted/40',
                            isChecked && 'bg-primary/5',
                            atPairLimit && 'opacity-50',
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors',
                              isChecked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                            )}
                          >
                            {isChecked && <Check className="h-3 w-3" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {employee.lastName} {employee.firstName}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">{employee.position}</span>
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Выбрано: {selectedEmployees.length}
                    {restrictionType === 'pair' && ' из 2'}
                  </span>
                  {selectedEmployees.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedEmployees([])}
                      className="underline hover:text-foreground"
                    >
                      Очистить
                    </button>
                  )}
                </div>
              </div>

              {restrictionType === 'group' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Максимум одновременно в отпуске</label>
                  <input
                    type="number"
                    min="1"
                    max={selectedEmployees.length - 1 || 1}
                    value={maxConcurrent}
                    onChange={(e) => setMaxConcurrent(parseInt(e.target.value) || 1)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-medium">Описание (необязательно)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Напр. для обеспечения непрерывной работы…"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>

              <Button
                type="button"
                onClick={handleCreateRestriction}
                disabled={selectedEmployees.length === 0}
                className="w-full gap-2"
              >
                <Plus className="h-4 w-4" />
                Создать ограничение
              </Button>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground/70">
                Текущие ограничения{restrictions.length > 0 && ` (${restrictions.length})`}
              </h3>
              {restrictions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 py-10 text-center text-sm text-muted-foreground">
                  Нет ограничений
                </div>
              ) : (
                <div className="space-y-2.5">
                  {restrictions.map((restriction) => (
                    <div key={restriction.id} className="rounded-xl border border-border/60 p-4">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                              restriction.type === 'pair'
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                : 'bg-primary/10 text-primary',
                            )}
                          >
                            {restriction.type === 'pair' ? <Link2 className="h-3 w-3" /> : <GitCompareArrows className="h-3 w-3" />}
                            {restriction.type === 'pair' ? 'Парное' : 'Групповое'}
                          </span>
                          {restriction.maxConcurrent && (
                            <span className="text-xs text-muted-foreground">
                              максимум {restriction.maxConcurrent} одновременно
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteRestriction(restriction.id)}
                          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          title="Удалить"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="text-sm">
                        {restriction.employeeIds.map((id) => getEmployeeName(id)).join(', ')}
                      </p>
                      {restriction.description && (
                        <p className="mt-1 text-xs italic text-muted-foreground">{restriction.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
