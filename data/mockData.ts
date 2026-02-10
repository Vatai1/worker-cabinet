import type { Salary, ScheduleItem, Request, Document } from '@/types'

export const mockEmployees: { id: string; firstName: string; lastName: string; color: string }[] = []

export const mockSalaries: Salary[] = []

export const mockSchedule: ScheduleItem[] = []

export const mockRequests: Request[] = []

export const mockDocuments: Document[] = []

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
