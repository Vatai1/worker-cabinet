import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { Login } from '@/pages/Login'
import { Layout } from '@/components/layout/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { Profile } from '@/pages/Profile'
import { ThemeProvider } from '@/components/ThemeProvider'
import { Requests } from '@/pages/Requests'
import { Documents } from '@/pages/Documents'
import { DocumentTemplates } from '@/pages/DocumentTemplates'
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
import { HRDocumentTemplates } from '@/pages/HRDocumentTemplates'

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
                to={user?.role === 'manager' ? '/leader' : '/dashboard'}
                replace
              />
            }
          />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="leader" element={<LeaderDashboard />} />
          <Route path="manager" element={<ManagerDashboard />} />
          <Route path="vacation" element={<Vacation />} />
<Route path="employees" element={<Employees />} />
          <Route path="departments" element={<Departments />} />
          <Route path="departments/:id" element={<DepartmentDetail />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />

          <Route path="requests" element={<Requests />} />
          <Route path="documents" element={<Documents />} />
          <Route path="document-templates" element={<DocumentTemplates />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="employees/:id" element={<EmployeeProfile />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="projects/:id/documents" element={<ProjectDocuments />} />
          <Route path="projects/:id/roadmap" element={<ProjectRoadmap />} />
          <Route path="hr/document-templates" element={<HRRoute><HRDocumentTemplates /></HRRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
