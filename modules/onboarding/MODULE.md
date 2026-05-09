# Модуль: Онбординг

## Основная информация

- **Код**: `onboarding`
- **Категория**: `hr`
- **Маршрут**: `/onboarding`
- **Иконка**: `UserPlus`
- **Сортировка**: 60
- **Описание**: Адаптация новых сотрудников

## Файловая структура

```
modules/onboarding/
└── pages/
    ├── Onboarding.tsx
    └── HROnboarding.tsx
```

## API эндпоинты

**Файл**: `backend/src/routes/onboarding.js` (814 строк)

### Шаблоны (hr/admin)

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/onboarding/templates` | hr, admin | Список шаблонов |
| POST | `/api/onboarding/templates` | hr, admin | Создать шаблон (multipart) |
| PUT | `/api/onboarding/templates/:id` | hr, admin | Обновить шаблон (multipart) |
| DELETE | `/api/onboarding/templates/:id` | hr, admin | Удалить шаблон |

### Онбординг сотрудника

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/onboarding/me` | onboarding | Свой онбординг |
| POST | `/api/onboarding/documents/:id/access-token` | owner, hr, admin | Токен доступа к файлу |
| GET | `/api/onboarding/documents/:id/file` | token | Скачать файл шаблона |
| POST | `/api/onboarding/me/documents/:id/acknowledge` | onboarding | Подтвердить документ |

### Управление (hr/admin)

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/onboarding/` | hr, admin | Список онбордингов |
| POST | `/api/onboarding/` | hr, admin | Создать онбординг (создаёт пользователя) |
| GET | `/api/onboarding/:id` | hr, admin | Детали онбординга |
| DELETE | `/api/onboarding/:id` | hr, admin | Удалить онбординг |

## Роли и доступ

| Роль | Доступ |
|------|--------|
| employee | Нет (OnboardingRoute перенаправляет) |
| manager | Нет |
| hr | Управление шаблонами и онбордингами |
| admin | Управление шаблонами и онбордингами |
| onboarding | Только свой онбординг, просмотр и подтверждение документов |

## Особенности

- При подтверждении всех документов роль автоматически меняется с `onboarding` на `employee`
- Создание онбординга через POST создаёт нового пользователя с ролью `onboarding`

## Зависимости

**Frontend**:
- `@/shared/lib/*`
- `@/shared/components/ui/*`
- `@/shared/store/modulesStore`
- `@/core/auth/store/authStore`

**Backend**:
- MinIO S3 (файлы шаблонов)
- `bcryptjs` (хеширование пароля нового пользователя)
- `crypto` (токены доступа)
