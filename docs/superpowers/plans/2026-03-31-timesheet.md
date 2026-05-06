# Табель посещаемости — План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить раздел "Табель" (форма Т-13) с поддержкой редактирования по ролям, автозаполнением из отпусков, сменой статусов и экспортом в Excel/PDF.

**Architecture:** Бэкенд — новый роут `/api/timesheet` с таблицами `timesheets` + `timesheet_entries`; менеджер редактирует только свой отдел, HR/admin — любой. Фронтенд — общий компонент `TimesheetGrid` используется на двух страницах: `/leader/timesheet` и `/hr/timesheet`.

**Tech Stack:** Node.js/Express, PostgreSQL, `exceljs` (Excel), `pdfkit` (PDF), React 18 + TypeScript, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-03-31-timesheet-design.md`

---

## Карта файлов

| Файл | Действие | Ответственность |
|------|----------|-----------------|
| `backend/src/db/migrate.js` | Изменить | Добавить таблицы `timesheets`, `timesheet_entries` |
| `backend/package.json` | Изменить | Добавить `exceljs`, `pdfkit` |
| `backend/src/routes/timesheet.js` | Создать | Все API эндпоинты табеля |
| `backend/src/server.js` | Изменить | Зарегистрировать `/api/timesheet` |
| `backend/src/tests/timesheet.test.js` | Создать | Интеграционные тесты API |
| `lib/timesheetCodes.ts` | Создать | Словарь кодов Т-13 |
| `components/timesheet/TimesheetGrid.tsx` | Создать | Общий компонент таблицы-табеля |
| `pages/ManagerTimesheet.tsx` | Создать | Страница менеджера `/leader/timesheet` |
| `pages/HRTimesheet.tsx` | Создать | Страница HR `/hr/timesheet` |
| `App.tsx` | Изменить | Добавить маршруты |
| `components/layout/Sidebar.tsx` | Изменить | Добавить пункты навигации |

---

## Task 1: Миграция базы данных

**Files:**
- Modify: `backend/src/db/migrate.js`

- [ ] **Шаг 1: Открой `backend/src/db/migrate.js`, найди последний блок `await db.query(...)` перед `console.log('✅ Migrations completed')`**

- [ ] **Шаг 2: Добавь миграцию таблиц после последнего существующего `await db.query`**

```javascript
await db.query(`
  CREATE TABLE IF NOT EXISTS timesheets (
    id            SERIAL PRIMARY KEY,
    department_id INTEGER NOT NULL REFERENCES departments(id),
    year          INTEGER NOT NULL,
    month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    status        VARCHAR(20) NOT NULL DEFAULT 'draft',
    created_by    INTEGER REFERENCES users(id),
    updated_by    INTEGER REFERENCES users(id),
    updated_at    TIMESTAMP,
    created_at    TIMESTAMP DEFAULT NOW(),
    UNIQUE(department_id, year, month)
  )
`)

await db.query(`
  CREATE TABLE IF NOT EXISTS timesheet_entries (
    id           SERIAL PRIMARY KEY,
    timesheet_id INTEGER NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
    employee_id  INTEGER NOT NULL REFERENCES users(id),
    date         DATE NOT NULL,
    code         VARCHAR(10),
    hours        NUMERIC(4,1) CHECK (hours IS NULL OR (hours >= 0 AND hours <= 24)),
    UNIQUE(timesheet_id, employee_id, date)
  )
`)
```

- [ ] **Шаг 3: Запусти миграцию**

```bash
cd backend && npm run migrate
```

Ожидаемый результат: `✅ Migrations completed` без ошибок.

- [ ] **Шаг 4: Закоммить**

```bash
git add backend/src/db/migrate.js
git commit -m "feat(timesheet): add DB migration for timesheets and timesheet_entries"
```

---

## Task 2: Установка зависимостей бэкенда

**Files:**
- Modify: `backend/package.json`

- [ ] **Шаг 1: Установи пакеты**

```bash
cd backend && npm install exceljs pdfkit
```

- [ ] **Шаг 2: Убедись, что оба пакета появились в `backend/package.json` в секции `dependencies`**

- [ ] **Шаг 3: Закоммить**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "feat(timesheet): add exceljs and pdfkit dependencies"
```

---

## Task 3: Тест-скелет API (TDD — пиши тесты до реализации)

**Files:**
- Create: `backend/src/tests/timesheet.test.js`

> Создай файл с тестами ДО написания роута. Тесты будут падать — это ожидаемо.

- [ ] **Шаг 1: Убедись, что seeded данные есть в БД**

```bash
cd backend && npm run seed
```

Seeded пользователи (нужны для тестов):
- `ivanov@example.com` / `password123` — роль `employee`
- `petrov@example.com` / `password123` — роль `manager`
- `admin@example.com` / `password123` — роль `admin` (если отсутствует, используй `hr@example.com`)

Посмотри реальные email-адреса в `backend/src/db/seed.js` и скорректируй константы в тесте.

- [ ] **Шаг 2: Создай `backend/src/tests/timesheet.test.js`**

