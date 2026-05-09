# Модуль: Табель

## Основная информация

- **Код**: `timesheet`
- **Категория**: `work`
- **Маршрут**: `/leader/timesheet`
- **Иконка**: `Calendar`
- **Сортировка**: 50
- **Описание**: Учёт рабочего времени по форме Т-13

## Файловая структура

```
modules/timesheet/
└── pages/
    ├── ManagerTimesheet.tsx
    └── HRTimesheet.tsx
```

## API эндпоинты

**Файл**: `backend/src/routes/timesheet.js` (591 строка)

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/timesheet/` | manager, hr, admin | Список табелей (manager: свой отдел) |
| POST | `/api/timesheet/` | manager, hr, admin | Создать табель (manager: авто-отдел) |
| GET | `/api/timesheet/:id` | manager, hr, admin | Детали табеля |
| PUT | `/api/timesheet/:id/entries` | manager, hr, admin | Обновить записи (без отпускных кодов) |
| PUT | `/api/timesheet/:id/status` | manager, hr, admin | Изменить статус (manager: draft->submitted, HR: submitted->approved) |
| POST | `/api/timesheet/:id/submit-today` | manager, hr, admin | Отметить сегодня |
| GET | `/api/timesheet/:id/export/excel` | manager, hr, admin | Экспорт XLSX |
| GET | `/api/timesheet/:id/export/pdf` | manager, hr, admin | Экспорт PDF |

## Роли и доступ

| Роль | Доступ |
|------|--------|
| employee | Нет доступа (ManagerRoute) |
| manager | Табели своего отдела, draft -> submitted |
| hr | Все табели, submitted -> approved, approved -> submitted |
| admin | Все табели, полный контроль |
| onboarding | Нет доступа |

## Зависимости

**Frontend**:
- `@/shared/lib/*`
- `@/shared/components/ui/*`
- `@/shared/store/modulesStore`

**Backend**:
- `exceljs` (XLSX экспорт)
- `pdfkit` (PDF экспорт)
- `backend/src/lib/dateUtils.js`
- `backend/src/lib/timesheetExport.js`
