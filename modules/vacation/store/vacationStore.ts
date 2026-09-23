import { create } from 'zustand'
import type {
  VacationRequest,
  VacationBalance,
  VacationRestriction,
  VacationRestrictionViolation,
  VacationFormData,
  VacationValidationError,
  VacationSubstitution,
} from '@/shared/types'
import { VacationRequestStatus, VacationType } from '@/shared/types'
import { vacationApi } from '@/modules/vacation/services/vacationApi'
import {
  calculateVacationDuration,
  checkDateOverlap,
} from '@/modules/vacation/data/mockVacationData'

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback

interface VacationStore {
  requests: VacationRequest[]
  balances: Record<string, VacationBalance>
  restrictions: VacationRestriction[]
  violations: VacationRestrictionViolation[]

  currentUserRequests: VacationRequest[]
  departmentRequests: VacationRequest[]
  connectionsRequests: VacationRequest[]

  calendarVersion: number
  bumpCalendarVersion: () => void

  loading: boolean
  error: string | null

  fetchAllRequests: (filters?: { departmentId?: string; year?: number; status?: string; vacationType?: string; tagId?: string }) => Promise<void>
  fetchConnectionRequests: () => Promise<void>
  fetchUserRequests: (userId: string) => Promise<void>
  fetchDepartmentRequests: (departmentId: string, filters?: { status?: string; year?: number; vacationType?: string }) => Promise<void>
  fetchBalance: (userId: string, year: number) => Promise<VacationBalance>
  fetchRestrictions: (departmentId: string) => Promise<void>
  fetchViolations: (departmentId?: string) => Promise<void>

  createRequest: (userId: string, data: VacationFormData) => Promise<VacationRequest | null>
  cancelRequest: (requestId: string) => Promise<void>

  approveRequest: (requestId: string, managerId: string) => Promise<void>
  rejectRequest: (requestId: string, managerId: string, reason: string) => Promise<void>
  approveTransferRequest: (requestId: string) => Promise<void>
  rejectTransferRequest: (requestId: string, reason: string) => Promise<void>

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

  addSubstitutes: (requestId: string, userIds: number[]) => Promise<void>
  removeSubstitute: (requestId: string, userId: number) => Promise<void>
  mySubstitutions: VacationSubstitution[]
  fetchMySubstitutions: () => Promise<void>
}

export const useVacationStore = create<VacationStore>()((set, get) => ({
      requests: [],
      balances: {},
      restrictions: [],
      violations: [],
      mySubstitutions: [],
      
      currentUserRequests: [],
      departmentRequests: [],
      connectionsRequests: [],

      calendarVersion: 0,
      bumpCalendarVersion: () => set({ calendarVersion: Date.now() }),

      loading: false,
      error: null,

      fetchAllRequests: async (filters) => {
        set({ loading: true, error: null })
        try {
          const data = await vacationApi.getAllRequests(filters)
          set({ departmentRequests: data, loading: false })
        } catch (error) {
          set({ error: errorMessage(error, 'Ошибка при загрузке заявок'), loading: false })
        }
      },

      fetchConnectionRequests: async () => {
        set({ loading: true, error: null })
        try {
          const data = await vacationApi.getAllRequests({ scope: 'connections' })
          set({ connectionsRequests: data, loading: false })
        } catch (error) {
          set({ error: errorMessage(error, 'Ошибка при загрузке заявок по связям'), loading: false })
        }
      },

      fetchUserRequests: async (userId: string) => {
        set({ loading: true, error: null })
        try {
          const data = await vacationApi.getUserRequests(userId)
          set({ currentUserRequests: data, loading: false })
        } catch (error) {
          set({ error: errorMessage(error, 'Ошибка при загрузке заявок'), loading: false })
        }
      },
      
      fetchDepartmentRequests: async (departmentId, filters) => {
        set({ loading: true, error: null })
        try {
          const data = await vacationApi.getDepartmentRequests(departmentId, filters)
          set({ departmentRequests: data, loading: false })
        } catch (error) {
          set({ error: errorMessage(error, 'Ошибка при загрузке заявок отдела'), loading: false })
        }
      },
      
      fetchBalance: async (userId: string, year: number) => {
        try {
          const balance = await vacationApi.getBalance(userId, year)
          set((state) => ({
            balances: {
              ...state.balances,
              [userId]: balance,
            },
          }))
          return balance
        } catch (error) {
          set({ error: errorMessage(error, 'Ошибка при загрузке баланса') })
          throw error
        }
      },
      
      fetchRestrictions: async (departmentId: string) => {
        set({ loading: true, error: null })
        try {
          const data = await vacationApi.getRestrictions(departmentId ? { departmentId } : undefined)
          set({ restrictions: data, loading: false })
        } catch (error) {
          set({ error: errorMessage(error, 'Ошибка при загрузке ограничений'), loading: false })
        }
      },

      fetchViolations: async (departmentId?: string) => {
        try {
          const data = await vacationApi.getRestrictionViolations(departmentId)
          set({ violations: data })
        } catch (error) {
          set({ error: errorMessage(error, 'Ошибка при проверке пересечений') })
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
        } catch {
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

          get().bumpCalendarVersion()

          return newRequest
        } catch (error) {
          set({ error: errorMessage(error, 'Ошибка при создании заявки'), loading: false })
          return null
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

          get().bumpCalendarVersion()
        } catch (error) {
          set({ error: errorMessage(error, 'Ошибка при отмене заявки'), loading: false })
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

          get().bumpCalendarVersion()
        } catch (error) {
          set({ error: errorMessage(error, 'Ошибка при согласовании заявки'), loading: false })
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

          get().bumpCalendarVersion()
        } catch (error) {
          set({ error: errorMessage(error, 'Ошибка при отклонении заявки'), loading: false })
          throw error
        }
      },

      approveTransferRequest: async (requestId: string) => {
        set({ loading: true, error: null })
        try {
          const updatedRequest = await vacationApi.approveTransfer(requestId)

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

          get().bumpCalendarVersion()
        } catch (error) {
          set({ error: errorMessage(error, 'Ошибка при согласовании переноса'), loading: false })
          throw error
        }
      },

      rejectTransferRequest: async (requestId: string, reason: string) => {
        set({ loading: true, error: null })
        try {
          const updatedRequest = await vacationApi.rejectTransfer(requestId, reason)

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

          get().bumpCalendarVersion()
        } catch (error) {
          set({ error: errorMessage(error, 'Ошибка при отклонении переноса'), loading: false })
          throw error
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
        } catch (error) {
          set({ error: errorMessage(error, 'Ошибка при добавлении комментария'), loading: false })
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
        } catch (error) {
          set({ error: errorMessage(error, 'Ошибка при создании ограничения'), loading: false })
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
        } catch (error) {
          set({ error: errorMessage(error, 'Ошибка при удалении ограничения'), loading: false })
          throw error
        }
      },

      addSubstitutes: async (requestId: string, userIds: number[]) => {
        try {
          await vacationApi.addSubstitutes(requestId, userIds)
        } catch (error) {
          set({ error: errorMessage(error, 'Ошибка при добавлении замещающих') })
          throw error
        }
      },

      removeSubstitute: async (requestId: string, userId: number) => {
        try {
          await vacationApi.removeSubstitute(requestId, userId)
        } catch (error) {
          set({ error: errorMessage(error, 'Ошибка при удалении замещающего') })
          throw error
        }
      },

      fetchMySubstitutions: async () => {
        try {
          const data = await vacationApi.getMySubstitutions()
          set({ mySubstitutions: data })
        } catch {
        }
      },

    })
)
