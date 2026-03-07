import { useState } from 'react'
import { useRequestsStore } from '@/store/requestsStore'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { getRequestTypeLabel, getRequestStatusBadge } from '@/data/mockData'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { formatDate, formatDateTime } from '@/lib/utils'
import { Check, X, Search, Users, Clock, CheckCircle } from 'lucide-react'

export function LeaderDashboard() {
  const { user } = useAuthStore()
  const { requests, updateRequestStatus } = useRequestsStore()
  const { addNotification } = useUIStore()
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const subordinateRequests = user?.subordinates
    ? requests.filter((r) => user.subordinates!.includes(r.userId))
    : []

  const pendingRequests = subordinateRequests.filter((r) => r.status === 'pending')

  const filteredRequests = subordinateRequests.filter((request) => {
    const matchesSearch = searchQuery === '' ||
      request.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getRequestTypeLabel(request.type).toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.id.includes(searchQuery)
    return matchesSearch
  })

  const handleApprove = (requestId: string) => {
    updateRequestStatus(requestId, 'approved', comment || 'Одобрено лидером')
    
    const request = requests.find((r) => r.id === requestId)
    if (request) {
      addNotification({
        userId: request.userId,
        title: 'Заявление на отпуск одобрено',
        message: `Ваше заявление на отпуск с ${formatDate(request.startDate)} одобрено лидером.`,
        type: 'success',
        read: false,
      })
    }

    setSelectedRequest(null)
    setComment('')
  }

  const handleReject = (requestId: string) => {
    if (!comment.trim()) {
      alert('Пожалуйста, укажите причину отказа')
      return
    }

    updateRequestStatus(requestId, 'rejected', comment)
    
    const request = requests.find((r) => r.id === requestId)
    if (request) {
      addNotification({
        userId: request.userId,
        title: 'Заявление на отпуск отклонено',
        message: `Ваше заявление на отпуск отклонено. Причина: ${comment}`,
        type: 'error',
        read: false,
      })
    }

    setSelectedRequest(null)
    setComment('')
  }

  const getEmployeeName = (userId: string) => {
    const employees: Record<string, { firstName: string; lastName: string }> = {
      '1': { firstName: 'Иван', lastName: 'Иванов' },
    }
    const emp = employees[userId]
    return emp ? `${emp.firstName} ${emp.lastName}` : `Сотрудник #${userId}`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Панель лидера</h1>
        <p className="text-muted-foreground">
          Рассмотрение заявлений от сотрудников команды
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Всего заявок
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{subordinateRequests.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              На рассмотрении
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendingRequests.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Одобрено
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {subordinateRequests.filter((r) => r.status === 'approved').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск по заявлениям..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {pendingRequests.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Требуют рассмотрения</h2>
          {pendingRequests.map((request) => (
            <Card key={request.id} className="border-yellow-200 bg-yellow-50/50">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {getRequestTypeLabel(request.type)}
                    </CardTitle>
                    <CardDescription>
                      {getEmployeeName(request.userId)} • ID: {request.id}
                    </CardDescription>
                  </div>
                  <Badge className="bg-yellow-100 text-yellow-800" variant="secondary">
                    На рассмотрении
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

                  <div>
                    <p className="text-sm font-medium">Создано</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateTime(request.createdAt)}
                    </p>
                  </div>

                  {selectedRequest === request.id ? (
                    <div className="space-y-3 rounded-lg bg-white p-4 border">
                      <div className="space-y-2">
                        <Label htmlFor="comment">Комментарий (обязательно при отклонении)</Label>
                        <textarea
                          id="comment"
                          className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          placeholder="Добавьте комментарий к решению..."
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(request.id)}
                          className="flex-1"
                        >
                          <Check className="mr-2 h-4 w-4" />
                          Одобрить
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleReject(request.id)}
                          className="flex-1"
                        >
                          <X className="mr-2 h-4 w-4" />
                          Отклонить
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedRequest(null)
                            setComment('')
                          }}
                        >
                          Отмена
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => setSelectedRequest(request.id)}
                    >
                      Рассмотреть
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Все заявления</h2>
        {filteredRequests.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-lg font-medium">Заявления не найдены</p>
            </CardContent>
          </Card>
        ) : (
          filteredRequests.map((request) => {
            const statusBadge = getRequestStatusBadge(request.status)
            
            return (
              <Card key={request.id} className={request.status === 'pending' ? 'border-yellow-200 bg-yellow-50/50' : ''}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {getRequestTypeLabel(request.type)}
                      </CardTitle>
                      <CardDescription>
                        {getEmployeeName(request.userId)} • ID: {request.id}
                      </CardDescription>
                    </div>
                    <Badge className={statusBadge.className} variant="secondary">
                      {statusBadge.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
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

                    {request.reviewerComment && (
                      <div className="rounded-lg bg-muted p-3">
                        <p className="text-sm font-medium">Комментарий руководителя</p>
                        <p className="text-sm text-muted-foreground">
                          {request.reviewerComment}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
