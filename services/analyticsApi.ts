import type {
  TrendPeriod,
  VacationTrendsResponse,
  DepartmentUtilizationResponse,
  UpcomingAbsencesResponse,
  BalanceSummaryResponse,
  YearOverYearComparisonResponse,
  AnalyticsApiError as IAnalyticsApiError,
} from '@/types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

class AnalyticsApiError extends Error implements IAnalyticsApiError {
  code: string
  details?: any

  constructor(code: string, message: string, details?: any) {
    super(message)
    this.name = 'AnalyticsApiError'
    this.code = code
    this.details = details
  }
}

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new AnalyticsApiError(
      error.code || 'API_ERROR',
      error.message || 'An error occurred',
      error.details
    )
  }
  return response.json()
}

const getAuthHeaders = () => {
  const authStorage = localStorage.getItem('auth-storage')
  if (authStorage) {
    try {
      const { state } = JSON.parse(authStorage)
      if (state?.token) {
        return {
          'Authorization': `Bearer ${state.token}`,
        }
      }
    } catch (e) {
      // Error parsing auth storage, return empty headers
    }
  }
  return {}
}

export const analyticsApi = {
  /**
   * Get vacation trends with monthly/quarterly/yearly aggregation
   */
  async getTrends(period: TrendPeriod = 'monthly', year: number = new Date().getFullYear()): Promise<VacationTrendsResponse> {
    const response = await fetch(
      `${API_BASE_URL}/analytics/trends?period=${period}&year=${year}`,
      { headers: getAuthHeaders() }
    )
    return handleResponse(response)
  },

  /**
   * Get department utilization statistics
   */
  async getUtilization(year: number = new Date().getFullYear()): Promise<DepartmentUtilizationResponse> {
    const response = await fetch(
      `${API_BASE_URL}/analytics/utilization?year=${year}`,
      { headers: getAuthHeaders() }
    )
    return handleResponse(response)
  },

  /**
   * Get upcoming absences with date range filtering
   */
  async getUpcomingAbsences(days: number = 30): Promise<UpcomingAbsencesResponse> {
    const response = await fetch(
      `${API_BASE_URL}/analytics/upcoming-absences?days=${days}`,
      { headers: getAuthHeaders() }
    )
    return handleResponse(response)
  },

  /**
   * Get balance summary with aggregate statistics by department
   */
  async getBalanceSummary(): Promise<BalanceSummaryResponse> {
    const response = await fetch(
      `${API_BASE_URL}/analytics/balance-summary`,
      { headers: getAuthHeaders() }
    )
    return handleResponse(response)
  },

  /**
   * Get year-over-year vacation comparison
   */
  async getYearOverYearComparison(year1: number, year2: number): Promise<YearOverYearComparisonResponse> {
    const response = await fetch(
      `${API_BASE_URL}/analytics/yoy-comparison?year1=${year1}&year2=${year2}`,
      { headers: getAuthHeaders() }
    )
    return handleResponse(response)
  },
}

export type AnalyticsApi = typeof analyticsApi
