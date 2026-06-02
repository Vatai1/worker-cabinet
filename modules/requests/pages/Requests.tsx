import { useState, useEffect } from 'react'
import { confirmDialog } from '@/shared/components/ConfirmDialog'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Badge } from '@/shared/components/ui/Badge'
import { Input } from '@/shared/components/ui/Input'
import { VacationRequestForm } from '@/modules/requests/components/forms/VacationRequestForm'
import { Plus, Search, Download, X, FileText, Clock, CheckCircle } from 'lucide-react'
import { useRequestsStore } from '@/modules/requests/store/requestsStore'
import { useAuthStore } from '@/core/auth/store/authStore'
import { getRequestTypeLabel, getRequestStatusBadge } from '@/shared/data/mockData'
import { formatDate, formatDateTime } from '@/shared/lib/utils'

type RequestStatus = 'all' | 'pending' | 'approved' | 'rejected' | 'cancelled'

export function Requests() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { requests, cancelRequest } = useRequestsStore()
  const [filterStatus, setFilterStatus] = useState<RequestStatus>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setShowForm(true)
      navigate('/requests', { replace: true })
    }
  }, [searchParams, navigate])

  const userRequests = user ? requests.filter((r) => r.userId === user.id) : []

  const filteredRequests = userRequests.filter((request) => {
    const matchesStatus = filterStatus === 'all' || request.status === filterStatus
    const matchesSearch = searchQuery === '' ||
      request.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getRequestTypeLabel(request.type).toLowerCase().includes(searchQuery.toLowerCase())
    return matchesStatus && matchesSearch
  })

  const handleCancel = async (id: string) => {
    if (await confirmDialog({ title: 'Отмена заявления', message: 'Вы уверены, что хотите отменить заявление?', confirmText: 'Отменить', variant: 'warning' })) {
      cancelRequest(id)
    }
  }

  const handleDownload = (request: typeof requests[0]) => {
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
        <div className="page-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Создать заявление</h1>
                <p className="text-sm text-muted-foreground">
                  Заполните форму для подачи заявления на отпуск
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              <X className="mr-2 h-4 w-4" />
              Отмена
            </Button>
          </div>
        </div>
        <VacationRequestForm onSuccess={() => setShowForm(false)} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl gradient-primary p-8 text-white animate-slide-up">
        <div className="absolute top-0 right-0 w-64 h-64 bg-card/5 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-card/5 rounded-full translate-y-1/3 -translate-x-1/3" />
        <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-card/3 rounded-full blur-2xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-5 w-5 text-white/70" />
            <span className="text-xs font-medium text-white/60 uppercase tracking-wider">Заявления</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Заявления</h1>
          <p className="mt-2 text-white/50 text-sm">Управление вашими заявлениями и запросами</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-6">
          <div className="flex items-center gap-1.5 rounded-lg bg-card/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
            <FileText className="h-3.5 w-3.5" />
            {userRequests.length} всего
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-card/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
            <Clock className="h-3.5 w-3.5" />
            {userRequests.filter((r) => r.status === 'pending').length} на рассмотрении
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-card/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
            <CheckCircle className="h-3.5 w-3.5" />
            {userRequests.filter((r) => r.status === 'approved').length} одобрено
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-card/10 text-white hover:bg-card/20 px-3 py-1.5 text-xs font-medium transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Создать заявление
          </button>
        </div>
      </div>

      <Card className="section-card stagger-1">
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

      <div className="space-y-4">
        {filteredRequests.length === 0 ? (
          <Card className="section-card stagger-2">
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
          filteredRequests.map((request, index) => {
            const statusBadge = getRequestStatusBadge(request.status)
            const staggerClass = index < 8 ? `stagger-${index + 1}` : 'stagger-8'

            return (
              <Card key={request.id} className={`section-card ${staggerClass}`}>
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
                        <Button variant="destructive" size="sm" onClick={() => handleCancel(request.id)}>
                          <X className="mr-2 h-4 w-4" />
                          Отменить
                        </Button>
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

      <div className="page-grid">
        <Card className="section-card stagger-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Всего</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userRequests.length}</div>
          </CardContent>
        </Card>
        <Card className="section-card stagger-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">На рассмотрении</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {userRequests.filter((r) => r.status === 'pending').length}
            </div>
          </CardContent>
        </Card>
        <Card className="section-card stagger-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Одобрено</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {userRequests.filter((r) => r.status === 'approved').length}
            </div>
          </CardContent>
        </Card>
        <Card className="section-card stagger-4">
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
