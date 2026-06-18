# Деплой Worker Cabinet

## Архитектура

Два сервера:

```
┌─────────────────────────────────┐     ┌──────────────────────────────────┐
│  Сервер приложений (APP)        │     │  Сервер бэкенда (BACKEND)         │
│                                 │     │                                  │
│  ┌───────────────────────────┐  │     │  ┌────────────────────────────┐  │
│  │  nginx (frontend)        │──┼─────┼─►│  backend (API)             │  │
│  │  Раздача статики + /api  │  │     │  └────────────────────────────┘  │
│  └───────────────────────────┘  │     │  ┌────────────────────────────┐  │
│                                 │     │  │  PostgreSQL                │  │
│  docker-compose.app.yml         │     │  └────────────────────────────┘  │
│  deploy-app.sh                  │     │  ┌────────────────────────────┐  │
│                                 │     │  │  MinIO (S3)                │  │
│                                 │     │  └────────────────────────────┘  │
│                                 │     │  ┌────────────────────────────┐  │
│                                 │     │  │  OnlyOffice + Redis         │  │
│                                 │     │  └────────────────────────────┘  │
│                                 │     │  ┌────────────────────────────┐  │
│                                 │     │  │  RabbitMQ                  │  │
│                                 │     │  └────────────────────────────┘  │
│                                 │     │  ┌────────────────────────────┐  │
│                                 │     │  │  notification-service       │  │
│                                 │     │  └────────────────────────────┘  │
│                                 │     │  ┌────────────────────────────┐  │
│                                 │     │  │  Hermes Agent + SearXNG     │  │
│                                 │     │  └────────────────────────────┘  │
│                                 │     │                                  │
│                                 │     │  docker-compose.backend.yml      │
│                                 │     │  deploy-backend.sh               │
└─────────────────────────────────┘     └──────────────────────────────────┘
          Локальная сеть
```

## Быстрый старт

### 1. Сборка и пуш образов (машина разработчика)

```bash
export REGISTRY=your-registry.example.com
export FRONTEND_IMAGE=worker-cabinet-frontend:latest
export BACKEND_IMAGE=worker-cabinet-backend:latest
export NOTIFICATION_IMAGE=worker-cabinet-notification:latest

npm run docker:build
npm run docker:push
```

### 2. Деплой на сервер приложений

```bash
scp deploy/docker-compose.app.yml deploy/deploy-app.sh .env.app user@app-server:/opt/worker-cabinet/
ssh user@app-server
cd /opt/worker-cabinet
cp .env.app .env
chmod +x deploy-app.sh
./deploy-app.sh deploy
```

### 3. Деплой на сервер бэкенда

```bash
scp deploy/docker-compose.backend.yml deploy/deploy-backend.sh .env.backend user@backend-server:/opt/worker-cabinet/
ssh user@backend-server
cd /opt/worker-cabinet
cp .env.backend .env
chmod +x deploy-backend.sh
./deploy-backend.sh deploy
```

## Скрипты на серверах

### Сервер приложений (`deploy-app.sh`)

```
deploy      Полный деплой (pull + recreate)
pull        Загрузка образов из registry
start       Запуск сервисов
stop        Остановка сервисов
restart     Перезапуск сервисов
logs        Просмотр логов
status      Статус сервисов
help        Справка
```

### Сервер бэкенда (`deploy-backend.sh`)

```
deploy      Полный деплой (pull + recreate + миграции)
pull        Загрузка образов из registry
start       Запуск сервисов
stop        Остановка сервисов
restart     Перезапуск сервисов
logs        Просмотр логов
status      Статус сервисов
migrate     Запуск миграций
help        Справка
```

## npm run команды (сборка образов)

```bash
npm run docker:build:frontend     Собрать только frontend
npm run docker:build:backend      Собрать только backend
npm run docker:build:notification Собрать только notification-service
npm run docker:build              Собрать все образы

npm run docker:push:frontend      Пуш только frontend
npm run docker:push:backend       Пуш только backend
npm run docker:push:notification  Пуш только notification-service
npm run docker:push               Пуш все образы
```

