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

### Для HR / администраторов
- Управление балансами отпускных дней по годам
- Онбординг новых сотрудников: создание, назначение шаблонов документов
- Создание и проведение опросов
- Шаблоны документов (PDF/DOCX) для онбординга
- Визуальная иерархия организации (React Flow)
- HR-справочники: должности, типы договоров, отделы, грейды, навыки и др.
- Полный обзор отпусков по всем сотрудникам

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
- MinIO (S3-совместимое хранилище файлов)
- Multer (загрузка файлов)
- Telegram Bot API (опционально)

## Тестовые пользователи

После запуска `seed` будут доступны следующие пользователи:

| Email | Пароль | Роль |
|-------|--------|------|
| ivanov@example.com | password123 | Сотрудник |
| petrov@example.com | password123 | Руководитель |
| sidorov@example.com | password123 | Сотрудник |
| ivanova@example.com | password123 | Сотрудник |
| petrova@example.com | password123 | Сотрудник |

## API

API endpoints описаны в [backend/README.md](./backend/README.md)

## Структура проекта

```
worker-cabinet/
├── backend/                  # Backend API (Node.js + Express)
│   └── src/
│       ├── routes/           # auth, vacation, users, departments, projects,
│       │                     # surveys, onboarding, documents, notifications,
│       │                     # hierarchy, dictionaries, telegram
│       ├── middleware/       # JWT auth, multer upload, rate limiter
│       ├── services/         # Бизнес-логика
│       ├── config/           # database.js, s3.js (MinIO)
│       └── db/               # migrate.js, seed.js, schema.sql
├── components/
│   ├── calendar/             # Компоненты календаря
│   ├── layout/               # Header, Sidebar, Layout
│   ├── modals/               # Модальные окна
│   ├── forms/                # Формы
│   └── ui/                   # Переиспользуемые примитивы
├── pages/                    # По одному файлу на маршрут
├── services/                 # API-клиенты
├── store/                    # Zustand stores
├── types/                    # TypeScript интерфейсы
└── lib/                      # Утилиты: cn(), formatDate(), authHeaders, api.ts
```

## Лицензия

MIT
