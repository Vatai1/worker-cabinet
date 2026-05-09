# Модуль: Навыки

## Основная информация

- **Код**: `skills`
- **Категория**: `hr`
- **Маршрут**: (нет отдельного маршрута — внутри EmployeeProfile)
- **Иконка**: `Wrench`
- **Сортировка**: 85
- **Описание**: Управление навыками и компетенциями сотрудников

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

### Навыки сотрудников

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/users/skills/all` | all | Все навыки с сотрудниками |
| POST | `/api/users/:id/skills` | own, admin | Добавить навык |
| DELETE | `/api/users/:id/skills` | own, admin | Удалить навык |

### Справочник навыков

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/dictionaries/skills` | hr, admin | Список навыков из справочника |
| POST | `/api/dictionaries/skills` | hr, admin | Добавить навык в справочник |
| PUT | `/api/dictionaries/skills/:id` | hr, admin | Обновить навык |
| DELETE | `/api/dictionaries/skills/:id` | hr, admin | Удалить навык |

## Роли и доступ

| Роль | Доступ |
|------|--------|
| employee | Просмотр, управление своими навыками |
| manager | Просмотр |
| hr | Полное управление справочником и навыками |
| admin | Полное управление |
| onboarding | Нет (внутри EmployeeProfile) |

## Зависимости

**Frontend**:
- `@/shared/lib/*`
- `@/shared/components/ui/*`
