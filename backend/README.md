# Worker Cabinet — Backend

Backend API для HR-системы управления сотрудниками.

## Технологии

- Node.js + Express
- PostgreSQL
- JWT аутентификация
- MinIO (S3-совместимое хранилище файлов)
- Multer (загрузка файлов)

## Установка и настройка

### 1. Установите зависимости

```bash
cd backend
npm install
```

### 2. Настройте переменные окружения

Скопируйте `deploy/.env.example` в `backend/.env` и заполните значения:

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

# MinIO (хранилище файлов)
S3_ENDPOINT=localhost
S3_PORT=9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=worker-cabinet
```

### 3. Запустите миграции

```bash
npm run migrate
```

### 4. Заполните тестовыми данными (опционально)

```bash
npm run seed
```

## Запуск

```bash
# Режим разработки (hot reload)
npm run dev

# Продакшн
npm start
```

Сервер будет доступен на http://localhost:5000

## API endpoints

### Аутентификация (`/api/auth`)

- `POST /register` — Регистрация пользователя
- `POST /login` — Вход в систему
- `GET /me` — Данные текущего пользователя

### Пользователи (`/api/users`)

- `GET /` — Список пользователей
- `GET /:id` — Пользователь по ID
- `PUT /:id` — Обновить профиль
- `PUT /:id/avatar` — Загрузить фото
- `PUT /:id/role` — Изменить роль (hr/admin)
- `GET /:id/documents` — Документы пользователя

### Отпуска (`/api/vacation`)

- `GET /requests` — Список заявок (с фильтрами)
- `POST /requests` — Создать заявку
- `PUT /requests/:id` — Обновить заявку
- `POST /requests/:id/approve` — Согласовать
- `POST /requests/:id/reject` — Отклонить
- `POST /requests/:id/cancel` — Отменить
- `GET /balance/:userId` — Баланс пользователя
- `PUT /balance/:userId` — Обновить баланс (hr/admin)
- `GET /calendar` — Календарь отпусков
- `GET /block-all` — Статус блокировки всех отпусков
- `POST /block-all` — Установить блокировку (manager)

### Отделы (`/api/departments`)

- `GET /` — Список отделов
- `POST /` — Создать отдел (hr/admin)
- `PUT /:id` — Обновить отдел
- `DELETE /:id` — Удалить отдел
- `PUT /:id/manager` — Назначить руководителя

### Проекты (`/api/projects`)

- `GET /` — Список проектов
- `POST /` — Создать проект
- `GET /:id` — Проект по ID
- `PUT /:id` — Обновить проект
- `DELETE /:id` — Удалить проект
- `GET /:id/documents` — Документы проекта
- `POST /:id/documents` — Загрузить документ в проект

### Документы (`/api/documents`)

- `GET /` — Список документов
- `POST /` — Загрузить документ
- `DELETE /:id` — Удалить документ

### Опросы (`/api/surveys`)

- `GET /` — Список опросов
- `POST /` — Создать опрос (hr/admin)
- `GET /:id` — Опрос по ID
- `PUT /:id` — Обновить опрос
- `DELETE /:id` — Удалить опрос
- `POST /:id/submit` — Отправить ответы
- `GET /:id/results` — Результаты опроса (hr/admin)

### Онбординг (`/api/onboarding`)

- `GET /templates` — Шаблоны документов
- `POST /templates` — Создать шаблон
- `DELETE /templates/:id` — Удалить шаблон
- `GET /me` — Онбординг текущего пользователя
- `POST /me/documents/:id/acknowledge` — Подтвердить документ
- `GET /` — Список онбординг-пользователей (hr/admin)
- `POST /` — Создать онбординг для пользователя
- `GET /:id` — Онбординг пользователя по ID

### Уведомления (`/api/notifications`)

- `GET /` — Список уведомлений
- `PUT /:id/read` — Отметить как прочитанное
- `PUT /read-all` — Отметить все как прочитанные

### Иерархия (`/api/hierarchy`)

- `GET /` — Получить данные иерархии
- `PUT /` — Сохранить данные иерархии (hr/admin)

### Справочники (`/api/dictionaries`)

- `GET /` — Все справочники
- `GET /:type` — Значения справочника по типу
- `POST /:type` — Добавить значение
- `PUT /:type/:id` — Обновить значение
- `DELETE /:type/:id` — Удалить значение

Типы справочников: `position`, `contract_type`, `department_type`, `grade`, `skill`, `education`, `language`, `doc_type`

## Тестовые пользователи

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
│   │   ├── database.js       # Конфигурация PostgreSQL (pg Pool)
│   │   └── s3.js             # MinIO клиент
│   ├── routes/               # Маршруты API
│   │   ├── auth.js
│   │   ├── vacation.js
│   │   ├── users.js
│   │   ├── departments.js
│   │   ├── projects.js
│   │   ├── documents.js
│   │   ├── userDocuments.js
│   │   ├── surveys.js
│   │   ├── onboarding.js
│   │   ├── notifications.js
│   │   ├── hierarchy.js
│   │   ├── dictionaries.js
│   │   └── dictionaries.js
│   ├── middleware/
│   │   ├── auth.js           # JWT middleware
│   │   ├── upload.js         # Multer (MinIO)
│   │   ├── errors.js
│   │   └── rateLimiter.js
│   ├── services/             # Бизнес-логика
│   ├── db/
│   │   ├── schema.sql        # SQL-схема БД
│   │   ├── migrate.js        # Скрипт миграций
│   │   └── seed.js           # Тестовые данные
│   └── server.js             # Точка входа Express
├── package.json
└── .env
```
