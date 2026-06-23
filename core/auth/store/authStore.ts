import { create } from 'zustand'
import type { User, AuthState } from '@/shared/types'
import { deleteCookie } from '@/shared/lib/cookies'
import { API_BASE_URL } from '@/shared/lib/api'
import { useModulesStore } from '@/shared/store/modulesStore'

interface AuthStore extends AuthState {
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  updateUser: (user: Partial<User>) => void
  checkAuth: () => Promise<void>
}

export const useAuthStore = create<AuthStore>()((set) => ({
  user: null,
  isAuthenticated: false,
  loading: true,
  checkAuth: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        credentials: 'include',
      })

      if (!response.ok) {
        deleteCookie('auth_token')
        set({ isAuthenticated: false, user: null, loading: false })
        return
      }

      const data = await response.json()
      set({
        user: {
          id: data.id.toString(),
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          middleName: data.middleName,
          position: data.position,
          department: data.department,
          departmentId: data.departmentId?.toString(),
          phone: data.phone,
          birthDate: data.birthDate,
          hireDate: data.hireDate,
          status: data.status,
          role: data.role,
          managerId: data.managerId?.toString(),
          subordinates: data.subordinates?.map((id: number) => id.toString()),
          gender: data.gender,
          avatar: data.avatar,
        },
        isAuthenticated: true,
        loading: false,
      })
      useModulesStore.getState().fetchModules()
    } catch (error) {
      deleteCookie('auth_token')
      set({ isAuthenticated: false, user: null, loading: false })
    }
  },
  login: async (email: string, password: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Неверный email или пароль')
      }

      const data = await response.json()

      set({
        user: {
          id: data.user.id.toString(),
          email: data.user.email,
          firstName: data.user.firstName,
          lastName: data.user.lastName,
          middleName: data.user.middleName,
          position: data.user.position,
          department: data.user.department,
          departmentId: data.user.departmentId?.toString(),
          phone: data.user.phone,
          birthDate: data.user.birthDate,
          hireDate: data.user.hireDate,
          status: data.user.status,
          role: data.user.role,
          managerId: data.user.managerId?.toString(),
          subordinates: data.user.subordinates?.map((id: number) => id.toString()),
          gender: data.user.gender,
          avatar: data.user.avatar,
        },
        isAuthenticated: true,
      })
      useModulesStore.getState().fetchModules()
    } catch (error) {
      throw error
    }
  },
  logout: async () => {
    set({
      user: null,
      isAuthenticated: false,
    })
    deleteCookie('auth_token')
    try {
      const res = await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        if (data.logoutUrl) {
          window.location.href = data.logoutUrl
          return
        }
      }
    } catch {
      // ignore
    }
  },
  updateUser: (updates: Partial<User>) => {
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    }))
  },
}))