```javascript
import { describe, it, before } from 'node:test'
import assert from 'node:assert'

const BASE = 'http://localhost:5000/api'

async function login(email) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  })
  const data = await res.json()
  return data.token
}

describe('Timesheet API', () => {
  let managerToken
  let hrToken
  let employeeToken
  let timesheetId

  before(async () => {
    // Скорректируй email если нужно — смотри backend/src/db/seed.js
    hrToken = await login('admin@example.com')
    managerToken = await login('petrov@example.com')
    employeeToken = await login('ivanov@example.com')
  })

  it('GET /timesheet returns 401 without token', async () => {
    const res = await fetch(`${BASE}/timesheet`)
    assert.strictEqual(res.status, 401)
  })

  it('GET /timesheet returns 403 for employee', async () => {
    const res = await fetch(`${BASE}/timesheet`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    })
    assert.strictEqual(res.status, 403)
  })

  it('GET /timesheet returns array for HR', async () => {
    const res = await fetch(`${BASE}/timesheet`, {
      headers: { Authorization: `Bearer ${hrToken}` },
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
  })

  it('POST /timesheet creates timesheet with auto-fill (HR)', async () => {
    const deptRes = await fetch(`${BASE}/departments`, {
      headers: { Authorization: `Bearer ${hrToken}` },
    })
    const depts = await deptRes.json()
    assert.ok(depts.length > 0, 'Need at least one department in seed')
    const deptId = depts[0].id

    const res = await fetch(`${BASE}/timesheet`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${hrToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ department_id: deptId, year: 2025, month: 1 }),
    })
    assert.strictEqual(res.status, 201)
    const data = await res.json()
    assert.ok(data.id)
    assert.strictEqual(data.status, 'draft')
    timesheetId = data.id
  })

  it('POST /timesheet returns 409 on duplicate', async () => {
    const deptRes = await fetch(`${BASE}/departments`, {
      headers: { Authorization: `Bearer ${hrToken}` },
    })
    const depts = await deptRes.json()
    const deptId = depts[0].id
    const res = await fetch(`${BASE}/timesheet`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${hrToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ department_id: deptId, year: 2025, month: 1 }),
    })
    assert.strictEqual(res.status, 409)
  })

  it('GET /timesheet/:id returns timesheet with entries', async () => {
    const res = await fetch(`${BASE}/timesheet/${timesheetId}`, {
      headers: { Authorization: `Bearer ${hrToken}` },
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data.entries))
  })

  it('PUT /timesheet/:id/entries updates cells', async () => {
    const tsRes = await fetch(`${BASE}/timesheet/${timesheetId}`, {
      headers: { Authorization: `Bearer ${hrToken}` },
    })
    const ts = await tsRes.json()
    assert.ok(ts.entries.length > 0, 'Need entries to update')
    const entry = ts.entries[0]

    const res = await fetch(`${BASE}/timesheet/${timesheetId}/entries`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${hrToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ employee_id: entry.employee_id, date: entry.date, code: 'Б', hours: null }]),
    })
    assert.strictEqual(res.status, 200)
  })

  it('PUT /timesheet/:id/entries returns 400 for out-of-range date', async () => {
    const tsRes = await fetch(`${BASE}/timesheet/${timesheetId}`, {
      headers: { Authorization: `Bearer ${hrToken}` },
    })
    const ts = await tsRes.json()
    const entry = ts.entries[0]

    const res = await fetch(`${BASE}/timesheet/${timesheetId}/entries`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${hrToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ employee_id: entry.employee_id, date: '2020-01-01', code: 'Я', hours: 8 }]),
    })
    assert.strictEqual(res.status, 400)
  })

  it('PUT /timesheet/:id/status draft→approved is forbidden for HR (must go via submitted)', async () => {
    const res = await fetch(`${BASE}/timesheet/${timesheetId}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${hrToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    })
    assert.strictEqual(res.status, 403)
  })

  it('PUT /timesheet/:id/status draft→submitted is forbidden for HR', async () => {
    const res = await fetch(`${BASE}/timesheet/${timesheetId}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${hrToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'submitted' }),
    })
    assert.strictEqual(res.status, 403)
  })

  it('PUT /timesheet/:id/entries returns 403 for employee', async () => {
    const tsRes = await fetch(`${BASE}/timesheet/${timesheetId}`, {
      headers: { Authorization: `Bearer ${hrToken}` },
    })
    const ts = await tsRes.json()
    const entry = ts.entries[0]

    const res = await fetch(`${BASE}/timesheet/${timesheetId}/entries`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${employeeToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ employee_id: entry.employee_id, date: entry.date, code: 'Б', hours: null }]),
    })
    assert.strictEqual(res.status, 403)
  })
})
```

- [ ] **Шаг 3: Убедись, что сервер запущен (в отдельном терминале `cd backend && npm run dev`), затем запусти тесты — они должны падать**

```bash
cd backend && node --test src/tests/timesheet.test.js
```

Ожидаемый результат: большинство тестов падают с ошибкой типа `404` или `Cannot find module` — это нормально, роут ещё не написан.

- [ ] **Шаг 4: Закоммить тест-скелет**

```bash
git add backend/src/tests/timesheet.test.js
git commit -m "test(timesheet): add failing integration test skeleton (TDD)"
```

---

## Task 4: Бэкенд — роут `/api/timesheet`

**Files:**
- Create: `backend/src/routes/timesheet.js`

- [ ] **Шаг 1: Создай файл `backend/src/routes/timesheet.js` со следующим содержимым:**

```javascript
import express from 'express'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { query, getClient } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'

const router = express.Router()

// Все маршруты требуют аутентификации и роли manager/hr/admin
router.use(authenticateToken)
router.use(authorizeRoles('manager', 'hr', 'admin'))

// Проверяет, имеет ли пользователь доступ к табелю конкретного отдела
async function canAccessDepartment(user, departmentId) {
  if (['hr', 'admin'].includes(user.role)) return true
  const result = await query(
    `SELECT id FROM departments WHERE id = $1 AND manager_id = $2`,
    [departmentId, user.id]
  )
  return result.rows.length > 0
}

// Проверяет, имеет ли пользователь доступ к конкретному табелю
async function canAccessTimesheet(user, timesheetId) {
  const result = await query(`SELECT department_id FROM timesheets WHERE id = $1`, [timesheetId])
  if (result.rows.length === 0) return false
  return canAccessDepartment(user, result.rows[0].department_id)
}

// GET /api/timesheet — список табелей
router.get('/', async (req, res) => {
  try {
    let rows
    if (['hr', 'admin'].includes(req.user.role)) {
      const result = await query(`
        SELECT t.*, d.name as department_name
        FROM timesheets t
        JOIN departments d ON t.department_id = d.id
        ORDER BY t.year DESC, t.month DESC, d.name
      `)
      rows = result.rows
    } else {
      const result = await query(`
        SELECT t.*, d.name as department_name
        FROM timesheets t
        JOIN departments d ON t.department_id = d.id
        WHERE d.manager_id = $1
        ORDER BY t.year DESC, t.month DESC
      `, [req.user.id])
      rows = result.rows
    }
    res.json(rows)
  } catch (error) {
    console.error('Error fetching timesheets:', error)
    res.status(500).json({ error: 'Ошибка при получении табелей' })
  }
})

// POST /api/timesheet — создать табель с автозаполнением
router.post('/', async (req, res) => {
  const { department_id, year, month } = req.body

  if (!department_id || !year || !month) {
    return res.status(400).json({ error: 'Необходимо указать department_id, year, month' })
  }

  if (!(await canAccessDepartment(req.user, department_id))) {
    return res.status(403).json({ error: 'Нет доступа к данному отделу' })
  }

  const client = await getClient()
  try {
    await client.query('BEGIN')

    // Создаём табель
    const tsResult = await client.query(
      `INSERT INTO timesheets (department_id, year, month, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [department_id, year, month, req.user.id]
    )
    const timesheet = tsResult.rows[0]

    // Получаем сотрудников отдела
    const empResult = await client.query(
      `SELECT id FROM users WHERE department_id = $1`,
      [department_id]
    )
    const employees = empResult.rows

    // Получаем одобренные отпуска сотрудников за месяц
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    const vacResult = await client.query(
      `SELECT employee_id, start_date, end_date
       FROM vacation_requests
       WHERE employee_id = ANY($1)
         AND status = 'approved'
         AND start_date <= $2
         AND end_date >= $3`,
      [employees.map(e => e.id), endDate, startDate]
    )

    // Строим множество дат-отпусков: "employee_id:YYYY-MM-DD"
    const vacationDays = new Set()
    for (const vac of vacResult.rows) {
      const start = new Date(vac.start_date)
      const end = new Date(vac.end_date)
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0]
        vacationDays.add(`${vac.employee_id}:${dateStr}`)
      }
    }

    // Генерируем записи для каждого сотрудника и каждого дня месяца
    const daysInMonth = new Date(year, month, 0).getDate()
    const entries = []
    for (const emp of employees) {
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day)
        const dateStr = date.toISOString().split('T')[0]
        const dow = date.getDay() // 0=Sun, 6=Sat
        let code, hours

        if (dow === 0 || dow === 6) {
          code = 'В'; hours = null
        } else if (vacationDays.has(`${emp.id}:${dateStr}`)) {
          code = 'ОТ'; hours = null
        } else {
          code = 'Я'; hours = 8
        }
        entries.push([timesheet.id, emp.id, dateStr, code, hours])
      }
    }

    if (entries.length > 0) {
      const placeholders = entries.map((_, i) => {
        const base = i * 5
        return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5})`
      }).join(', ')
      await client.query(
        `INSERT INTO timesheet_entries (timesheet_id, employee_id, date, code, hours) VALUES ${placeholders}`,
        entries.flat()
      )
    }

    await client.query('COMMIT')
    res.status(201).json(timesheet)
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Табель за этот месяц уже существует' })
    }
    console.error('Error creating timesheet:', error)
    res.status(500).json({ error: 'Ошибка при создании табеля' })
  } finally {
    client.release()
  }
})

// GET /api/timesheet/:id — табель со всеми записями
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!(await canAccessTimesheet(req.user, id))) {
      return res.status(403).json({ error: 'Нет доступа к этому табелю' })
    }

    const tsResult = await query(
      `SELECT t.*, d.name as department_name
       FROM timesheets t JOIN departments d ON t.department_id = d.id
       WHERE t.id = $1`,
      [id]
    )
    if (tsResult.rows.length === 0) return res.status(404).json({ error: 'Табель не найден' })

    const entriesResult = await query(
      `SELECT te.*, u.first_name, u.last_name
       FROM timesheet_entries te
       JOIN users u ON te.employee_id = u.id
       WHERE te.timesheet_id = $1
       ORDER BY u.last_name, u.first_name, te.date`,
      [id]
    )

    res.json({ ...tsResult.rows[0], entries: entriesResult.rows })
  } catch (error) {
    console.error('Error fetching timesheet:', error)
    res.status(500).json({ error: 'Ошибка при получении табеля' })
  }
})

// PUT /api/timesheet/:id/entries — batch-обновление ячеек
router.put('/:id/entries', async (req, res) => {
  const { id } = req.params
  const entries = req.body

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'Ожидается непустой массив записей' })
  }

  try {
    const tsResult = await query(`SELECT * FROM timesheets WHERE id = $1`, [id])
    if (tsResult.rows.length === 0) return res.status(404).json({ error: 'Табель не найден' })
    const timesheet = tsResult.rows[0]

    if (!(await canAccessDepartment(req.user, timesheet.department_id))) {
      return res.status(403).json({ error: 'Нет доступа к этому табелю' })
    }

    if (timesheet.status === 'approved') {
      return res.status(403).json({ error: 'Нельзя редактировать утверждённый табель' })
    }

    if (timesheet.status === 'submitted' && req.user.role === 'manager') {
      return res.status(403).json({ error: 'Табель передан на утверждение, редактирование недоступно' })
    }

    // Проверяем, что все даты принадлежат году/месяцу табеля
    // Используем строковое сравнение YYYY-MM-DD чтобы избежать timezone-сдвигов
    const mm = String(timesheet.month).padStart(2, '0')
    const daysInTs = new Date(timesheet.year, timesheet.month, 0).getDate()
    const rangeStart = `${timesheet.year}-${mm}-01`
    const rangeEnd = `${timesheet.year}-${mm}-${String(daysInTs).padStart(2, '0')}`
    for (const e of entries) {
      if (e.date < rangeStart || e.date > rangeEnd) {
        return res.status(400).json({ error: `Дата ${e.date} не входит в диапазон табеля` })
      }
    }

    const client = await getClient()
    try {
      await client.query('BEGIN')
      for (const e of entries) {
        await client.query(
          `INSERT INTO timesheet_entries (timesheet_id, employee_id, date, code, hours)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (timesheet_id, employee_id, date) DO UPDATE
             SET code = EXCLUDED.code, hours = EXCLUDED.hours`,
          [id, e.employee_id, e.date, e.code ?? null, e.hours ?? null]
        )
      }
      await client.query(
        `UPDATE timesheets SET updated_by = $1, updated_at = NOW() WHERE id = $2`,
        [req.user.id, id]
      )
      await client.query('COMMIT')
      res.json({ success: true })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Error updating entries:', error)
    res.status(500).json({ error: 'Ошибка при обновлении записей' })
  }
})

// PUT /api/timesheet/:id/status — сменить статус
router.put('/:id/status', async (req, res) => {
  const { id } = req.params
  const { status } = req.body

  const allowedStatuses = ['draft', 'submitted', 'approved']
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Недопустимый статус' })
  }

  try {
    const tsResult = await query(`SELECT * FROM timesheets WHERE id = $1`, [id])
    if (tsResult.rows.length === 0) return res.status(404).json({ error: 'Табель не найден' })
    const timesheet = tsResult.rows[0]

    if (!(await canAccessDepartment(req.user, timesheet.department_id))) {
      return res.status(403).json({ error: 'Нет доступа к этому табелю' })
    }

    const current = timesheet.status
    const isHR = ['hr', 'admin'].includes(req.user.role)

    // Допустимые переходы
    const allowed =
      (req.user.role === 'manager' && current === 'draft' && status === 'submitted') ||
      (isHR && current === 'submitted' && status === 'approved') ||
      (isHR && current === 'approved' && status === 'submitted')

    if (!allowed) {
      return res.status(403).json({ error: `Переход ${current}→${status} недопустим для вашей роли` })
    }

    const result = await query(
      `UPDATE timesheets SET status = $1, updated_by = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [status, req.user.id, id]
    )
    res.json(result.rows[0])
  } catch (error) {
    console.error('Error updating timesheet status:', error)
    res.status(500).json({ error: 'Ошибка при изменении статуса' })
  }
})

