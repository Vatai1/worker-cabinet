# Табель посещаемости — Спецификация

**Дата:** 2026-03-31
**Статус:** Утверждён

## Обзор

Раздел "Табель" позволяет менеджерам вести учёт посещаемости сотрудников своего отдела по форме Т-13, а HR/admin — просматривать и редактировать табели по всей организации с возможностью экспорта в Excel и PDF.

## Роли и доступ

| Роль | Возможности |
|------|-------------|
| `manager` | Создание, просмотр и редактирование табеля своего отдела |
| `hr` / `admin` | Создание, просмотр и редактирование табелей любого отдела; выбор отдела из списка |

## База данных

### Таблица `timesheets`

```sql
CREATE TABLE timesheets (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  year          INTEGER NOT NULL,
  month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  status        VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft | submitted | approved
  created_by    INTEGER REFERENCES users(id),
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
  hours        NUMERIC(4,1),
  UNIQUE(timesheet_id, employee_id, date)
);
```

### Автозаполнение при создании табеля

При `POST /api/timesheet` бэкенд автоматически генерирует записи:
1. Суббота и воскресенье → код `В`, часы `null`
2. Одобренные отпуска сотрудников отдела за период → код `ОТ`, часы `null`
3. Остальные рабочие дни → код `Я`, часы `8`

Менеджер или HR может переопределить любую ячейку.

## API

Маршрут: `/api/timesheet`

| Метод | Путь | Описание | Доступ |
|-------|------|----------|--------|
| GET | `/` | Список табелей | manager (свой отдел), hr/admin (все) |
| POST | `/` | Создать табель с автозаполнением | manager, hr/admin |
| GET | `/:id` | Получить табель со всеми записями | manager (свой), hr/admin (любой) |
| PUT | `/:id/entries` | Batch-обновление ячеек | manager (свой), hr/admin (любой) |
| PUT | `/:id/status` | Изменить статус (draft→submitted→approved) | manager (свой), hr/admin (любой) |
| GET | `/:id/export/excel` | Скачать Excel | manager (свой), hr/admin (любой) |
| GET | `/:id/export/pdf` | Скачать PDF (форма Т-13) | manager (свой), hr/admin (любой) |

### Тело запроса `PUT /:id/entries`

```json
[
  { "employee_id": 1, "date": "2026-03-03", "code": "Б", "hours": null },
  { "employee_id": 2, "date": "2026-03-03", "code": "Я", "hours": 8 }
]
```

Используется `INSERT ... ON CONFLICT DO UPDATE` для upsert каждой ячейки.

## Фронтенд

### Маршруты

- `/manager/timesheet` — табель менеджера (только его отдел)
- `/hr/timesheet` — HR-страница с выбором отдела и месяца

### Компонент `TimesheetGrid` (общий)

Принимает пропсы: `timesheetId`, `entries`, `employees`, `month`, `year`, `readonly?`, `onSave`.

Отображение:
- Строки — сотрудники
- Столбцы — дни месяца (1–31)
- Каждая ячейка: верхняя строка — код (select из словаря), нижняя — часы (number input 0–24)
- Выходные (В) — серый фон
- Отпуск (ОТ) — синий фон
- Больничный (Б) — жёлтый фон
- Прогул (П) / НН — красный фон
- Итоговый столбец: сумма рабочих часов за месяц
- Кнопка "Сохранить" — batch-запрос только изменённых ячеек
- Кнопки "Экспорт Excel" и "Экспорт PDF"

### Словарь кодов Т-13 (константы фронтенда)

```
Я   — Явка
ОТ  — Ежегодный отпуск
ОС  — Отпуск без сохранения ЗП
УО  — Учебный отпуск
Б   — Больничный
Т   — Временная нетрудоспособность без пособия
К   — Командировка
НН  — Неявка по невыясненной причине
В   — Выходной/праздник
ПР  — Прогул
ДО  — Дополнительный отпуск
ОЖ  — Отпуск по уходу за ребёнком
Р   — Отпуск по беременности и родам
ОЗ  — Отпуск без сохранения ЗП (гос. обязанности)
УВ  — Сокращённый рабочий день
```

### Сайдбар

- Менеджер: добавить пункт "Табель" → `/manager/timesheet`
- HR (группа "HR"): добавить подпункт "Табель" → `/hr/timesheet`

## Зависимости

- Бэкенд: `exceljs` для Excel, `pdfkit` для PDF
- Фронтенд: новые страницы `pages/ManagerTimesheet.tsx`, `pages/HRTimesheet.tsx`; компонент `components/timesheet/TimesheetGrid.tsx`

## Статусы табеля

- `draft` — в работе, редактирование разрешено
- `submitted` — отправлен менеджером, HR может редактировать
- `approved` — утверждён HR, редактирование заблокировано
