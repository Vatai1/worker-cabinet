import { useEffect, useMemo, useState } from 'react'
import { Users, Search } from 'lucide-react'
import { useAuthStore } from '@/core/auth/store/authStore'
import { useVacationStore } from '@/modules/vacation/store/vacationStore'
import { Button } from '@/shared/components/ui/Button'
import { Card } from '@/shared/components/ui/Card'
import { MultiSelectDropdown } from '@/shared/components/ui/MultiSelectDropdown'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'

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
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'ru')
    )
  }, [departmentRequests, selectedDepartmentId])

  const positionOptions = useMemo(
    () =>
      Array.from(new Set(departmentUsers.map((u) => u.position).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'ru'))
        .map((p) => ({ value: p, label: p })),
    [departmentUsers]
  )

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return departmentUsers.filter((u) => {
      if (positionFilter.length > 0 && !positionFilter.includes(u.position)) return false
      if (!q) return true
      return (
        `${u.lastName} ${u.firstName}`.toLowerCase().includes(q) ||
        u.position.toLowerCase().includes(q)
      )
    })
  }, [departmentUsers, search, positionFilter])

  const handleCreateRestriction = async () => {
    if (!selectedDepartmentId || selectedEmployees.length === 0) return

    if (restrictionType === 'pair' && selectedEmployees.length !== 2) {
      alert('Для парного ограничения нужно выбрать ровно 2 сотрудника')
      return
    }

    if (restrictionType === 'group' && selectedEmployees.length < 2) {
      alert('Для группового ограничения нужно выбрать минимум 2 сотрудника')
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
    } catch {
    }
  }

  const handleDeleteRestriction = async (restrictionId: string) => {
    try {
      await useVacationStore.getState().deleteRestriction(restrictionId)
      if (selectedDepartmentId) await fetchRestrictions(selectedDepartmentId)
    } catch {
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

  const selectedDepartmentLabel =
    departments.find((d) => d.value === selectedDepartmentId)?.label ?? ''

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Пересечения отпусков</h2>
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
          <div className="py-8 text-center text-muted-foreground">Нет данных по отделам</div>
        ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-lg font-semibold mb-4">Создать новое ограничение</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Тип ограничения</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setRestrictionType('pair')
                      setSelectedEmployees((prev) => prev.slice(0, 2))
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                      restrictionType === 'pair'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-input hover:border-input'
                    }`}
                  >
                    Парное
                  </button>
                  <button
                    type="button"
                    onClick={() => setRestrictionType('group')}
                    className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                      restrictionType === 'group'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-input hover:border-input'
                    }`}
                  >
                    Групповое
                  </button>
                </div>
              </div>

              {restrictionType === 'pair' ? (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-800">
                  Парное ограничение: два выбранных сотрудника не могут одновременно находиться в отпуске
                </div>
              ) : (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-sm text-blue-800">
                  Групповое ограничение: максимум {maxConcurrent} {maxConcurrent === 1 ? 'сотрудник' : 'сотрудника'} из группы могут одновременно находиться в отпуске
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Выберите сотрудников</label>

                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Поиск по ФИО или должности..."
                    className="w-full rounded-lg border-2 border-input py-2 pl-9 pr-3 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="mb-2 flex flex-wrap items-center gap-2">
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

                <div className="border-2 border-input rounded-lg max-h-60 overflow-y-auto">
                  {filteredUsers.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                      Сотрудники не найдены
                    </div>
                  ) : (
                    filteredUsers.map((employee) => {
                      const isChecked = selectedEmployees.includes(employee.id)
                      const atPairLimit = restrictionType === 'pair' && selectedEmployees.length >= 2 && !isChecked
                      return (
                        <button
                          key={employee.id}
                          type="button"
                          onClick={() => toggleEmployee(employee.id)}
                          title={atPairLimit ? 'Для парного ограничения выбирается ровно 2 сотрудника — выбор заменит одного из выбранных' : undefined}
                          className={`w-full px-4 py-2 text-left border-b border-input last:border-0 hover:bg-muted/50 flex items-center gap-2 ${
                            isChecked ? 'bg-blue-50' : ''
                          } ${atPairLimit ? 'opacity-50' : ''}`}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                            isChecked ? 'border-blue-500 bg-blue-500' : 'border-input'
                          }`}>
                            {isChecked && (
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                          <div>
                            <div className="text-sm font-medium">{employee.lastName} {employee.firstName}</div>
                            <div className="text-xs text-muted-foreground">{employee.position}</div>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>

                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
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
                <div>
                  <label className="block text-sm font-medium mb-2">Максимум одновременно в отпуске</label>
                  <input
                    type="number"
                    min="1"
                    max={selectedEmployees.length - 1 || 1}
                    value={maxConcurrent}
                    onChange={(e) => setMaxConcurrent(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border-2 border-input rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Описание (необязательно)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Например, для обеспечения непрерывной работы..."
                  className="w-full px-3 py-2 border-2 border-input rounded-lg focus:border-blue-500 focus:outline-none"
                />
              </div>

              <Button
                type="button"
                onClick={handleCreateRestriction}
                disabled={selectedEmployees.length === 0}
                className="w-full"
              >
                Создать ограничение
              </Button>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Текущие ограничения</h3>
            {restrictions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Нет ограничений</div>
            ) : (
              <div className="space-y-3">
                {restrictions.map((restriction) => (
                  <div
                    key={restriction.id}
                    className="border-2 border-input rounded-lg p-4 hover:border-input transition-colors"
                  >
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <div>
                        <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                          restriction.type === 'pair' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {restriction.type === 'pair' ? 'Парное' : 'Групповое'}
                        </span>
                        {restriction.maxConcurrent && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (максимум {restriction.maxConcurrent} одновременно)
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteRestriction(restriction.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    <div className="text-sm mb-2">
                      {restriction.employeeIds.map((id) => getEmployeeName(id)).join(', ')}
                    </div>
                    {restriction.description && (
                      <div className="text-xs text-muted-foreground italic">{restriction.description}</div>
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
