# Модуль: Настройки

## Основная информация

- **Код**: `settings`
- **Категория**: `general`
- **Маршрут**: `/settings`
- **Иконка**: `Settings`
- **Сортировка**: 999
- **Описание**: Настройки пользователя и системы

## Файловая структура

```
core/settings/
└── pages/
    └── Settings.tsx
```

## API эндпоинты

Нет собственного бэкенд-роутера. Использует:

| Источник | Эндпоинт | Роли | Описание |
|----------|----------|------|----------|
| `admin.js` | `GET /api/admin/settings` | admin | Системные настройки |
| `admin.js` | `PUT /api/admin/settings` | admin | Обновить настройки |
| `users.js` | `PUT /api/users/:id` | employee: свой | Настройки профиля |

## Роли и доступ

| Роль | Доступ |
|------|--------|
| employee | Свои настройки |
| manager | Свои настройки |
| hr | Свои настройки |
| admin | Свои настройки + системные |
| onboarding | Нет (ProtectedRoute) |

## Зависимости

**Frontend**:
- `@/core/auth/store/authStore`
- `@/shared/lib/*`
- `@/shared/components/ui/*`
