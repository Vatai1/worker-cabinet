import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Login } from '@/pages/Login'
import { Layout } from '@/components/layout/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { Profile } from '@/pages/Profile'
import { ThemeProvider } from '@/components/ThemeProvider'
import { NotificationLoader } from '@/components/NotificationLoader'

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
import { Settings } from '@/pages/Settings'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  console.log('[App] ProtectedRoute - isAuthenticated:', isAuthenticated)

  if (!isAuthenticated) {
    console.log('[App] Redirecting to login')
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function App() {
  const user = useAuthStore((state) => state.user)

  console.log('[App] User:', user ? `${user.firstName} ${user.lastName} (${user.role})` : 'null')

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
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />

          <Route path="requests" element={<Requests />} />
          <Route path="documents" element={<Documents />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="employees/:id" element={<EmployeeProfile />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="projects/:id/documents" element={<ProjectDocuments />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
