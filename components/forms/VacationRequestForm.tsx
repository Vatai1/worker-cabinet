import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRequestsStore } from '@/store/requestsStore'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Calendar, Send } from 'lucide-react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

interface VacationRequestFormProps {
  onSuccess?: () => void
}

export function VacationRequestForm({ onSuccess }: VacationRequestFormProps) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { addRequest } = useRequestsStore()
  const { addNotification } = useUIStore()
  
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!user) return
    
    // Валидация
    if (!startDate || !endDate || !reason) {
      alert('Пожалуйста, заполните все поля')
      return
    }

    const start = new Date(startDate)
    const end = new Date(endDate)
    
    if (start > end) {
      alert('Дата начала не может быть позже даты окончания')
      return
    }

    // Создаем заявку
    addRequest({
      userId: user.id,
      type: 'vacation',
      startDate,
      endDate,
      reason,
    })

    // Добавляем уведомление
    addNotification({
      userId: user.id,
      title: 'Заявление на отпуск создано',
      message: `Ваше заявление на отпуск с ${format(start, 'd MMMM', { locale: ru })} по ${format(end, 'd MMMM', { locale: ru })} отправлено на согласование.`,
      type: 'info',
      read: false,
    })

    // Вызываем callback или перенаправляем
    if (onSuccess) {
      onSuccess()
    } else {
      navigate('/requests')
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const daysCount = startDate && endDate 
    ? Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Заявление на отпуск
        </CardTitle>
        <CardDescription>
          Заполните форму для подачи заявления на отпуск
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startDate">Дата начала *</Label>
              <Input
                id="startDate"
                type="date"
                min={today}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">Дата окончания *</Label>
              <Input
                id="endDate"
                type="date"
                min={startDate || today}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          {daysCount > 0 && (
            <div className="bg-primary/10 rounded-lg p-3 text-center">
              <p className="text-sm font-medium">Количество дней: {daysCount}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reason">Причина *</Label>
            <textarea
              id="reason"
              className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Укажите причину отпуска (например: ежегодный оплачиваемый отпуск)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          <div className="flex gap-3">
            <Button type="submit" className="flex-1">
              <Send className="mr-2 h-4 w-4" />
              Отправить заявление
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/requests')}
            >
              Отмена
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
