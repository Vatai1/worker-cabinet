import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent } from '@/components/ui/Card'
import { Avatar, AvatarFallback } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Users, Loader2, ChevronRight } from 'lucide-react'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api'

interface Employee {
  id: string
  first_name: string
  last_name: string
  middle_name?: string
  position: string
  department_name?: string
  phone?: string
  email: string
  status: 'active' | 'inactive' | 'on_leave'
  role: string
}

const getAuthHeaders = () => {
  const authStorage = localStorage.getItem('auth-storage')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (authStorage) {
    try {
      const { state } = JSON.parse(authStorage)
      if (state?.token) {
        headers['Authorization'] = `Bearer ${state.token}`
      }
    } catch (e) {
      console.error('[Employees] Error parsing auth storage:', e)
    }
  }

  return headers
}

const statusLabels: Record<string, string> = {
  active: 'Активен',
  inactive: 'Неактивен',
  on_leave: 'В отпуске',
}

const statusVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  inactive: 'destructive',
  on_leave: 'secondary',
}

export function Employees() {
  const { user } = useAuthStore()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        setLoading(true)
        const params = user?.departmentId ? `?departmentId=${user.departmentId}` : ''
        const response = await fetch(`${API_BASE_URL}/users${params}`, {
          headers: getAuthHeaders(),
        })
        if (!response.ok) {
          throw new Error('Не удалось загрузить список сотрудников')
        }
        const data = await response.json()
        setEmployees(data)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchEmployees()
  }, [user?.departmentId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <p className="text-destructive font-medium">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Сотрудники</h1>
        <p className="text-muted-foreground mt-2">
          {user?.department ? `Отдел: ${user.department}` : 'Все сотрудники отдела'}
        </p>
      </div>

      {employees.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground text-sm">Сотрудник</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground text-sm">Должность</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground text-sm">Email</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground text-sm">Телефон</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground text-sm">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr
                      key={employee.id}
                      className="border-b border-border/30 hover:bg-muted/20 transition-colors cursor-pointer group"
                    >
                      <Link
                        to={`/employees/${employee.id}`}
                        className="contents"
                      >
                        <td className="p-4 align-middle">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10 ring-2 ring-primary/20">
                              <AvatarFallback className="gradient-primary text-white text-sm font-semibold">
                                {employee.first_name?.[0]}{employee.last_name?.[0]}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex items-center gap-2">
                              <div>
                                <div className="font-medium">
                                  {employee.last_name} {employee.first_name}
                                  {employee.middle_name ? ` ${employee.middle_name}` : ''}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {employee.department_name || '-'}
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                        </td>
                        <td className="p-4 align-middle text-sm">{employee.position}</td>
                        <td className="p-4 align-middle text-sm text-muted-foreground">{employee.email || '-'}</td>
                        <td className="p-4 align-middle text-sm text-muted-foreground">{employee.phone || '-'}</td>
                        <td className="p-4 align-middle">
                          <Badge variant={statusVariants[employee.status] || 'outline'}>
                            {statusLabels[employee.status] || employee.status}
                          </Badge>
                        </td>
                      </Link>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="text-center py-12">
          <Users className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">Сотрудники не найдены</p>
        </div>
      )}
    </div>
  )
}
