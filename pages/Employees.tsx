import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'
import { Search, Mail, Phone, Calendar, MoreVertical } from 'lucide-react'

interface Employee {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  position: string
  department: string
  hireDate: string
  status: 'active' | 'vacation' | 'sick'
}

const mockEmployees: Employee[] = [
  {
    id: '1',
    firstName: 'Иван',
    lastName: 'Иванов',
    email: 'ivanov@company.com',
    phone: '+7 (999) 123-45-67',
    position: 'Разработчик',
    department: 'IT',
    hireDate: '2022-01-15',
    status: 'active',
  },
  {
    id: '2',
    firstName: 'Петр',
    lastName: 'Петров',
    email: 'petrov@company.com',
    phone: '+7 (999) 234-56-78',
    position: 'Дизайнер',
    department: 'IT',
    hireDate: '2022-03-20',
    status: 'vacation',
  },
  {
    id: '3',
    firstName: 'Мария',
    lastName: 'Сидорова',
    email: 'sidorova@company.com',
    phone: '+7 (999) 345-67-89',
    position: 'Тестировщик',
    department: 'IT',
    hireDate: '2022-06-10',
    status: 'active',
  },
]

export function Employees() {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredEmployees = mockEmployees.filter((employee) => {
    const fullName = `${employee.firstName} ${employee.lastName}`.toLowerCase()
    return (
      fullName.includes(searchQuery.toLowerCase()) ||
      employee.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      employee.position.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })

  const getStatusBadge = (status: Employee['status']) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Работает</Badge>
      case 'vacation':
        return <Badge className="bg-blue-100 text-blue-800">В отпуске</Badge>
      case 'sick':
        return <Badge className="bg-red-100 text-red-800">На больничном</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Сотрудники</h1>
          <p className="text-muted-foreground">
            Управление командой и просмотр информации о сотрудниках
          </p>
        </div>

      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск по имени, email или должности..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {filteredEmployees.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-lg font-medium">Сотрудники не найдены</p>
            </CardContent>
          </Card>
        ) : (
          filteredEmployees.map((employee) => (
            <Card key={employee.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-purple-600 text-white font-semibold text-lg">
                      {employee.firstName[0]}{employee.lastName[0]}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">
                        {employee.firstName} {employee.lastName}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {employee.position} • {employee.department}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(employee.status)}
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    <span>{employee.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span>{employee.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>С {formatDate(employee.hireDate)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
