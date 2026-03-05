// Analytics Types for HR Dashboard

export type TrendPeriod = 'monthly' | 'quarterly' | 'yearly'

export interface MonthlyTrend {
  period: 'monthly'
  year: number
  month: number
  label: string
  requestCount: number
  totalDays: number
  uniqueEmployees: number
}

export interface QuarterlyTrend {
  period: 'quarterly'
  year: number
  quarter: number
  label: string
  requestCount: number
  totalDays: number
  uniqueEmployees: number
}

export interface YearlyTrend {
  period: 'yearly'
  year: number
  label: string
  requestCount: number
  totalDays: number
  uniqueEmployees: number
}

export type TrendData = MonthlyTrend | QuarterlyTrend | YearlyTrend

export interface VacationTrendsResponse {
  period: TrendPeriod
  year: number
  data: TrendData[]
}

export interface DepartmentUtilization {
  departmentId: string
  departmentName: string
  employeeCount: number
  totalDaysUsed: number
  totalAvailableDays: number
  utilizationPercentage: number
}

export interface DepartmentUtilizationResponse {
  year: number
  standardDaysPerYear: number
  data: DepartmentUtilization[]
}

export interface UpcomingAbsenceEmployee {
  firstName: string
  lastName: string
  middleName?: string
  position: string
  departmentId?: string
  departmentName?: string
}

export interface UpcomingAbsence {
  id: string
  userId: string
  startDate: string
  endDate: string
  duration: number
  comment?: string
  vacationType: string
  vacationTypeName: string
  employee: UpcomingAbsenceEmployee
}

export interface UpcomingAbsencesResponse {
  days: number
  startDate: string
  endDate: string
  count: number
  data: UpcomingAbsence[]
}

export interface DepartmentBalanceSummary {
  departmentId: string
  departmentName: string
  employeeCount: number
  totalDaysAllocated: number
  totalDaysUsed: number
  totalDaysReserved: number
  totalDaysRemaining: number
}

export interface CompanyTotals {
  totalEmployees: number
  totalDaysAllocated: number
  totalDaysUsed: number
  totalDaysReserved: number
  totalDaysRemaining: number
}

export interface BalanceSummaryResponse {
  companyTotals: CompanyTotals
  departments: DepartmentBalanceSummary[]
}

export interface YearStatistics {
  year: number
  requestCount: number
  totalDays: number
  uniqueEmployees: number
  avgDuration: number
}

export interface YearOverYearChange {
  absolute: number
  percentage: number
}

export interface YearOverYearChanges {
  totalDays: YearOverYearChange
  requestCount: YearOverYearChange
  uniqueEmployees: YearOverYearChange
  avgDuration: YearOverYearChange
}

export interface YearOverYearComparisonResponse {
  year1: YearStatistics
  year2: YearStatistics
  changes: YearOverYearChanges
}

export interface AnalyticsApiError {
  code: string
  message: string
  details?: any
}
