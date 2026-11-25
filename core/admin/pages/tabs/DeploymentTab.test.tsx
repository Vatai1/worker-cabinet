import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeploymentTab } from './DeploymentTab'
import { apiGet, apiPatch, apiPost } from '@/shared/lib/apiClient'

vi.mock('@/shared/lib/apiClient', () => ({ apiGet: vi.fn(), apiPatch: vi.fn(), apiPost: vi.fn() }))

const release = { version: '2.4.62', commit: 'abcdef0', frontend: 'frontend@sha256:abc', backend: 'backend@sha256:def' }
const fixture = () => ({ settings: { enabled: true, frontend_url: 'https://example.ru', backend_health_url: 'http://backend:5000/api/health', health_timeout_seconds: 180 }, online: true, observed: {}, catalog_error: null, host_error: null, releases: [release], jobs: [] as unknown[] })
const recovery = { id: '12345678-1234-1234-1234-123456789abc', release, status: 'recovery_required', events: [{ stage: 'migrate', status: 'failed', message: 'Ошибка миграции', at: '2026-11-25T03:00:00Z' }], before_state: {}, after_state: {}, backup: 'backup.dump', resolution_requested: false, initiated_by: 1, created_at: '2026-11-25T03:00:00Z' }

beforeEach(() => { vi.mocked(apiGet).mockResolvedValue(fixture()); vi.mocked(apiPost).mockResolvedValue(undefined); vi.mocked(apiPatch).mockResolvedValue(undefined) })
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Обновление системы', () => {
  it('требует выбора релиза и подтверждения перед постановкой задания', async () => {
    const user = userEvent.setup()
    render(<DeploymentTab />)
    const start = await screen.findByRole('button', { name: 'Обновить прод' })
    expect((start as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole('combobox', { name: 'Версия для обоих серверов' }))
    await user.click(screen.getByRole('option', { name: '2.4.62 · abcdef0' }))
    await user.click(start)
    expect(apiPost).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Подтвердить обновление' }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/admin/deployment/jobs', { version: '2.4.62' }))
  })

  it('после открытия страницы восстанавливает активное задание с сервера и блокирует повторный запуск', async () => {
    vi.mocked(apiGet).mockResolvedValue({ ...fixture(), jobs: [{ ...recovery, status: 'running' }] })
    render(<DeploymentTab />)
    await screen.findByText('Обновление выполняется · 2.4.62')
    expect((screen.getByRole('button', { name: 'Обновить прод' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Сохранить настройки' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('не разрешает восстановление без подтверждения ручной проверки БД', async () => {
    const user = userEvent.setup()
    vi.mocked(apiGet).mockResolvedValue({ ...fixture(), jobs: [recovery] })
    render(<DeploymentTab />)
    const button = await screen.findByRole('button', { name: 'Проверить восстановление' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByLabelText('Я проверил схему и данные БД, приложение совместимо с ней'))
    await user.click(button)
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith(`/admin/deployment/jobs/${recovery.id}/recover`, { database_checked: true }))
  })

  it('не разрешает запуск при недоступном сервисе', async () => {
    vi.mocked(apiGet).mockResolvedValue({ ...fixture(), online: false })
    render(<DeploymentTab />)
    await screen.findByText('Сервис деплоя не подключён. Для запуска нужна первоначальная настройка на серверах.')
    expect((screen.getByRole('button', { name: 'Обновить прод' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
