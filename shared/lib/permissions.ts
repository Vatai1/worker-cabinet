import { useAuthStore } from '@/core/auth/store/authStore'
import { useOrgStore } from '@/shared/store/orgStore'

function globalRole(): string {
  return useAuthStore.getState().user?.role ?? 'employee'
}

function orgRole(): string | null {
  const preview = useAuthStore.getState().previewRole
  if (preview) return preview
  const s = useOrgStore.getState()
  const org = s.organizations.find((o) => o.id === s.currentOrgId)
  return org?.org_role ?? null
}

export function isSuperAdmin(): boolean {
  return globalRole() === 'superadmin'
}

export function hasAnyRole(...roles: string[]): boolean {
  const global = globalRole()
  if (global === 'superadmin') return true
  if (roles.includes(global)) return true
  const org = orgRole()
  return org !== null && roles.includes(org)
}

export function hasGlobalRole(...roles: string[]): boolean {
  const global = globalRole()
  if (global === 'superadmin') return true
  return roles.includes(global)
}

export function hasOrgRole(...roles: string[]): boolean {
  if (globalRole() === 'superadmin') return true
  const org = orgRole()
  return org !== null && roles.includes(org)
}

export const hasAnyRoleSync = hasAnyRole
