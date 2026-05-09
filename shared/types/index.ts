export type UserRole = 'employee' | 'manager' | 'hr' | 'admin' | 'onboarding'

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
  gender?: 'male' | 'female' | 'other'
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

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  token: string | null
}

export * from '@/modules/vacation/types/vacation'
export * from '@/modules/projects/types/project'
export * from '@/modules/surveys/types/survey'