// GET /api/timesheet/:id/export/excel
router.get('/:id/export/excel', async (req, res) => {
  const { id } = req.params
  try {
    if (!(await canAccessTimesheet(req.user, id))) {
      return res.status(403).json({ error: 'Нет доступа' })
    }
    const tsResult = await query(
      `SELECT t.*, d.name as department_name FROM timesheets t
       JOIN departments d ON t.department_id = d.id WHERE t.id = $1`,
      [id]
    )
    if (tsResult.rows.length === 0) return res.status(404).json({ error: 'Табель не найден' })
    const timesheet = tsResult.rows[0]

    const entriesResult = await query(
      `SELECT te.employee_id, te.date, te.code, te.hours,
              u.first_name, u.last_name
       FROM timesheet_entries te
       JOIN users u ON te.employee_id = u.id
       WHERE te.timesheet_id = $1
       ORDER BY u.last_name, u.first_name, te.date`,
      [id]
    )

    const daysInMonth = new Date(timesheet.year, timesheet.month, 0).getDate()

    // Группируем по сотруднику
    const byEmployee = {}
    for (const e of entriesResult.rows) {
      const key = e.employee_id
      if (!byEmployee[key]) {
        byEmployee[key] = { name: `${e.last_name} ${e.first_name}`, days: {} }
      }
      byEmployee[key].days[e.date] = { code: e.code, hours: e.hours }
    }

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Табель')

    // Заголовок
    const header = ['Сотрудник']
    for (let d = 1; d <= daysInMonth; d++) header.push(String(d))
    header.push('Итого ч.')
    sheet.addRow(header)
    sheet.getRow(1).font = { bold: true }

    for (const emp of Object.values(byEmployee)) {
      const codeRow = [emp.name]
      const hoursRow = ['']
      let total = 0
      for (let d = 1; d <= daysInMonth; d++) {
        const date = `${timesheet.year}-${String(timesheet.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const cell = emp.days[date]
        codeRow.push(cell?.code ?? '')
        hoursRow.push(cell?.hours != null ? cell.hours : '')
        if (cell?.hours) total += Number(cell.hours)
      }
      codeRow.push(total)
      hoursRow.push('')
      sheet.addRow(codeRow)
      sheet.addRow(hoursRow)
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="timesheet-${timesheet.year}-${timesheet.month}.xlsx"`)
    await workbook.xlsx.write(res)
    res.end()
  } catch (error) {
    console.error('Error exporting Excel:', error)
    res.status(500).json({ error: 'Ошибка при экспорте Excel' })
  }
})

// GET /api/timesheet/:id/export/pdf
router.get('/:id/export/pdf', async (req, res) => {
  const { id } = req.params
  try {
    if (!(await canAccessTimesheet(req.user, id))) {
      return res.status(403).json({ error: 'Нет доступа' })
    }
    const tsResult = await query(
      `SELECT t.*, d.name as department_name FROM timesheets t
       JOIN departments d ON t.department_id = d.id WHERE t.id = $1`,
      [id]
    )
    if (tsResult.rows.length === 0) return res.status(404).json({ error: 'Табель не найден' })
    const timesheet = tsResult.rows[0]

    const entriesResult = await query(
      `SELECT te.employee_id, te.date, te.code, te.hours,
              u.first_name, u.last_name
       FROM timesheet_entries te
       JOIN users u ON te.employee_id = u.id
       WHERE te.timesheet_id = $1
       ORDER BY u.last_name, u.first_name, te.date`,
      [id]
    )

    const daysInMonth = new Date(timesheet.year, timesheet.month, 0).getDate()
    const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

    const byEmployee = {}
    for (const e of entriesResult.rows) {
      if (!byEmployee[e.employee_id]) {
        byEmployee[e.employee_id] = { name: `${e.last_name} ${e.first_name}`, days: {} }
      }
      byEmployee[e.employee_id].days[e.date] = { code: e.code, hours: e.hours }
    }

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="timesheet-${timesheet.year}-${timesheet.month}.pdf"`)

    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' })
    doc.pipe(res)

    doc.fontSize(14).text(
      `Табель учёта рабочего времени — ${timesheet.department_name} — ${monthNames[timesheet.month - 1]} ${timesheet.year}`,
      { align: 'center' }
    )
    doc.moveDown(0.5)

    const colWidth = 20
    const nameWidth = 120
    const rowHeight = 16
    let y = doc.y
    const startX = 30

    // Шапка: дни
    doc.fontSize(7).text('Сотрудник', startX, y, { width: nameWidth, continued: false })
    for (let d = 1; d <= daysInMonth; d++) {
      doc.text(String(d), startX + nameWidth + (d - 1) * colWidth, y, { width: colWidth, align: 'center' })
    }
    doc.text('Итого', startX + nameWidth + daysInMonth * colWidth, y, { width: 35, align: 'center' })
    y += rowHeight

    for (const emp of Object.values(byEmployee)) {
      let total = 0
      doc.text(emp.name, startX, y, { width: nameWidth })
      for (let d = 1; d <= daysInMonth; d++) {
        const date = `${timesheet.year}-${String(timesheet.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const cell = emp.days[date]
        const codeText = cell?.code ?? ''
        const hoursText = cell?.hours != null ? String(cell.hours) : ''
        if (cell?.hours) total += Number(cell.hours)
        const cx = startX + nameWidth + (d - 1) * colWidth
        doc.text(codeText, cx, y, { width: colWidth, align: 'center' })
        doc.text(hoursText, cx, y + 8, { width: colWidth, align: 'center' })
      }
      doc.text(String(total), startX + nameWidth + daysInMonth * colWidth, y, { width: 35, align: 'center' })
      y += rowHeight * 2
      if (y > 500) { doc.addPage(); y = 30 }
    }

    doc.end()
  } catch (error) {
    console.error('Error exporting PDF:', error)
    res.status(500).json({ error: 'Ошибка при экспорте PDF' })
  }
})

export default router
```

- [ ] **Шаг 2: Закоммить**

```bash
git add backend/src/routes/timesheet.js
git commit -m "feat(timesheet): add timesheet API routes"
```

---

## Task 5: Регистрация роута в server.js

**Files:**
- Modify: `backend/src/server.js`

- [ ] **Шаг 1: Добавь импорт после строки `import dictionariesRoutes from './routes/dictionaries.js'`**

```javascript
import timesheetRoutes from './routes/timesheet.js'
```

- [ ] **Шаг 2: Добавь регистрацию после `app.use('/api/dictionaries', dictionariesRoutes)`**

```javascript
app.use('/api/timesheet', timesheetRoutes)
```

- [ ] **Шаг 3: Запусти сервер и убедись, что стартует без ошибок**

```bash
cd backend && npm run dev
```

Ожидаемый результат: `Server running on port 5000`

- [ ] **Шаг 4: Закоммить**

```bash
git add backend/src/server.js
git commit -m "feat(timesheet): register /api/timesheet route"
```

---

- [ ] **Шаг 5: После написания роута — запусти тесты снова, убедись что все проходят**

```bash
cd backend && node --test src/tests/timesheet.test.js
```

Ожидаемый результат: все тесты зелёные.

- [ ] **Шаг 6: Закоммить обновлённый тест-файл (если вносились правки)**

```bash
git add backend/src/tests/timesheet.test.js
git commit -m "test(timesheet): tests passing after implementation"
```

---

## Task 6: Словарь кодов Т-13 (фронтенд)

**Files:**
- Create: `lib/timesheetCodes.ts`

- [ ] **Шаг 1: Создай файл `lib/timesheetCodes.ts`**

```typescript
export const TIMESHEET_CODES = [
  { code: 'Я',  label: 'Явка' },
  { code: 'ОТ', label: 'Ежегодный отпуск' },
  { code: 'ОС', label: 'Отпуск без сохранения ЗП' },
  { code: 'УО', label: 'Учебный отпуск' },
  { code: 'Б',  label: 'Больничный' },
  { code: 'Т',  label: 'Нетрудоспособность без пособия' },
  { code: 'К',  label: 'Командировка' },
  { code: 'НН', label: 'Неявка (невыясненная причина)' },
  { code: 'В',  label: 'Выходной / праздник' },
  { code: 'ПР', label: 'Прогул' },
  { code: 'ДО', label: 'Дополнительный отпуск' },
  { code: 'ОЖ', label: 'Отпуск по уходу за ребёнком' },
  { code: 'Р',  label: 'Отпуск по беременности и родам' },
  { code: 'ОЗ', label: 'Отпуск (гос. обязанности)' },
  { code: 'УВ', label: 'Сокращённый рабочий день' },
] as const

export type TimesheetCode = typeof TIMESHEET_CODES[number]['code']

export const CODE_COLORS: Record<string, string> = {
  'В':  'bg-gray-100 dark:bg-gray-800',
  'ПР': 'bg-red-100 dark:bg-red-950',
  'НН': 'bg-red-100 dark:bg-red-950',
  'ОТ': 'bg-blue-100 dark:bg-blue-950',
  'Б':  'bg-yellow-100 dark:bg-yellow-950',
}
```

- [ ] **Шаг 2: Проверь typecheck**

```bash
npm run typecheck 2>&1 | head -20
```

Ожидаемый результат: без новых ошибок.

- [ ] **Шаг 3: Закоммить**

```bash
git add lib/timesheetCodes.ts
git commit -m "feat(timesheet): add T-13 codes dictionary"
```

---

## Task 7: Компонент TimesheetGrid

**Files:**
- Create: `components/timesheet/TimesheetGrid.tsx`

- [ ] **Шаг 1: Создай файл `components/timesheet/TimesheetGrid.tsx`**

```typescript
import { useState, useMemo } from 'react'
import { TIMESHEET_CODES, CODE_COLORS } from '@/lib/timesheetCodes'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/lib/authHeaders'
import { getErrorMessage } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/Button'

export interface TimesheetEntry {
  id: number
  employee_id: number
  date: string
  code: string | null
  hours: number | null
  first_name: string
  last_name: string
}

interface Employee {
  id: number
  first_name: string
  last_name: string
}

interface Props {
  timesheetId: number
  entries: TimesheetEntry[]
  year: number
  month: number
  readonly: boolean
  onSave: () => void
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function dateStr(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function TimesheetGrid({ timesheetId, entries, year, month, readonly, onSave }: Props) {
  const totalDays = daysInMonth(year, month)

  // Карта изменений: "empId:date" -> {code, hours}
  const [changes, setChanges] = useState<Record<string, { code: string | null; hours: number | null }>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Уникальные сотрудники из entries
  const employees = useMemo<Employee[]>(() => {
    const seen = new Set<number>()
    const result: Employee[] = []
    for (const e of entries) {
      if (!seen.has(e.employee_id)) {
        seen.add(e.employee_id)
        result.push({ id: e.employee_id, first_name: e.first_name, last_name: e.last_name })
      }
    }
    return result
  }, [entries])

  // Быстрый доступ к ячейке: "empId:date"
  const entryMap = useMemo(() => {
    const map: Record<string, TimesheetEntry> = {}
    for (const e of entries) map[`${e.employee_id}:${e.date}`] = e
    return map
  }, [entries])

  function getCell(empId: number, day: number) {
    const date = dateStr(year, month, day)
    const key = `${empId}:${date}`
    if (changes[key] !== undefined) return changes[key]
    const e = entryMap[key]
    return e ? { code: e.code, hours: e.hours } : { code: null, hours: null }
  }

  function setCell(empId: number, day: number, code: string | null, hours: number | null) {
    const date = dateStr(year, month, day)
    setChanges(prev => ({ ...prev, [`${empId}:${date}`]: { code, hours } }))
  }

  function totalHours(empId: number) {
    let total = 0
    for (let d = 1; d <= totalDays; d++) {
      const h = getCell(empId, d).hours
      if (h != null) total += h
    }
    return total
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const body = Object.entries(changes).map(([key, val]) => {
        const [empId, date] = key.split(':')
        return { employee_id: Number(empId), date, code: val.code, hours: val.hours }
      })
      const res = await fetch(`${API_BASE_URL}/timesheet/${timesheetId}/entries`, {
        method: 'PUT',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Ошибка сохранения')
      }
      setChanges({})
      onSave()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleExport(format: 'excel' | 'pdf') {
    try {
      const res = await fetch(`${API_BASE_URL}/timesheet/${timesheetId}/export/${format}`, {
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error('Ошибка экспорта')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `timesheet-${year}-${month}.${format === 'excel' ? 'xlsx' : 'pdf'}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    }
  }

  const days = Array.from({ length: totalDays }, (_, i) => i + 1)
  const hasChanges = Object.keys(changes).length > 0

  return (
    <div className="space-y-4">
      {error && <div className="text-sm text-destructive">{error}</div>}

      <div className="flex items-center gap-2 justify-end flex-wrap">
        {!readonly && hasChanges && (
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        )}
        <Button variant="outline" onClick={() => handleExport('excel')}>Экспорт Excel</Button>
        <Button variant="outline" onClick={() => handleExport('pdf')}>Экспорт PDF</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr className="bg-muted/50">
              <th className="sticky left-0 bg-muted/80 border border-border px-2 py-1 text-left min-w-[140px] z-10">
                Сотрудник
              </th>
              {days.map(d => (
                <th key={d} className="border border-border px-1 py-1 text-center min-w-[36px]">
                  {d}
                </th>
              ))}
              <th className="border border-border px-2 py-1 text-center min-w-[48px]">Итого ч.</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr key={emp.id} className="hover:bg-muted/20">
                <td className="sticky left-0 bg-card border border-border px-2 py-1 font-medium z-10">
                  {emp.last_name} {emp.first_name}
                </td>
                {days.map(day => {
                  const cell = getCell(emp.id, day)
                  const colorClass = cell.code ? (CODE_COLORS[cell.code] ?? '') : ''
                  return (
                    <td key={day} className={`border border-border p-0 ${colorClass}`}>
                      <div className="flex flex-col items-center">
                        {readonly ? (
                          <>
                            <span className="py-0.5 text-center w-full font-medium">{cell.code ?? ''}</span>
                            <span className="py-0.5 text-center w-full text-muted-foreground">{cell.hours ?? ''}</span>
                          </>
                        ) : (
                          <>
                            <select
                              value={cell.code ?? ''}
                              onChange={e => setCell(emp.id, day, e.target.value || null, cell.hours)}
                              className="w-full bg-transparent text-center text-xs border-b border-border/40 focus:outline-none cursor-pointer py-0.5"
                            >
                              <option value=""></option>
                              {TIMESHEET_CODES.map(c => (
                                <option key={c.code} value={c.code}>{c.code}</option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={0}
                              max={24}
                              step={0.5}
                              value={cell.hours ?? ''}
                              onChange={e => setCell(emp.id, day, cell.code, e.target.value === '' ? null : Number(e.target.value))}
                              className="w-full bg-transparent text-center text-xs focus:outline-none py-0.5"
                            />
                          </>
                        )}
                      </div>
                    </td>
                  )
                })}
                <td className="border border-border px-2 py-1 text-center font-semibold">
                  {totalHours(emp.id)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Шаг 2: Проверь typecheck и lint**

```bash
npm run typecheck 2>&1 | head -30 && npm run lint 2>&1 | head -30
```

Ожидаемый результат: без ошибок.

- [ ] **Шаг 3: Закоммить**

```bash
git add components/timesheet/TimesheetGrid.tsx
git commit -m "feat(timesheet): add TimesheetGrid component"
```

---

## Task 8: Страница менеджера ManagerTimesheet

**Files:**
- Create: `pages/ManagerTimesheet.tsx`

- [ ] **Шаг 1: Создай файл `pages/ManagerTimesheet.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/lib/authHeaders'
import { getErrorMessage } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { TimesheetGrid, TimesheetEntry } from '@/components/timesheet/TimesheetGrid'

interface Timesheet {
  id: number
  department_id: number
  department_name: string
  year: number
  month: number
  status: 'draft' | 'submitted' | 'approved'
}

const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

export function ManagerTimesheet() {
  const user = useAuthStore(s => s.user)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [timesheet, setTimesheet] = useState<Timesheet | null>(null)
  const [timesheetData, setTimesheetData] = useState<{ entries: unknown[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function loadTimesheet() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/timesheet`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Ошибка загрузки')
      const list: Timesheet[] = await res.json()
      const found = list.find(t => t.year === year && t.month === month) ?? null
      setTimesheet(found)

      if (found) {
        const res2 = await fetch(`${API_BASE_URL}/timesheet/${found.id}`, { headers: getAuthHeaders() })
        if (!res2.ok) throw new Error('Ошибка загрузки данных')
        setTimesheetData(await res2.json())
      } else {
        setTimesheetData(null)
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTimesheet() }, [year, month])

  async function handleCreate() {
    setCreating(true)
    setError(null)
    try {
      const deptRes = await fetch(`${API_BASE_URL}/departments`, { headers: getAuthHeaders() })
      const depts = await deptRes.json()
      const myDept = depts.find((d: { manager_id: number }) => d.manager_id === user?.id)
      if (!myDept) throw new Error('Вы не являетесь руководителем ни одного отдела')

      const res = await fetch(`${API_BASE_URL}/timesheet`, {
        method: 'POST',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ department_id: myDept.id, year, month }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Ошибка создания')
      }
      await loadTimesheet()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  async function handleSubmit() {
    if (!timesheet) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/timesheet/${timesheet.id}/status`, {
        method: 'PUT',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ status: 'submitted' }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Ошибка')
      }
      await loadTimesheet()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const readonly = timesheet?.status !== 'draft'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Табель</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-card"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-card"
          >
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {loading ? (
        <div className="text-muted-foreground">Загрузка...</div>
      ) : !timesheet ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <p className="text-muted-foreground">Табель за {MONTH_NAMES[month - 1]} {year} не создан</p>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? 'Создание...' : 'Создать табель'}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{timesheet.department_name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                timesheet.status === 'draft' ? 'bg-muted text-muted-foreground' :
                timesheet.status === 'submitted' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' :
                'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
              }`}>
                {timesheet.status === 'draft' ? 'Черновик' :
                 timesheet.status === 'submitted' ? 'На утверждении' : 'Утверждён'}
              </span>
            </div>
            {timesheet.status === 'draft' && (
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Отправка...' : 'Отправить на утверждение'}
              </Button>
            )}
          </div>

          {timesheetData && (
            <TimesheetGrid
              timesheetId={timesheet.id}
              entries={(timesheetData as { entries: TimesheetEntry[] }).entries}
              year={year}
              month={month}
              readonly={readonly}
              onSave={loadTimesheet}
            />
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Шаг 2: Проверь typecheck и lint**

```bash
npm run typecheck 2>&1 | head -30 && npm run lint 2>&1 | head -30
```

- [ ] **Шаг 3: Закоммить**

```bash
git add pages/ManagerTimesheet.tsx
git commit -m "feat(timesheet): add ManagerTimesheet page"
```

---

## Task 9: Страница HR — HRTimesheet

**Files:**
- Create: `pages/HRTimesheet.tsx`

- [ ] **Шаг 1: Создай файл `pages/HRTimesheet.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/lib/authHeaders'
import { getErrorMessage } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { TimesheetGrid, TimesheetEntry } from '@/components/timesheet/TimesheetGrid'

interface Department { id: number; name: string }
interface Timesheet {
  id: number
  department_id: number
  department_name: string
  year: number
  month: number
  status: 'draft' | 'submitted' | 'approved'
}

const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

export function HRTimesheet() {
  const now = new Date()
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedDept, setSelectedDept] = useState<number | null>(null)
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [timesheet, setTimesheet] = useState<Timesheet | null>(null)
  const [timesheetData, setTimesheetData] = useState<{ entries: unknown[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE_URL}/departments`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then((data: Department[]) => {
        setDepartments(data)
        if (data.length > 0) setSelectedDept(data[0].id)
      })
  }, [])

  async function loadTimesheet() {
    if (!selectedDept) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/timesheet`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Ошибка загрузки')
      const list: Timesheet[] = await res.json()
      const found = list.find(t => t.department_id === selectedDept && t.year === year && t.month === month) ?? null
      setTimesheet(found)
      if (found) {
        const res2 = await fetch(`${API_BASE_URL}/timesheet/${found.id}`, { headers: getAuthHeaders() })
        if (!res2.ok) throw new Error('Ошибка загрузки данных')
        setTimesheetData(await res2.json())
      } else {
        setTimesheetData(null)
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTimesheet() }, [selectedDept, year, month])

  async function handleCreate() {
    if (!selectedDept) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/timesheet`, {
        method: 'POST',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ department_id: selectedDept, year, month }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Ошибка создания')
      }
      await loadTimesheet()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  async function handleStatusChange(status: string) {
    if (!timesheet) return
    setStatusLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/timesheet/${timesheet.id}/status`, {
        method: 'PUT',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Ошибка')
      }
      await loadTimesheet()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setStatusLoading(false)
    }
  }

  const readonly = timesheet?.status === 'approved'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Табель — все отделы</h1>

      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={selectedDept ?? ''}
          onChange={e => setSelectedDept(Number(e.target.value))}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card"
        >
          {departments.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select
          value={month}
          onChange={e => setMonth(Number(e.target.value))}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card"
        >
          {MONTH_NAMES.map((name, i) => (
            <option key={i + 1} value={i + 1}>{name}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-card"
        >
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {loading ? (
        <div className="text-muted-foreground">Загрузка...</div>
      ) : !timesheet ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <p className="text-muted-foreground">Табель не создан</p>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? 'Создание...' : 'Создать табель'}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              timesheet.status === 'draft' ? 'bg-muted text-muted-foreground' :
              timesheet.status === 'submitted' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' :
              'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
            }`}>
              {timesheet.status === 'draft' ? 'Черновик' :
               timesheet.status === 'submitted' ? 'На утверждении' : 'Утверждён'}
            </span>
            <div className="flex gap-2">
              {timesheet.status === 'submitted' && (
                <Button onClick={() => handleStatusChange('approved')} disabled={statusLoading}>
                  Утвердить
                </Button>
              )}
              {timesheet.status === 'approved' && (
                <Button variant="outline" onClick={() => handleStatusChange('submitted')} disabled={statusLoading}>
                  Вернуть на доработку
                </Button>
              )}
            </div>
          </div>

          {timesheetData && (
            <TimesheetGrid
              timesheetId={timesheet.id}
              entries={(timesheetData as { entries: TimesheetEntry[] }).entries}
              year={year}
              month={month}
              readonly={readonly}
              onSave={loadTimesheet}
            />
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Шаг 2: Проверь typecheck и lint**

```bash
npm run typecheck 2>&1 | head -30 && npm run lint 2>&1 | head -30
```

- [ ] **Шаг 3: Закоммить**

```bash
git add pages/HRTimesheet.tsx
git commit -m "feat(timesheet): add HRTimesheet page"
```

---

## Task 10: Маршруты App.tsx + Sidebar

**Files:**
- Modify: `App.tsx`
- Modify: `components/layout/Sidebar.tsx`

- [ ] **Шаг 1: В `App.tsx` добавь импорты после строки `import { HRDictionaries } from '@/pages/HRDictionaries'`**

```typescript
import { ManagerTimesheet } from '@/pages/ManagerTimesheet'
import { HRTimesheet } from '@/pages/HRTimesheet'
```

- [ ] **Шаг 2: В `App.tsx` добавь `ManagerRoute` guard рядом с `HRRoute` (после строки закрывающей `function HRRoute`)**

```tsx
function ManagerRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const loading = useAuthStore((state) => state.loading)
  if (loading) return null
  if (user?.role !== 'manager') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
```

- [ ] **Шаг 3: В `App.tsx` добавь маршруты после `<Route path="hr/dictionaries" ...>`**

```tsx
<Route path="leader/timesheet" element={<ManagerRoute><ManagerTimesheet /></ManagerRoute>} />
<Route path="hr/timesheet" element={<HRRoute><HRTimesheet /></HRRoute>} />
```

- [ ] **Шаг 4: В `Sidebar.tsx` добавь иконку `Table2` в импорт из `'lucide-react'`**

```typescript
import {
  // ... существующие иконки ...
  Table2,
} from 'lucide-react'
```

- [ ] **Шаг 5: В `getManagerNavigation` добавь пункт "Табель" после `{ name: 'Отпуск', href: '/vacation', icon: Plane }`**

```typescript
{ name: 'Табель', href: '/leader/timesheet', icon: Table2 },
```

- [ ] **Шаг 6: В `getHRNavigation` найди в группе "HR" массив `children` и добавь в его конец новый элемент**

Найди последний элемент `children` в группе "HR" (это `{ name: 'Справочники', href: '/hr/dictionaries' }`) и добавь после него:
```typescript
{ name: 'Табель', href: '/hr/timesheet' },
```

Не переписывай весь блок `children` — добавь только одну строку, чтобы не затронуть существующие пункты.

- [ ] **Шаг 7: Запусти typecheck и lint**

```bash
npm run lint && npm run typecheck
```

Ожидаемый результат: без ошибок.

- [ ] **Шаг 8: Закоммить**

```bash
git add App.tsx components/layout/Sidebar.tsx
git commit -m "feat(timesheet): add routes and sidebar navigation"
```

---

## Task 11: Финальная проверка

- [ ] **Шаг 1: Запусти приложение**

```bash
npm run dev
```

- [ ] **Шаг 2: Войди как менеджер (`petrov@example.com` / `password123`), перейди на `/leader/timesheet`**

Проверь:
- Отображается селектор месяца/года
- Кнопка "Создать табель" есть
- После создания — таблица с сотрудниками и автозаполненными ячейками
- Ячейки редактируемы (code-select + hours-input)
- Кнопка "Сохранить" появляется при изменениях
- Кнопки "Экспорт Excel" и "Экспорт PDF" работают
- Кнопка "Отправить на утверждение" работает, после чего таблица переходит в readonly для менеджера

- [ ] **Шаг 3: Войди как HR/admin, перейди на `/hr/timesheet`**

Проверь:
- Есть селектор отдела
- Таблица отображается и редактируема при `draft` и `submitted`
- Кнопки "Утвердить" и "Вернуть на доработку" работают

- [ ] **Шаг 4: Войди как сотрудник (`ivanov@example.com`), убедись что `/leader/timesheet` и `/hr/timesheet` недоступны (редирект)**

- [ ] **Шаг 5: Финальный коммит**

```bash
git push origin main
```
