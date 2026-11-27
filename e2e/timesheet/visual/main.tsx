import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HRTimesheet } from '@/modules/timesheet/pages/HRTimesheet'
import { ManagerTimesheet } from '@/modules/timesheet/pages/ManagerTimesheet'
import '@/index.css'

const params = new URLSearchParams(window.location.search)
const root = document.getElementById('root')!

document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
root.style.padding = '1rem'

createRoot(root).render(
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    {params.get('role') === 'hr' ? <HRTimesheet /> : <ManagerTimesheet />}
  </BrowserRouter>,
)
