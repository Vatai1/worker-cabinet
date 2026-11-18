import { test as base, expect, type Page } from '@playwright/test'
import { World, API } from '../vacation/fixtures'
import type { TimesheetDetails } from '../../shared/components/timesheet/TimesheetGrid'

interface Scenario {
  world: World
  sheet: TimesheetDetails
  today: string
  department: string
  open: (page: Page, role: 'mgr' | 'hr' | 'worker' | 'leave', path?: string) => Promise<void>
}

export const test = base.extend<{ scenario: Scenario }>({
  scenario: async ({ page }, use, info) => {
    const world = new World(`ts-${Date.now()}-${info.retry}`, 1)
    const department = `E2E Табель ${world.ns}`
    let today = ''
    let original: { day: string; kind: string; description: string | null } | undefined
    try {
      await world.init()
      await world.ensureDepartment('dept', department)
      await world.ensureUser('mgr', { lastName: 'Табельников', firstName: 'Антон', role: 'manager', department: 'dept' })
      await world.ensureUser('worker', { lastName: 'Почасовой', firstName: 'Иван', role: 'employee', department: 'dept' })
      await world.ensureUser('leave', { lastName: 'Отпусков', firstName: 'Пётр', role: 'employee', department: 'dept' })
      await world.ensureUser('hr', { lastName: 'Кадрова', firstName: 'Анна', role: 'hr' })
      await world.setDepartment('dept', { manager_id: world.users.mgr.id })
      const now = new Date()
      const created = await world.ok<{ id: number }>('POST', '/timesheet', { department_id: world.departments.dept, year: now.getFullYear(), month: now.getMonth() + 1 }, world.users.mgr.token)
      const sheet = await world.ok<TimesheetDetails>('GET', `/timesheet/${created.id}`, undefined, world.users.mgr.token)
      today = sheet.today
      const calendar = await world.ok<{ days: { day: string; kind: string; description: string | null }[] }>('GET', `/vacation/production-calendar?year=${sheet.year}`)
      original = calendar.days.find(day => day.day === today)
      await world.ok('PUT', `/vacation/production-calendar/${today}`, { kind: 'shortened', description: 'E2E табель: рабочий день' })
      const open: Scenario['open'] = async (target, role, path) => {
        await world.loginPage(target, role)
        await target.goto(path ?? (role === 'hr' ? '/hr?tab=timesheet' : '/leader/timesheet'))
        const intro = target.getByRole('button', { name: 'Понятно', exact: true })
        if (await intro.isVisible()) await intro.click()
        if (role === 'hr') {
          await target.getByRole('combobox', { name: 'Отдел', exact: true }).selectOption(String(world.departments.dept))
          await expect(target.getByRole('combobox', { name: 'Версия табеля', exact: true })).toHaveValue(String(sheet.id))
        }
      }
      await world.loginPage(page, 'mgr')
      await use({ world, sheet, today, department, open })
    } finally {
      if (today && world.adminToken) {
        if (original) await world.call('PUT', `/vacation/production-calendar/${today}`, { kind: original.kind, description: original.description })
        else await world.call('DELETE', `/vacation/production-calendar/${today}`)
      }
      if (world.api) {
        const changes = Object.values(world.users).map(user => ({ employee_id: user.id, staff_number: null, hourly: false }))
        if (changes.length) await world.call('PUT', '/timesheet/employees/settings', changes)
        await world.teardown()
      }
    }
  },
})

export { expect, API }
