# Модуль: Авторизация

## Основная информация

- **Код**: `auth`
- **Категория**: `general`
- **Маршрут**: `/login`, `/profile`
- **Иконка**: `Lock`
- **Сортировка**: 1
- **Описание**: Аутентификация, регистрация, профиль пользователя, хранение JWT

## Файловая структура

```
core/auth/
├── store/
│   └── authStore.ts
└── pages/
    ├── Login.tsx
    └── Profile.tsx
```

## API эндпоинты

**Файл**: `backend/src/routes/auth.js` (294 строки)

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| POST | `/api/auth/register` | public | Регистрация (rate-limited) |
| POST | `/api/auth/login` | public | Вход (rate-limited) |
| GET | `/api/auth/me` | token | Текущий пользователь (JWT verify) |

## Роли и доступ

| Роль | Доступ |
|------|--------|
| all | `/login` — публичная страница |
| all authenticated | `/profile` — внутри ProtectedRoute |

## Особенности

- `authStore` — Zustand store, токен сохраняется в cookie `auth_token` (7 дней)
- `checkAuth()` вызывается при загрузке приложения
- `getAuthHeaders()` / `getAuthHeadersWithContentType()` — утилиты для API-запросов

## Зависимости

**Frontend**:
- `zustand` (authStore, persist middleware, cookies)
- `@/shared/lib/*`

**Backend**:
- `bcryptjs` (хеширование паролей)
- `jsonwebtoken` (JWT)
- `backend/src/middleware/rateLimiter.js` (authLimiter)
- `backend/src/middleware/validation.js` (validateLogin, validateRegister)
