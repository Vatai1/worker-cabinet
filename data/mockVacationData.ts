import type {
  VacationRequest,
  VacationBalance,
  VacationRestriction,
  VacationCalendarItem,
} from '@/types'
import { VacationRequestStatus, VacationType } from '@/types'

export const mockVacationRequests: VacationRequest[] = []

export const mockVacationBalances: Record<string, VacationBalance> = {}

export const mockVacationRestrictions: VacationRestriction[] = []

export const getVacationRequestStatusLabel = (
  status: VacationRequestStatus
): string => {
  const labels: Record<VacationRequestStatus, string> = {
    [VacationRequestStatus.ON_APPROVAL]: 'На согласовании',
    [VacationRequestStatus.APPROVED]: 'Согласовано',
    [VacationRequestStatus.REJECTED]: 'Не согласовано',
    [VacationRequestStatus.CANCELLED_BY_EMPLOYEE]: 'Отменено сотрудником',
    [VacationRequestStatus.CANCELLED_BY_MANAGER]: 'Отменено руководителем',
  }
  return labels[status]
}

export const getVacationRequestStatusBadge = (
  status: VacationRequestStatus
): { label: string; className: string } => {
  const badges: Record<
    VacationRequestStatus,
    { label: string; className: string }
  > = {
    [VacationRequestStatus.ON_APPROVAL]: {
      label: 'На согласовании',
      className: 'bg-yellow-100 text-yellow-800',
    },
    [VacationRequestStatus.APPROVED]: {
      label: 'Согласовано',
      className: 'bg-green-100 text-green-800',
    },
    [VacationRequestStatus.REJECTED]: {
      label: 'Не согласовано',
      className: 'bg-red-100 text-red-800',
    },
    [VacationRequestStatus.CANCELLED_BY_EMPLOYEE]: {
      label: 'Отменено сотрудником',
      className: 'bg-gray-100 text-gray-800',
    },
    [VacationRequestStatus.CANCELLED_BY_MANAGER]: {
      label: 'Отменено руководителем',
      className: 'bg-orange-100 text-orange-800',
    },
  }
  return badges[status]
}

export const getVacationTypeLabel = (type: VacationType): string => {
  const labels: Record<VacationType, string> = {
    [VacationType.ANNUAL_PAID]: 'Ежегодный оплачиваемый',
    [VacationType.UNPAID]: 'Без сохранения ЗП',
    [VacationType.EDUCATIONAL]: 'Учебный',
    [VacationType.MATERNITY]: 'По беременности и родам',
    [VacationType.CHILD_CARE]: 'По уходу за ребёнком',
    [VacationType.ADDITIONAL]: 'Дополнительный',
    [VacationType.VETERAN]: 'Ветеранский',
  }
  return labels[type]
}

export const calculateVacationDuration = (
  startDate: string,
  endDate: string
): number => {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const diffTime = Math.abs(end.getTime() - start.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
  return diffDays
}

export const checkDateOverlap = (
  startDate1: string,
  endDate1: string,
  startDate2: string,
  endDate2: string
): boolean => {
  const start1 = new Date(startDate1)
  const end1 = new Date(endDate1)
  const start2 = new Date(startDate2)
  const end2 = new Date(endDate2)
  
  return start1 <= end2 && end1 >= start2
}
