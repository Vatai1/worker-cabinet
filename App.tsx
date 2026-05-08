import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useModulesStore } from '@/store/modulesStore'
import { Login } from '@/pages/Login'
import { Layout } from '@/components/layout/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { Profile } from '@/pages/Profile'
import { ThemeProvider } from '@/components/ThemeProvider'
import { Requests } from '@/pages/Requests'
import { Documents } from '@/pages/Documents'
import { Notifications } from '@/pages/Notifications'
import { ManagerDashboard } from '@/pages/ManagerDashboard'
import { LeaderDashboard } from '@/pages/LeaderDashboard'
import { Vacation } from '@/pages/Vacation'
import { Employees } from '@/pages/Employees'
import { EmployeeProfile } from '@/pages/EmployeeProfile'
import { Projects } from '@/pages/Projects'
import { ProjectDetail } from '@/pages/ProjectDetail'
import { ProjectDocuments } from '@/pages/ProjectDocuments'
import { ProjectRoadmap } from '@/pages/ProjectRoadmap'
import { Settings } from '@/pages/Settings'
import { Departments } from '@/pages/Departments'
import { DepartmentDetail } from '@/pages/DepartmentDetail'
import { Surveys } from '@/pages/Surveys'
import { SurveyPage } from '@/pages/SurveyPage'
import { Onboarding } from '@/pages/Onboarding'
import { HROnboarding } from '@/pages/HROnboarding'
import { ManagerTimesheet } from '@/pages/ManagerTimesheet'
import { CalendarPage } from '@/pages/CalendarPage'
import { AdminPanel } from '@/pages/AdminPanel'
import { AdminAnalytics } from '@/pages/AdminAnalytics'
import { HRPanel } from '@/pages/HRPanel'

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
  const isModuleEnabled = useModulesStore((s) => s.isModuleEnabled)
  if (!isModuleEnabled(module)) return <Navigate to="/dashboard" replace />
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

          <Route path="requests" element={<BlockOnboardingRoute><Requests /></BlockOnboardingRoute>} />
          <Route path="documents" element={<ModuleGuard module="documents"><BlockOnboardingRoute><Documents /></BlockOnboardingRoute></ModuleGuard>} />
          <Route path="notifications" element={<ModuleGuard module="notifications"><BlockOnboardingRoute><Notifications /></BlockOnboardingRoute></ModuleGuard>} />
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
          <Route path="admin/analytics" element={<AdminRoute><AdminAnalytics /></AdminRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
