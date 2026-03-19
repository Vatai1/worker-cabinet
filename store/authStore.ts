import { create } from 'zustand'
import type { User, AuthState } from '@/types'
import { setCookie, getCookie, deleteCookie } from '@/lib/cookies'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

interface AuthStore extends AuthState {
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  updateUser: (user: Partial<User>) => void
  checkAuth: () => Promise<void>
}

export const useAuthStore = create<AuthStore>()((set) => ({
  user: null,
  isAuthenticated: false,
  token: getCookie('auth_token'),
  loading: true,
  checkAuth: async () => {
    const token = getCookie('auth_token')
    if (!token) {
      set({ isAuthenticated: false, user: null, token: null, loading: false })
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        deleteCookie('auth_token')
        set({ isAuthenticated: false, user: null, token: null, loading: false })
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
        },
        isAuthenticated: true,
        token,
        loading: false,
      })
    } catch (error) {
      console.error('[AuthStore] checkAuth error:', error)
      deleteCookie('auth_token')
      set({ isAuthenticated: false, user: null, token: null, loading: false })
    }
  },
  login: async (email: string, password: string) => {
    try {
      console.log('[AuthStore] Attempting login for:', email)
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      console.log('[AuthStore] Response status:', response.status)
      if (!response.ok) {
        const error = await response.json()
        console.log('[AuthStore] Login error:', error)
        throw new Error(error.error || 'Неверный email или пароль')
      }

      const data = await response.json()
      console.log('[AuthStore] Login successful:', data.user.email, '- Role:', data.user.role)

      setCookie('auth_token', data.token)

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
        },
        isAuthenticated: true,
        token: data.token,
      })
      console.log('[AuthStore] Token saved to cookie')
    } catch (error) {
      console.log('[AuthStore] Login failed:', error)
      throw error
    }
  },
  logout: () => {
    deleteCookie('auth_token')
    set({
      user: null,
      isAuthenticated: false,
      token: null,
    })
  },
  updateUser: (updates: Partial<User>) => {
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    }))
  },
}))
