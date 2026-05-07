export interface AdminRole {
  id: number
  name: string
  description: string | null
  is_system: boolean
  color: string | null
  created_at: string
  permissions: AdminPermission[]
}

export interface AdminPermission {
  id: number
  code: string
  name: string
  module: string
  description?: string
}

export interface AdminUser {
  id: number
  email: string
  first_name: string
  last_name: string
  middle_name: string | null
  position: string
  status: 'active' | 'inactive' | 'on_leave'
  role: string
  department_id: number | null
  department_name: string | null
  hire_date: string | null
  phone: string | null
  avatar: string | null
  manager_id: number | null
  manager_first_name: string | null
  manager_last_name: string | null
  responsibility_area: string | null
  created_at: string
}

export interface SystemSetting {
  key: string
  value: string
  description: string | null
  updated_at: string
}

export interface AuditLogEntry {
  id: number
  user_id: number | null
  user_name: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  details: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

export interface AdminStats {
  totalUsers: number
  activeUsers: number
  totalRoles: number
  totalDepartments: number
  auditToday: number
  roleDistribution: { role: string; count: string }[]
}
