# Деплой Worker Cabinet

## Dev окружение

Локальный запуск с сервисами в Docker:

### Linux/Mac:
```bash
./deploy/dev.sh start
```

### Windows (PowerShell):
```powershell
.\deploy\dev.ps1 start
```

### Команды:
```bash
start       # Полный запуск (проверка, сервисы, миграции, dev сервер)
services    # Только Docker сервисы (БД, MinIO, OnlyOffice)
dev         # Только dev сервер
stop        # Остановка сервисов
status      # Статус
logs        # Логи
```

### Порты dev окружения:
- Frontend: http://localhost:3000
- Backend: http://localhost:5001
- PostgreSQL: localhost:5433
- MinIO: http://localhost:9000 (console: :9001)
- OnlyOffice: http://localhost:8080

## Production окружение

Полная сборка в Docker:

### Linux/Mac:
```bash
cd deploy
cp .env.example .env
nano .env
./prod.sh deploy
```

### Windows (PowerShell):
```powershell
cd deploy
Copy-Item .env.example .env
notepad .env
.\prod.ps1 deploy
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
├── dev.sh                  # Скрипт для dev окружения (Linux/Mac)
├── dev.ps1                 # Скрипт для dev окружения (Windows)
├── prod.sh                 # Скрипт для production (Linux/Mac)
├── prod.ps1                # Скрипт для production (Windows)
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
