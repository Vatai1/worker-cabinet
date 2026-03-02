import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, AuthState } from '@/types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api'

interface AuthStore extends AuthState {
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  updateUser: (user: Partial<User>) => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      token: null,
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
          console.log('[AuthStore] Token saved to state')
        } catch (error) {
          console.log('[AuthStore] Login failed:', error)
          throw error
        }
      },
      logout: () => {
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
    }),
    {
      name: 'auth-storage',
    }
  )
)
