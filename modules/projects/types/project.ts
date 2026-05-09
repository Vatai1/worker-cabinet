type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'

type ProjectMemberRole = 'lead' | 'member'

export interface ProjectMember {
  id: string
  first_name: string
  last_name: string
  position: string
  department_name?: string
  role: ProjectMemberRole
  joined_at?: string
  description?: string
  gender?: 'male' | 'female' | 'other'
  avatar?: string
}

export interface Project {
  id: string
  name: string
  description?: string
  status: ProjectStatus
  start_date?: string
  end_date?: string
  is_public: boolean
  created_at: string
  updated_at?: string
  members?: ProjectMember[]
}
