import { useAuthStore } from '@/core/auth/store/authStore'
import { useOrgStore } from '@/shared/store/orgStore'

export function useGlobalRole(): string {
  return useAuthStore((s) => s.user?.role ?? 'employee')
}

export function useOrgRole(): string | null {
  return useOrgStore((s) => {
    const org = s.organizations.find(o => o.id === s.currentOrgId)
    return org?.org_role ?? null
  })
}

export function isSuperAdmin(): boolean {
  return useGlobalRole() === 'superadmin'
}

export function hasAnyRole(...roles: string[]): boolean {
  const global = useGlobalRole()
  const org = useOrgRole()
  if (global === 'superadmin') return true
  return roles.includes(global) || (org !== null && roles.includes(org))
}

export function hasGlobalRole(...roles: string[]): boolean {
  const global = useGlobalRole()
  if (global === 'superadmin') return true
  return roles.includes(global)
}

export function hasOrgRole(...roles: string[]): boolean {
  const org = useOrgRole()
  if (useGlobalRole() === 'superadmin') return true
  return org !== null && roles.includes(org)
}

export function hasAnyRoleSync(...roles: string[]): boolean {
  const global = useAuthStore.getState().user?.role ?? 'employee'
  if (global === 'superadmin') return true
  if (roles.includes(global)) return true
  const orgState = useOrgStore.getState()
  const org = orgState.organizations.find(o => o.id === orgState.currentOrgId)
  return org ? roles.includes(org.org_role) : false
}