## Переменные окружения

### .env.app (сервер приложений)

| Переменная      | Описание                  | Обязательно |
|-----------------|---------------------------|-------------|
| REGISTRY        | Адрес registry            | Да          |
| FRONTEND_IMAGE  | Имя образа frontend       | Да          |
| APP_PORT        | Порт nginx (default: 80)   | Нет         |
| BACKEND_HOST    | IP/hostname сервера бэка   | Да          |
| BACKEND_PORT    | Порт бэкенда (default: 5000)| Нет        |
| NGINX_SERVER_NAME| Имя сервера nginx          | Нет         |

### .env.backend (сервер бэкенда)

| Переменная          | Описание                  | Обязательно |
|---------------------|---------------------------|-------------|
| REGISTRY            | Адрес registry            | Да          |
| BACKEND_IMAGE       | Имя образа backend        | Да          |
| NOTIFICATION_IMAGE  | Имя образа notification   | Да          |
| DB_NAME             | Имя базы данных           | Нет         |
| DB_USER             | Пользователь БД           | Нет         |
| DB_PASSWORD         | Пароль БД                 | **Да**      |
| DB_PORT             | Порт PostgreSQL           | Нет         |
| JWT_SECRET          | Секрет для JWT            | **Да**      |
| S3_ACCESS_KEY       | Access ключ MinIO         | Нет         |
| S3_SECRET_KEY       | Secret ключ MinIO         | **Да**      |
| S3_BUCKET           | Имя бакета                | Нет         |
| ONLYOFFICE_JWT_SECRET| Секрет OnlyOffice JWT    | **Да**      |
| RABBITMQ_PASSWORD   | Пароль RabbitMQ           | **Да**      |
| MAIL_HOST           | SMTP хост                 | Нет         |
| MAIL_PORT           | SMTP порт                 | Нет         |
| MAIL_FROM           | Отправитель               | Нет         |
| NOTIFICATION_SECRET | Секрет уведомлений        | **Да**      |
| HERMES_API_KEY      | API ключ Hermes Agent     | **Да**      |

## Порты

### Сервер приложений
- HTTP: 80 (настраивается через APP_PORT)

### Сервер бэкенда
- Backend API: 5000
- PostgreSQL: 5432
- MinIO: 9000 / 9001 (console)
- OnlyOffice: 80 (внутри сети)
- RabbitMQ: 5672 / 15672 (management)
- Notification service: 5001
- Hermes Agent: 8642 (localhost only)
- SearXNG: 8888 (localhost only)

## Структура файлов

```
deploy/
├── docker-compose.app.yml          # Docker Compose сервера приложений
├── docker-compose.backend.yml     # Docker Compose сервера бэкенда
├── docker-compose.prod.yml        # Docker Compose (один сервер, legacy)
├── nginx-app.conf                  # Nginx конфиг (шаблон с envsubst)
├── deploy-app.sh                   # Скрипт деплоя сервера приложений
├── deploy-backend.sh               # Скрипт деплоя сервера бэкенда
├── deploy.js                       # Кроссплатформенный Node.js скрипт (dev/prod)
├── dev.sh                          # Bash скрипт dev (legacy)
├── prod.sh                         # Bash скрипт prod (legacy)
├── .env.app.example                # Шаблон env для сервера приложений
├── .env.backend.example            # Шаблон env для сервера бэкенда
├── .env.example                    # Шаблон env (legacy)
├── nginx.conf                      # Nginx конфиг (legacy)
└── README.md                       # Этот файл

Dockerfile.frontend                 # Dockerfile для frontend (nginx + статику)
Dockerfile.backend                  # Dockerfile для backend (Node.js)
```

## Требования

- Docker + Docker Compose v2 на обоих серверах
- Приватный Docker Registry
- Локальная сеть между серверами

## Обновление

1. Сборка новых образов на машине разработчика:
   ```bash
   npm run docker:build
   npm run docker:push
   ```

2. Деплой на серверах:
   ```bash
   ./deploy-app.sh deploy        # на сервере приложений
   ./deploy-backend.sh deploy   # на сервере бэкенда
   ```
