import { test, expect } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

test('проверка подключения к API', async ({ request }) => {
  const res = await request.post('http://localhost:5000/api/auth/login', {
    data: { email: 'ivanov@example.com', password: 'password123' },
  })

  if (!res.ok()) {
    const body = await res.json()
    throw new Error(
      `Тестовый пользователь не существует или API недоступен.\n` +
      `Статус: ${res.status()}\n` +
      `Ответ: ${JSON.stringify(body)}\n\n` +
      `Запустите: cd backend && npm run seed`
    )
  }

  expect(res.ok()).toBeTruthy()
})
