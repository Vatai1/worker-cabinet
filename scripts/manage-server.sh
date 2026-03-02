#!/bin/bash

# Скрипт для управления сервером worker-cabinet

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_DIR/server.pid"
LOG_DIR="$PROJECT_DIR/logs"
FRONTEND_LOG="$LOG_DIR/frontend.log"
BACKEND_LOG="$LOG_DIR/backend.log"

# Создаем директорию для логов, если не существует
mkdir -p "$LOG_DIR"

# Функция проверки, запущен ли сервер
is_server_running() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        else
            rm -f "$PID_FILE"
            return 1
        fi
    fi
    return 1
}

# Функция запуска сервера
start_server() {
    cd "$PROJECT_DIR"
    
    if is_server_running; then
        echo "✅ Сервер уже запущен (PID: $(cat $PID_FILE))"
        return 0
    fi
    
    echo "🚀 Запуск сервера..."
    
    # Очистка портов перед запуском
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    lsof -ti:5001 | xargs kill -9 2>/dev/null || true
    
    # Запуск в фоне с перенаправлением логов
    nohup npm run dev > "$LOG_DIR/server.log" 2>&1 &
    local server_pid=$!
    echo $server_pid > "$PID_FILE"
    
    # Ожидание запуска
    sleep 3
    
    if is_server_running; then
        echo "✅ Сервер успешно запущен"
        echo "📁 Логи:"
        echo "   - Frontend: $FRONTEND_LOG"
        echo "   - Backend:  $BACKEND_LOG"
        echo "   - Общий:    $LOG_DIR/server.log"
        echo "🌐 Доступ:"
        echo "   - Frontend: http://localhost:3000/"
        echo "   - Backend:  http://localhost:5001/"
        echo "📝 PID: $server_pid"
    else
        echo "❌ Ошибка запуска сервера. Проверьте логи:"
        tail -n 20 "$LOG_DIR/server.log"
        rm -f "$PID_FILE"
        return 1
    fi
}

# Функция остановки сервера
stop_server() {
    cd "$PROJECT_DIR"
    
    if ! is_server_running; then
        echo "⚠️  Сервер не запущен"
        return 0
    fi
    
    local pid=$(cat "$PID_FILE")
    echo "🛑 Остановка сервера (PID: $pid)..."
    
    # Остановка основного процесса (npm run dev)
    kill -TERM "$pid" 2>/dev/null || true
    
    # Очистка портов
    sleep 2
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    lsof -ti:5001 | xargs kill -9 2>/dev/null || true
    
    # Удаление PID файла
    rm -f "$PID_FILE"
    
    sleep 1
    
    if ! is_server_running; then
        echo "✅ Сервер успешно остановлен"
    else
        echo "❌ Не удалось остановить сервер"
        return 1
    fi
}

# Функция перезапуска сервера
restart_server() {
    echo "🔄 Перезапуск сервера..."
    stop_server
    sleep 2
    start_server
}

# Функция проверки статуса сервера
status_server() {
    cd "$PROJECT_DIR"
    
    echo "📊 Статус сервера:"
    echo ""
    
    if is_server_running; then
        local pid=$(cat "$PID_FILE")
        echo "✅ Сервер запущен"
        echo "   PID: $pid"
        echo ""
        
        # Проверка портов
        echo "🌐 Порты:"
        if lsof -ti:3000 > /dev/null 2>&1; then
            echo "   ✅ Frontend (3000): активен"
        else
            echo "   ❌ Frontend (3000): неактивен"
        fi
        
        if lsof -ti:5001 > /dev/null 2>&1; then
            echo "   ✅ Backend (5001): активен"
        else
            echo "   ❌ Backend (5001): неактивен"
        fi
        
        echo ""
        echo "📁 Логи:"
        echo "   - Frontend: $FRONTEND_LOG"
        echo "   - Backend:  $BACKEND_LOG"
        echo "   - Общий:    $LOG_DIR/server.log"
    else
        echo "❌ Сервер не запущен"
    fi
}

# Функция просмотра логов
logs_server() {
    local log_type="${1:-server}"
    cd "$PROJECT_DIR"
    
    case "$log_type" in
        frontend)
            if [ -f "$FRONTEND_LOG" ]; then
                echo "📄 Логи Frontend:"
                tail -n 50 "$FRONTEND_LOG"
            else
                echo "⚠️  Файл логов Frontend не найден"
            fi
            ;;
        backend)
            if [ -f "$BACKEND_LOG" ]; then
                echo "📄 Логи Backend:"
                tail -n 50 "$BACKEND_LOG"
            else
                echo "⚠️  Файл логов Backend не найден"
            fi
            ;;
        server|*)
            if [ -f "$LOG_DIR/server.log" ]; then
                echo "📄 Общие логи:"
                tail -n 50 "$LOG_DIR/server.log"
            else
                echo "⚠️  Файл общих логов не найден"
            fi
            ;;
    esac
}

# Функция просмотра логов в реальном времени
tail_logs() {
    local log_type="${1:-server}"
    cd "$PROJECT_DIR"
    
    case "$log_type" in
        frontend)
            if [ -f "$FRONTEND_LOG" ]; then
                echo "📄 Логи Frontend (实时, Ctrl+C для выхода):"
                tail -f "$FRONTEND_LOG"
            else
                echo "⚠️  Файл логов Frontend не найден"
            fi
            ;;
        backend)
            if [ -f "$BACKEND_LOG" ]; then
                echo "📄 Логи Backend (实时, Ctrl+C для выхода):"
                tail -f "$BACKEND_LOG"
            else
                echo "⚠️  Файл логов Backend не найден"
            fi
            ;;
        server|*)
            if [ -f "$LOG_DIR/server.log" ]; then
                echo "📄 Общие логи (实时, Ctrl+C для выхода):"
                tail -f "$LOG_DIR/server.log"
            else
                echo "⚠️  Файл общих логов не найден"
            fi
            ;;
    esac
}

# Функция очистки логов
clear_logs() {
    cd "$PROJECT_DIR"
    
    echo "🧹 Очистка логов..."
    > "$FRONTEND_LOG" 2>/dev/null || true
    > "$BACKEND_LOG" 2>/dev/null || true
    > "$LOG_DIR/server.log" 2>/dev/null || true
    
    echo "✅ Логи очищены"
}

# Функция отображения справки
show_help() {
    cat << EOF
🔧 Скрипт управления сервером worker-cabinet

Использование: $0 [COMMAND] [OPTIONS]

Команды:
  start          Запустить сервер
  stop           Остановить сервер
  restart        Перезапустить сервер
  status         Показать статус сервера
  logs [TYPE]    Показать последние 50 строк логов
                  TYPE: frontend, backend или server (по умолчанию)
  tail [TYPE]    Смотреть логи в реальном времени
                  TYPE: frontend, backend или server (по умолчанию)
  clear          Очистить файлы логов
  help           Показать эту справку

Примеры:
  $0 start              Запуск сервера
  $0 status             Проверка статуса
  $0 logs backend       Просмотр логов backend
  $0 tail frontend      Мониторинг логов frontend в реальном времени
  $0 stop               Остановка сервера

EOF
}

# Главная функция
main() {
    local command="${1:-help}"
    
    case "$command" in
        start)
            start_server
            ;;
        stop)
            stop_server
            ;;
        restart)
            restart_server
            ;;
        status)
            status_server
            ;;
        logs)
            logs_server "${2:-server}"
            ;;
        tail)
            tail_logs "${2:-server}"
            ;;
        clear)
            clear_logs
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            echo "❌ Неизвестная команда: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Запуск главной функции
main "$@"
