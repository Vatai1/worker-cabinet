import type { Request } from '@/shared/types'

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
