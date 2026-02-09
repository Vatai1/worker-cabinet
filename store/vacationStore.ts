import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  VacationRequest,
  VacationBalance,
  VacationRestriction,
  VacationCalendarItem,
  VacationFormData,
  VacationValidationError,
} from '@/types'
import { VacationRequestStatus, VacationType } from '@/types'
import {
  mockVacationRequests,
  mockVacationBalances,
  mockVacationRestrictions,
  calculateVacationDuration,
  checkDateOverlap,
} from '@/data/mockVacationData'

interface VacationStore {
  requests: VacationRequest[]
  balances: Record<string, VacationBalance>
  restrictions: VacationRestriction[]
  
  currentUserRequests: VacationRequest[]
  departmentRequests: VacationRequest[]
  
  loading: boolean
  error: string | null
  
  fetchUserRequests: (userId: string) => Promise<void>
  fetchDepartmentRequests: (departmentId: string) => Promise<void>
  fetchBalance: (userId: string) => Promise<VacationBalance>
  fetchRestrictions: (departmentId: string) => Promise<void>
  
  createRequest: (userId: string, data: VacationFormData) => Promise<VacationRequest | null>
  updateRequest: (requestId: string, data: Partial<VacationFormData>) => Promise<void>
  cancelRequest: (requestId: string) => Promise<void>
  
  approveRequest: (requestId: string, managerId: string) => Promise<void>
  rejectRequest: (requestId: string, managerId: string, reason: string) => Promise<void>
  cancelByManager: (requestId: string, managerId: string, reason: string) => Promise<void>
  
  validateRequest: (
    userId: string,
    data: VacationFormData
  ) => VacationValidationError[]
  
  createRestriction: (
    departmentId: string,
    data: Omit<VacationRestriction, 'id' | 'departmentId' | 'createdAt' | 'createdBy' | 'createdByName'>
  ) => Promise<void>
  
  deleteRestriction: (restrictionId: string) => Promise<void>
  
  getCalendarItems: (departmentId: string, year: number) => VacationCalendarItem[]
  
  clearError: () => void
}

