import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Login } from '@/pages/Login'
import { Layout } from '@/components/layout/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { Profile } from '@/pages/Profile'
import { Schedule } from '@/pages/Schedule'
import { Requests } from '@/pages/Requests'
import { Documents } from '@/pages/Documents'
import { Notifications } from '@/pages/Notifications'
import { ManagerDashboard } from '@/pages/ManagerDashboard'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  return <>{children}</>
}

function App() {
  const user = useAuthStore((state) => state.user)

  return (
    <BrowserRouter>
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
                to={user?.role === 'manager' ? '/manager' : '/dashboard'} 
                replace 
              />
            } 
          />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="manager" element={<ManagerDashboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="requests" element={<Requests />} />
          <Route path="documents" element={<Documents />} />
          <Route path="notifications" element={<Notifications />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
