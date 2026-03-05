import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  TrendPeriod,
  VacationTrendsResponse,
  DepartmentUtilizationResponse,
  UpcomingAbsencesResponse,
  BalanceSummaryResponse,
  YearOverYearComparisonResponse,
} from '@/types'
import { analyticsApi } from '@/services/analyticsApi'

interface CacheMetadata {
  timestamp: number
  params: Record<string, unknown>
}

interface AnalyticsStore {
  // Data caches
  trends: VacationTrendsResponse | null
  utilization: DepartmentUtilizationResponse | null
  upcomingAbsences: UpcomingAbsencesResponse | null
  balanceSummary: BalanceSummaryResponse | null
  yearOverYearComparison: YearOverYearComparisonResponse | null

  // Cache metadata for invalidation
  trendsCache: CacheMetadata | null
  utilizationCache: CacheMetadata | null
  upcomingAbsencesCache: CacheMetadata | null
  balanceSummaryCache: CacheMetadata | null
  yearOverYearCache: CacheMetadata | null

  // Loading states
  loading: boolean
  trendsLoading: boolean
  utilizationLoading: boolean
  upcomingAbsencesLoading: boolean
  balanceSummaryLoading: boolean
  yearOverYearLoading: boolean

  // Error states
  error: string | null
  trendsError: string | null
  utilizationError: string | null
  upcomingAbsencesError: string | null
  balanceSummaryError: string | null
  yearOverYearError: string | null

  // Fetch actions
  fetchTrends: (period?: TrendPeriod, year?: number) => Promise<void>
  fetchUtilization: (year?: number) => Promise<void>
  fetchUpcomingAbsences: (days?: number) => Promise<void>
  fetchBalanceSummary: () => Promise<void>
  fetchYearOverYearComparison: (year1: number, year2: number) => Promise<void>

  // Refresh actions (force refetch)
  refreshTrends: () => Promise<void>
  refreshUtilization: () => Promise<void>
  refreshUpcomingAbsences: () => Promise<void>
  refreshBalanceSummary: () => Promise<void>
  refreshYearOverYearComparison: () => Promise<void>

  // Utility actions
  clearError: () => void
  clearAllErrors: () => void
  reset: () => void

  // Cache management
  invalidateCache: () => void
  isCacheValid: (cache: CacheMetadata | null, maxAgeMs?: number) => boolean
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

const initialState = {
  trends: null,
  utilization: null,
  upcomingAbsences: null,
  balanceSummary: null,
  yearOverYearComparison: null,

  trendsCache: null,
  utilizationCache: null,
  upcomingAbsencesCache: null,
  balanceSummaryCache: null,
  yearOverYearCache: null,

  loading: false,
  trendsLoading: false,
  utilizationLoading: false,
  upcomingAbsencesLoading: false,
  balanceSummaryLoading: false,
  yearOverYearLoading: false,

  error: null,
  trendsError: null,
  utilizationError: null,
  upcomingAbsencesError: null,
  balanceSummaryError: null,
  yearOverYearError: null,
}

export const useAnalyticsStore = create<AnalyticsStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      isCacheValid: (cache: CacheMetadata | null, maxAgeMs: number = CACHE_TTL_MS) => {
        if (!cache) return false
        return Date.now() - cache.timestamp < maxAgeMs
      },

      fetchTrends: async (period: TrendPeriod = 'monthly', year: number = new Date().getFullYear()) => {
        const { trendsCache, isCacheValid } = get()

        // Check cache validity
        if (trendsCache &&
            isCacheValid(trendsCache) &&
            trendsCache.params.period === period &&
            trendsCache.params.year === year) {
          return
        }

        set({ trendsLoading: true, trendsError: null, loading: true })
        try {
          const data = await analyticsApi.getTrends(period, year)
          set({
            trends: data,
            trendsCache: { timestamp: Date.now(), params: { period, year } },
            trendsLoading: false,
            loading: false,
          })
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Ошибка при загрузке трендов отпусков'
          set({
            trendsError: message,
            error: message,
            trendsLoading: false,
            loading: false,
          })
        }
      },

      fetchUtilization: async (year: number = new Date().getFullYear()) => {
        const { utilizationCache, isCacheValid } = get()

        if (utilizationCache &&
            isCacheValid(utilizationCache) &&
            utilizationCache.params.year === year) {
          return
        }

        set({ utilizationLoading: true, utilizationError: null, loading: true })
        try {
          const data = await analyticsApi.getUtilization(year)
          set({
            utilization: data,
            utilizationCache: { timestamp: Date.now(), params: { year } },
            utilizationLoading: false,
            loading: false,
          })
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Ошибка при загрузке утилизации отделов'
          set({
            utilizationError: message,
            error: message,
            utilizationLoading: false,
            loading: false,
          })
        }
      },

