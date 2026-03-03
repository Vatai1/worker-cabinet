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
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "docker-compose не установлен"
        exit 1
    fi
    
    log_success "Все зависимости установлены"
}

check_env_file() {
    if [ ! -f "$SCRIPT_DIR/.env" ]; then
        log_error "Файл .env не найден в директории deploy/"
        log_info "Создайте файл deploy/.env на основе deploy/.env.example"
        exit 1
    fi
}

build_images() {
    log_info "Сборка Docker образов..."
    cd "$SCRIPT_DIR"
    docker-compose -f docker-compose.prod.yml build
    log_success "Образы собраны"
}

start_services() {
    log_info "Запуск сервисов..."
    cd "$SCRIPT_DIR"
    docker-compose -f docker-compose.prod.yml up -d
    log_success "Сервисы запущены"
    
    log_info "Приложение доступно на http://localhost"
}

stop_services() {
    log_info "Остановка сервисов..."
    cd "$SCRIPT_DIR"
    docker-compose -f docker-compose.prod.yml down
    log_success "Сервисы остановлены"
}

restart_services() {
    log_info "Перезапуск сервисов..."
    stop_services
    start_services
}

show_logs() {
    cd "$SCRIPT_DIR"
    docker-compose -f docker-compose.prod.yml logs -f
}

show_status() {
    log_info "Статус сервисов:"
    cd "$SCRIPT_DIR"
    docker-compose -f docker-compose.prod.yml ps
}

run_migrations() {
    log_info "Запуск миграций..."
    cd "$SCRIPT_DIR"
    docker-compose -f docker-compose.prod.yml exec backend npm run migrate
    log_success "Миграции выполнены"
}

cleanup() {
    log_warning "Это удалит все данные (БД, файлы, логи)!"
    read -p "Продолжить? (yes/no): " -r
    if [[ $REPLY == "yes" ]]; then
        log_info "Очистка..."
        cd "$SCRIPT_DIR"
        docker-compose -f docker-compose.prod.yml down -v --remove-orphans
        docker system prune -f
        log_success "Очистка завершена"
    else
        log_info "Отменено"
    fi
}

deploy_full() {
    log_info "🚀 Полный деплой..."
    check_requirements
    check_env_file
    build_images
    start_services
    sleep 10
    run_migrations
    log_success "✅ Деплой завершен! Приложение доступно на http://localhost"
}

show_help() {
    cat << EOF
${BLUE}Скрипт продакшн деплоя${NC}

Использование: $0 [COMMAND]

Команды:
  deploy      Полный деплой (проверка, сборка, запуск, миграции)
  build       Сборка Docker образов
  start       Запуск сервисов
  stop        Остановка сервисов
  restart     Перезапуск сервисов
  logs        Просмотр логов
  status      Статус сервисов
  migrate     Запуск миграций
  cleanup     Полная очистка (удаление volumes)
  help        Показать эту справку

Примеры:
  $0 deploy          Полный деплой
  $0 build           Только сборка образов
  $0 logs            Просмотр логов
  $0 restart         Перезапуск
EOF
}

main() {
    local command="${1:-help}"
    
    case "$command" in
        deploy)
            deploy_full
            ;;
        build)
            check_requirements
            check_env_file
            build_images
            ;;
        start)
            check_env_file
            start_services
            ;;
        stop)
            stop_services
            ;;
        restart)
            check_env_file
            restart_services
            ;;
        logs)
            show_logs
            ;;
        status)
            show_status
            ;;
        migrate)
            run_migrations
            ;;
        cleanup)
            cleanup
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