export const useVacationStore = create<VacationStore>()(
  persist(
    (set, get) => ({
      requests: mockVacationRequests,
      balances: mockVacationBalances,
      restrictions: mockVacationRestrictions,
      
      currentUserRequests: [],
      departmentRequests: [],
      
      loading: false,
      error: null,
      
      fetchUserRequests: async (userId: string) => {
        set({ loading: true, error: null })
        try {
          const userRequests = get().requests.filter((r) => r.userId === userId)
          set({ currentUserRequests: userRequests, loading: false })
        } catch (error) {
          set({ error: 'Ошибка при загрузке заявок', loading: false })
        }
      },
      
      fetchDepartmentRequests: async (departmentId: string) => {
        set({ loading: true, error: null })
        try {
          const deptRequests = get().requests.filter(
            (r) => r.userDepartment === 'Отдел разработки'
          )
          set({ departmentRequests: deptRequests, loading: false })
        } catch (error) {
          set({ error: 'Ошибка при загрузке заявок отдела', loading: false })
        }
      },
      
      fetchBalance: async (userId: string) => {
        try {
          return get().balances[userId] || {
            userId,
            totalDays: 28,
            usedDays: 0,
            availableDays: 28,
            reservedDays: 0,
            lastAccrualDate: new Date().toISOString().split('T')[0],
            travelAvailable: false,
            hireDate: new Date().toISOString().split('T')[0],
          }
        } catch (error) {
          set({ error: 'Ошибка при загрузке баланса' })
          throw error
        }
      },
      
      fetchRestrictions: async (departmentId: string) => {
        set({ loading: true, error: null })
        try {
          set({ loading: false })
        } catch (error) {
          set({ error: 'Ошибка при загрузке ограничений', loading: false })
        }
      },
      
      validateRequest: (userId: string, data: VacationFormData) => {
        const errors: VacationValidationError[] = []
        const { startDate, endDate, vacationType, hasTravel } = data
        
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const start = new Date(startDate)
        const end = new Date(endDate)
        
        if (start < today) {
          errors.push({
            field: 'startDate',
            message: 'Нельзя создавать заявку на отпуск с датой начала в прошлом',
          })
        }
        
        if (end < start) {
          errors.push({
            field: 'endDate',
            message: 'Дата окончания не может быть раньше даты начала',
          })
        }
        
        const duration = calculateVacationDuration(startDate, endDate)
        const balance = get().balances[userId]
        const vacationTypeInfo = Object.values(VacationType).find(
          (vt) => vt === vacationType
        )
        
        if (balance && vacationTypeInfo) {
          const availableDays = balance.availableDays
          if (duration > availableDays) {
            errors.push({
              field: 'balance',
              message: `Недостаточно дней на счётчике. Доступно: ${availableDays}, требуется: ${duration}`,
              details: { available: availableDays, required: duration },
            })
          }
        }
        
        const userRequests = get().requests.filter(
          (r) => r.userId === userId && r.status === VacationRequestStatus.ON_APPROVAL
        )
        
        for (const request of userRequests) {
          if (checkDateOverlap(startDate, endDate, request.startDate, request.endDate)) {
            errors.push({
              field: 'overlap',
              message: 'Пересечение с существующей заявкой',
              details: { requestId: request.id },
            })
            break
          }
        }
        
        if (hasTravel) {
          if (!balance?.travelAvailable) {
            errors.push({
              field: 'travel',
              message: 'Проезд недоступен',
              details: {
                nextAvailableDate: balance?.travelNextAvailableDate,
              },
            })
          }
        }
        
        return errors
      },
      
      createRequest: async (userId: string, data: VacationFormData) => {
        set({ loading: true, error: null })
        
        const errors = get().validateRequest(userId, data)
        if (errors.length > 0) {
          set({ loading: false, error: errors[0].message })
          return null
        }
        
        try {
          const duration = calculateVacationDuration(data.startDate, data.endDate)
          const travelDays = data.hasTravel ? 2 : 0
          const totalDuration = duration + travelDays
          
          const balance = get().balances[userId]
          if (balance) {
            const newBalance = {
              ...balance,
              reservedDays: balance.reservedDays + totalDuration,
            }
            set((state) => ({
              balances: {
                ...state.balances,
                [userId]: newBalance,
              },
            }))
          }
          
          const user = get().requests.find((r) => r.userId === userId)
          const newRequest: VacationRequest = {
            id: `vr${Date.now()}`,
            userId,
            userFirstName: user?.userFirstName || '',
            userLastName: user?.userLastName || '',
            userMiddleName: user?.userMiddleName,
            userPosition: user?.userPosition || '',
            userDepartment: user?.userDepartment || '',
            startDate: data.startDate,
            endDate: data.endDate,
            duration: totalDuration,
            vacationType: data.vacationType,
            status: VacationRequestStatus.ON_APPROVAL,
            comment: data.comment,
            hasTravel: data.hasTravel,
            travelDays: data.hasTravel ? 2 : undefined,
            createdAt: new Date().toISOString(),
            statusHistory: [
              {
                status: VacationRequestStatus.ON_APPROVAL,
                changedAt: new Date().toISOString(),
                changedBy: userId,
                changedByName: `${user?.userLastName} ${user?.userFirstName}`,
              },
            ],
          }
          
          set((state) => ({
            requests: [...state.requests, newRequest],
            currentUserRequests: [...state.currentUserRequests, newRequest],
            loading: false,
          }))
          
          return newRequest
        } catch (error) {
          set({ error: 'Ошибка при создании заявки', loading: false })
          return null
        }
      },
      
      updateRequest: async (requestId: string, data: Partial<VacationFormData>) => {
        set({ loading: true, error: null })
        try {
          const request = get().requests.find((r) => r.id === requestId)
          if (!request) {
            set({ error: 'Заявка не найдена', loading: false })
            return
          }
          
          if (request.status !== VacationRequestStatus.ON_APPROVAL) {
            set({ error: 'Можно редактировать только заявки на согласовании', loading: false })
            return
          }
          
          const oldDuration = request.duration
          const newDuration = data.startDate && data.endDate
            ? calculateVacationDuration(data.startDate, data.endDate) + (data.hasTravel ? 2 : 0)
            : oldDuration
          
          const balance = get().balances[request.userId]
          if (balance && oldDuration !== newDuration) {
            const newBalance = {
              ...balance,
              reservedDays: balance.reservedDays - oldDuration + newDuration,
            }
            set((state) => ({
              balances: {
                ...state.balances,
                [request.userId]: newBalance,
              },
            }))
          }
          
          const updatedRequest: VacationRequest = {
            ...request,
            ...(data.startDate && { startDate: data.startDate }),
            ...(data.endDate && { endDate: data.endDate }),
            ...(data.vacationType && { vacationType: data.vacationType }),
            ...(data.comment !== undefined && { comment: data.comment }),
            ...(data.hasTravel !== undefined && {
              hasTravel: data.hasTravel,
              travelDays: data.hasTravel ? 2 : undefined,
            }),
            ...(newDuration !== oldDuration && { duration: newDuration }),
          }
          
          set((state) => ({
            requests: state.requests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            currentUserRequests: state.currentUserRequests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            loading: false,
          }))
        } catch (error) {
          set({ error: 'Ошибка при обновлении заявки', loading: false })
        }
      },
      
      cancelRequest: async (requestId: string) => {
        set({ loading: true, error: null })
        try {
          const request = get().requests.find((r) => r.id === requestId)
          if (!request) {
            set({ error: 'Заявка не найдена', loading: false })
            return
          }
          
          if (request.status !== VacationRequestStatus.ON_APPROVAL) {
            set({ error: 'Можно отменить только заявки на согласовании', loading: false })
            return
          }
          
          const balance = get().balances[request.userId]
          if (balance) {
            const newBalance = {
              ...balance,
              reservedDays: balance.reservedDays - request.duration,
            }
            set((state) => ({
              balances: {
                ...state.balances,
                [request.userId]: newBalance,
              },
            }))
          }
          
          const updatedRequest: VacationRequest = {
            ...request,
            status: VacationRequestStatus.CANCELLED_BY_EMPLOYEE,
            statusHistory: [
              ...request.statusHistory,
              {
                status: VacationRequestStatus.CANCELLED_BY_EMPLOYEE,
                changedAt: new Date().toISOString(),
                changedBy: request.userId,
                changedByName: `${request.userLastName} ${request.userFirstName}`,
              },
            ],
          }
          
          set((state) => ({
            requests: state.requests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            currentUserRequests: state.currentUserRequests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            loading: false,
          }))
        } catch (error) {
          set({ error: 'Ошибка при отмене заявки', loading: false })
        }
      },
      
      approveRequest: async (requestId: string, managerId: string) => {
        set({ loading: true, error: null })
        try {
          const request = get().requests.find((r) => r.id === requestId)
          if (!request) {
            set({ error: 'Заявка не найдена', loading: false })
            return
          }
          
          const balance = get().balances[request.userId]
          if (balance) {
            const newBalance = {
              ...balance,
              usedDays: balance.usedDays + request.duration,
              reservedDays: balance.reservedDays - request.duration,
              availableDays: balance.availableDays - request.duration,
            }
            set((state) => ({
              balances: {
                ...state.balances,
                [request.userId]: newBalance,
              },
            }))
          }
          
          const updatedRequest: VacationRequest = {
            ...request,
            status: VacationRequestStatus.APPROVED,
            reviewedAt: new Date().toISOString(),
            reviewedBy: managerId,
            statusHistory: [
              ...request.statusHistory,
              {
                status: VacationRequestStatus.APPROVED,
                changedAt: new Date().toISOString(),
                changedBy: managerId,
                changedByName: 'Руководитель',
                comment: 'Согласовано',
              },
            ],
          }
          
          set((state) => ({
            requests: state.requests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            departmentRequests: state.departmentRequests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            loading: false,
          }))
        } catch (error) {
          set({ error: 'Ошибка при согласовании заявки', loading: false })
        }
      },
      
      rejectRequest: async (requestId: string, managerId: string, reason: string) => {
        set({ loading: true, error: null })
        try {
          const request = get().requests.find((r) => r.id === requestId)
          if (!request) {
            set({ error: 'Заявка не найдена', loading: false })
            return
          }
          
          const balance = get().balances[request.userId]
          if (balance) {
            const newBalance = {
              ...balance,
              reservedDays: balance.reservedDays - request.duration,
              availableDays: balance.availableDays + request.duration,
            }
            set((state) => ({
              balances: {
                ...state.balances,
                [request.userId]: newBalance,
              },
            }))
          }
          
          const updatedRequest: VacationRequest = {
            ...request,
            status: VacationRequestStatus.REJECTED,
            rejectionReason: reason,
            reviewedAt: new Date().toISOString(),
            reviewedBy: managerId,
            statusHistory: [
              ...request.statusHistory,
              {
                status: VacationRequestStatus.REJECTED,
                changedAt: new Date().toISOString(),
                changedBy: managerId,
                changedByName: 'Руководитель',
                comment: reason,
              },
            ],
          }
          
          set((state) => ({
            requests: state.requests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            departmentRequests: state.departmentRequests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            loading: false,
          }))
        } catch (error) {
          set({ error: 'Ошибка при отклонении заявки', loading: false })
        }
      },
      
      cancelByManager: async (requestId: string, managerId: string, reason: string) => {
        set({ loading: true, error: null })
        try {
          const request = get().requests.find((r) => r.id === requestId)
          if (!request) {
            set({ error: 'Заявка не найдена', loading: false })
            return
          }
          
          if (request.status !== VacationRequestStatus.APPROVED) {
            set({ error: 'Можно отменить только согласованные заявки', loading: false })
            return
          }
          
          const balance = get().balances[request.userId]
          if (balance) {
            const newBalance = {
              ...balance,
              usedDays: balance.usedDays - request.duration,
              availableDays: balance.availableDays + request.duration,
            }
            set((state) => ({
              balances: {
                ...state.balances,
                [request.userId]: newBalance,
              },
            }))
          }
          
          const updatedRequest: VacationRequest = {
            ...request,
            status: VacationRequestStatus.CANCELLED_BY_MANAGER,
            cancellationReason: reason,
            statusHistory: [
              ...request.statusHistory,
              {
                status: VacationRequestStatus.CANCELLED_BY_MANAGER,
                changedAt: new Date().toISOString(),
                changedBy: managerId,
                changedByName: 'Руководитель',
                comment: reason,
              },
            ],
          }
          
          set((state) => ({
            requests: state.requests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            loading: false,
          }))
        } catch (error) {
          set({ error: 'Ошибка при отмене заявки руководителем', loading: false })
        }
      },
      
      createRestriction: async (
        departmentId: string,
        data: Omit<VacationRestriction, 'id' | 'departmentId' | 'createdAt' | 'createdBy' | 'createdByName'>
      ) => {
        set({ loading: true, error: null })
        try {
          const newRestriction: VacationRestriction = {
            ...data,
            id: `vr-${Date.now()}`,
            departmentId,
            createdAt: new Date().toISOString(),
            createdBy: 'current-user',
            createdByName: 'Текущий пользователь',
          }
          
          set((state) => ({
            restrictions: [...state.restrictions, newRestriction],
            loading: false,
          }))
        } catch (error) {
          set({ error: 'Ошибка при создании ограничения', loading: false })
        }
      },
      
      deleteRestriction: async (restrictionId: string) => {
        set({ loading: true, error: null })
        try {
          set((state) => ({
            restrictions: state.restrictions.filter((r) => r.id !== restrictionId),
            loading: false,
          }))
        } catch (error) {
          set({ error: 'Ошибка при удалении ограничения', loading: false })
        }
      },
      
      getCalendarItems: (departmentId: string, year: number) => {
        const requests = get().requests.filter((r) => {
          const startDate = new Date(r.startDate)
          return startDate.getFullYear() === year && r.status === VacationRequestStatus.APPROVED
        })
        
        return requests.map((r) => ({
          requestId: r.id,
          userId: r.userId,
          userFirstName: r.userFirstName,
          userLastName: r.userLastName,
          userPosition: r.userPosition,
          startDate: r.startDate,
          endDate: r.endDate,
          vacationType: r.vacationType,
          status: r.status,
        }))
      },
      
      clearError: () => set({ error: null }),
    }),
    {
      name: 'vacation-storage',
      partialize: (state) => ({
        requests: state.requests,
        balances: state.balances,
        restrictions: state.restrictions,
      }),
    }
  )
)
