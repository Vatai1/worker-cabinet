import type { Salary, ScheduleItem, Request, Document } from '@/types'

// Mock сотрудники
export const mockEmployees = [
  { id: '1', firstName: 'Иван', lastName: 'Иванов', color: 'bg-blue-500' },
  { id: '2', firstName: 'Петр', lastName: 'Петров', color: 'bg-green-500' },
  { id: '3', firstName: 'Сидор', lastName: 'Сидоров', color: 'bg-purple-500' },
  { id: '4', firstName: 'Анна', lastName: 'Иванова', color: 'bg-pink-500' },
  { id: '5', firstName: 'Мария', lastName: 'Петрова', color: 'bg-orange-500' },
]

export const mockSalaries: Salary[] = [
  {
    id: '1',
    userId: '1',
    amount: 150000,
    bonus: 25000,
    total: 175000,
    period: '2025-01',
    paymentDate: '2025-01-25',
    status: 'paid',
  },
  {
    id: '2',
    userId: '1',
    amount: 150000,
    bonus: 0,
    total: 150000,
    period: '2024-12',
    paymentDate: '2024-12-25',
    status: 'paid',
  },
  {
    id: '3',
    userId: '1',
    amount: 145000,
    bonus: 10000,
    total: 155000,
    period: '2024-11',
    paymentDate: '2024-11-25',
    status: 'paid',
  },
]

export const mockSchedule: ScheduleItem[] = (() => {
  const items: ScheduleItem[] = []
  const today = new Date()
  
  for (let i = -7; i < 21; i++) {
    const date = new Date(today)
    date.setDate(date.getDate() + i)
    
    const dayOfWeek = date.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    
    items.push({
      id: `schedule-${i}`,
      date: date.toISOString().split('T')[0],
      startTime: isWeekend ? '00:00' : '09:00',
      endTime: isWeekend ? '00:00' : '18:00',
      type: isWeekend ? 'day_off' : 'work',
      notes: isWeekend ? 'Выходной день' : undefined,
    })
  }
  
  return items
})()

export const mockRequests: Request[] = [
  // Отпуска сотрудников на весь год
  // Иванов (текущий пользователь)
  {
    id: '1',
    userId: '1',
    type: 'vacation',
    startDate: '2025-01-15',
    endDate: '2025-01-29',
    reason: 'Ежегодный оплачиваемый отпуск',
    status: 'approved',
    createdAt: '2024-12-01T10:00:00',
    reviewedAt: '2024-12-05T14:30:00',
  },
  {
    id: '3',
    userId: '1',
    type: 'vacation',
    startDate: '2025-06-02',
    endDate: '2025-06-15',
    reason: 'Летний отпуск',
    status: 'pending',
    createdAt: '2025-01-06T16:00:00',
  },
  {
    id: '2',
    userId: '1',
    type: 'remote_work',
    startDate: '2025-01-08',
    endDate: '2025-01-08',
    reason: 'Работа на дому по семейным обстоятельствам',
    status: 'approved',
    createdAt: '2025-01-05T09:00:00',
    reviewedAt: '2025-01-05T11:30:00',
  },
  
  // Петров
  {
    id: '4',
    userId: '2',
    type: 'vacation',
    startDate: '2025-02-01',
    endDate: '2025-02-14',
    reason: 'Ежегодный отпуск',
    status: 'approved',
    createdAt: '2024-12-15T10:00:00',
    reviewedAt: '2024-12-20T14:30:00',
  },
  {
    id: '5',
    userId: '2',
    type: 'vacation',
    startDate: '2025-07-01',
    endDate: '2025-07-14',
    reason: 'Летний отпуск',
    status: 'approved',
    createdAt: '2025-01-10T10:00:00',
    reviewedAt: '2025-01-12T14:30:00',
  },
  
  // Сидоров
  {
    id: '6',
    userId: '3',
    type: 'vacation',
    startDate: '2025-03-01',
    endDate: '2025-03-14',
    reason: 'Ежегодный отпуск',
    status: 'approved',
    createdAt: '2025-01-05T10:00:00',
    reviewedAt: '2025-01-08T14:30:00',
  },
  {
    id: '7',
    userId: '3',
    type: 'vacation',
    startDate: '2025-08-15',
    endDate: '2025-08-29',
    reason: 'Летний отпуск',
    status: 'pending',
    createdAt: '2025-01-15T10:00:00',
  },
  
  // Иванова
  {
    id: '8',
    userId: '4',
    type: 'vacation',
    startDate: '2025-04-01',
    endDate: '2025-04-14',
    reason: 'Ежегодный отпуск',
    status: 'approved',
    createdAt: '2025-01-08T10:00:00',
    reviewedAt: '2025-01-10T14:30:00',
  },
  {
    id: '9',
    userId: '4',
    type: 'vacation',
    startDate: '2025-09-01',
    endDate: '2025-09-14',
    reason: 'Осенний отпуск',
    status: 'approved',
    createdAt: '2025-01-12T10:00:00',
    reviewedAt: '2025-01-14T14:30:00',
  },
  
  // Петрова
  {
    id: '10',
    userId: '5',
    type: 'vacation',
    startDate: '2025-05-01',
    endDate: '2025-05-14',
    reason: 'Ежегодный отпуск',
    status: 'approved',
    createdAt: '2025-01-03T10:00:00',
    reviewedAt: '2025-01-05T14:30:00',
  },
  {
    id: '11',
    userId: '5',
    type: 'vacation',
    startDate: '2025-10-01',
    endDate: '2025-10-14',
    reason: 'Осенний отпуск',
    status: 'pending',
    createdAt: '2025-01-18T10:00:00',
  },
]

