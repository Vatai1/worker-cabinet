import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TimesheetEmployees } from '@/modules/timesheet/components/TimesheetEmployees'
import { apiGet, apiPut } from '@/shared/lib/apiClient'
import { EMPLOYEE_SETTINGS } from './fixtures'

vi.mock('@/shared/lib/apiClient')

beforeEach(() => {
  vi.mocked(apiGet).mockResolvedValue(EMPLOYEE_SETTINGS)
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('Настройки сотрудников табеля', () => {
  it('находит сотрудника по второму номеру и применяет массовое действие только к выбранным строкам', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    vi.mocked(apiPut).mockResolvedValue({
      updated: [{ employee_id: 1, hourly: false, staff_number: '0012', staff_numbers: ['0012', '0047'] }],
    })
    render(<TimesheetEmployees onSaved={onSaved} />)
    await screen.findByRole('rowheader', { name: /Иванов Алексей/ })

    await user.type(screen.getByPlaceholderText('Поиск по ФИО, должности или табельному номеру'), '0047')
    expect(screen.queryByRole('rowheader', { name: /Соколова Мария/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Выбрать всех показанных сотрудников' }))
    await user.click(screen.getByRole('button', { name: 'Отключить почасовой учёт' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить изменения (1)' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(apiPut).toHaveBeenCalledExactlyOnceWith('/timesheet/employees/settings', [{ employee_id: 1, hourly: false }])
    expect(screen.getByRole('checkbox', { name: 'Почасовой учёт — Иванов Алексей' })).not.toBeChecked()
  })

  it('показывает конфликт номера, сохраняет введённое значение и позволяет исправить его', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    vi.mocked(apiPut)
      .mockRejectedValueOnce(new Error('Табельный номер уже занят'))
      .mockResolvedValueOnce({ updated: [{ employee_id: 2, hourly: false, staff_number: '0035', staff_numbers: ['0035', '0091'] }] })
    render(<TimesheetEmployees onSaved={onSaved} />)

    await user.click(await screen.findByRole('button', { name: 'Добавить табельный номер — Соколова Мария' }))
    const number = screen.getByRole('textbox', { name: 'Табельный номер 2 — Соколова Мария' })
    await user.type(number, '0047')
    await user.click(screen.getByRole('button', { name: 'Сохранить изменения (1)' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Табельный номер уже занят')
    expect(number).toHaveValue('0047')
    expect(onSaved).not.toHaveBeenCalled()

    await user.clear(number)
    await user.type(number, ' 0091 ')
    await user.click(screen.getByRole('button', { name: 'Сохранить изменения (1)' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(apiPut).toHaveBeenLastCalledWith('/timesheet/employees/settings', [{ employee_id: 2, staff_numbers: ['0035', '0091'] }])
    expect(number).toHaveValue('0091')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
