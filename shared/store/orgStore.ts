import { create } from 'zustand'
import { apiGet } from '@/shared/lib/apiClient'
import { getCookie, setCookie } from '@/shared/lib/cookies'

interface Organization {
  id: number
  name: string
  slug: string
  inn?: string
  logo_s3_key?: string
  org_role: string
  is_active: boolean
}

interface OrgStore {
  organizations: Organization[]
  currentOrgId: number | null
  loaded: boolean
  loading: boolean
  error: string | null
  fetchOrgs: (force?: boolean) => Promise<void>
  setCurrentOrg: (id: number) => void
  currentOrg: () => Organization | null
}

export const useOrgStore = create<OrgStore>((set, get) => ({
  organizations: [],
  currentOrgId: getCookie('active_org_id') ? parseInt(getCookie('active_org_id')!) : null,
  loaded: false,
  loading: false,
  error: null,

  fetchOrgs: async (force = false) => {
    if (get().loading) return
    if (!force && get().loaded) return
    set({ loading: true, error: null })
    try {
      const orgs = await apiGet<Organization[]>('/organizations')
      const currentId = get().currentOrgId
      if (orgs.length > 0 && !orgs.some(o => o.id === currentId)) {
        setCookie('active_org_id', String(orgs[0].id))
        set({ organizations: orgs, currentOrgId: orgs[0].id, loading: false, loaded: true })
      } else {
        set({ organizations: orgs, loading: false, loaded: true })
      }
    } catch (e) {
      set({ error: e instanceof Error && e.message ? e.message : 'Ошибка загрузки организаций', loading: false })
    }
  },

  setCurrentOrg: (id: number) => {
    setCookie('active_org_id', String(id))
    set({ currentOrgId: id })
    window.location.reload()
  },

  currentOrg: () => {
    const { organizations, currentOrgId } = get()
    return organizations.find(o => o.id === currentOrgId) || null
  },
}))
