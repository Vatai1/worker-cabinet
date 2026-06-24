# Worker Cabinet

Полнофункциональная HR-система для управления сотрудниками, отпусками, онбордингом, опросами, документами, проектами и отделами.

## Быстрый старт

```bash
# Установка зависимостей
npm install
npm run backend:install

# Настройка БД
npm run backend:migrate
npm run backend:seed

# Запуск
npm run dev
```

Приложение будет доступно по адресам:
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:5000
- **API Docs**: http://localhost:5000/api-docs

## Деплой

### Dev окружение (локально + Docker для сервисов)

**Linux/Mac:**
```bash
./deploy/dev.sh start
```

**Windows (PowerShell):**
```powershell
.\deploy\dev.ps1 start
```

### Production (полностью в Docker)

**Linux/Mac:**
```bash
cd deploy
cp .env.example .env
./prod.sh deploy
```

**Windows (PowerShell):**
```powershell
cd deploy
Copy-Item .env.example .env
.\prod.ps1 deploy
```

Подробнее в [deploy/README.md](./deploy/README.md)

## Документация

Полная инструкция по установке и настройке в [SETUP.md](./SETUP.md)

## Возможности

### Для сотрудников
- Создание заявок на отпуск через интерактивный календарь
- Просмотр баланса отпускных дней (с переносом по годам)
- 7 типов отпусков (ежегодный, учебный, без сохранения ЗП и др.)
- Прохождение опросов
- Загрузка и просмотр личных документов
- Профиль с фото и персональными данными
- Уведомления о статусе заявок
- Онбординг: ознакомление с документами при первом входе

### Для руководителей
- Согласование/отклонение заявок подчинённых
- Отмена уже согласованных отпусков
- Просмотр загрузки отдела на календаре
- Управление ограничениями на пересечение отпусков (блокировка всех)
- Дашборд с текущими заявками
- Табель: отправка данных за текущий день с проверкой заполненности

### Для HR / администраторов
- Управление балансами отпускных дней по годам
- Онбординг новых сотрудников: создание, назначение шаблонов документов
- Создание и проведение опросов
- Шаблоны документов (PDF/DOCX) для онбординга
- Визуальная иерархия организации (React Flow)
- HR-справочники: должности, типы договоров, отделы, грейды, навыки и др.
- Полный обзор отпусков по всем сотрудникам
- Автосоздание табелей для всех отделов
- Настраиваемая страница входа (заголовок, описание, демо-кнопки)

## Роли пользователей

| Роль | Описание |
|------|----------|
| `employee` | Обычный сотрудник |
| `manager` | Руководитель отдела, согласует заявки |
| `hr` | HR-специалист, управляет справочниками и онбордингом |
| `admin` | Полный доступ |
| `onboarding` | Новый сотрудник, роль автоматически меняется на `employee` после завершения онбординга |

## Технологии

**Frontend:**
- React 18 + TypeScript
- Vite
- React Router v6
- Zustand (state management)
- Tailwind CSS
- React Flow (`@xyflow/react`) — для HR-иерархии
- date-fns

**Backend:**
- Node.js + Express
- PostgreSQL
- JWT аутентификация
- Swagger/OpenAPI 3.0 документация
- MinIO (S3-совместимое хранилище файлов)
- Multer (загрузка файлов)
- docxtemplater (генерация DOCX)
- ExcelJS + PDFKit (экспорт табелей)
- EWS/Outlook OAuth2 (интеграция с календарём)
- RabbitMQ (очередь уведомлений, опционально)

## Тестовые пользователи

После запуска `seed` будут доступны следующие пользователи (пароль: `password123`):

| Email | Роль | Имя |
|-------|------|-----|
| admin@example.com | Администратор | Алексей Смирнов |
| elena@example.com | HR | Елена Соколова |
| petrov@example.com | Руководитель | Пётр Петров |
| ivanov@example.com | Сотрудник | Иван Иванов |

На странице входа доступны демо-кнопки для быстрого входа под каждой ролью.

## API

Интерактивная документация API с кастомным тёмным интерфейсом доступна по адресу http://localhost:5000/api-docs (только в dev-режиме).

Возможности:
- Навигация по 111 endpoint'ам с группировкой по тегам
- Интерактивная панель «Попробовать» для отправки реальных запросов
- Авторизация через Bearer Token
- JSON syntax highlighting
- Экспорт OpenAPI спецификации
- Поиск endpoint'ов с hotkey `/`

Спецификация OpenAPI 3.0 также доступна в формате JSON: http://localhost:5000/api-docs.json

## Структура проекта

