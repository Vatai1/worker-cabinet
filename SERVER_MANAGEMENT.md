# Управление сервером

## Быстрый запуск

### Запуск сервера
```bash
cd /Users/vatai/worker-cabinet && ./scripts/manage-server.sh start
```

### Остановка сервера
```bash
cd /Users/vatai/worker-cabinet && ./scripts/manage-server.sh stop
```

### Проверка статуса
```bash
cd /Users/vatai/worker-cabinet && ./scripts/manage-server.sh status
```

### Перезапуск сервера
```bash
cd /Users/vatai/worker-cabinet && ./scripts/manage-server.sh restart
```

## Команды скрипта

| Команда | Описание |
|---------|----------|
| `start` | Запустить сервер |
| `stop` | Остановить сервер |
| `restart` | Перезапустить сервер |
| `status` | Показать статус сервера и порты |
| `logs [TYPE]` | Показать последние 50 строк логов |
| `tail [TYPE]` | Смотреть логи в реальном времени (Ctrl+C для выхода) |
| `clear` | Очистить файлы логов |
| `help` | Показать справку |

## Просмотр логов

### Последние строки логов
```bash
# Общие логи
./scripts/manage-server.sh logs

# Логи Frontend
./scripts/manage-server.sh logs frontend

# Логи Backend
./scripts/manage-server.sh logs backend
```

### Мониторинг логов в реальном времени
```bash
# Общие логи
./scripts/manage-server.sh tail

# Логи Frontend
./scripts/manage-server.sh tail frontend

# Логи Backend
./scripts/manage-server.sh tail backend
```

## Расположение файлов

- **Скрипт**: `scripts/manage-server.sh`
- **PID файл**: `server.pid`
- **Логи**: `logs/`
  - `logs/frontend.log` - логи Frontend
  - `logs/backend.log` - логи Backend
  - `logs/server.log` - общие логи

## Адреса серверов

- **Frontend**: http://localhost:3000/
- **Backend**: http://localhost:5000/

## Устранение проблем

### Сервер не запускается

1. Проверьте статус:
   ```bash
   ./scripts/manage-server.sh status
   ```

2. Проверьте логи:
   ```bash
   ./scripts/manage-server.sh logs
   ```

3. Попробуйте перезапустить:
   ```bash
   ./scripts/manage-server.sh restart
   ```

### Порт занят

Скрипт автоматически очищает порты 3000 и 5001 при запуске. Если проблема сохраняется:

```bash
# Очистка портов вручную
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:5000 | xargs kill -9 2>/dev/null
```

### Процесс завис

```bash
# Принудительная остановка
./scripts/manage-server.sh stop
sleep 2
./scripts/manage-server.sh start
```

## Справка

Для получения справки:
```bash
./scripts/manage-server.sh help
```
