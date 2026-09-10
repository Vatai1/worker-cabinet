import { Outlet } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { ModelsModal } from '@/core/admin/components/ModelsModal'

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden gradient-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden lg:ml-[288px]">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-6 lg:p-12">
            <Outlet />
          </div>
        </main>
      </div>
      <Toaster position="top-right" richColors closeButton />
      <ConfirmDialog />
      <ModelsModal />
    </div>
  )
}
