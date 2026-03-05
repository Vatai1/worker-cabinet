export type UserRole = 'employee' | 'manager' | 'hr' | 'admin'

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  middleName?: string
  position: string
  department: string
  departmentId?: string
  avatar?: string
  phone?: string
  birthDate?: string
  hireDate: string
  status: 'active' | 'inactive' | 'on_leave'
  role: UserRole
  subordinates?: string[]
  managerId?: string
  responsibilityArea?: string
}

export interface Salary {
  id: string
  userId: string
  amount: number
  bonus: number
  total: number
  period: string
  paymentDate: string
  status: 'paid' | 'pending' | 'cancelled'
}

export interface ScheduleItem {
  id: string
  date: string
  startTime: string
  endTime: string
  type: 'work' | 'day_off' | 'vacation' | 'sick_leave' | 'business_trip'
  notes?: string
}

export interface Request {
  id: string
  userId: string
  type: 'vacation' | 'sick_leave' | 'remote_work' | 'business_trip' | 'other'
  startDate: string
  endDate: string
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  createdAt: string
  reviewedAt?: string
  reviewerComment?: string
}

export interface Document {
  id: string
  userId: string
  name: string
  type: 'contract' | 'nda' | 'policy' | 'certificate' | 'other'
  url: string
  uploadDate: string
  size: number
  mimeType?: string
}

export interface Notification {
  id: string
  userId: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  read: boolean
  createdAt: string
}

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  token: string | null
}

export interface AppState {
  auth: AuthState
  notifications: Notification[]
  sidebarOpen: boolean
}

export * from './vacation'
export * from './analytics'

