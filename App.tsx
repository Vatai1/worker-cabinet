import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from '@/core/auth/store/authStore'
import { useModulesStore } from '@/shared/store/modulesStore'
import { Login } from '@/core/auth/pages/Login'
import { Layout } from '@/shared/components/layout/Layout'
import { Dashboard } from '@/shared/pages/Dashboard'
import { Profile } from '@/core/auth/pages/Profile'
import { ThemeProvider } from '@/shared/components/ThemeProvider'
import { Requests } from '@/modules/requests/pages/Requests'
import { Documents } from '@/modules/documents/pages/Documents'

import { ManagerDashboard } from '@/modules/requests/pages/ManagerDashboard'
import { LeaderDashboard } from '@/modules/requests/pages/LeaderDashboard'
import { Vacation } from '@/modules/vacation/pages/Vacation'
import { Employees } from '@/core/employees/pages/Employees'
import { EmployeeProfile } from '@/core/employees/pages/EmployeeProfile'
import { Projects } from '@/modules/projects/pages/Projects'
import { ProjectDetail } from '@/modules/projects/pages/ProjectDetail'
import { ProjectDocuments } from '@/modules/projects/pages/ProjectDocuments'
import { ProjectRoadmap } from '@/modules/projects/pages/ProjectRoadmap'
import { Settings } from '@/core/settings/pages/Settings'
import { Departments } from '@/modules/departments/pages/Departments'
import { DepartmentDetail } from '@/modules/departments/pages/DepartmentDetail'
import { Surveys } from '@/modules/surveys/pages/Surveys'
import { SurveyPage } from '@/modules/surveys/pages/SurveyPage'
import { Onboarding } from '@/modules/onboarding/pages/Onboarding'
import { HROnboarding } from '@/modules/onboarding/pages/HROnboarding'
import { ManagerTimesheet } from '@/modules/timesheet/pages/ManagerTimesheet'
import { CalendarPage } from '@/modules/calendar/pages/CalendarPage'
import { Notifications } from '@/modules/notifications/pages/Notifications'
import { AdminPanel } from '@/core/admin/pages/AdminPanel'
import { HRPanel } from '@/shared/pages/HRPanel'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const token = useAuthStore((state) => state.token)
  const loading = useAuthStore((state) => state.loading)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Загрузка...</div>
      </div>
    )
  }

  if (!isAuthenticated || !token) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function HRRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const loading = useAuthStore((state) => state.loading)
  if (loading) return null
  if (!['hr', 'admin'].includes(user?.role ?? ''))
    return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function ManagerRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const loading = useAuthStore((state) => state.loading)
  if (loading) return null
  if (user?.role !== 'manager') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function OnboardingRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const loading = useAuthStore((state) => state.loading)
  if (loading) return null
  if (user?.role !== 'onboarding') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function BlockOnboardingRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const loading = useAuthStore((state) => state.loading)
  if (loading) return null
  if (user?.role === 'onboarding') return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const loading = useAuthStore((state) => state.loading)
  if (loading) return null
  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function ModuleGuard({ module, children }: { module: string; children: React.ReactNode }) {
  const loaded = useModulesStore((s) => s.loaded)
  const enabledModules = useModulesStore((s) => s.enabledModules)

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Загрузка...</div>
      </div>
    )
  }

  if (!enabledModules.has(module)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function App() {
  const user = useAuthStore((state) => state.user)
  const checkAuth = useAuthStore((state) => state.checkAuth)

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  return (
    <BrowserRouter>
      <ThemeProvider>
        <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route
            index
            element={
              <Navigate
                to={
                  user?.role === 'manager' ? '/leader' :
                  user?.role === 'onboarding' ? '/onboarding' :
                  '/dashboard'
                }
                replace
              />
            }
          />
          <Route path="dashboard" element={<BlockOnboardingRoute><Dashboard /></BlockOnboardingRoute>} />
          <Route path="leader" element={<BlockOnboardingRoute><LeaderDashboard /></BlockOnboardingRoute>} />
          <Route path="manager" element={<BlockOnboardingRoute><ManagerDashboard /></BlockOnboardingRoute>} />
          <Route path="vacation" element={<ModuleGuard module="vacation"><BlockOnboardingRoute><Vacation /></BlockOnboardingRoute></ModuleGuard>} />
          <Route path="employees" element={<Employees />} />
          <Route path="departments" element={<Departments />} />
          <Route path="departments/:id" element={<DepartmentDetail />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
          <Route path="notifications" element={<ModuleGuard module="notifications"><BlockOnboardingRoute><Notifications /></BlockOnboardingRoute></ModuleGuard>} />

          <Route path="requests" element={<BlockOnboardingRoute><Requests /></BlockOnboardingRoute>} />
          <Route path="documents" element={<ModuleGuard module="documents"><BlockOnboardingRoute><Documents /></BlockOnboardingRoute></ModuleGuard>} />
          <Route path="calendar" element={<ModuleGuard module="calendar"><BlockOnboardingRoute><CalendarPage /></BlockOnboardingRoute></ModuleGuard>} />
          <Route path="employees/:id" element={<EmployeeProfile />} />
          <Route path="projects" element={<ModuleGuard module="projects"><BlockOnboardingRoute><Projects /></BlockOnboardingRoute></ModuleGuard>} />
          <Route path="projects/:id" element={<ModuleGuard module="projects"><BlockOnboardingRoute><ProjectDetail /></BlockOnboardingRoute></ModuleGuard>} />
          <Route path="projects/:id/documents" element={<ModuleGuard module="projects"><BlockOnboardingRoute><ProjectDocuments /></BlockOnboardingRoute></ModuleGuard>} />
          <Route path="projects/:id/roadmap" element={<ModuleGuard module="projects"><BlockOnboardingRoute><ProjectRoadmap /></BlockOnboardingRoute></ModuleGuard>} />
          <Route path="surveys" element={<ModuleGuard module="surveys"><ProtectedRoute><Surveys /></ProtectedRoute></ModuleGuard>} />
          <Route path="surveys/:id" element={<ModuleGuard module="surveys"><ProtectedRoute><SurveyPage /></ProtectedRoute></ModuleGuard>} />
          <Route path="onboarding" element={<ModuleGuard module="onboarding"><OnboardingRoute><Onboarding /></OnboardingRoute></ModuleGuard>} />
          <Route path="hr" element={<HRRoute><HRPanel /></HRRoute>} />
          <Route path="hr/onboarding/:id" element={<ModuleGuard module="onboarding"><HRRoute><HROnboarding /></HRRoute></ModuleGuard>} />
          <Route path="leader/timesheet" element={<ModuleGuard module="timesheet"><ManagerRoute><ManagerTimesheet /></ManagerRoute></ModuleGuard>} />
          <Route path="admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
