#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

COMPOSE_FILE="docker-compose.app.yml"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}ℹ ${NC}$1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

check_requirements() {
    log_info "Проверка зависимостей..."

    if ! command -v docker &> /dev/null; then
        log_error "Docker не установлен"
        exit 1
    fi

    log_success "Все зависимости установлены"
}

check_env_file() {
    if [ ! -f "$SCRIPT_DIR/.env" ]; then
        log_error "Файл .env не найден в директории deploy/"
        log_info "Создайте deploy/.env на основе deploy/.env.example"
        exit 1
    fi
}

source_env() {
    check_env_file
    log_info "Загрузка .env..."
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
    log_success ".env загружен"
}

cmd_pull() {
    source_env
    log_info "Загрузка образов..."
    cd "$SCRIPT_DIR"
    docker compose -f "$COMPOSE_FILE" pull
    log_success "Образы загружены"
}

cmd_start() {
    check_env_file
    log_info "Запуск сервисов..."
    cd "$SCRIPT_DIR"
    docker compose -f "$COMPOSE_FILE" up -d
    log_success "Сервисы запущены"
}

cmd_stop() {
    log_info "Остановка сервисов..."
    cd "$SCRIPT_DIR"
    docker compose -f "$COMPOSE_FILE" down
    log_success "Сервисы остановлены"
}

cmd_restart() {
    check_env_file
    log_info "Перезапуск сервисов..."
    cd "$SCRIPT_DIR"
    docker compose -f "$COMPOSE_FILE" restart
    log_success "Сервисы перезапущены"
}

cmd_logs() {
    cd "$SCRIPT_DIR"
    docker compose -f "$COMPOSE_FILE" logs -f
}

cmd_status() {
    log_info "Статус сервисов:"
    cd "$SCRIPT_DIR"
    docker compose -f "$COMPOSE_FILE" ps
}

cmd_deploy() {
    log_info "🚀 Деплой сервера приложений..."
    check_requirements
    source_env
    cmd_pull
    log_info "Пересоздание контейнеров..."
    cd "$SCRIPT_DIR"
    docker compose -f "$COMPOSE_FILE" up -d --force-recreate
    log_success "✅ Сервер приложений задеплоен!"
}

show_help() {
    cat << EOF
${BLUE}Worker Cabinet — скрипт деплоя сервера приложений${NC}

Использование: $0 [COMMAND]

Команды:
  deploy      Загрузка образов и пересоздание контейнеров
  pull        Загрузка образов из registry
  start       Запуск сервисов
  stop        Остановка сервисов
  restart     Перезапуск сервисов
  logs        Просмотр логов
  status      Статус сервисов
  help        Показать справку

Примеры:
  $0 deploy          Полный деплой
  $0 pull            Только загрузка образов
  $0 logs            Просмотр логов
  $0 restart         Перезапуск сервисов
EOF
}

main() {
    local command="${1:-help}"

    case "$command" in
        deploy)
            cmd_deploy
            ;;
        pull)
            cmd_pull
            ;;
        start)
            cmd_start
            ;;
        stop)
            cmd_stop
            ;;
        restart)
            cmd_restart
            ;;
        logs)
            cmd_logs
            ;;
        status)
            cmd_status
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "Неизвестная команда: $command"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
