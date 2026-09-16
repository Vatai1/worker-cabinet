# Модуль: Теги

## Основная информация

- **Код**: `skills`
- **Категория**: `hr`
- **Маршрут**: (нет отдельного маршрута — внутри EmployeeProfile)
- **Иконка**: `Tag`
- **Сортировка**: 85
- **Описание**: Управление тегами на профилях работников

## Файловая структура

```
modules/skills/
├── components/
│   ├── SkillsCard.tsx
│   └── modals/
│       └── AddSkillModal.tsx
```

## API эндпоинты

**Файлы**: `backend/src/routes/users.js`, `backend/src/routes/dictionaries.js`, `backend/src/routes/admin.js`

### Теги работников

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/users/skills/all` | all | Все теги с работниками |
| POST | `/api/users/:id/skills` | own, admin | Добавить тег |
| DELETE | `/api/users/:id/skills` | own, admin | Удалить тег |

`GET /api/users` также возвращает поле `skills: string[]` для каждого работника — используется списком работников (`core/employees/pages/Employees.tsx`) для поиска и фильтрации по тегам.

### Справочник тегов

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/dictionaries/skills` | hr, admin | Список тегов из справочника |
| POST | `/api/dictionaries/skills` | hr, admin | Добавить тег в справочник |
| PUT | `/api/dictionaries/skills/:id` | hr, admin | Обновить тег |
| DELETE | `/api/dictionaries/skills/:id` | hr, admin | Удалить тег |

## Роли и доступ

| Роль | Доступ |
|------|--------|
| employee | Просмотр, управление своими тегами |
| manager | Просмотр |
| hr | Полное управление справочником и тегами |
| admin | Полное управление |
| onboarding | Нет (внутри EmployeeProfile) |

## Зависимости

**Frontend**:
- `@/shared/lib/*`
- `@/shared/components/ui/*`
