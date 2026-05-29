import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden gradient-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden lg:ml-[272px]">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl p-6 lg:p-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
