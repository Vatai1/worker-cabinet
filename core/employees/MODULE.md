# Модуль: Сотрудники

## Основная информация

- **Код**: `employees`
- **Категория**: `admin`
- **Маршрут**: `/employees`
- **Иконка**: `Users`
- **Сортировка**: 2
- **Описание**: Справочник сотрудников, профили, навыки, аватары

## Файловая структура

```
core/employees/
└── pages/
    ├── Employees.tsx
    └── EmployeeProfile.tsx
```

## API эндпоинты

**Файл**: `backend/src/routes/users.js` (806 строк)

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/users/` | employee, manager, hr, admin | Список сотрудников |
| GET | `/api/users/search` | all | Поиск сотрудников |
| GET | `/api/users/skills/all` | all | Все навыки с сотрудниками |
| GET | `/api/users/positions/all` | all | Все должности |
| GET | `/api/users/:id` | employee: свой | Профиль сотрудника |
| PUT | `/api/users/:id` | employee: свой | Обновить профиль |
| POST | `/api/users/:id/skills` | employee: свой | Добавить навык |
| DELETE | `/api/users/:id/skills` | employee: свой | Удалить навык |
| POST | `/api/users/me/avatar` | all | Загрузить аватар (multipart) |

## Роли и доступ

| Роль | Доступ |
|------|--------|
| employee | Свой профиль, навыки, аватар |
| manager | Все профили |
| hr | Все профили |
| admin | Все профили |
| onboarding | Нет (ProtectedRoute) |

## Зависимости

**Frontend**:
- `@/shared/lib/*`
- `@/shared/components/ui/*`
- `@/modules/skills/components/*` (SkillsCard, AddSkillModal)

**Backend**:
- MinIO S3 (аватары)
- `multer` (upload middleware)
