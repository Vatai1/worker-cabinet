import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TimesheetGrid } from '@/shared/components/timesheet/TimesheetGrid'
import { apiPost } from '@/shared/lib/apiClient'
import { makeTimesheet, TIMESHEET_DATE } from './fixtures'

vi.mock('@/shared/lib/apiClient')

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('Сетка табеля', () => {
  it('сохраняет разные отметки для двух номеров и оставляет автоматический отпуск', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    vi.mocked(apiPost).mockResolvedValue({})
    render(<TimesheetGrid sheet={makeTimesheet()} selectedDate={TIMESHEET_DATE} editable onSaved={onSaved} />)

    const vacationRow = screen.getByRole('row', { name: /Соколова Мария/ })
    expect(within(vacationRow).getByText('О', { exact: true })).toBeVisible()
    expect(within(vacationRow).queryByRole('combobox')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Явка всем с обычным учётом' }))
    await user.click(screen.getByRole('button', { name: 'Указать часы — Иванов Алексей · 0012' }))
    const hours = screen.getByRole('spinbutton', { name: `Часы за ${TIMESHEET_DATE} — Иванов Алексей · 0012` })
    expect(hours).toHaveFocus()
    await user.type(hours, '8')
    const minutes = screen.getByRole('spinbutton', { name: `Минуты за ${TIMESHEET_DATE} — Иванов Алексей · 0012` })
    await user.clear(minutes)
    await user.type(minutes, '5')

    await user.click(screen.getByRole('combobox', { name: `Отметка за ${TIMESHEET_DATE} — Иванов Алексей · 0047` }))
    await user.click(screen.getByRole('option', { name: /^НН —/ }))
    await user.click(screen.getByRole('button', { name: 'Отправить на проверку' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(apiPost).toHaveBeenCalledExactlyOnceWith(`/timesheet/42/days/${TIMESHEET_DATE}/submit`, {
      entries: [
        { employee_id: 1, staff_number: '0012', date: TIMESHEET_DATE, code: 'Я', minutes: 485 },
        { employee_id: 1, staff_number: '0047', date: TIMESHEET_DATE, code: 'НН', minutes: null },
        { employee_id: 3, staff_number: '0054', date: TIMESHEET_DATE, code: 'Я', minutes: null },
      ],
    })
  })

  it('показывает отправленные отметки без полей редактирования', () => {
    const sheet = makeTimesheet()
    sheet.days.push({ date: TIMESHEET_DATE, status: 'submitted', revision: 1, employee_ids: [1, 2, 3], staff_rows: sheet.current_staff_rows, reason: null })
    sheet.entries.push({ employee_id: 1, staff_number: '0012', date: TIMESHEET_DATE, code: 'Я', minutes: 485 })
    render(<TimesheetGrid sheet={sheet} selectedDate={TIMESHEET_DATE} />)

    const row = screen.getByRole('row', { name: /Иванов Алексей.*0012/ })
    expect(within(row).getAllByText('8:05')).toHaveLength(1)
    expect(screen.getByLabelText('На проверке у HR')).toBeVisible()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отправить на проверку' })).not.toBeInTheDocument()
  })
})
