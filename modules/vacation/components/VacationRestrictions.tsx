import { useEffect, useMemo, useState } from 'react'
import { Users, Search, Check, Trash2, Plus, Tag, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/core/auth/store/authStore'
import { useVacationStore } from '@/modules/vacation/store/vacationStore'
import { useModulesStore } from '@/shared/store/modulesStore'
import { Button } from '@/shared/components/ui/Button'
import { Card } from '@/shared/components/ui/Card'
import { MultiSelectDropdown } from '@/shared/components/ui/MultiSelectDropdown'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { apiGet } from '@/shared/lib/apiClient'
import { cn, formatDate, getErrorMessage } from '@/shared/lib/utils'

interface DepartmentUser {
  id: string
  firstName: string
  lastName: string
  position: string
}

interface UserSearchRow {
  id: number
  first_name: string
  last_name: string
  middle_name: string | null
  position: string | null
  tags: Array<{ id: number; name: string }>
}

export function VacationRestrictions() {
  const user = useAuthStore((state) => state.user)
  const departmentRequests = useVacationStore((state) => state.departmentRequests)
  const restrictions = useVacationStore((state) => state.restrictions)
  const fetchRestrictions = useVacationStore((state) => state.fetchRestrictions)
  const violations = useVacationStore((state) => state.violations)
  const fetchViolations = useVacationStore((state) => state.fetchViolations)
  const isModuleEnabled = useModulesStore((s) => s.isModuleEnabled)
  const skillsEnabled = isModuleEnabled('skills')

  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [maxConcurrent, setMaxConcurrent] = useState<number>(1)
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<Array<{ id: number; name: string }>>([])

  const [search, setSearch] = useState('')
  const [positionFilter, setPositionFilter] = useState<string[]>([])
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('')
  const [violationsExpanded, setViolationsExpanded] = useState(true)
  const [deptTagOptions, setDeptTagOptions] = useState<Array<{ id: number; name: string }>>([])
  const [tagMembers, setTagMembers] = useState<UserSearchRow[]>([])

  useEffect(() => {
    if (!skillsEnabled) {
      setTags([])
      return
    }
    apiGet<Array<{ id: number; name: string }>>('/users/skills/all').then(setTags).catch(() => setTags([]))
  }, [skillsEnabled])

  useEffect(() => {
    if (!skillsEnabled || !selectedDepartmentId) {
      setDeptTagOptions([])
      return
    }
    apiGet<UserSearchRow[]>(`/users/search?departmentId=${selectedDepartmentId}`)
      .then((rows) => {
        const map = new Map<number, string>()
        rows.forEach((row) => (row.tags || []).forEach((t) => map.set(t.id, t.name)))
        setDeptTagOptions(
          Array.from(map.entries())
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
        )
      })
      .catch(() => setDeptTagOptions([]))
  }, [skillsEnabled, selectedDepartmentId])

  useEffect(() => {
    if (selectedTagIds.length === 0) {
      setTagMembers([])
      return
    }
    apiGet<UserSearchRow[]>(`/users/search?tagId=${selectedTagIds.join(',')}`)
      .then(setTagMembers)
      .catch(() => setTagMembers([]))
  }, [selectedTagIds])

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

  useEffect(() => {
    if (selectedDepartmentId) fetchViolations(selectedDepartmentId)
  }, [selectedDepartmentId, fetchViolations])

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
    if (!selectedDepartmentId || (selectedEmployees.length === 0 && selectedTagIds.length === 0)) return

    try {
      await useVacationStore.getState().createRestriction(selectedDepartmentId, {
        type: 'group',
        employeeIds: selectedEmployees,
        tagIds: selectedTagIds,
        maxConcurrent,
        description: description || undefined,
      })
      await Promise.all([fetchRestrictions(selectedDepartmentId), fetchViolations(selectedDepartmentId)])
      setSelectedEmployees([])
      setSelectedTagIds([])
      setMaxConcurrent(1)
      setDescription('')
      toast.success('Ограничение создано')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    }
  }

  const handleDeleteRestriction = async (restrictionId: string) => {
    try {
      await useVacationStore.getState().deleteRestriction(restrictionId)
      if (selectedDepartmentId) await Promise.all([fetchRestrictions(selectedDepartmentId), fetchViolations(selectedDepartmentId)])
    } catch {
      // handled in store
    }
  }

  const toggleEmployee = (employeeId: string) => {
    setSelectedEmployees((prev) => {
      if (prev.includes(employeeId)) return prev.filter((id) => id !== employeeId)
      return [...prev, employeeId]
    })
  }

  const getEmployeeName = (employeeId: string) => {
    const employee = departmentUsers.find((u) => u.id === employeeId)
    return employee ? `${employee.lastName} ${employee.firstName}` : employeeId
  }

  const getTagName = (tagId: string) => tags.find((t) => String(t.id) === tagId)?.name ?? tagId

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
                setSelectedTagIds([])
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
          <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground/70">Новое ограничение</h3>

              <div className="space-y-2">
                <label className="block text-sm font-medium">Название (необязательно)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Напр. для обеспечения непрерывной работы…"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>

              <div className="rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-sm text-foreground">
                {`Максимум ${maxConcurrent} ${maxConcurrent === 1 ? 'работник' : 'работника'} из группы могут одновременно находиться в отпуске.`}
              </div>

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
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">Работники не найдены</div>
                  ) : (
                    filteredUsers.map((employee) => {
                      const isChecked = selectedEmployees.includes(employee.id)
                      return (
                        <button
                          key={employee.id}
                          type="button"
                          onClick={() => toggleEmployee(employee.id)}
                          className={cn(
                            'flex w-full items-center gap-2.5 border-b border-border/60 px-4 py-2 text-left transition-colors last:border-0 hover:bg-muted/40',
                            isChecked && 'bg-primary/5',
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
                  <span>Выбрано: {selectedEmployees.length + selectedTagIds.length}</span>
                  {(selectedEmployees.length > 0 || selectedTagIds.length > 0) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEmployees([])
                        setSelectedTagIds([])
                      }}
                      className="underline hover:text-foreground"
                    >
                      Очистить
                    </button>
                  )}
                </div>
              </div>

              {skillsEnabled && deptTagOptions.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Теги</label>
                  <MultiSelectDropdown
                    options={deptTagOptions.map((t) => ({ value: String(t.id), label: t.name }))}
                    selected={selectedTagIds}
                    onChange={setSelectedTagIds}
                    placeholder="Теги не выбраны"
                    countLabel="Теги"
                  />
                  <p className="text-xs text-muted-foreground">
                    Показаны только теги, связанные с сотрудниками отдела. В ограничение войдут все работники с выбранными тегами (список обновляется автоматически)
                  </p>
                  {selectedTagIds.length > 0 && (
                    <div className="rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5">
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                        Сотрудники с выбранными тегами{tagMembers.length > 0 && ` (${tagMembers.length})`}
                      </p>
                      {tagMembers.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Никто не найден</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {tagMembers.map((m) => (
                            <span
                              key={m.id}
                              className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                            >
                              {m.last_name} {m.first_name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

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

              <Button
                type="button"
                onClick={handleCreateRestriction}
                disabled={selectedEmployees.length === 0 && selectedTagIds.length === 0}
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
                          {restriction.description && (
                            <span className="text-sm font-medium">{restriction.description}</span>
                          )}
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
                        {restriction.employeeIds.map((id) => getEmployeeName(id)).join(', ') || 'Только теги'}
                      </p>
                      {(restriction.tagIds?.length ?? 0) > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {restriction.tagIds!.map((tid) => (
                            <span
                              key={tid}
                              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                            >
                              <Tag className="h-3 w-3" />
                              {getTagName(tid)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={() => setViolationsExpanded((v) => !v)}
                className="flex w-full items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Текущие пересечения{violations.length > 0 && ` (${violations.length})`}
                {violationsExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {violationsExpanded && (
                violations.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/60 py-6 text-center text-sm text-muted-foreground">
                    Сейчас нет пересечений среди сотрудников отдела
                  </div>
                ) : (
                  <div className="space-y-2">
                    {violations.map((v, i) => (
                      <div key={`${v.restrictionId}-${i}`} className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5">
                        <p className="text-sm font-medium">{v.names.join(', ')}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(v.startDate)} – {formatDate(v.endDate)}
                          {v.maxConcurrent != null && ` · лимит одновременно: ${v.maxConcurrent}`}
                          {v.tagNames.length > 0 && ` · по тегам: ${v.tagNames.join(', ')}`}
                        </p>
                        {v.description && <p className="mt-0.5 text-xs italic text-muted-foreground">{v.description}</p>}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
