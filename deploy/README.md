# Деплой Worker Cabinet

## Кроссплатформенный запуск (Windows, macOS, Linux)

Все команды работают через Node.js скрипт:

```bash
# Dev окружение
npm run deploy:dev              # Полный запуск dev окружения
npm run deploy:dev:services     # Только Docker сервисы
npm run deploy:dev:stop         # Остановка сервисов
npm run deploy:dev:logs         # Логи сервисов
npm run deploy:dev:status       # Статус сервисов

# Production окружение
npm run deploy:prod             # Полный деплой
npm run deploy:prod:build       # Сборка образов
npm run deploy:prod:start       # Запуск
npm run deploy:prod:stop        # Остановка
npm run deploy:prod:logs        # Логи
npm run deploy:prod:status      # Статус
```

Или напрямую через Node.js:

```bash
node deploy/deploy.js dev start      # Полный запуск dev
node deploy/deploy.js dev services   # Только сервисы
node deploy/deploy.js dev stop       # Остановка
node deploy/deploy.js dev help       # Справка по dev командам

node deploy/deploy.js prod deploy    # Полный деплой
node deploy/deploy.js prod build     # Сборка
node deploy/deploy.js prod help      # Справка по prod командам
```

## Dev окружение

Локальный запуск с сервисами в Docker:

### Команды:
```
start       # Полный запуск (проверка, сервисы, миграции, dev сервер)
services    # Только Docker сервисы (БД, MinIO, OnlyOffice)
deps        # Установка зависимостей
migrate     # Миграции БД
dev         # Только dev сервер
stop        # Остановка сервисов
status      # Статус
logs        # Логи
```

### Порты dev окружения:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000
- PostgreSQL: localhost:5433
- MinIO: http://localhost:9000 (console: :9001)
- OnlyOffice: http://localhost:8080

## Production окружение

Полная сборка в Docker:

```bash
cd deploy
cp .env.example .env
# Отредактируйте .env
node deploy.js prod deploy
```

### Команды:
```
deploy      # Полный деплой
build       # Сборка образов
start       # Запуск
stop        # Остановка
restart     # Перезапуск
logs        # Логи
status      # Статус
migrate     # Миграции
cleanup     # Полная очистка с удалением данных
```

### Порты production:
- Приложение: http://localhost:80
- MinIO: :9000 (console: :9001)

## Структура файлов

```
deploy/
├── deploy.js               # Кроссплатформенный Node.js скрипт
├── dev.sh                  # Bash скрипт для dev (Linux/Mac)
├── dev.ps1                 # PowerShell скрипт для dev (Windows)
├── prod.sh                 # Bash скрипт для production (Linux/Mac)
├── prod.ps1                # PowerShell скрипт для production (Windows)
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
