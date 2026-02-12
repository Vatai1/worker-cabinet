# Worker Cabinet

Система управления отпусками сотрудников с календарём, учётом балансов и workflow согласования.

## 🚀 Быстрый старт

```bash
# Установка
npm install
npm run backend:install

# Настройка БД
npm run backend:migrate
npm run backend:seed

# Запуск (рекомендуемый способ)
./scripts/manage-server.sh start

# Или стандартный способ
npm run dev
```

Приложение будет доступно по адресам:
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:5001

### Управление сервером

Для удобного управления сервером используйте скрипт:

```bash
# Запуск
./scripts/manage-server.sh start

# Остановка
./scripts/manage-server.sh stop

# Статус
./scripts/manage-server.sh status

# Перезапуск
./scripts/manage-server.sh restart

# Просмотр логов
./scripts/manage-server.sh logs
./scripts/manage-server.sh logs frontend
./scripts/manage-server.sh logs backend

# Мониторинг логов в реальном времени
./scripts/manage-server.sh tail
```

Подробнее см. [SERVER_MANAGEMENT.md](./SERVER_MANAGEMENT.md)

## 📝 Документация

Полная инструкция по установке и настройке в [SETUP.md](./SETUP.md)

## ✨ Возможности

### Для сотрудников
- Создание заявок на отпуск через интерактивный календарь
- Просмотр баланса отпускных дней
- Календарь отпусков всего отдела
- 7 типов отпусков (ежегодный, учебный, без сохранения ЗП и др.)
- Опция проезда к месту проведения отпуска

### Для руководителей
- Согласование/отклонение заявок подчинённых
- Отмена уже согласованных отпусков
- Просмотр загрузки отдела
- Управление ограничениями на пересечение отпусков

### Для HR
- Управление балансами отпускных дней
- Полный обзор по всем сотрудникам
- Формирование отчётности

## 🎯 Технологии

**Frontend:**
- React 18 + TypeScript
- Vite
- React Router v6
- Zustand (state management)
- Tailwind CSS
- date-fns

**Backend:**
- Node.js + Express
- PostgreSQL
- JWT authentication
- REST API

## 📸 Скриншоты

> TODO: Добавить скриншоты интерфейса

## 🔐 Тестовые пользователи

| Email | Пароль | Роль |
|-------|--------|------|
| ivanov@example.com | password123 | Сотрудник |
| petrov@example.com | password123 | Руководитель |

## 📖 API Documentation

API endpoints описаны в [backend/README.md](./backend/README.md)

## 🗂️ Структура проекта

```
worker-cabinet/
├── backend/           # Backend API
├── components/        # React компоненты
│   ├── calendar/      # Календарь
│   ├── layout/        # Layout компоненты
│   ├── modals/        # Модальные окна
│   └── ui/            # UI компоненты
├── pages/             # Страницы
├── services/          # API клиенты
├── store/             # State management
├── types/             # TypeScript типы
└── specs/             # Спецификации функций
```

## 📄 Лицензия

MIT
