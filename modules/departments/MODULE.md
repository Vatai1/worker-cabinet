# Модуль: Отделы

## Основная информация

- **Код**: `departments`
- **Категория**: `admin`
- **Маршрут**: `/departments`
- **Иконка**: `Building2`
- **Сортировка**: 75
- **Описание**: Справочник отделов компании

## Файловая структура

```
modules/departments/
└── pages/
    ├── Departments.tsx
    └── DepartmentDetail.tsx
```

## API эндпоинты

**Файл**: `backend/src/routes/departments.js` (242 строки)

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/departments/` | all | Список отделов |
| GET | `/api/departments/:id` | all | Детали отдела с сотрудниками |
| PATCH | `/api/departments/vacation-block-all` | hr, admin | Заблокировать отпуска во всех отделах |
| PATCH | `/api/departments/:id/vacation-block` | hr, admin | Заблокировать/разблокировать отпуска в отделе |

## Роли и доступ

| Роль | Доступ |
|------|--------|
| employee | Просмотр |
| manager | Просмотр |
| hr | Просмотр + блокировка отпусков |
| admin | Просмотр + блокировка отпусков |
| onboarding | Нет (нет ModuleGuard, ProtectedRoute) |

## Зависимости

**Frontend**:
- `@/shared/lib/*`
- `@/shared/components/ui/*`
