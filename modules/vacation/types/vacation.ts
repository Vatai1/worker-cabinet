export enum VacationRequestStatus {
  ON_APPROVAL = 'on_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED_BY_EMPLOYEE = 'cancelled_by_employee',
  CANCELLED_BY_MANAGER = 'cancelled_by_manager',
}

export enum VacationType {
  ANNUAL_PAID = 'annual_paid',
  UNPAID = 'unpaid',
  EDUCATIONAL = 'educational',
  MATERNITY = 'maternity',
  CHILD_CARE = 'child_care',
  ADDITIONAL = 'additional',
  VETERAN = 'veteran',
}

interface VacationTypeInfo {
  id: number
  name: string
  description: string
  countedInCounter: boolean
}

export const VACATION_TYPES: Record<VacationType, VacationTypeInfo> = {
  [VacationType.ANNUAL_PAID]: {
    id: 1,
    name: 'Ежегодный оплачиваемый отпуск',
    description: 'Стандартный оплачиваемый отпуск',
    countedInCounter: true,
  },
  [VacationType.UNPAID]: {
    id: 2,
    name: 'Отпуск без сохранения заработной платы',
    description: 'Неоплачиваемый отпуск по соглашению',
    countedInCounter: false,
  },
  [VacationType.EDUCATIONAL]: {
    id: 3,
    name: 'Учебный отпуск',
    description: 'Отпуск для обучения и сдачи экзаменов',
    countedInCounter: false,
  },
  [VacationType.MATERNITY]: {
    id: 4,
    name: 'Отпуск по беременности и родам',
    description: 'Декретный отпуск',
    countedInCounter: false,
  },
  [VacationType.CHILD_CARE]: {
    id: 5,
    name: 'Отпуск по уходу за ребёнком',
    description: 'До 3 лет',
    countedInCounter: false,
  },
  [VacationType.ADDITIONAL]: {
    id: 6,
    name: 'Дополнительный отпуск',
    description: 'За вредные условия, работу на Крайнем Севере и т.д.',
    countedInCounter: true,
  },
  [VacationType.VETERAN]: {
    id: 7,
    name: 'Ветеранский',
    description: 'Для участников боевых действий',
    countedInCounter: false,
  },
}

export interface VacationRequest {
  id: string
  userId: string
  userFirstName: string
  userLastName: string
  userMiddleName?: string
  userPosition: string
  userDepartment: string
  departmentManagerId?: string
  
  startDate: string
  endDate: string
  duration: number
  
  vacationType: VacationType
  status: VacationRequestStatus
  
  comment?: string
  rejectionReason?: string
  cancellationReason?: string
  
  hasTravel: boolean
  travelDestination?: string
  travelDays?: number
  
  referenceDocument?: string
  
  transferRequestedAt?: string
  transferReason?: string
  transferredFromId?: string
  
  createdAt: string
  reviewedAt?: string
  reviewedBy?: string
  
  statusHistory: VacationRequestStatusHistory[]
}

interface VacationRequestStatusHistory {
  status: VacationRequestStatus
  changedAt: string
  changedBy: string
  changedByName: string
  comment?: string
}

export interface VacationBalance {
  userId: string
  year: number
  
  totalDays: number
  usedDays: number
  availableDays: number
  reservedDays: number
  
  lastAccrualDate: string
  
  travelAvailable: boolean
  travelNextAvailableDate?: string
  travelLastUsedDate?: string
  hireDate: string
}

export interface VacationRestriction {
  id: string
  departmentId: string
  
  type: 'pair' | 'group'
  
  employeeIds: string[]
  maxConcurrent?: number
  
  description?: string
  createdAt: string
  createdBy: string
  createdByName: string
}

export interface VacationCalendarItem {
  requestId: string
  userId: string
  userFirstName: string
  userLastName: string
  userPosition: string
  
  startDate: string
  endDate: string
  
  vacationType: VacationType
  status: VacationRequestStatus
}

export interface VacationFormData {
  startDate: string
  endDate: string
  vacationType: VacationType
  comment?: string
  hasTravel: boolean
  travelDestination?: string
  referenceDocument?: string
}

export interface VacationValidationError {
  field: 'startDate' | 'endDate' | 'duration' | 'balance' | 'overlap' | 'travel' | 'referenceDocument' | 'restriction'
  message: string
  details?: any
}


