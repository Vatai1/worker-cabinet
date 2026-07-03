import { useEffect, useState, useMemo } from 'react'
import { Card } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Badge } from '@/shared/components/ui/Badge'
import { YearCalendar } from '@/shared/components/calendar/YearCalendar'
import { vacationApi } from '@/modules/vacation/services/vacationApi'
import { getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'
import { Plane, Filter, ChevronLeft, ChevronRight, Loader2, Users, Lock, Unlock } from 'lucide-react'
import type { VacationRequest } from '@/shared/types'
import { useDepartmentsStore } from '@/shared/store/departmentsStore'
import { VacationRequestStatus } from '@/shared/types'

interface Department {
  id: number
  name: string
  manager_name: string | null
  employee_count: string
  vacation_requests_blocked: boolean
}

export function HRVacationCalendar() {
  const [requests, setRequests] = useState<VacationRequest[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [togglingBlock, setTogglingBlock] = useState<number | null>(null)
  const [togglingAll, setTogglingAll] = useState(false)

  const fetchDepartments = async () => {
    await useDepartmentsStore.getState().invalidateDepartments()
    await useDepartmentsStore.getState().fetchDepartments()
    setDepartments(useDepartmentsStore.getState().departments as Department[])
  }

  useEffect(() => {
    fetchDepartments()
  }, [])

  useEffect(() => {
    const fetchRequests = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await vacationApi.getAllRequests({
          departmentId: selectedDepartmentId || undefined,
          year,
        })
        setRequests(data)
      } catch (err: any) {
        setError(err.message || 'Ошибка при загрузке данных')
      } finally {
        setLoading(false)
      }
    }
    fetchRequests()
  }, [selectedDepartmentId, year])

  const handleToggleBlock = async (deptId: number, blocked: boolean) => {
    setTogglingBlock(deptId)
    try {
      const res = await fetch(`${API_BASE_URL}/departments/${deptId}/vacation-block`, {
        method: 'PATCH',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ blocked }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Ошибка')
      }
      setDepartments((prev) =>
        prev.map((d) =>
          d.id === deptId ? { ...d, vacation_requests_blocked: blocked } : d
        )
      )
    } catch (err: any) {
      console.error('Error toggling block:', err)
    } finally {
      setTogglingBlock(null)
    }
  }

  const allBlocked = departments.length > 0 && departments.every((d) => d.vacation_requests_blocked)

  const handleToggleAll = async () => {
    setTogglingAll(true)
    try {
      const res = await fetch(`${API_BASE_URL}/departments/vacation-block-all`, {
        method: 'PATCH',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ blocked: !allBlocked }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Ошибка')
      }
      setDepartments((prev) =>
        prev.map((d) => ({ ...d, vacation_requests_blocked: !allBlocked }))
      )
    } catch (err: any) {
      console.error('Error toggling block all:', err)
    } finally {
      setTogglingAll(false)
    }
  }

  const visibleRequests = useMemo(
    () =>
      requests.filter(
        (r) =>
          r.status === VacationRequestStatus.APPROVED ||
          r.status === VacationRequestStatus.ON_APPROVAL
      ),
    [requests]
  )

  const employeeStats = useMemo(() => {
    const stats: Record<string, { firstName: string; lastName: string; position: string; department: string; count: number }> = {}
    visibleRequests.forEach((r) => {
      if (!stats[r.userId]) {
        stats[r.userId] = {
          firstName: r.userFirstName,
          lastName: r.userLastName,
          position: r.userPosition,
          department: r.userDepartment,
          count: 0,
        }
      }
      stats[r.userId].count++
    })
    return Object.entries(stats).sort((a, b) => a[1].lastName.localeCompare(b[1].lastName))
  }, [visibleRequests])

  const totalEmployees = employeeStats.length
  const onApprovalCount = visibleRequests.filter((r) => r.status === VacationRequestStatus.ON_APPROVAL).length
  const approvedCount = visibleRequests.filter((r) => r.status === VacationRequestStatus.APPROVED).length

  const handlePrevYear = () => setYear((y) => y - 1)
  const handleNextYear = () => setYear((y) => y + 1)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Plane className="w-8 h-8 text-primary" />
            Календарь отпусков
          </h1>
          <p className="mt-2 text-muted-foreground">
            Обзор отпусков всех сотрудников{selectedDepartmentId ? ` — ${departments.find((d) => String(d.id) === selectedDepartmentId)?.name || ''}` : ''}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={selectedDepartmentId}
            onChange={(e) => setSelectedDepartmentId(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Все отделы</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevYear}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-lg font-semibold min-w-[60px] text-center">{year}</span>
          <Button variant="outline" size="icon" onClick={handleNextYear}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="w-4 h-4" />
            <span>Сотрудников: <strong className="text-foreground">{totalEmployees}</strong></span>
          </div>
          <Badge variant="success">Согласовано: {approvedCount}</Badge>
          {onApprovalCount > 0 && (
            <Badge variant="warning">На согласовании: {onApprovalCount}</Badge>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Управление заявками по отделам</h2>
            {departments.length > 0 && (
              <Button
                variant={allBlocked ? 'outline' : 'destructive'}
                size="sm"
                onClick={handleToggleAll}
                disabled={togglingAll}
                className="gap-1.5"
              >
                {togglingAll ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : allBlocked ? (
                  <Unlock className="w-3.5 h-3.5" />
                ) : (
                  <Lock className="w-3.5 h-3.5" />
                )}
                {allBlocked ? 'Разблокировать все' : 'Заблокировать все'}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {departments.map((dept) => (
              <div
                key={dept.id}
                className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors ${
                  dept.vacation_requests_blocked
                    ? 'border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20'
                    : 'border-border/50 hover:bg-muted/30'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{dept.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {dept.employee_count} сотрудник(ов)
                  </div>
                </div>
                <Button
                  variant={dept.vacation_requests_blocked ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={() => handleToggleBlock(dept.id, !dept.vacation_requests_blocked)}
                  disabled={togglingBlock === dept.id}
                  className="shrink-0 gap-1.5"
                >
                  {togglingBlock === dept.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : dept.vacation_requests_blocked ? (
                    <Lock className="w-3.5 h-3.5" />
                  ) : (
                    <Unlock className="w-3.5 h-3.5" />
                  )}
                  {dept.vacation_requests_blocked ? 'Заблокировано' : 'Активно'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Загрузка...</span>
            </div>
          ) : (
            <YearCalendar year={year} requests={visibleRequests} />
          )}
        </div>
      </Card>

      {employeeStats.length > 0 && (
        <Card>
          <div className="p-6">
            <h2 className="text-xl font-bold mb-4">Сотрудники в отпуске ({year})</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {employeeStats.map(([userId, info]) => {
                const userRequests = visibleRequests.filter((r) => r.userId === userId)
                const approved = userRequests.filter((r) => r.status === VacationRequestStatus.APPROVED).length
                const onApproval = userRequests.filter((r) => r.status === VacationRequestStatus.ON_APPROVAL).length
                return (
                  <div
                    key={userId}
                    className="flex items-center gap-3 p-3 rounded-xl border border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                      {info.firstName[0]}
                      {info.lastName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {info.lastName} {info.firstName}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{info.position}</div>
                      {info.department && (
                        <div className="text-xs text-muted-foreground truncate">{info.department}</div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {approved > 0 && (
                        <Badge variant="success" className="text-[10px] px-1.5 py-0">
                          {approved}
                        </Badge>
                      )}
                      {onApproval > 0 && (
                        <Badge variant="warning" className="text-[10px] px-1.5 py-0">
                          {onApproval}
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
