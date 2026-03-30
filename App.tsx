import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, lazy, Suspense, Component, type ReactNode } from 'react'

class PageErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) { return { error: e.message } }
  render() {
    if (this.state.error) return (
      <div className="p-8 text-destructive text-sm">Ошибка загрузки страницы: {this.state.error}</div>
    )
    return this.props.children
  }
}
import { useAuthStore } from '@/store/authStore'
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
import { HRSurveys } from '@/pages/HRSurveys'
import { Surveys } from '@/pages/Surveys'
import { SurveyPage } from '@/pages/SurveyPage'
import { Onboarding } from '@/pages/Onboarding'
import { HROnboarding } from '@/pages/HROnboarding'
import { HRVacationCalendar } from '@/pages/HRVacationCalendar'
import { HRDictionaries } from '@/pages/HRDictionaries'
const HRHierarchy = lazy(() => import('@/pages/HRHierarchy').then(m => ({ default: m.HRHierarchy })))

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
          <Route path="vacation" element={<BlockOnboardingRoute><Vacation /></BlockOnboardingRoute>} />
          <Route path="employees" element={<Employees />} />
          <Route path="departments" element={<Departments />} />
          <Route path="departments/:id" element={<DepartmentDetail />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />

          <Route path="requests" element={<BlockOnboardingRoute><Requests /></BlockOnboardingRoute>} />
          <Route path="documents" element={<BlockOnboardingRoute><Documents /></BlockOnboardingRoute>} />
          <Route path="notifications" element={<BlockOnboardingRoute><Notifications /></BlockOnboardingRoute>} />
          <Route path="employees/:id" element={<EmployeeProfile />} />
          <Route path="projects" element={<BlockOnboardingRoute><Projects /></BlockOnboardingRoute>} />
          <Route path="projects/:id" element={<BlockOnboardingRoute><ProjectDetail /></BlockOnboardingRoute>} />
          <Route path="projects/:id/documents" element={<BlockOnboardingRoute><ProjectDocuments /></BlockOnboardingRoute>} />
          <Route path="projects/:id/roadmap" element={<BlockOnboardingRoute><ProjectRoadmap /></BlockOnboardingRoute>} />
          <Route path="hr/surveys" element={<HRRoute><HRSurveys /></HRRoute>} />
          <Route path="surveys" element={<ProtectedRoute><Surveys /></ProtectedRoute>} />
          <Route path="surveys/:id" element={<ProtectedRoute><SurveyPage /></ProtectedRoute>} />
          <Route path="onboarding" element={<OnboardingRoute><Onboarding /></OnboardingRoute>} />
          <Route path="hr/onboarding" element={<HRRoute><HROnboarding /></HRRoute>} />
          <Route path="hr/onboarding/:id" element={<HRRoute><HROnboarding /></HRRoute>} />
          <Route path="hr/vacation-calendar" element={<HRRoute><HRVacationCalendar /></HRRoute>} />
          <Route path="hr/hierarchy" element={<HRRoute><PageErrorBoundary><Suspense fallback={<div className="p-8 text-muted-foreground">Загрузка...</div>}><HRHierarchy /></Suspense></PageErrorBoundary></HRRoute>} />
          <Route path="hr/dictionaries" element={<HRRoute><HRDictionaries /></HRRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
