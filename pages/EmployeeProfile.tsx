import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Avatar, AvatarFallback } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'
import { Mail, Phone, Calendar, Building2, Briefcase, ArrowLeft, Loader2 } from 'lucide-react'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api'

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
      console.error('[EmployeeProfile] Error parsing auth storage:', e)
    }
  }

  return headers
}

interface EmployeeData {
  id: string
  email: string
  firstName: string
  lastName: string
  middleName?: string
  position: string
  department: string
  departmentId?: string
  phone?: string
  birthDate?: string
  hireDate: string
  status: 'active' | 'inactive' | 'on_leave'
  role: string
}

export function EmployeeProfile() {
  const { id } = useParams<{ id: string }>()
  const [employee, setEmployee] = useState<EmployeeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchEmployee = async () => {
      try {
        setLoading(true)
        const response = await fetch(`${API_BASE_URL}/users/${id}`, {
          headers: getAuthHeaders(),
        })
        if (!response.ok) {
          throw new Error('Не удалось загрузить данные сотрудника')
        }
        const data = await response.json()
        setEmployee(data)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      fetchEmployee()
    }
  }, [id])

  const getStatusBadge = (status: EmployeeData['status']) => {
    const badges = {
      active: { label: 'Активен', className: 'bg-green-100 text-green-800' },
      inactive: { label: 'Неактивен', className: 'bg-gray-100 text-gray-800' },
      on_leave: { label: 'В отпуске', className: 'bg-yellow-100 text-yellow-800' },
    }
    return badges[status]
  }

  const getUserInitials = () => {
    if (!employee) return '??'
    return `${employee.firstName[0]}${employee.lastName[0]}`
  }

  const getRoleLabel = (role: string) => {
    const roles: Record<string, string> = {
      employee: 'Сотрудник',
      manager: 'Руководитель',
      hr: 'HR',
      admin: 'Администратор',
    }
    return roles[role] || role
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Link to="/employees">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад к списку
          </Button>
        </Link>
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <p className="text-destructive font-medium">{error}</p>
        </div>
      </div>
    )
  }

  if (!employee) {
    return (
      <div className="space-y-6">
        <Link to="/employees">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад к списку
          </Button>
        </Link>
        <div className="rounded-2xl border p-8 text-center">
          <p className="text-muted-foreground">Сотрудник не найден</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/employees">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Назад
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Профиль сотрудника</h1>
            <p className="text-muted-foreground">
              {employee.lastName} {employee.firstName}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader className="text-center">
            <Avatar className="mx-auto h-24 w-24">
              <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                {getUserInitials()}
              </AvatarFallback>
            </Avatar>
            <CardTitle className="mt-4">
              {employee.lastName} {employee.firstName}
            </CardTitle>
            <CardDescription>{employee.position}</CardDescription>
            <Badge className="mx-auto mt-2" variant={employee.status === 'active' ? 'success' : 'secondary'}>
              {getStatusBadge(employee.status).label}
            </Badge>
            <Badge className="mx-auto mt-2" variant="outline">
              {getRoleLabel(employee.role)}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span>{employee.department}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Работает с {formatDate(employee.hireDate)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Личная информация</CardTitle>
            <CardDescription>
              Основная информация о сотруднике
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Фамилия</label>
                <div className="flex items-center gap-2 rounded-md border p-3">
                  <span className="text-sm">{employee.lastName}</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Имя</label>
                <div className="flex items-center gap-2 rounded-md border p-3">
                  <span className="text-sm">{employee.firstName}</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Отчество</label>
                <div className="flex items-center gap-2 rounded-md border p-3">
                  <span className="text-sm">{employee.middleName || '—'}</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Дата рождения</label>
                <div className="flex items-center gap-2 rounded-md border p-3">
                  <span className="text-sm">{employee.birthDate ? formatDate(employee.birthDate) : '—'}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Контактная информация</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <div className="flex items-center gap-2 rounded-md border p-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{employee.email}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Телефон</label>
                  <div className="flex items-center gap-2 rounded-md border p-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{employee.phone || '—'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Информация о работе</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Должность</label>
                  <div className="flex items-center gap-2 rounded-md border p-3">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{employee.position}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Отдел</label>
                  <div className="flex items-center gap-2 rounded-md border p-3">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{employee.department}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
