import { Building2, FolderKanban } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/Avatar'
import { generateAvatarUrl } from '@/shared/lib/avatar'
import { personName } from '@/shared/lib/utils'
import { matchesAnyWordPrefix, searchTokens, wordPrefixIndex } from '@/shared/lib/wordSearch'
import { PROJECT_STATUS_LABELS } from '@/shared/hooks/useGlobalSearch'
import type { GlobalSearchUser, GlobalSearchDepartment, GlobalSearchProject } from '@/shared/hooks/useGlobalSearch'

type RowVariant = 'compact' | 'cozy'

export function highlightMatch(text: string, query: string) {
  const ranges = searchTokens(query)
    .map((t) => ({ start: wordPrefixIndex(text, t), length: t.length }))
    .filter((r) => r.start !== -1)
    .sort((a, b) => a.start - b.start)
  if (ranges.length === 0) return text
  const parts: React.ReactNode[] = []
  let cursor = 0
  for (const r of ranges) {
    if (r.start < cursor) continue
    parts.push(text.slice(cursor, r.start))
    parts.push(
      <mark key={r.start} className="rounded-[3px] bg-primary/15 px-0.5 -mx-0.5 font-semibold text-primary">
        {text.slice(r.start, r.start + r.length)}
      </mark>,
    )
    cursor = r.start + r.length
  }
  parts.push(text.slice(cursor))
  return <>{parts}</>
}

interface EmployeeRowProps {
  user: GlobalSearchUser
  query: string
  onClick: () => void
  variant?: RowVariant
}

export function EmployeeResultRow({ user, query, onClick, variant = 'compact' }: EmployeeRowProps) {
  const matchedTag = user.skills?.find((s) => matchesAnyWordPrefix(s, query))
  const name = personName(user.last_name, user.first_name, user.middle_name)

  if (variant === 'cozy') {
    return (
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={user.avatar || generateAvatarUrl(String(user.id))} alt={name} />
          <AvatarFallback className="text-xs">{user.first_name[0]}{user.last_name[0]}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{highlightMatch(name, query)}</p>
          {matchedTag && (
            <span className="mt-0.5 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {matchedTag}
            </span>
          )}
        </div>
        <div className="ml-auto shrink-0 text-right">
          {user.position && <p className="text-sm font-medium">{user.position}</p>}
          {user.department_name && <p className="text-xs text-muted-foreground">{user.department_name}</p>}
        </div>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted"
    >
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={user.avatar || generateAvatarUrl(String(user.id))} alt={name} />
        <AvatarFallback className="text-xs">{user.first_name[0]}{user.last_name[0]}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
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
  query?: string
  onClick: () => void
  variant?: RowVariant
}

export function DepartmentResultRow({ department, query = '', onClick, variant = 'compact' }: DepartmentRowProps) {
  if (variant === 'cozy') {
    return (
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="h-4 w-4" />
        </div>
        <p className="min-w-0 truncate text-sm font-medium">{highlightMatch(department.name, query)}</p>
        {department.manager_name && (
          <p className="ml-auto shrink-0 text-right text-sm font-medium">{department.manager_name}</p>
        )}
      </button>
    )
  }

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
  query?: string
  onClick: () => void
  variant?: RowVariant
}

export function ProjectResultRow({ project, query = '', onClick, variant = 'compact' }: ProjectRowProps) {
  const statusLabel = project.status ? PROJECT_STATUS_LABELS[project.status] ?? project.status : null

  if (variant === 'cozy') {
    return (
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <FolderKanban className="h-4 w-4" />
        </div>
        <p className="min-w-0 truncate text-sm font-medium">{highlightMatch(project.name, query)}</p>
        {statusLabel && <p className="ml-auto shrink-0 text-right text-sm font-medium">{statusLabel}</p>}
      </button>
    )
  }

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
        {statusLabel && <p className="truncate text-xs text-muted-foreground">{statusLabel}</p>}
      </div>
    </button>
  )
}
