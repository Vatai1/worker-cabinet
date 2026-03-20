#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
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

log_step() {
    echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$2 не установлен"
        log_info "Установите: $3"
        return 1
    fi
    return 0
}

check_requirements() {
    log_step "Проверка системных требований"
    
    local missing=0
    
    if ! check_command "docker" "Docker" "https://docs.docker.com/get-docker/"; then
        missing=1
    fi
    
    if ! check_command "node" "Node.js" "https://nodejs.org/ (версия 20+)"; then
        missing=1
    else
        local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$node_version" -lt 18 ]; then
            log_warning "Рекомендуется Node.js 20+, текущая версия: $(node -v)"
        fi
    fi
    
    if ! check_command "npm" "npm" "идёт вместе с Node.js"; then
        missing=1
    fi
    
    if [ $missing -eq 1 ]; then
        log_error "Установите недостающие зависимости и запустите скрипт снова"
        exit 1
    fi
    
    log_success "Все зависимости установлены"
    log_info "Node.js: $(node -v)"
    log_info "npm: $(npm -v)"
    log_info "Docker: $(docker --version)"
}

setup_env_files() {
    log_step "Настройка переменных окружения"
    
    if [ ! -f "$SCRIPT_DIR/backend/.env" ]; then
        log_info "Создание backend/.env из .env.example"
        cp "$SCRIPT_DIR/backend/.env.example" "$SCRIPT_DIR/backend/.env"
        log_success "Файл backend/.env создан"
    else
        log_info "Файл backend/.env уже существует"
    fi
}

install_dependencies() {
    log_step "Установка зависимостей"
    
    log_info "Установка frontend зависимостей..."
    cd "$SCRIPT_DIR"
    npm install
    log_success "Frontend зависимости установлены"
    
    log_info "Установка backend зависимостей..."
    cd "$SCRIPT_DIR/backend"
    npm install
    log_success "Backend зависимости установлены"
}

start_docker_services() {
    log_step "Запуск Docker сервисов"
    
    cd "$SCRIPT_DIR"
    
    if docker-compose ps postgres 2>/dev/null | grep -q "Up"; then
        log_info "Сервисы уже запущены"
    else
        log_info "Запуск PostgreSQL, MinIO, OnlyOffice..."
        docker-compose up -d postgres minio onlyoffice
        
        log_info "Ожидание готовности PostgreSQL..."
        sleep 5
        
        local max_attempts=30
        local attempt=1
        while [ $attempt -le $max_attempts ]; do
            if docker exec worker-cabinet-db pg_isready -U postgres &>/dev/null; then
                break
            fi
            echo -n "."
            sleep 1
            attempt=$((attempt + 1))
        done
        echo
        
        if [ $attempt -gt $max_attempts ]; then
            log_error "PostgreSQL не отвечает"
            exit 1
        fi
        
        log_success "Docker сервисы запущены"
    fi
}

run_migrations() {
    log_step "Миграции базы данных"
    
    cd "$SCRIPT_DIR/backend"
    npm run migrate
    log_success "Миграции выполнены"
}

seed_database() {
    log_step "Тестовые данные"
    
    echo -e "${YELLOW}Заполнить базу тестовыми данными?${NC}"
    echo "Это создаст тестового администратора (admin/admin123)"
    read -p "(y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd "$SCRIPT_DIR/backend"
        npm run seed
        log_success "Тестовые данные добавлены"
    else
        log_info "Пропущено"
    fi
}

init_s3() {
    log_step "Инициализация S3 бакета"
    
    cd "$SCRIPT_DIR/backend"
    
    if npm run init:s3 2>/dev/null; then
        log_success "S3 бакет инициализирован"
    else
        log_warning "S3 инициализация пропущена (возможно уже существует)"
    fi
}

show_final_info() {
    log_step "Готово!"
    
    echo -e "${GREEN}"
    echo "  ╔═══════════════════════════════════════════════════════════╗"
    echo "  ║          Worker Cabinet успешно установлен!               ║"
    echo "  ╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    echo -e "${CYAN}Для запуска dev сервера:${NC}"
    echo "  npm run dev"
    echo ""
    echo -e "${CYAN}Адреса:${NC}"
    echo "  Frontend:  ${GREEN}http://localhost:3000${NC}"
    echo "  Backend:   ${GREEN}http://localhost:5000${NC}"
    echo "  MinIO:     ${GREEN}http://localhost:9000${NC} (console: ${GREEN}:9001${NC})"
    echo "  OnlyOffice:${GREEN}http://localhost:8080${NC}"
    echo ""
    echo -e "${CYAN}Тестовый аккаунт (если выбрано):${NC}"
    echo "  Логин:    admin"
    echo "  Пароль:   admin123"
    echo ""
    echo -e "${CYAN}Полезные команды:${NC}"
    echo "  npm run dev          - Запуск frontend + backend"
    echo "  npm run lint         - Проверка кода"
    echo "  npm run typecheck    - Проверка типов"
    echo "  ./deploy/dev.sh stop - Остановка Docker сервисов"
    echo ""
}

show_help() {
    cat << EOF
${BLUE}Worker Cabinet - Скрипт установки${NC}

Использование: $0 [COMMAND]

Команды:
  all       Полная установка (проверка, env, зависимости, Docker, миграции)
  check     Только проверка зависимостей
  env       Только создание .env файлов
  deps      Только установка зависимостей
  docker    Только запуск Docker сервисов
  migrate   Только миграции БД
  seed      Только заполнение тестовыми данными
  help      Показать эту справку

Примеры:
  $0              Интерактивная установка с вопросами
  $0 all          Полная установка без вопросов
  $0 deps         Установить только npm зависимости
EOF
}

run_interactive() {
    echo -e "${CYAN}"
    echo "  ╔═══════════════════════════════════════════════════════════╗"
    echo "  ║        Worker Cabinet - Установка                        ║"
    echo "  ╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    
    check_requirements
    setup_env_files
    install_dependencies
    start_docker_services
    run_migrations
    seed_database
    init_s3
    show_final_info
}

run_all() {
    check_requirements
    setup_env_files
    install_dependencies
    start_docker_services
    run_migrations
    
    cd "$SCRIPT_DIR/backend"
    npm run init:s3 2>/dev/null || true
    
    show_final_info
}

main() {
    local command="${1:-}"
    
    case "$command" in
        all)
            run_all
            ;;
        check)
            check_requirements
            ;;
        env)
            setup_env_files
            ;;
        deps)
            install_dependencies
            ;;
        docker)
            start_docker_services
            ;;
        migrate)
            run_migrations
            ;;
        seed)
            cd "$SCRIPT_DIR/backend"
            npm run seed
            log_success "Тестовые данные добавлены"
            ;;
        help|--help|-h)
            show_help
            ;;
        "")
            run_interactive
            ;;
        *)
            log_error "Неизвестная команда: $command"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
