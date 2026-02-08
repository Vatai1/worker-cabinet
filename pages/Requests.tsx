import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useRequestsStore } from '@/store/requestsStore'
import { useAuthStore } from '@/store/authStore'
import { getRequestTypeLabel, getRequestStatusBadge } from '@/data/mockData'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDate, formatDateTime } from '@/lib/utils'
import { Plus, Search, Download, X } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { VacationRequestForm } from '@/components/forms/VacationRequestForm'

type RequestStatus = 'all' | 'pending' | 'approved' | 'rejected' | 'cancelled'

export function Requests() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { requests, updateRequestStatus, cancelRequest } = useRequestsStore()
  const [filterStatus, setFilterStatus] = useState<RequestStatus>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showForm, setShowForm] = useState(false)

  // Проверяем параметр ?create=true в URL
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setShowForm(true)
      // Удаляем параметр из URL
      navigate('/requests', { replace: true })
    }
  }, [searchParams, navigate])

  // Фильтруем заявки текущего пользователя
  const userRequests = user ? requests.filter((r) => r.userId === user.id) : []

  const filteredRequests = userRequests.filter((request) => {
    const matchesStatus = filterStatus === 'all' || request.status === filterStatus
    const matchesSearch = searchQuery === '' || 
      request.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getRequestTypeLabel(request.type).toLowerCase().includes(searchQuery.toLowerCase())
    return matchesStatus && matchesSearch
  })

  const handleCancel = (id: string) => {
    if (confirm('Вы уверены, что хотите отменить заявление?')) {
      cancelRequest(id)
    }
  }

  const handleDownload = (request: typeof requests[0]) => {
    // Генерация простого текстового файла для демо
    const content = `
ЗЯВЛЕНИЕ НА ОТПУСК

От: ${user?.firstName} ${user?.lastName}
Должность: ${user?.position}
Отдел: ${user?.department}

Тип заявления: ${getRequestTypeLabel(request.type)}
Дата начала: ${formatDate(request.startDate)}
Дата окончания: ${formatDate(request.endDate)}
Причина: ${request.reason}

Статус: ${getRequestStatusBadge(request.status).label}
Дата создания: ${formatDateTime(request.createdAt)}
${request.reviewedAt ? `Дата рассмотрения: ${formatDateTime(request.reviewedAt)}` : ''}
${request.reviewerComment ? `Комментарий: ${request.reviewerComment}` : ''}
    `.trim()

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `заявление-${request.type}-${request.id}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (showForm) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Создать заявление</h1>
            <p className="text-muted-foreground">
              Заполните форму для подачи заявления на отпуск
            </p>
          </div>
          <Button variant="outline" onClick={() => setShowForm(false)}>
            <X className="mr-2 h-4 w-4" />
            Отмена
          </Button>
        </div>
        <VacationRequestForm onSuccess={() => setShowForm(false)} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Заявления</h1>
          <p className="text-muted-foreground">
            Управление вашими заявлениями и запросами
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Создать заявление
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Поиск по заявлениям..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={filterStatus === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterStatus('all')}
              >
                Все
              </Button>
              <Button
                variant={filterStatus === 'pending' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterStatus('pending')}
              >
                На рассмотрении
              </Button>
              <Button
                variant={filterStatus === 'approved' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterStatus('approved')}
              >
                Одобрено
              </Button>
              <Button
                variant={filterStatus === 'rejected' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterStatus('rejected')}
              >
                Отклонено
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requests list */}
      <div className="space-y-4">
        {filteredRequests.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="text-center">
                <p className="text-lg font-medium">Заявления не найдены</p>
                <p className="text-sm text-muted-foreground">
                  {searchQuery || filterStatus !== 'all'
                    ? 'Попробуйте изменить параметры поиска или фильтры'
                    : 'У вас пока нет заявлений'}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredRequests.map((request) => {
            const statusBadge = getRequestStatusBadge(request.status)
            
            return (
              <Card key={request.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {getRequestTypeLabel(request.type)}
                      </CardTitle>
                      <CardDescription>
                        ID: {request.id}
                      </CardDescription>
                    </div>
                    <Badge className={statusBadge.className} variant="secondary">
                      {statusBadge.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium">Причина</p>
                      <p className="text-sm text-muted-foreground">{request.reason}</p>
                    </div>
                    
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-sm font-medium">Дата начала</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(request.startDate)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Дата окончания</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(request.endDate)}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-sm font-medium">Создано</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDateTime(request.createdAt)}
                        </p>
                      </div>
                      {request.reviewedAt && (
                        <div>
                          <p className="text-sm font-medium">Рассмотрено</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDateTime(request.reviewedAt)}
                          </p>
                        </div>
                      )}
                    </div>

                    {request.reviewerComment && (
                      <div className="rounded-lg bg-muted p-3">
                        <p className="text-sm font-medium">Комментарий</p>
                        <p className="text-sm text-muted-foreground">
                          {request.reviewerComment}
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      {request.status === 'pending' && (
                        <>
                          <Button variant="destructive" size="sm" onClick={() => handleCancel(request.id)}>
                            <X className="mr-2 h-4 w-4" />
                            Отменить
                          </Button>
                        </>
                      )}
                      {request.status === 'approved' && (
                        <Button variant="outline" size="sm" onClick={() => handleDownload(request)}>
                          <Download className="mr-2 h-4 w-4" />
                          Скачать заявление
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Всего</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userRequests.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">На рассмотрении</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {userRequests.filter((r) => r.status === 'pending').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Одобрено</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {userRequests.filter((r) => r.status === 'approved').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Отклонено</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {userRequests.filter((r) => r.status === 'rejected').length}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
