import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, AuthState } from '@/types'

interface AuthStore extends AuthState {
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  updateUser: (user: Partial<User>) => void
}

// Mock user data for demo
const mockUser: User = {
  id: '1',
  email: 'ivanov@example.com',
  firstName: 'Иван',
  lastName: 'Иванов',
  middleName: 'Иванович',
  position: 'Senior Frontend Developer',
  department: 'Отдел разработки',
  phone: '+7 (999) 123-45-67',
  birthDate: '1990-05-15',
  hireDate: '2020-03-01',
  status: 'active',
  role: 'employee',
}

// Mock manager data for demo
const mockManager: User = {
  id: '2',
  email: 'petrov@example.com',
  firstName: 'Петр',
  lastName: 'Петров',
  middleName: 'Петрович',
  position: 'Руководитель отдела разработки',
  department: 'Отдел разработки',
  phone: '+7 (999) 765-43-21',
  birthDate: '1985-03-20',
  hireDate: '2018-01-15',
  status: 'active',
  role: 'manager',
  subordinates: ['1'], // ID сотрудника Иванова
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      token: null,
      login: async (email: string, password: string) => {
        // Mock authentication - в реальном приложении здесь будет API запрос
        if (email && password.length >= 6) {
          // Определяем роль по email (для демо)
          const isManager = email.includes('manager') || email.includes('petrov') || email.includes('admin')
          const user = isManager ? mockManager : mockUser
          
          set({
            user: user,
            isAuthenticated: true,
            token: 'mock-jwt-token',
          })
        } else {
          throw new Error('Неверный email или пароль')
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
