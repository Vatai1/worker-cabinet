# Деплой Worker Cabinet

## Dev окружение

Локальный запуск с сервисами в Docker:

```bash
# Полный запуск (проверка зависимостей, запуск сервисов, миграции, dev сервер)
./deploy/dev.sh start

# Только запуск Docker сервисов (БД, MinIO, OnlyOffice)
./deploy/dev.sh services

# Только dev сервер
./deploy/dev.sh dev

# Остановка сервисов
./deploy/dev.sh stop

# Статус
./deploy/dev.sh status

# Логи
./deploy/dev.sh logs
```

### Порты dev окружения:
- Frontend: http://localhost:3000
- Backend: http://localhost:5001
- PostgreSQL: localhost:5433
- MinIO: http://localhost:9000 (console: :9001)
- OnlyOffice: http://localhost:8080

## Production окружение

Полная сборка в Docker:

```bash
# 1. Скопировать .env.example в .env и заполнить переменные
cd deploy
cp .env.example .env
nano .env

# 2. Полный деплой
./prod.sh deploy

# Другие команды:
./prod.sh build     # Сборка образов
./prod.sh start     # Запуск
./prod.sh stop      # Остановка
./prod.sh restart   # Перезапуск
./prod.sh logs      # Логи
./prod.sh status    # Статус
./prod.sh migrate   # Миграции
./prod.sh cleanup   # Полная очистка с удалением данных
```

### Порты production:
- Приложение: http://localhost:80
- MinIO: :9000 (console: :9001)

## Структура файлов

```
deploy/
├── dev.sh                  # Скрипт для dev окружения
├── prod.sh                 # Скрипт для production
├── docker-compose.prod.yml # Docker Compose для production
├── nginx.conf              # Конфигурация nginx для frontend
├── .env.example            # Пример env файла
└── README.md               # Этот файл
```

## Требования

### Dev:
- Docker & Docker Compose
- Node.js 20+
- npm

### Production:
- Docker & Docker Compose

## Переменные окружения

| Переменная | Описание | Обязательно |
|------------|----------|-------------|
| DB_NAME | Имя базы данных | Нет (default: worker_cabinet) |
| DB_USER | Пользователь БД | Нет (default: postgres) |
| DB_PASSWORD | Пароль БД | **Да** |
| JWT_SECRET | Секрет для JWT | **Да** |
| S3_ACCESS_KEY | Access ключ MinIO | Нет (default: minioadmin) |
| S3_SECRET_KEY | Secret ключ MinIO | Нет (default: minioadmin123) |
| S3_BUCKET | Имя бакета | Нет (default: worker-cabinet) |
| TELEGRAM_BOT_TOKEN | Токен Telegram бота | Нет |
| TELEGRAM_BOT_USERNAME | Username бота | Нет |
| TELEGRAM_ADMIN_CHAT_ID | Chat ID админа | Нет |