      fetchUpcomingAbsences: async (days: number = 30) => {
        const { upcomingAbsencesCache, isCacheValid } = get()

        // Use shorter cache TTL for upcoming absences (1 minute) since data changes more frequently
        if (upcomingAbsencesCache &&
            isCacheValid(upcomingAbsencesCache, 60 * 1000) &&
            upcomingAbsencesCache.params.days === days) {
          return
        }

        set({ upcomingAbsencesLoading: true, upcomingAbsencesError: null, loading: true })
        try {
          const data = await analyticsApi.getUpcomingAbsences(days)
          set({
            upcomingAbsences: data,
            upcomingAbsencesCache: { timestamp: Date.now(), params: { days } },
            upcomingAbsencesLoading: false,
            loading: false,
          })
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Ошибка при загрузке предстоящих отсутствий'
          set({
            upcomingAbsencesError: message,
            error: message,
            upcomingAbsencesLoading: false,
            loading: false,
          })
        }
      },

      fetchBalanceSummary: async () => {
        const { balanceSummaryCache, isCacheValid } = get()

        if (balanceSummaryCache && isCacheValid(balanceSummaryCache)) {
          return
        }

        set({ balanceSummaryLoading: true, balanceSummaryError: null, loading: true })
        try {
          const data = await analyticsApi.getBalanceSummary()
          set({
            balanceSummary: data,
            balanceSummaryCache: { timestamp: Date.now(), params: {} },
            balanceSummaryLoading: false,
            loading: false,
          })
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Ошибка при загрузке сводки по балансам'
          set({
            balanceSummaryError: message,
            error: message,
            balanceSummaryLoading: false,
            loading: false,
          })
        }
      },

      fetchYearOverYearComparison: async (year1: number, year2: number) => {
        const { yearOverYearCache, isCacheValid } = get()

        if (yearOverYearCache &&
            isCacheValid(yearOverYearCache) &&
            yearOverYearCache.params.year1 === year1 &&
            yearOverYearCache.params.year2 === year2) {
          return
        }

        set({ yearOverYearLoading: true, yearOverYearError: null, loading: true })
        try {
          const data = await analyticsApi.getYearOverYearComparison(year1, year2)
          set({
            yearOverYearComparison: data,
            yearOverYearCache: { timestamp: Date.now(), params: { year1, year2 } },
            yearOverYearLoading: false,
            loading: false,
          })
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Ошибка при загрузке сравнения по годам'
          set({
            yearOverYearError: message,
            error: message,
            yearOverYearLoading: false,
            loading: false,
          })
        }
      },

      refreshTrends: async () => {
        const { trendsCache } = get()
        const period = (trendsCache?.params.period as TrendPeriod) || 'monthly'
        const year = (trendsCache?.params.year as number) || new Date().getFullYear()

        set({ trendsCache: null })
        await get().fetchTrends(period, year)
      },

      refreshUtilization: async () => {
        const { utilizationCache } = get()
        const year = (utilizationCache?.params.year as number) || new Date().getFullYear()

        set({ utilizationCache: null })
        await get().fetchUtilization(year)
      },

      refreshUpcomingAbsences: async () => {
        const { upcomingAbsencesCache } = get()
        const days = (upcomingAbsencesCache?.params.days as number) || 30

        set({ upcomingAbsencesCache: null })
        await get().fetchUpcomingAbsences(days)
      },

      refreshBalanceSummary: async () => {
        set({ balanceSummaryCache: null })
        await get().fetchBalanceSummary()
      },

      refreshYearOverYearComparison: async () => {
        const { yearOverYearCache } = get()
        const year1 = (yearOverYearCache?.params.year1 as number) || new Date().getFullYear() - 1
        const year2 = (yearOverYearCache?.params.year2 as number) || new Date().getFullYear()

        set({ yearOverYearCache: null })
        await get().fetchYearOverYearComparison(year1, year2)
      },

      clearError: () => set({ error: null }),

      clearAllErrors: () => set({
        error: null,
        trendsError: null,
        utilizationError: null,
        upcomingAbsencesError: null,
        balanceSummaryError: null,
        yearOverYearError: null,
      }),

      reset: () => set(initialState),

      invalidateCache: () => set({
        trendsCache: null,
        utilizationCache: null,
        upcomingAbsencesCache: null,
        balanceSummaryCache: null,
        yearOverYearCache: null,
      }),
    }),
    {
      name: 'analytics-storage',
      partialize: (state) => ({
        trends: state.trends,
        utilization: state.utilization,
        upcomingAbsences: state.upcomingAbsences,
        balanceSummary: state.balanceSummary,
        yearOverYearComparison: state.yearOverYearComparison,
        trendsCache: state.trendsCache,
        utilizationCache: state.utilizationCache,
        upcomingAbsencesCache: state.upcomingAbsencesCache,
        balanceSummaryCache: state.balanceSummaryCache,
        yearOverYearCache: state.yearOverYearCache,
      }),
    }
  )
)
