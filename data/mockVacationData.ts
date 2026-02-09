import type {
  VacationRequest,
  VacationBalance,
  VacationRestriction,
  VacationCalendarItem,
} from '@/types'
import { VacationRequestStatus, VacationType } from '@/types'

export const mockVacationRequests: VacationRequest[] = [
  {
    id: 'vr1',
    userId: '1',
    userFirstName: 'Иван',
    userLastName: 'Иванов',
    userMiddleName: 'Иванович',
    userPosition: 'Senior Frontend Developer',
    userDepartment: 'Отдел разработки',
    startDate: '2026-01-15',
    endDate: '2026-01-29',
    duration: 15,
    vacationType: VacationType.ANNUAL_PAID,
    status: VacationRequestStatus.APPROVED,
    comment: 'Планирую отдых с семьей',
    hasTravel: false,
    createdAt: '2025-12-01T10:00:00',
    reviewedAt: '2025-12-05T14:30:00',
    reviewedBy: '2',
    statusHistory: [
      {
        status: VacationRequestStatus.ON_APPROVAL,
        changedAt: '2025-12-01T10:00:00',
        changedBy: '1',
        changedByName: 'Иванов Иван Иванович',
      },
      {
        status: VacationRequestStatus.APPROVED,
        changedAt: '2025-12-05T14:30:00',
        changedBy: '2',
        changedByName: 'Петров Петр Петрович',
        comment: 'Согласовано',
      },
    ],
  },
  {
    id: 'vr2',
    userId: '1',
    userFirstName: 'Иван',
    userLastName: 'Иванов',
    userMiddleName: 'Иванович',
    userPosition: 'Senior Frontend Developer',
    userDepartment: 'Отдел разработки',
    startDate: '2026-06-02',
    endDate: '2026-06-15',
    duration: 14,
    vacationType: VacationType.ANNUAL_PAID,
    status: VacationRequestStatus.ON_APPROVAL,
    comment: 'Летний отпуск',
    hasTravel: true,
    travelDays: 2,
    createdAt: '2026-01-06T16:00:00',
    statusHistory: [
      {
        status: VacationRequestStatus.ON_APPROVAL,
        changedAt: '2026-01-06T16:00:00',
        changedBy: '1',
        changedByName: 'Иванов Иван Иванович',
      },
    ],
  },
  {
    id: 'vr3',
    userId: '2',
    userFirstName: 'Петр',
    userLastName: 'Петров',
    userMiddleName: 'Петрович',
    userPosition: 'Руководитель отдела разработки',
    userDepartment: 'Отдел разработки',
    startDate: '2026-02-01',
    endDate: '2026-02-14',
    duration: 14,
    vacationType: VacationType.ANNUAL_PAID,
    status: VacationRequestStatus.APPROVED,
    comment: 'Ежегодный отпуск',
    hasTravel: false,
    createdAt: '2025-12-15T10:00:00',
    reviewedAt: '2025-12-20T14:30:00',
    reviewedBy: '3',
    statusHistory: [
      {
        status: VacationRequestStatus.ON_APPROVAL,
        changedAt: '2025-12-15T10:00:00',
        changedBy: '2',
        changedByName: 'Петров Петр Петрович',
      },
      {
        status: VacationRequestStatus.APPROVED,
        changedAt: '2025-12-20T14:30:00',
        changedBy: '3',
        changedByName: 'Директор',
        comment: 'Согласовано',
      },
    ],
  },
  {
    id: 'vr4',
    userId: '3',
    userFirstName: 'Сидор',
    userLastName: 'Сидоров',
    userMiddleName: 'Сидорович',
    userPosition: 'Backend Developer',
    userDepartment: 'Отдел разработки',
    startDate: '2026-03-01',
    endDate: '2026-03-14',
    duration: 14,
    vacationType: VacationType.ANNUAL_PAID,
    status: VacationRequestStatus.APPROVED,
    comment: 'Ежегодный отпуск',
    hasTravel: false,
    createdAt: '2026-01-05T10:00:00',
    reviewedAt: '2026-01-08T14:30:00',
    reviewedBy: '2',
    statusHistory: [
      {
        status: VacationRequestStatus.ON_APPROVAL,
        changedAt: '2026-01-05T10:00:00',
        changedBy: '3',
        changedByName: 'Сидоров Сидор Сидорович',
      },
      {
        status: VacationRequestStatus.APPROVED,
        changedAt: '2026-01-08T14:30:00',
        changedBy: '2',
        changedByName: 'Петров Петр Петрович',
        comment: 'Согласовано',
      },
    ],
  },
  {
    id: 'vr5',
    userId: '3',
    userFirstName: 'Сидор',
    userLastName: 'Сидоров',
    userMiddleName: 'Сидорович',
    userPosition: 'Backend Developer',
    userDepartment: 'Отдел разработки',
    startDate: '2026-08-15',
    endDate: '2026-08-29',
    duration: 15,
    vacationType: VacationType.ANNUAL_PAID,
    status: VacationRequestStatus.ON_APPROVAL,
    comment: 'Летний отпуск',
    hasTravel: false,
    createdAt: '2026-01-15T10:00:00',
    statusHistory: [
      {
        status: VacationRequestStatus.ON_APPROVAL,
        changedAt: '2026-01-15T10:00:00',
        changedBy: '3',
        changedByName: 'Сидоров Сидор Сидорович',
      },
    ],
  },
  {
    id: 'vr6',
    userId: '4',
    userFirstName: 'Анна',
    userLastName: 'Иванова',
    userMiddleName: 'Сергеевна',
    userPosition: 'UI/UX Designer',
    userDepartment: 'Отдел разработки',
    startDate: '2026-04-01',
    endDate: '2026-04-14',
    duration: 14,
    vacationType: VacationType.ANNUAL_PAID,
    status: VacationRequestStatus.APPROVED,
    comment: 'Ежегодный отпуск',
    hasTravel: true,
    travelDays: 2,
    createdAt: '2026-01-08T10:00:00',
    reviewedAt: '2026-01-10T14:30:00',
    reviewedBy: '2',
    statusHistory: [
      {
        status: VacationRequestStatus.ON_APPROVAL,
        changedAt: '2026-01-08T10:00:00',
        changedBy: '4',
        changedByName: 'Иванова Анна Сергеевна',
      },
      {
        status: VacationRequestStatus.APPROVED,
        changedAt: '2026-01-10T14:30:00',
        changedBy: '2',
        changedByName: 'Петров Петр Петрович',
        comment: 'Согласовано',
      },
    ],
  },
  {
    id: 'vr7',
    userId: '4',
    userFirstName: 'Анна',
    userLastName: 'Иванова',
    userMiddleName: 'Сергеевна',
    userPosition: 'UI/UX Designer',
    userDepartment: 'Отдел разработки',
    startDate: '2026-09-01',
    endDate: '2026-09-14',
    duration: 14,
    vacationType: VacationType.ANNUAL_PAID,
    status: VacationRequestStatus.APPROVED,
    comment: 'Осенний отпуск',
    hasTravel: false,
    createdAt: '2026-01-12T10:00:00',
    reviewedAt: '2026-01-14T14:30:00',
    reviewedBy: '2',
    statusHistory: [
      {
        status: VacationRequestStatus.ON_APPROVAL,
        changedAt: '2026-01-12T10:00:00',
        changedBy: '4',
        changedByName: 'Иванова Анна Сергеевна',
      },
      {
        status: VacationRequestStatus.APPROVED,
        changedAt: '2026-01-14T14:30:00',
        changedBy: '2',
        changedByName: 'Петров Петр Петрович',
        comment: 'Согласовано',
      },
    ],
  },
  {
    id: 'vr8',
    userId: '5',
    userFirstName: 'Мария',
    userLastName: 'Петрова',
    userMiddleName: 'Александровна',
    userPosition: 'QA Engineer',
    userDepartment: 'Отдел разработки',
    startDate: '2026-05-01',
    endDate: '2026-05-14',
    duration: 14,
    vacationType: VacationType.ANNUAL_PAID,
    status: VacationRequestStatus.APPROVED,
    comment: 'Ежегодный отпуск',
    hasTravel: false,
    createdAt: '2026-01-03T10:00:00',
    reviewedAt: '2026-01-05T14:30:00',
    reviewedBy: '2',
    statusHistory: [
      {
        status: VacationRequestStatus.ON_APPROVAL,
        changedAt: '2026-01-03T10:00:00',
        changedBy: '5',
        changedByName: 'Петрова Мария Александровна',
      },
      {
        status: VacationRequestStatus.APPROVED,
        changedAt: '2026-01-05T14:30:00',
        changedBy: '2',
        changedByName: 'Петров Петр Петрович',
        comment: 'Согласовано',
      },
    ],
  },
  {
    id: 'vr9',
    userId: '5',
    userFirstName: 'Мария',
    userLastName: 'Петрова',
    userMiddleName: 'Александровна',
    userPosition: 'QA Engineer',
    userDepartment: 'Отдел разработки',
    startDate: '2026-10-01',
    endDate: '2026-10-14',
    duration: 14,
    vacationType: VacationType.ANNUAL_PAID,
    status: VacationRequestStatus.ON_APPROVAL,
    comment: 'Осенний отпуск',
    hasTravel: false,
    createdAt: '2026-01-18T10:00:00',
    statusHistory: [
      {
        status: VacationRequestStatus.ON_APPROVAL,
        changedAt: '2026-01-18T10:00:00',
        changedBy: '5',
        changedByName: 'Петрова Мария Александровна',
      },
    ],
  },
]

