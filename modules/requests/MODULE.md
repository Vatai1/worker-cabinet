# Модуль: Заявки (дашборды)

## Основная информация

- **Код**: `requests`
- **Категория**: `work`
- **Маршрут**: `/requests`, `/leader`, `/manager`
- **Иконка**: `ClipboardCheck`
- **Сортировка**: 25
- **Описание**: Дашборды заявок для сотрудников, руководителей и менеджеров

## Файловая структура

```
modules/requests/
├── store/
│   └── requestsStore.ts
├── pages/
│   ├── Requests.tsx
│   ├── ManagerDashboard.tsx
│   └── LeaderDashboard.tsx
└── components/forms/
    └── VacationRequestForm.tsx
```

## API эндпоинты

Модуль не имеет собственного бэкенд-роутера. Использует эндпоинты других модулей:

| Источник | Эндпоинты |
|----------|-----------|
| `modules/vacation` | `/api/vacation/requests`, `/api/vacation/calendar` |
| `modules/projects` | `/api/projects/` |
| `modules/timesheet` | `/api/timesheet/` |

## Роли и доступ

| Роль | Доступ |
|------|--------|
| employee | `/dashboard`, `/requests` |
| manager | `/manager`, `/leader` (если руководитель), `/requests` |
| hr | `/requests` |
| admin | `/requests` |
| onboarding | Заблокировано (BlockOnboardingRoute) |

## Зависимости

**Frontend**:
- `@/shared/lib/*`
- `@/shared/components/ui/*`
- `@/core/auth/store/authStore`

**Backend**:
- Делегирует к модулям vacation, projects, timesheet
