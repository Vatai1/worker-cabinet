# Табель посещаемости — Спецификация

**Дата:** 2026-03-31
**Статус:** Утверждён

## Обзор

Раздел "Табель" позволяет менеджерам вести учёт посещаемости сотрудников своего отдела по форме Т-13, а HR/admin — просматривать и редактировать табели по всей организации с возможностью экспорта в Excel и PDF.

## Роли и доступ

| Роль | Возможности |
|------|-------------|
| `manager` | Создание, просмотр и редактирование табеля своего отдела; может переводить статус `draft→submitted` |
| `hr` / `admin` | Создание, просмотр и редактирование табелей любого отдела; может переводить статус `submitted→approved` и откатывать `approved→submitted` |
| `employee`, `onboarding` | Доступ отсутствует; маршруты защищены через `BlockOnboardingRoute` и `authorizeRoles` |

## Статусы табеля и переходы

| Статус | Кто устанавливает | Редактирование записей |
|--------|-------------------|------------------------|
| `draft` | Создаётся автоматически | Менеджер и HR/admin |
| `submitted` | Менеджер (свой отдел) | Только HR/admin |
| `approved` | HR/admin | Заблокировано для всех |

Бэкенд обязан отклонять изменения записей (`PUT /:id/entries`) и недопустимые переходы статуса, если табель в состоянии `approved`.

## База данных

Изменения добавляются в `backend/src/db/migrate.js`.

### Таблица `timesheets`

```sql
CREATE TABLE timesheets (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  year          INTEGER NOT NULL,
  month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  status        VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft | submitted | approved
  created_by    INTEGER REFERENCES users(id),
  updated_by    INTEGER REFERENCES users(id),
  updated_at    TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(department_id, year, month)
);
```

### Таблица `timesheet_entries`

```sql
CREATE TABLE timesheet_entries (
  id           SERIAL PRIMARY KEY,
  timesheet_id INTEGER NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  employee_id  INTEGER NOT NULL REFERENCES users(id),
  date         DATE NOT NULL,
  code         VARCHAR(10),
  hours        NUMERIC(4,1) CHECK (hours IS NULL OR (hours >= 0 AND hours <= 24)),
  UNIQUE(timesheet_id, employee_id, date)
);
```

### Автозаполнение при создании табеля

При `POST /api/timesheet` бэкенд автоматически генерирует записи для всех сотрудников отдела:
1. Суббота и воскресенье → код `В`, часы `null`
2. Одобренные отпуска сотрудников отдела, актуальные на момент создания → код `ОТ`, часы `null`
3. Остальные рабочие дни → код `Я`, часы `8`

Пересинхронизация отпусков после создания табеля не выполняется — менеджер корректирует вручную. Сотрудники, переведённые в отдел после создания табеля, добавляются с пустыми ячейками.

## API

Маршрут: `/api/timesheet`

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/` | Список табелей | manager (свой отдел), hr/admin (все) |
| POST | `/` | Создать табель с автозаполнением | manager (свой отдел), hr/admin |
| GET | `/:id` | Получить табель со всеми записями | manager (свой), hr/admin (любой) |
| PUT | `/:id/entries` | Batch-обновление ячеек | manager (свой, только `draft`), hr/admin (любой, `draft`/`submitted`) |
| PUT | `/:id/status` | Изменить статус | manager: `draft→submitted`; hr/admin: `submitted→approved`, `approved→submitted` |
| GET | `/:id/export/excel` | Скачать Excel | manager (свой), hr/admin (любой) |
| GET | `/:id/export/pdf` | Скачать PDF (форма Т-13) | manager (свой), hr/admin (любой) |

### Тело запроса `PUT /:id/entries`

```json
[
  { "employee_id": 1, "date": "2026-03-03", "code": "Б", "hours": null },
  { "employee_id": 2, "date": "2026-03-03", "code": "Я", "hours": 8 }
]
```

- Дата каждой записи должна входить в диапазон `year`/`month` табеля — иначе `400 Bad Request`.
- Используется `INSERT ... ON CONFLICT DO UPDATE` для upsert.
- Поля `updated_by` и `updated_at` таблицы `timesheets` обновляются при каждом изменении записей.

### Экспорт (скачивание файлов с авторизацией)

Фронтенд запрашивает экспорт через `fetch` с `getAuthHeaders()`, получает `blob` и инициирует скачивание через `URL.createObjectURL`. Прямые ссылки `<a href>` не используются, так как требуется JWT.

## Фронтенд

### Маршруты

- `/leader/timesheet` — табель менеджера (только его отдел)
- `/hr/timesheet` — HR-страница с выбором отдела и месяца

### Компонент `TimesheetGrid` (общий)

Файл: `components/timesheet/TimesheetGrid.tsx`

Пропсы: `timesheetId`, `entries`, `employees`, `month`, `year`, `readonly: boolean`, `onSave`.

- `readonly = true` когда статус `approved`, или когда пользователь — менеджер и статус `submitted`
- `readonly = false` для HR/admin при статусах `draft` и `submitted`

Отображение:
- Строки — сотрудники; столбцы — дни месяца (1–31)
- Каждая ячейка: верхняя строка — код (select из словаря), нижняя — часы (number input 0–24)
- Выходные (`В`) — серый фон
- Отпуск (`ОТ`) — синий фон
- Больничный (`Б`) — жёлтый фон
- Прогул (`П`) / `НН` — красный фон
- Итоговый столбец: сумма часов за месяц по сотруднику
- Кнопка "Сохранить" — batch-запрос только изменённых ячеек
- Кнопки "Экспорт Excel" и "Экспорт PDF" — через `fetch` + blob

### Страницы

**`pages/ManagerTimesheet.tsx`** (маршрут `/leader/timesheet`):
- Показывает табель отдела менеджера
- Selector месяца/года; кнопка "Создать табель" если ещё нет
- Кнопка "Отправить на утверждение" (`draft→submitted`)
- `TimesheetGrid` с `readonly` в зависимости от статуса

**`pages/HRTimesheet.tsx`** (маршрут `/hr/timesheet`):
- Selector отдела (из списка всех отделов)
- Selector месяца/года
- `TimesheetGrid` с возможностью редактирования при `draft`/`submitted`
- Кнопка "Утвердить" (`submitted→approved`) и "Вернуть на доработку" (`approved→submitted`)

### Сайдбар (`components/layout/Sidebar.tsx`)

- `getManagerNavigation`: добавить `{ name: 'Табель', href: '/leader/timesheet', icon: TableIcon }`
- `getHRNavigation`: в группу "HR" добавить `{ name: 'Табель', href: '/hr/timesheet' }`

## Словарь кодов Т-13

```typescript
// lib/timesheetCodes.ts
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
]
```

## NPM-зависимости (бэкенд)

- `exceljs` — генерация Excel
- `pdfkit` — генерация PDF (форма Т-13)
