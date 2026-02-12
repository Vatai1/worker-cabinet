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
import { vacationApi } from '@/services/vacationApi'
import {
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

  fetchAllRequests: () => Promise<void>
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

  addComment: (requestId: string, comment: string) => Promise<void>

  validateRequest: (
    userId: string,
    data: VacationFormData
  ) => VacationValidationError[]

  checkRestrictions: (
    userId: string,
    data: VacationFormData
  ) => Promise<VacationValidationError[]>
  
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
      requests: [],
      balances: {},
      restrictions: [],
      
      currentUserRequests: [],
      departmentRequests: [],
      
      loading: false,
      error: null,

      fetchAllRequests: async () => {
        set({ loading: true, error: null })
        try {
          const data = await vacationApi.getAllRequests()
          set({ departmentRequests: data, loading: false })
        } catch (error: any) {
          set({ error: error.message || 'Ошибка при загрузке заявок', loading: false })
        }
      },

      fetchUserRequests: async (userId: string) => {
        set({ loading: true, error: null })
        try {
          const data = await vacationApi.getUserRequests(userId)
          set({ currentUserRequests: data, loading: false })
        } catch (error: any) {
          set({ error: error.message || 'Ошибка при загрузке заявок', loading: false })
        }
      },
      
      fetchDepartmentRequests: async (departmentId: string) => {
        set({ loading: true, error: null })
        try {
          const data = await vacationApi.getDepartmentRequests(departmentId)
          set({ departmentRequests: data, loading: false })
        } catch (error: any) {
          set({ error: error.message || 'Ошибка при загрузке заявок отдела', loading: false })
        }
      },
      
      fetchBalance: async (userId: string) => {
        try {
          const balance = await vacationApi.getBalance(userId)
          set((state) => ({
            balances: {
              ...state.balances,
              [userId]: balance,
            },
          }))
          return balance
        } catch (error: any) {
          set({ error: error.message || 'Ошибка при загрузке баланса' })
          throw error
        }
      },
      
      fetchRestrictions: async (departmentId: string) => {
        set({ loading: true, error: null })
        try {
          const data = await vacationApi.getRestrictions(departmentId)
          set({ restrictions: data, loading: false })
        } catch (error: any) {
          set({ error: error.message || 'Ошибка при загрузке ограничений', loading: false })
        }
      },
      
      validateRequest: (userId: string, data: VacationFormData) => {
        const errors: VacationValidationError[] = []
        const { startDate, endDate, vacationType, hasTravel, referenceDocument } = data
        
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
        
        if (vacationType === VacationType.EDUCATIONAL && !referenceDocument) {
          errors.push({
            field: 'referenceDocument',
            message: 'Для учебного отпуска необходимо приложить справку',
          })
        }

        return errors
      },

      checkRestrictions: async (userId: string, data: VacationFormData) => {
        try {
          const warnings = await vacationApi.checkRestrictions(userId, {
            startDate: data.startDate,
            endDate: data.endDate,
          })
          return warnings
        } catch (error: any) {
          console.error('Error checking restrictions:', error)
          return []
        }
      },
      
      createRequest: async (userId: string, data: VacationFormData) => {
        set({ loading: true, error: null })

        const errors = get().validateRequest(userId, data)
        if (errors.length > 0) {
          set({ loading: false, error: errors[0].message })
          return null
        }

        try {
          const newRequest = await vacationApi.createRequest(userId, data)

          set((state) => ({
            requests: [...state.requests, newRequest],
            currentUserRequests: [...state.currentUserRequests, newRequest],
            loading: false,
          }))

          return newRequest
        } catch (error: any) {
          set({ error: error.message || 'Ошибка при создании заявки', loading: false })
          return null
        }
      },
      
      updateRequest: async (requestId: string, data: Partial<VacationFormData>) => {
        set({ loading: true, error: null })
        try {
          const updatedRequest = await vacationApi.updateRequest(requestId, data)

          set((state) => ({
            requests: state.requests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            currentUserRequests: state.currentUserRequests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            departmentRequests: state.departmentRequests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            loading: false,
          }))
        } catch (error: any) {
          set({ error: error.message || 'Ошибка при обновлении заявки', loading: false })
          throw error
        }
      },
      
      cancelRequest: async (requestId: string) => {
        set({ loading: true, error: null })
        try {
          const updatedRequest = await vacationApi.cancelRequest(requestId)

          set((state) => ({
            requests: state.requests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            currentUserRequests: state.currentUserRequests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            departmentRequests: state.departmentRequests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            loading: false,
          }))
        } catch (error: any) {
          set({ error: error.message || 'Ошибка при отмене заявки', loading: false })
          throw error
        }
      },
      
      approveRequest: async (requestId: string, managerId: string) => {
        set({ loading: true, error: null })
        try {
          const updatedRequest = await vacationApi.approveRequest(requestId, managerId)
          
          set((state) => ({
            requests: state.requests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            currentUserRequests: state.currentUserRequests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            departmentRequests: state.departmentRequests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            loading: false,
          }))
        } catch (error: any) {
          set({ error: error.message || 'Ошибка при согласовании заявки', loading: false })
          throw error
        }
      },
      
      rejectRequest: async (requestId: string, managerId: string, reason: string) => {
        set({ loading: true, error: null })
        try {
          const updatedRequest = await vacationApi.rejectRequest(requestId, managerId, reason)
          
          set((state) => ({
            requests: state.requests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            currentUserRequests: state.currentUserRequests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            departmentRequests: state.departmentRequests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            loading: false,
          }))
        } catch (error: any) {
          set({ error: error.message || 'Ошибка при отклонении заявки', loading: false })
          throw error
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

      addComment: async (requestId: string, comment: string) => {
        set({ loading: true, error: null })
        try {
          const updatedRequest = await vacationApi.addComment(requestId, comment)

          set((state) => ({
            requests: state.requests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            currentUserRequests: state.currentUserRequests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            departmentRequests: state.departmentRequests.map((r) =>
              r.id === requestId ? updatedRequest : r
            ),
            loading: false,
          }))
        } catch (error: any) {
          set({ error: error.message || 'Ошибка при добавлении комментария', loading: false })
          throw error
        }
      },

      createRestriction: async (
        departmentId: string,
        data: Omit<VacationRestriction, 'id' | 'departmentId' | 'createdAt' | 'createdBy' | 'createdByName'>
      ) => {
        set({ loading: true, error: null })
        try {
          const newRestriction = await vacationApi.createRestriction(departmentId, data)

          set((state) => ({
            restrictions: [...state.restrictions, newRestriction],
            loading: false,
          }))
        } catch (error: any) {
          set({ error: error.message || 'Ошибка при создании ограничения', loading: false })
          throw error
        }
      },

      deleteRestriction: async (restrictionId: string) => {
        set({ loading: true, error: null })
        try {
          await vacationApi.deleteRestriction(restrictionId)

          set((state) => ({
            restrictions: state.restrictions.filter((r) => r.id !== restrictionId),
            loading: false,
          }))
        } catch (error: any) {
          set({ error: error.message || 'Ошибка при удалении ограничения', loading: false })
          throw error
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
