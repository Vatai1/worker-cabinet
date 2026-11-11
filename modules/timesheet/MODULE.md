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

Обработчики находятся в `backend/src/routes/timesheet.js`.

| Метод | Путь | Доступ | Назначение |
|--------|------|--------|------------|
| GET | `/api/timesheet` | Начальник, HR | Список месячных табелей. Начальник видит закреплённые отделы |
| POST | `/api/timesheet` | Начальник, HR | Создать месячный табель |
| GET | `/api/timesheet/:id` | Начальник, HR | Состав отдела, отметки и состояния дней |
| PUT | `/api/timesheet/:id/entries` | Начальник | Сохранить отметки в открытом дне |
| POST | `/api/timesheet/:id/days/:date/submit` | Начальник | Отправить сегодняшний или возвращённый день вместе с правками |
| POST | `/api/timesheet/:id/submit-today` | Начальник | Отправить сохранённые отметки за сегодня |
| GET | `/api/timesheet/days/submitted` | HR | Очередь отправленных дней по отделам |
| PUT | `/api/timesheet/:id/days/:date/review` | HR | Принять день или вернуть начальнику с причиной |
| PUT | `/api/timesheet/:id/status` | Начальник, HR | Переходы для исторических месячных табелей без дневных отправок |
| GET | `/api/timesheet/:id/export/excel` | Начальник, HR | Экспорт XLSX |
| GET | `/api/timesheet/:id/export/pdf` | Начальник, HR | Экспорт PDF |

Начальник отправляет заполненный день на проверку. HR принимает его или возвращает с причиной. Отправленные и принятые дни закрыты для редактирования. Для возвращённого дня начальник получает уведомление и может исправить отметки даже после даты табеля.

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