export const mockVacationBalances: Record<string, VacationBalance> = {
  '1': {
    userId: '1',
    totalDays: 28,
    usedDays: 15,
    availableDays: 13,
    reservedDays: 14,
    lastAccrualDate: '2026-01-01',
    travelAvailable: true,
    travelLastUsedDate: '2023-06-01',
    travelNextAvailableDate: '2026-06-01',
    hireDate: '2020-03-01',
  },
  '2': {
    userId: '2',
    totalDays: 28,
    usedDays: 14,
    availableDays: 14,
    reservedDays: 0,
    lastAccrualDate: '2026-01-01',
    travelAvailable: true,
    travelLastUsedDate: '2022-08-15',
    travelNextAvailableDate: '2026-08-15',
    hireDate: '2018-01-15',
  },
  '3': {
    userId: '3',
    totalDays: 28,
    usedDays: 14,
    availableDays: 14,
    reservedDays: 15,
    lastAccrualDate: '2026-01-01',
    travelAvailable: false,
    travelNextAvailableDate: '2026-09-01',
    hireDate: '2021-06-01',
  },
  '4': {
    userId: '4',
    totalDays: 28,
    usedDays: 28,
    availableDays: 0,
    reservedDays: 14,
    lastAccrualDate: '2026-01-01',
    travelAvailable: false,
    travelLastUsedDate: '2026-04-01',
    travelNextAvailableDate: '2026-04-01',
    hireDate: '2019-03-15',
  },
  '5': {
    userId: '5',
    totalDays: 28,
    usedDays: 14,
    availableDays: 14,
    reservedDays: 14,
    lastAccrualDate: '2026-01-01',
    travelAvailable: true,
    travelLastUsedDate: '2023-05-01',
    travelNextAvailableDate: '2026-05-01',
    hireDate: '2020-08-20',
  },
}

export const mockVacationRestrictions: VacationRestriction[] = [
  {
    id: 'vr1',
    departmentId: 'dept1',
    type: 'pair',
    employeeIds: ['1', '3'],
    description: 'Иванов и Сидоров не могут одновременно быть в отпуске (критические функции)',
    createdAt: '2025-01-01T10:00:00',
    createdBy: '2',
    createdByName: 'Петров Петр Петрович',
  },
  {
    id: 'vr2',
    departmentId: 'dept1',
    type: 'group',
    employeeIds: ['1', '2', '3', '4', '5'],
    maxConcurrent: 2,
    description: 'Максимум 2 человека из команды разработки одновременно в отпуске',
    createdAt: '2025-01-01T10:00:00',
    createdBy: '2',
    createdByName: 'Петров Петр Петрович',
  },
]

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
