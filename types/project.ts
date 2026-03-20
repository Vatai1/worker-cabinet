export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'

export type ProjectMemberRole = 'lead' | 'member'

export interface ProjectMember {
  id: string
  first_name: string
  last_name: string
  position: string
  department_name?: string
  role: ProjectMemberRole
  joined_at?: string
  description?: string
}

export interface RoadmapRow {
  id: string
  title: string
  color: string
  order_index: number
}

export type TaskPriority = 'low' | 'medium' | 'high'
export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export interface RoadmapTask {
  id: string
  row_id: string
  title: string
  description?: string
  start_date: string
  end_date: string
  status: TaskStatus
  priority: TaskPriority
  assignee_id?: string
  assignee_name?: string
  order_index: number
}

export interface FolderItem {
  id: string
  name: string
  path: string
  parent_path: string
  created_by: string
  created_at: string
}

export interface DocItem {
  id: string
  name: string
  path: string
  folder_path: string
  size: number
  mime_type: string
  tags: string[]
  created_by: string
  created_at: string
  updated_at?: string
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
