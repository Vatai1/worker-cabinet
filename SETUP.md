# Worker Cabinet - Инструкция по установке

Полнофункциональная система управления отпусками сотрудников с фронтендом на React и бэкендом на Node.js + PostgreSQL.

## Требования

- Node.js 18+
- PostgreSQL 14+
- npm или yarn

## Быстрый старт

### 1. Установка зависимостей

```bash
# Установка фронтенда
npm install

# Установка бэкенда
npm run backend:install
```

### 2. Настройка базы данных

Убедитесь, что PostgreSQL установлен и работает. Создайте базу данных:

```bash
# В PostgreSQL
createdb worker_cabinet

# Или через psql
psql -U postgres
CREATE DATABASE worker_cabinet;
\q
```

### 3. Настройка переменных окружения

#### Backend (`backend/.env`)

```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=worker_cabinet
DB_USER=postgres
DB_PASSWORD=postgres

JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d

FRONTEND_URL=http://localhost:3000
```

**Измените `DB_PASSWORD` на ваш пароль PostgreSQL!**

#### Frontend (`.env`)

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

### 4. Миграции и начальные данные

```bash
# Создать таблицы
npm run backend:migrate

# Заполнить тестовыми данными
npm run backend:seed
```

### 5. Запуск приложения

```bash
# Запуск фронтенда и бэкенда одновременно
npm run dev
```

Это запустит:
- Фронтенд: http://localhost:3000
- Бэкенд: http://localhost:5000

## Тестовые пользователи

После запуска `seed` будут доступны следующие пользователи (пароль для всех: `password123`):

| Email | Роль | Описание |
|-------|------|-----------|
| ivanov@example.com | employee | Сотрудник |
| petrov@example.com | manager | Руководитель отдела |
| sidorov@example.com | employee | Сотрудник |
| ivanova@example.com | employee | Сотрудник |
| petrova@example.com | employee | Сотрудник |

## Структура проекта

```
worker-cabinet/
├── backend/                 # Бэкенд на Node.js
│   ├── src/
│   │   ├── config/         # Конфигурация
│   │   ├── routes/         # API маршруты
│   │   ├── middleware/     # Middleware (auth)
│   │   ├── db/             # Миграции и seed
│   │   └── server.js       # Точка входа
│   ├── package.json
│   ├── .env                # Конфигурация БД
│   └── README.md
├── components/             # React компоненты
├── pages/                  # Страницы приложения
├── services/               # API клиенты
├── store/                  # State management (Zustand)
├── types/                  # TypeScript типы
└── package.json            # Фронтенд зависимости
```

## API Endpoints

### Auth (http://localhost:5000/api/auth)

- `POST /register` - Регистрация
- `POST /login` - Вход
- `GET /me` - Текущий пользователь

### Vacation (http://localhost:5000/api/vacation)

- `GET /requests` - Список заявок
- `GET /balance/:userId` - Баланс пользователя
- `POST /requests` - Создать заявку
- `PUT /requests/:id` - Обновить заявку
- `POST /requests/:id/approve` - Согласовать
- `POST /requests/:id/reject` - Отклонить
- `POST /requests/:id/cancel` - Отменить
- `GET /calendar` - Календарь отпусков

### Users (http://localhost:5000/api/users)

- `GET /` - Список пользователей
- `GET /:id` - Данные пользователя

## Возможности

### Сотрудники
- ✅ Создание заявок на отпуск
- ✅ Просмотр баланса отпускных дней
- ✅ Просмотр истории заявок
- ✅ Отмена заявок на согласовании
- ✅ Календарь отпусков отдела
- ✅ Опция проезда к месту проведения отпуска

### Руководители
- ✅ Всё, что доступно сотрудникам
- ✅ Просмотр заявок подчинённых
- ✅ Согласование/отклонение заявок
- ✅ Отмена согласованных отпусков
- ✅ Управление ограничениями на пересечение отпусков

### HR
- ✅ Все функции руководителя
- ✅ Управление балансами дней
- ✅ Просмотр всех сотрудников

## Разработка

### Запуск только фронтенда

```bash
npm run dev:frontend
```

### Запуск только бэкенда

```bash
npm run dev:backend
```

### Linting

```bash
npm run lint
npm run typecheck
```

## Troubleshooting

### Ошибка "ECONNREFUSED" при подключении к БД

Убедитесь, что PostgreSQL запущен:
```bash
# macOS
brew services list
brew services start postgresql

# Linux
sudo systemctl status postgresql
sudo systemctl start postgresql
```

### Ошибка "password authentication failed"

Проверьте пароль в `backend/.env`:
```env
DB_PASSWORD=your_actual_password
```

### Ошибка "role does not exist"

Создайте пользователя в PostgreSQL:
```bash
psql -U postgres
CREATE USER worker_cabinet WITH PASSWORD 'password';
GRANT ALL PRIVILEGES ON DATABASE worker_cabinet TO worker_cabinet;
\q
```

## Технологии

**Frontend:**
- React 18
- TypeScript
- Vite
- React Router
- Zustand (state management)
- Tailwind CSS
- date-fns

**Backend:**
- Node.js
- Express
- PostgreSQL
- JWT
- bcrypt

## Лицензия

MIT
