import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { BASE, login, headers, headersJSON } from './helpers.js'

const ORG = { 'X-Organization-Id': '1' }
let adminToken, hrToken, employeeToken

async function call(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...headersJSON(token), ...ORG },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}

const invNumber = () => `INV-TEST-${Date.now()}-${Math.floor(Math.random() * 1000)}`

describe('Инвентаризация', () => {
  let armId, furnitureId, customSectionId, itemId, assignedItemId, employeeId

  before(async () => {
    adminToken = await login('admin@example.com')
    hrToken = await login('elena@example.com')
    employeeToken = await login('ivanov@example.com')

    const sections = await (await fetch(`${BASE}/inventory/sections`, { headers: { ...headers(hrToken), ...ORG } })).json()
    armId = sections.find((s) => s.code === 'arm')?.id
    furnitureId = sections.find((s) => s.code === 'furniture')?.id

    const usersRes = await fetch(`${BASE}/users`, { headers: { ...headers(hrToken), ...ORG } })
    const users = await usersRes.json()
    employeeId = (Array.isArray(users) ? users : users.users ?? []).find((u) => u.email === 'ivanov@example.com')?.id
  })

  it('GET /inventory/sections — преднастроенные разделы со схемами полей', async () => {
    const { status, data } = await call('GET', '/inventory/sections', null, employeeToken)
    assert.strictEqual(status, 200)
    assert.ok(Array.isArray(data))
    assert.ok(data.length >= 6, 'сеяные разделы должны присутствовать')
    assert.ok(data.every((s) => typeof s.items_count === 'number'))
    const arm = data.find((s) => s.code === 'arm')
    assert.ok(arm, 'раздел АРМ должен быть')
    assert.ok(arm.field_schema.length >= 5, 'у АРМ должны быть поля')
    const typeField = arm.field_schema.find((f) => f.key === 'type')
    assert.strictEqual(typeField.type, 'select')
    assert.ok(typeField.options.includes('Ноутбук'))
    assert.strictEqual(typeField.required, true)
  })

  it('POST /inventory/sections — employee получает 403', async () => {
    const { status } = await call('POST', '/inventory/sections', { name: 'Запрещённый' }, employeeToken)
    assert.strictEqual(status, 403)
  })

  it('POST /inventory/sections — конструктор создаёт раздел с полями', async () => {
    const { status, data } = await call('POST', '/inventory/sections', {
      name: `Транспорт ${Date.now()}`,
      description: 'Служебный транспорт',
      sort_order: 70,
      fields: [
        { label: 'Марка', type: 'text', required: true },
        { label: 'Год выпуска', type: 'number', unit: 'г.' },
        { label: 'Топливо', type: 'select', options: ['Бензин', 'Дизель', 'Электро'] },
        { label: 'На ходу', type: 'checkbox' },
        { label: 'ТО до', type: 'date' }
      ]
    }, hrToken)
    assert.strictEqual(status, 201)
    assert.strictEqual(data.field_schema.length, 5)
    const markField = data.field_schema[0]
    assert.strictEqual(markField.label, 'Марка')
    assert.strictEqual(markField.required, true)
    assert.ok(markField.key, 'ключ генерируется автоматически')
    const fuelField = data.field_schema.find((f) => f.label === 'Топливо')
    assert.deepStrictEqual(fuelField.options, ['Бензин', 'Дизель', 'Электро'])
    assert.strictEqual(data.field_schema.find((f) => f.label === 'На ходу').type, 'checkbox')
    customSectionId = data.id
  })

  it('PUT /inventory/sections/:id — схема полей заменяется целиком', async () => {
    const { status, data } = await call('PUT', `/inventory/sections/${customSectionId}`, {
      name: `Транспорт ${Date.now()}`,
      description: 'Обновлено',
      fields: [
        { label: 'Госномер', type: 'text', required: true },
        { label: 'Пробег', type: 'number', unit: 'км' }
      ]
    }, hrToken)
    assert.strictEqual(status, 200)
    assert.strictEqual(data.field_schema.length, 2)
    assert.strictEqual(data.field_schema[0].label, 'Госномер')
    assert.strictEqual(data.field_schema[1].type, 'number')
  })

  it('POST /inventory/sections — поле без названия отклоняется', async () => {
    const { status } = await call('POST', '/inventory/sections', { name: 'Плохой', fields: [{ type: 'text' }] }, hrToken)
    assert.strictEqual(status, 400)
  })

  it('POST /inventory/items — валидация обязательных полей', async () => {
    const { status } = await call('POST', '/inventory/items', { name: '' }, hrToken)
    assert.strictEqual(status, 400)
  })

  it('POST /inventory/items — employee получает 403', async () => {
    const { status } = await call('POST', '/inventory/items', { name: 'Ноутбук', inventory_number: invNumber() }, employeeToken)
    assert.strictEqual(status, 403)
  })

  it('POST /inventory/items — позиция в АРМ с характеристиками', async () => {
    const { status, data } = await call('POST', '/inventory/items', {
      name: 'Ноутбук Lenovo ThinkPad',
      inventory_number: invNumber(),
      section_id: armId,
      serial_number: 'SN-INV-001',
      condition: 'new',
      location: 'Каб. 305',
      cost: 85000,
      field_values: { type: 'Ноутбук', os: 'Windows 11 Pro', ip: '10.0.0.15', ram: '16 ГБ' }
    }, hrToken)
    assert.strictEqual(status, 201)
    assert.strictEqual(data.status, 'in_stock')
    assert.strictEqual(data.field_values.type, 'Ноутбук')
    assert.strictEqual(data.field_values.os, 'Windows 11 Pro')
    itemId = data.id
  })

  it('POST /inventory/items — обязательное поле раздела отсутствует', async () => {
    const { status, data } = await call('POST', '/inventory/items', {
      name: 'Монитор без типа', inventory_number: invNumber(), section_id: armId
    }, hrToken)
    assert.strictEqual(status, 400)
    assert.match(data.error, /Тип/)
  })

  it('POST /inventory/items — недопустимый вариант списка отклоняется', async () => {
    const { status } = await call('POST', '/inventory/items', {
      name: 'Взлом', inventory_number: invNumber(), section_id: armId, field_values: { type: 'Кванто-компьютер' }
    }, hrToken)
    assert.strictEqual(status, 400)
  })

  it('POST /inventory/items — неизвестное поле отклоняется', async () => {
    const { status } = await call('POST', '/inventory/items', {
      name: 'Лишнее поле', inventory_number: invNumber(), section_id: armId,
      field_values: { type: 'Ноутбук', hack: 'x' }
    }, hrToken)
    assert.strictEqual(status, 400)
  })

  it('POST /inventory/items — числовое поле проверяется', async () => {
    const { status } = await call('POST', '/inventory/items', {
      name: 'Не число', inventory_number: invNumber(), section_id: customSectionId,
      field_values: { 'Госномер': 'А123ВС', 'Пробег': 'много' }
    }, hrToken)
    assert.strictEqual(status, 400)
  })

  it('POST /inventory/items — дубликат инвентарного номера отклоняется', async () => {
    const dup = invNumber()
    const first = await call('POST', '/inventory/items', { name: 'Первый', inventory_number: dup, section_id: furnitureId, field_values: {} }, hrToken)
    assert.strictEqual(first.status, 201)
    const second = await call('POST', '/inventory/items', { name: 'Второй', inventory_number: dup }, hrToken)
    assert.strictEqual(second.status, 409)
  })

  it('GET /inventory/items — поиск, фильтр по разделу, схема в ответе', async () => {
    const search = await call('GET', `/inventory/items?search=SN-INV-001`, null, employeeToken)
    assert.strictEqual(search.status, 200)
    const found = search.data.find((i) => i.id === itemId)
    assert.ok(found, 'позиция находится поиском')
    assert.strictEqual(found.section_name, 'АРМ')
    assert.ok(Array.isArray(found.section_schema), 'схема раздела в ответе')

    const bySection = await call('GET', `/inventory/items?section_id=${armId}`, null, hrToken)
    assert.strictEqual(bySection.status, 200)
    assert.ok(bySection.data.every((i) => i.section_id === armId))

    const byStatus = await call('GET', `/inventory/items?status=in_stock`, null, hrToken)
    assert.strictEqual(byStatus.status, 200)
    assert.ok(byStatus.data.every((i) => i.status === 'in_stock'))
  })

  it('PUT /inventory/items/:id — обновление с характеристиками', async () => {
    const { status, data } = await call('PUT', `/inventory/items/${itemId}`, {
      location: 'Каб. 401', cost: 90000,
      field_values: { type: 'Ноутбук', os: 'Ubuntu 24.04', ip: '10.0.0.15', ram: '32 ГБ' }
    }, hrToken)
    assert.strictEqual(status, 200)
    assert.strictEqual(data.location, 'Каб. 401')
    assert.strictEqual(Number(data.cost), 90000)
    assert.strictEqual(data.field_values.ram, '32 ГБ')
  })

  it('POST /inventory/items/:id/assign — выдача работнику', async () => {
    const { status, data } = await call('POST', `/inventory/items/${itemId}/assign`, {
      user_id: employeeId, comment: 'Под отчёт'
    }, hrToken)
    assert.strictEqual(status, 200)
    assert.strictEqual(data.status, 'assigned')
    assert.strictEqual(data.assigned_to, employeeId)
    assignedItemId = itemId
  })

  it('POST /inventory/items/:id/assign — повторная выдача отклоняется', async () => {
    const { status } = await call('POST', `/inventory/items/${itemId}/assign`, { user_id: employeeId }, hrToken)
    assert.strictEqual(status, 400)
  })

  it('GET /inventory/my — работник видит выданное', async () => {
    const { status, data } = await call('GET', '/inventory/my', null, employeeToken)
    assert.strictEqual(status, 200)
    assert.ok(data.some((i) => i.id === assignedItemId))
    assert.ok(data.every((i) => i.assigned_name))
  })

  it('GET /inventory/items?mine=1 — фильтр моего имущества', async () => {
    const { status, data } = await call('GET', '/inventory/items?mine=1', null, employeeToken)
    assert.strictEqual(status, 200)
    assert.ok(data.some((i) => i.id === assignedItemId))
  })

  it('GET /inventory/items/:id/movements — история с create и assign', async () => {
    const { status, data } = await call('GET', `/inventory/items/${itemId}/movements`, null, employeeToken)
    assert.strictEqual(status, 200)
    const actions = data.map((m) => m.action)
    assert.ok(actions.includes('create'))
    assert.ok(actions.includes('assign'))
    const assignMovement = data.find((m) => m.action === 'assign')
    assert.strictEqual(assignMovement.comment, 'Под отчёт')
    assert.ok(assignMovement.performer_name)
  })

  it('POST /inventory/items/:id/return — возврат на склад', async () => {
    const { status, data } = await call('POST', `/inventory/items/${itemId}/return`, { comment: 'Проект завершён' }, hrToken)
    assert.strictEqual(status, 200)
    assert.strictEqual(data.status, 'in_stock')
    assert.strictEqual(data.assigned_to, null)
  })

  it('POST /inventory/items/:id/return — повторный возврат отклоняется', async () => {
    const { status } = await call('POST', `/inventory/items/${itemId}/return`, {}, hrToken)
    assert.strictEqual(status, 400)
  })

  it('POST /inventory/items/:id/status — в ремонт и списание', async () => {
    const repair = await call('POST', `/inventory/items/${itemId}/status`, { status: 'repair', comment: 'Не включается' }, hrToken)
    assert.strictEqual(repair.status, 200)
    assert.strictEqual(repair.data.status, 'repair')

    const writtenOff = await call('POST', `/inventory/items/${itemId}/status`, { status: 'written_off' }, hrToken)
    assert.strictEqual(writtenOff.status, 200)
    assert.strictEqual(writtenOff.data.status, 'written_off')

    const movements = await call('GET', `/inventory/items/${itemId}/movements`, null, hrToken)
    const statusMoves = movements.data.filter((m) => m.action === 'status')
    assert.strictEqual(statusMoves.length, 2)
    assert.strictEqual(statusMoves[0].from_status, 'repair')
    assert.strictEqual(statusMoves[0].to_status, 'written_off')
  })

  it('POST /inventory/items/:id/status — недопустимый статус отклоняется', async () => {
    const { status } = await call('POST', `/inventory/items/${itemId}/status`, { status: 'magic' }, hrToken)
    assert.strictEqual(status, 400)
  })

  it('GET /inventory/stats — статистика по разделам', async () => {
    const { status, data } = await call('GET', '/inventory/stats', null, hrToken)
    assert.strictEqual(status, 200)
    assert.ok(Array.isArray(data.by_status))
    assert.ok(Array.isArray(data.by_section))
    assert.ok(data.total >= 1)
    assert.ok(typeof data.total_cost === 'number')
  })

  it('GET /inventory/stats — employee получает 403', async () => {
    const { status } = await call('GET', '/inventory/stats', null, employeeToken)
    assert.strictEqual(status, 403)
  })

  it('DELETE /inventory/sections/:id — 409 при непустом разделе', async () => {
    const { status } = await call('DELETE', `/inventory/sections/${armId}`, null, hrToken)
    assert.strictEqual(status, 409)
  })

  it('DELETE /inventory/items/:id — hr получает 403, admin удаляет', async () => {
    const forbidden = await call('DELETE', `/inventory/items/${itemId}`, null, hrToken)
    assert.strictEqual(forbidden.status, 403)

    const { status } = await call('DELETE', `/inventory/items/${itemId}`, null, adminToken)
    assert.strictEqual(status, 200)

    const gone = await call('GET', `/inventory/items/${itemId}`, null, adminToken)
    assert.strictEqual(gone.status, 404)
  })

  it('DELETE /inventory/sections/:id — пустой раздел удаляется', async () => {
    const { status } = await call('DELETE', `/inventory/sections/${customSectionId}`, null, hrToken)
    assert.strictEqual(status, 200)
  })

  it('GET /inventory/items/:id — 404 для несуществующей', async () => {
    const { status } = await call('GET', '/inventory/items/99999999', null, hrToken)
    assert.strictEqual(status, 404)
  })
})
