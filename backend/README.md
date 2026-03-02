# Worker Cabinet Backend

Backend API для системы управления отпусками сотрудников.

## Технологии

- Node.js + Express
- PostgreSQL
- JWT аутентификация
- REST API

## Установка и настройка

### 1. Установите зависимости

```bash
cd backend
npm install
```

### 2. Настройте PostgreSQL

Убедитесь, что PostgreSQL установлен и работает.

Создайте базу данных (опционально - миграции создадут её автоматически):

```bash
psql -U postgres
CREATE DATABASE worker_cabinet;
\q
```

### 3. Настройте переменные окружения

Отредактируйте файл `.env`:

```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=worker_cabinet
DB_USER=postgres
DB_PASSWORD=your_password

JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d

FRONTEND_URL=http://localhost:3000
```

### 4. Запустите миграции

```bash
npm run migrate
```

Это создаст все необходимые таблицы в базе данных.

### 5. Заполните данными (опционально)

```bash
npm run seed
```

Это создаст тестовых пользователей и заявки на отпуск.

## Запуск

### Режим разработки

```bash
npm run dev
```

### Продакшн

```bash
npm start
```

Сервер будет доступен на http://localhost:5000

## API endpoints

### Аутентификация (/api/auth)

- `POST /register` - Регистрация пользователя
- `POST /login` - Вход в систему
- `GET /me` - Получить данные текущего пользователя

### Отпуска (/api/vacation)

- `GET /requests` - Получить список заявок (с фильтрами)
- `GET /requests/:id` - Получить заявку по ID
- `POST /requests` - Создать заявку
- `PUT /requests/:id` - Обновить заявку
- `POST /requests/:id/approve` - Согласовать заявку
- `POST /requests/:id/reject` - Отклонить заявку
- `POST /requests/:id/cancel` - Отменить заявку
- `GET /balance/:userId` - Получить баланс пользователя
- `GET /calendar` - Получить календарь отпусков

### Пользователи (/api/users)

- `GET /` - Получить список пользователей
- `GET /:id` - Получить пользователя по ID

## Тестовые пользователи

После запуска `seed` будут доступны следующие пользователи:

| Email | Пароль | Роль |
|-------|--------|------|
| ivanov@example.com | password123 | Сотрудник |
| petrov@example.com | password123 | Руководитель |
| sidorov@example.com | password123 | Сотрудник |
| ivanova@example.com | password123 | Сотрудник |
| petrova@example.com | password123 | Сотрудник |

## Структура проекта

```
backend/
├── src/
│   ├── config/
│   │   └── database.js       # Конфигурация БД
│   ├── routes/
│   │   ├── auth.js           # Маршруты авторизации
│   │   ├── vacation.js       # Маршруты отпусков
│   │   └── users.js          # Маршруты пользователей
│   ├── middleware/
│   │   └── auth.js           # Middleware для JWT
│   ├── db/
│   │   ├── schema.sql        # SQL схема БД
│   │   ├── migrate.js        # Скрипт миграций
│   │   └── seed.js           # Скрипт начальных данных
│   └── server.js             # Точка входа
├── package.json
└── .env                      # Переменные окружения
```