export const mockDocuments: Document[] = [
  {
    id: '1',
    userId: '1',
    name: 'Трудовой договор.pdf',
    type: 'contract',
    url: '/documents/contract.pdf',
    uploadDate: '2020-03-01T10:00:00',
    size: 245760,
  },
  {
    id: '2',
    userId: '1',
    name: 'Соглашение о неразглашении.pdf',
    type: 'nda',
    url: '/documents/nda.pdf',
    uploadDate: '2020-03-01T10:00:00',
    size: 163840,
  },
  {
    id: '3',
    userId: '1',
    name: 'Политика безопасности.pdf',
    type: 'policy',
    url: '/documents/security-policy.pdf',
    uploadDate: '2024-01-15T09:00:00',
    size: 327680,
  },
  {
    id: '4',
    userId: '1',
    name: 'Сертификат о прохождении обучения.pdf',
    type: 'certificate',
    url: '/documents/certificate-2024.pdf',
    uploadDate: '2024-06-20T14:30:00',
    size: 409600,
  },
]

export const getRequestTypeLabel = (type: Request['type']): string => {
  const labels: Record<Request['type'], string> = {
    vacation: 'Отпуск',
    sick_leave: 'Больничный',
    remote_work: 'Удаленная работа',
    business_trip: 'Командировка',
    other: 'Другое',
  }
  return labels[type]
}

export const getRequestStatusBadge = (status: Request['status']): { label: string; className: string } => {
  const badges: Record<Request['status'], { label: string; className: string }> = {
    pending: { label: 'На рассмотрении', className: 'bg-yellow-100 text-yellow-800' },
    approved: { label: 'Одобрено', className: 'bg-green-100 text-green-800' },
    rejected: { label: 'Отклонено', className: 'bg-red-100 text-red-800' },
    cancelled: { label: 'Отменено', className: 'bg-gray-100 text-gray-800' },
  }
  return badges[status]
}

export const getDocumentTypeLabel = (type: Document['type']): string => {
  const labels: Record<Document['type'], string> = {
    contract: 'Договор',
    nda: 'NDA',
    policy: 'Политика',
    certificate: 'Сертификат',
    other: 'Другое',
  }
  return labels[type]
}

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Б'
  const k = 1024
  const sizes = ['Б', 'КБ', 'МБ', 'ГБ']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}
