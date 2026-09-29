import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'
import { useAuthStore } from '@/core/auth/store/authStore'
import { useModulesStore } from '@/shared/store/modulesStore'
import { useOrgStore } from '@/shared/store/orgStore'
import { useSessionActivity } from '@/core/auth/hooks/useSessionActivity'
import { hasAnyRole, isSuperAdmin } from '@/shared/lib/permissions'
import { Login } from '@/core/auth/pages/Login'
import { Layout } from '@/shared/components/layout/Layout'
import { Dashboard } from '@/shared/pages/Dashboard'
import { ThemeProvider } from '@/shared/components/ThemeProvider'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'

const Requests = lazy(() => import('@/modules/requests/pages/Requests').then(m => ({ default: m.Requests })))
const Documents = lazy(() => import('@/modules/documents/pages/Documents').then(m => ({ default: m.Documents })))
const Vacation = lazy(() => import('@/modules/vacation/pages/Vacation').then(m => ({ default: m.Vacation })))
const VacationApplicationPage = lazy(() => import('@/modules/vacation/pages/VacationApplicationPage').then(m => ({ default: m.VacationApplicationPage })))
const VacationTransferApplicationPage = lazy(() => import('@/modules/vacation/pages/VacationTransferApplicationPage').then(m => ({ default: m.VacationTransferApplicationPage })))
const MyHierarchy = lazy(() => import('@/modules/hierarchy/pages/MyHierarchy').then(m => ({ default: m.MyHierarchy })))
const Employees = lazy(() => import('@/core/employees/pages/Employees').then(m => ({ default: m.Employees })))
const EmployeeProfile = lazy(() => import('@/core/employees/pages/EmployeeProfile').then(m => ({ default: m.EmployeeProfile })))
const Projects = lazy(() => import('@/modules/projects/pages/Projects').then(m => ({ default: m.Projects })))
const ProjectDetail = lazy(() => import('@/modules/projects/pages/ProjectDetail').then(m => ({ default: m.ProjectDetail })))
const ProjectDocuments = lazy(() => import('@/modules/projects/pages/ProjectDocuments').then(m => ({ default: m.ProjectDocuments })))
const ProjectRoadmap = lazy(() => import('@/modules/projects/pages/ProjectRoadmap').then(m => ({ default: m.ProjectRoadmap })))
const Settings = lazy(() => import('@/core/settings/pages/Settings').then(m => ({ default: m.Settings })))
const Departments = lazy(() => import('@/modules/departments/pages/Departments').then(m => ({ default: m.Departments })))
const DepartmentDetail = lazy(() => import('@/modules/departments/pages/DepartmentDetail').then(m => ({ default: m.DepartmentDetail })))
const Surveys = lazy(() => import('@/modules/surveys/pages/Surveys').then(m => ({ default: m.Surveys })))
const SurveyPage = lazy(() => import('@/modules/surveys/pages/SurveyPage').then(m => ({ default: m.SurveyPage })))
const Onboarding = lazy(() => import('@/modules/onboarding/pages/Onboarding').then(m => ({ default: m.Onboarding })))
const HROnboarding = lazy(() => import('@/modules/onboarding/pages/HROnboarding').then(m => ({ default: m.HROnboarding })))
const HRDocTemplateNew = lazy(() => import('@/modules/documents/pages/HRDocTemplateNew').then(m => ({ default: m.HRDocTemplateNew })))
const ManagerTimesheet = lazy(() => import('@/modules/timesheet/pages/ManagerTimesheet').then(m => ({ default: m.ManagerTimesheet })))
const CalendarPage = lazy(() => import('@/modules/calendar/pages/CalendarPage').then(m => ({ default: m.CalendarPage })))
const Notifications = lazy(() => import('@/modules/notifications/pages/Notifications').then(m => ({ default: m.Notifications })))
const AdminPanel = lazy(() => import('@/core/admin/pages/AdminPanel').then(m => ({ default: m.AdminPanel })))
const HRPanel = lazy(() => import('@/shared/pages/HRPanel').then(m => ({ default: m.HRPanel })))
const SearchPage = lazy(() => import('@/shared/pages/SearchPage').then(m => ({ default: m.SearchPage })))
const Assistant = lazy(() => import('@/modules/assistant/pages/Assistant').then(m => ({ default: m.Assistant })))

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const loading = useAuthStore((state) => state.loading)
  const role = useAuthStore((state) => state.user?.role)
  const { organizations, currentOrgId } = useOrgStore()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (role !== 'superadmin' && organizations.length > 0 && !currentOrgId) {
    return <PageLoader />
  }

  return <>{children}</>
}

