# Модуль: Админ-панель

## Основная информация

- **Код**: `admin`
- **Категория**: `admin`
- **Маршрут**: `/admin`, `/hr`
- **Иконка**: `Shield`
- **Сортировка**: 999
- **Описание**: Управление пользователями, ролями, модулями, аналитика, аудит

## Файловая структура

```
core/admin/
├── types/
│   └── admin.ts
├── pages/
│   ├── AdminPanel.tsx
│   ├── AdminAnalytics.tsx
│   └── HRDictionaries.tsx
└── components/modals/
    ├── AddProjectModal.tsx
    └── AddDictItemModal.tsx
```

## API эндпоинты

**Файл**: `backend/src/routes/admin.js` (1672 строки)

### Роли и права

| Метод | Путь | Описание |
|--------|------|----------|
| GET | `/api/admin/roles` | Список ролей |
| POST | `/api/admin/roles` | Создать роль |
| PUT | `/api/admin/roles/:id` | Обновить роль |
| DELETE | `/api/admin/roles/:id` | Удалить роль |
| GET | `/api/admin/permissions` | Список разрешений |

### Управление пользователями

| Метод | Путь | Описание |
|--------|------|----------|
| GET | `/api/admin/users` | Список (пагинация, фильтры) |
| PUT | `/api/admin/users/:id` | Обновить пользователя |
| PUT | `/api/admin/users/:id/role` | Изменить роль |
| PUT | `/api/admin/users/:id/status` | Изменить статус |
| POST | `/api/admin/users/:id/reset-password` | Сброс пароля |
| POST | `/api/admin/users/:id/unlock` | Разблокировать |
| PUT | `/api/admin/users/bulk-status` | Массовый статус |
| PUT | `/api/admin/users/bulk-role` | Массовая роль |
| GET | `/api/admin/users/export` | Экспорт CSV |

### Настройки

| Метод | Путь | Описание |
|--------|------|----------|
| GET | `/api/admin/settings` | Системные настройки |
| PUT | `/api/admin/settings` | Обновить настройки |

### Аудит и безопасность

| Метод | Путь | Описание |
|--------|------|----------|
| GET | `/api/admin/audit-log` | Журнал аудита |
| GET | `/api/admin/error-log` | Журнал ошибок |
| GET | `/api/admin/security/failed-logins` | Неудачные входы |
| GET | `/api/admin/security/locked-accounts` | Заблокированные аккаунты |

### Аналитика и отчёты

| Метод | Путь | Описание |
|--------|------|----------|
| GET | `/api/admin/stats` | Статистика системы |
| GET | `/api/admin/analytics/activity` | Активность пользователей |
| GET | `/api/admin/reports/turnover` | Текучесть кадров |
| GET | `/api/admin/reports/tenure-age` | Стаж и возраст |
| GET | `/api/admin/reports/unused-vacations` | Неиспользованные отпуска |
| GET | `/api/admin/reports/project-load` | Загрузка по проектам |
| GET | `/api/admin/reports/vacations` | Отчёт по отпускам |
| GET | `/api/admin/reports/hires` | Отчёт по наймам |

### Модули

| Метод | Путь | Описание |
|--------|------|----------|
| GET | `/api/admin/modules` | Все модули |
| POST | `/api/admin/modules` | Создать модуль |
| PUT | `/api/admin/modules/:id` | Обновить модуль |
| DELETE | `/api/admin/modules/:id` | Удалить модуль |
| PUT | `/api/admin/modules/:id/toggle` | Вкл/выкл модуль |

### Словари

| Метод | Путь | Описание |
|--------|------|----------|
| GET | `/api/admin/dictionaries` | Все справочники |
| POST | `/api/admin/dictionaries/skills` | Добавить навык |
| DELETE | `/api/admin/dictionaries/skills/:id` | Удалить навык |

### Здоровье

| Метод | Путь | Описание |
|--------|------|----------|
| GET | `/api/admin/health` | Здоровье системы |

## Роли и доступ

| Роль | Доступ |
|------|--------|
| admin | Полный доступ ко всей админ-панели |
| hr | `/hr` — HRPanel (ограниченный набор функций) |

## Зависимости

**Frontend**:
- `@/shared/lib/*`
- `@/shared/components/ui/*`
- `@/shared/store/modulesStore`
- `@/core/admin/pages/AdminAnalytics`

**Backend**:
- Все остальные route-файлы (админ-панель управляет всем)
