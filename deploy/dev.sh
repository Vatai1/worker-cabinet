#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

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
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js не установлен"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log_error "npm не установлен"
        exit 1
    fi
    
    log_success "Все зависимости установлены"
}

setup_env() {
    if [ ! -f "$PROJECT_DIR/backend/.env" ]; then
        log_warning "Файл .env не найден, копирую .env.example"
        cp "$PROJECT_DIR/backend/.env.example" "$PROJECT_DIR/backend/.env"
    fi
}

start_services() {
    log_info "Запуск сервисов (PostgreSQL, MinIO, OnlyOffice)..."
    cd "$PROJECT_DIR"
    docker-compose up -d postgres minio onlyoffice
    log_success "Сервисы запущены"
    
    log_info "Ожидание готовности PostgreSQL..."
    sleep 5
    until docker exec worker-cabinet-db pg_isready -U postgres; do
        sleep 1
    done
    log_success "PostgreSQL готов к работе"
}

install_dependencies() {
    log_info "Установка зависимостей..."
    cd "$PROJECT_DIR"
    npm install
    cd backend && npm install
    log_success "Зависимости установлены"
}

run_migrations() {
    log_info "Запуск миграций базы данных..."
    cd "$PROJECT_DIR/backend"
    npm run migrate
    log_success "Миграции выполнены"
}

seed_database() {
    read -p "Заполнить базу тестовыми данными? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Заполнение базы тестовыми данными..."
        cd "$PROJECT_DIR/backend"
        npm run seed
        log_success "База данных заполнена"
    fi
}

start_dev() {
    log_info "Запуск dev сервера..."
    cd "$PROJECT_DIR"
    npm run dev
}

show_help() {
    cat << EOF
${BLUE}Скрипт запуска dev окружения${NC}

Использование: $0 [COMMAND]

Команды:
  start       Запуск полного цикла (проверка, сервисы, миграции, dev сервер)
  services    Запуск только Docker сервисов
  deps        Установка зависимостей
  migrate     Запуск миграций
  dev         Запуск dev сервера (без сервисов)
  stop        Остановка Docker сервисов
  status      Статус сервисов
  logs        Логи сервисов
  help        Показать эту справку

Примеры:
  $0 start           Полный запуск
  $0 services        Запуск БД, MinIO, OnlyOffice
  $0 dev             Запуск dev сервера
EOF
}

stop_services() {
    log_info "Остановка сервисов..."
    cd "$PROJECT_DIR"
    docker-compose down
    log_success "Сервисы остановлены"
}

status_services() {
    log_info "Статус сервисов:"
    cd "$PROJECT_DIR"
    docker-compose ps
}

logs_services() {
    cd "$PROJECT_DIR"
    docker-compose logs -f
}

main() {
    local command="${1:-help}"
    
    case "$command" in
        start)
            check_requirements
            setup_env
            start_services
            install_dependencies
            run_migrations
            seed_database
            start_dev
            ;;
        services)
            check_requirements
            start_services
            ;;
        deps)
            install_dependencies
            ;;
        migrate)
            run_migrations
            ;;
        dev)
            start_dev
            ;;
        stop)
            stop_services
            ;;
        status)
            status_services
            ;;
        logs)
            logs_services
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
