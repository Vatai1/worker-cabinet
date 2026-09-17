import { Building2, FolderKanban } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/Avatar'
import { generateAvatarUrl } from '@/shared/lib/avatar'
import { personName } from '@/shared/lib/utils'
import { PROJECT_STATUS_LABELS } from '@/shared/hooks/useGlobalSearch'
import type { GlobalSearchUser, GlobalSearchDepartment, GlobalSearchProject } from '@/shared/hooks/useGlobalSearch'

interface EmployeeRowProps {
  user: GlobalSearchUser
  query: string
  onClick: () => void
}

export function EmployeeResultRow({ user, query, onClick }: EmployeeRowProps) {
  const q = query.trim().toLowerCase()
  const matchedTag = q ? user.skills?.find((s) => s.toLowerCase().includes(q)) : undefined
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted"
    >
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={user.avatar || generateAvatarUrl(String(user.id))} alt={personName(user.last_name, user.first_name, user.middle_name)} />
        <AvatarFallback className="text-xs">{user.first_name[0]}{user.last_name[0]}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{personName(user.last_name, user.first_name, user.middle_name)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[user.position, user.department_name].filter(Boolean).join(' · ')}
        </p>
        {matchedTag && (
          <span className="mt-0.5 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {matchedTag}
          </span>
        )}
      </div>
    </button>
  )
}

interface DepartmentRowProps {
  department: GlobalSearchDepartment
  onClick: () => void
}

export function DepartmentResultRow({ department, onClick }: DepartmentRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Building2 className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{department.name}</p>
        {department.manager_name && <p className="truncate text-xs text-muted-foreground">{department.manager_name}</p>}
      </div>
    </button>
  )
}

interface ProjectRowProps {
  project: GlobalSearchProject
  onClick: () => void
}

export function ProjectResultRow({ project, onClick }: ProjectRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <FolderKanban className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{project.name}</p>
        {project.status && (
          <p className="truncate text-xs text-muted-foreground">{PROJECT_STATUS_LABELS[project.status] ?? project.status}</p>
        )}
      </div>
    </button>
  )
}