```
worker-cabinet/
├── backend/                  # Backend API (Node.js + Express)
│   └── src/
│       ├── routes/           # 15 групп: auth, vacation, users, departments, projects,
│       │                     # surveys, onboarding, documents, notifications,
│       │                     # hierarchy, dictionaries, timesheet, calendar, admin, assistant
│       ├── middleware/       # JWT auth, multer upload, rate limiter, CSRF, validation
│       ├── services/         # Бизнес-логика (ewsService, surveyService)
│       ├── config/           # database.js, s3.js (MinIO), rabbitmq.js, swagger.js
│       ├── db/               # migrate.js, seed.js, default-vacation-templates.js
│       ├── tests/            # HTTP-интеграционные тесты (node --test)
│       ├── cron/             # timesheetCron.js
│       └── public/           # Кастомный Swagger UI (api-docs.html)
├── core/                     # Основные модули приложения
│   ├── admin/                # AdminPanel, HRDictionaries, AdminAnalytics, модули
│   ├── auth/                 # Login, Profile, authStore
│   ├── employees/            # Employees, EmployeeProfile
│   └── settings/             # Settings
├── modules/                  # Бизнес-модули (каждый: pages/components/services/store/types)
│   ├── assistant/            # AI-ассистент (streaming chat)
│   ├── calendar/             # Календарь (Exchange EWS)
│   ├── departments/          # Отделы, DepartmentDetail
│   ├── documents/            # Документы (MinIO, OnlyOffice)
│   ├── hierarchy/            # HR-иерархия (React Flow)
│   ├── notifications/         # Уведомления
│   ├── onboarding/           # Онбординг (HR + сотрудник)
│   ├── projects/             # Проекты, Roadmap, документы
│   ├── requests/             # Заявки, ManagerDashboard
│   ├── skills/               # Навыки сотрудников
│   ├── surveys/              # Опросы, аналитика
│   ├── timesheet/            # Табель (manager + HR)
│   └── vacation/             # Отпуска, баланс, ограничения, заявки, переносы
├── shared/                   # Общие компоненты и утилиты
│   ├── components/           # Layout (Header, Sidebar), UI-примитивы, ConfirmDialog,
│   │                         # ErrorBoundary, TimesheetGrid
│   ├── data/                 # requestUtils.ts
│   ├── hooks/                # useModalOpen
│   ├── lib/                  # api, apiClient, authHeaders, cookies, utils, avatar,
│   │                         # documentUtils, timesheetCodes
│   ├── pages/                # Dashboard, HRPanel
│   ├── store/                # Zustand stores (modules, ui, siteSettings)
│   └── types/                # TypeScript интерфейсы
├── notification-service/     # Микросервис (RabbitMQ consumer + mailer)
├── deploy/                   # Docker Compose, dev/prod скрипты
└── docker/                   # Docker конфиги (Hermes agent)
```

## Тестирование

### HTTP-интеграционные тесты (183 теста)

Тесты покрывают все 16 групп маршрутов API через HTTP-запросы к запущенному серверу.

```bash
# Запустить сервер (если не запущен)
cd backend && node src/server.js &

# Запустить все тесты (нужен свежий сервер без rate-limit)
kill $(lsof -ti:5000) 2>/dev/null; sleep 1
cd backend && node src/server.js > /dev/null 2>&1 &
sleep 2 && rm -f /tmp/worker-cabinet-test-tokens.json
cd backend && node --test --test-concurrency=1 \
  src/tests/auth-extended.test.js \
  src/tests/departments.test.js \
  src/tests/notifications.test.js \
  src/tests/users.test.js \
  src/tests/hierarchy.test.js \
  src/tests/documents.test.js \
  src/tests/user-documents.test.js \
  src/tests/calendar.test.js \
  src/tests/dictionaries.test.js \
  src/tests/vacation.test.js \
  src/tests/surveys.test.js \
  src/tests/timesheet.test.js \
  src/tests/projects.test.js \
  src/tests/onboarding.test.js \
  src/tests/admin.test.js
```

Отдельные файлы:
```bash
cd backend && node --test src/tests/admin.test.js          # 39 тестов
cd backend && node --test src/tests/dictionaries.test.js   # 15 тестов
cd backend && node --test src/tests/projects.test.js       # 21 тест
cd backend && node --test src/tests/timesheet.test.js      # 14 тестов
# ... и т.д.
```

**Важно:** Auth-rate-limiter (10 запросов / 15 мин) требует перезапуска сервера между прогонами. Токены кэшируются в `/tmp/worker-cabinet-test-tokens.json` (TTL 5 мин).

### Покрытие по маршрутам

| Файл | Тестов | Маршруты |
|------|--------|----------|
| `admin.test.js` | 39 | `/admin/*` (users, roles, permissions, settings, stats, reports, audit, modules) |
| `projects.test.js` | 21 | `/projects/*` (CRUD, members, folders, documents, roadmap v1/v2) |
| `dictionaries.test.js` | 15 | `/dictionaries/*` (departments, skills, vacation-types, positions, managers) |
| `timesheet.test.js` | 14 | `/timesheet/*` (CRUD, entries, status workflow, export excel/pdf) |
| `surveys.test.js` | 13 | `/surveys/*` (CRUD, publish, respond, analytics, close) |
| `onboarding.test.js` | 12 | `/onboarding/*` (templates, records, self-service) |
| `users.test.js` | 12 | `/users/*` (list, search, profile, skills, projects) |
| `vacation.test.js` | 12 | `/vacation/*` (requests, calendar, restrictions, transfers, application) |
| `departments.test.js` | 7 | `/departments/*` (list, detail, vacation-block) |
| `notifications.test.js` | 7 | `/notifications/*` (list, unread, read, CRUD) |
| `calendar.test.js` | 6 | `/calendar/*` (OAuth, events, EWS, disconnect) |
| `hierarchy.test.js` | 6 | `/hierarchy/*` (get/save, department-level) |
| `user-documents.test.js` | 5 | `/user-documents/*` (list, download, preview, delete) |
| `auth-extended.test.js` | 5 | `/auth/*` (register, me) |
| `documents.test.js` | 3 | `/documents/*` (list for user/employee) |

## Лицензия

MIT