function HRRoute({ children }: { children: React.ReactNode }) {
  const loading = useAuthStore((state) => state.loading)
  if (loading) return <PageLoader />
  if (!hasAnyRole('hr', 'admin'))
    return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function ManagerRoute({ children }: { children: React.ReactNode }) {
  const loading = useAuthStore((state) => state.loading)
  if (loading) return <PageLoader />
  if (!hasAnyRole('manager'))
    return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function OnboardingRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const loading = useAuthStore((state) => state.loading)
  if (loading) return <PageLoader />
  if (user?.role !== 'onboarding') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function BlockOnboardingRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const loading = useAuthStore((state) => state.loading)
  if (loading) return <PageLoader />
  if (user?.role === 'onboarding') return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const loading = useAuthStore((state) => state.loading)
  if (loading) return <PageLoader />
  if (!hasAnyRole('admin')) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const loading = useAuthStore((state) => state.loading)
  if (loading) return <PageLoader />
  if (!isSuperAdmin()) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function AdminRedirect() {
  if (isSuperAdmin()) return <Navigate to="/admin/global" replace />
  return <Navigate to="/admin/org" replace />
}

function ProfileRedirect() {
  const user = useAuthStore((state) => state.user)
  return <Navigate to={user ? `/employees/${user.id}` : '/dashboard'} replace />
}

function ModuleGuard({ module, children }: { module: string; children: React.ReactNode }) {
  const loaded = useModulesStore((s) => s.loaded)
  const enabledModules = useModulesStore((s) => s.enabledModules)

  if (!loaded) return <PageLoader />

  if (!enabledModules.has(module)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function App() {
  const checkAuth = useAuthStore((state) => state.checkAuth)

  useSessionActivity()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <Suspense fallback={<PageLoader />}>
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
                    <Navigate to="/dashboard" replace />
                  }
                />
                <Route path="dashboard" element={<BlockOnboardingRoute><Dashboard /></BlockOnboardingRoute>} />
                <Route path="leader" element={<Navigate to="/dashboard" replace />} />
                <Route path="manager" element={<Navigate to="/dashboard" replace />} />
                <Route path="vacation" element={<ModuleGuard module="vacation"><BlockOnboardingRoute><Vacation /></BlockOnboardingRoute></ModuleGuard>} />
                <Route path="vacation/application" element={<ModuleGuard module="vacation"><BlockOnboardingRoute><VacationApplicationPage /></BlockOnboardingRoute></ModuleGuard>} />
                <Route path="vacation/transfer-application" element={<ModuleGuard module="vacation"><BlockOnboardingRoute><VacationTransferApplicationPage /></BlockOnboardingRoute></ModuleGuard>} />
                <Route path="vacation/my-substitutions" element={<ModuleGuard module="vacation"><BlockOnboardingRoute><Vacation /></BlockOnboardingRoute></ModuleGuard>} />
                <Route path="my-hierarchy" element={<BlockOnboardingRoute><MyHierarchy /></BlockOnboardingRoute>} />
                <Route path="employees" element={<Employees />} />
                <Route path="departments" element={<Departments />} />
                <Route path="departments/:id" element={<DepartmentDetail />} />
                <Route path="profile" element={<ProfileRedirect />} />
                <Route path="settings" element={<Settings />} />
                <Route path="notifications" element={<ModuleGuard module="notifications"><BlockOnboardingRoute><Notifications /></BlockOnboardingRoute></ModuleGuard>} />
                <Route path="requests" element={<BlockOnboardingRoute><Requests /></BlockOnboardingRoute>} />
                <Route path="search" element={<BlockOnboardingRoute><SearchPage /></BlockOnboardingRoute>} />
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
                <Route path="hr/doc-templates/new" element={<ModuleGuard module="documents"><HRRoute><HRDocTemplateNew /></HRRoute></ModuleGuard>} />
                <Route path="leader/timesheet" element={<ModuleGuard module="timesheet"><ManagerRoute><ManagerTimesheet /></ManagerRoute></ModuleGuard>} />
                <Route path="admin/global" element={<SuperAdminRoute><AdminPanel mode="global" /></SuperAdminRoute>} />
                <Route path="admin/org" element={<AdminRoute><AdminPanel mode="org" /></AdminRoute>} />
                <Route path="admin" element={<AdminRedirect />} />
                <Route path="assistant" element={<ModuleGuard module="assistant"><BlockOnboardingRoute><Assistant /></BlockOnboardingRoute></ModuleGuard>} />
              </Route>
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
