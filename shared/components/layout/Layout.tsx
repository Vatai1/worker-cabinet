import { Outlet } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { AppBanner } from '@/shared/components/AppBanner'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { ModelsModal } from '@/core/admin/components/ModelsModal'
import { ImpersonationBanner } from '@/shared/components/TestSwitcher'

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden gradient-bg">
      <ImpersonationBanner />
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden lg:ml-[288px]">
        <div className="sticky top-0 z-30">
          <AppBanner />
          <Header />
        </div>
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
