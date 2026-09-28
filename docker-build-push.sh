#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DOCKER_USER="vatai12"
TAG="latest"
VERSION=$(node -p "require('./package.json').version")
PLATFORM="linux/amd64"

FULL_FRONTEND_LATEST="${DOCKER_USER}/worker-cabinet-frontend:${TAG}"
FULL_FRONTEND_VERSION="${DOCKER_USER}/worker-cabinet-frontend:${VERSION}"
FULL_BACKEND_LATEST="${DOCKER_USER}/worker-cabinet-backend:${TAG}"
FULL_BACKEND_VERSION="${DOCKER_USER}/worker-cabinet-backend:${VERSION}"

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

SKIP_TESTS=false
if [ "${1:-}" = "--skip-tests" ]; then
    SKIP_TESTS=true
fi

RESULTS=()
BACKEND_PID=""
TEST_PG_NAME="wc-test-pg"
TEST_ENV_FILE="backend/.env.test"
BACKEND_LOG="backend/.test-server.log"

print_summary() {
    if [ ${#RESULTS[@]} -eq 0 ]; then
        return 0
    fi
    echo ""
    echo "=== Сводка ==="
    local entry status name secs
    for entry in "${RESULTS[@]}"; do
        IFS='|' read -r status name secs <<< "$entry"
        if [ "$status" = "PASS" ]; then
            echo -e "${GREEN}✓${NC} ${name} — ${secs} с"
        else
            echo -e "${RED}✗${NC} ${name} — ${secs} с (FAIL)"
        fi
    done
}

run_step() {
    local name="$1"
    shift
    local start end status
    start=$(date +%s)
    if "$@"; then
        status="PASS"
    else
        status="FAIL"
    fi
    end=$(date +%s)
    RESULTS+=("${status}|${name}|$((end - start))")
    if [ "$status" = "FAIL" ]; then
        print_summary
        log_error "Фаза «${name}» провалена — сборка отменена"
        exit 1
    fi
}

cleanup() {
    if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    docker stop "$TEST_PG_NAME" >/dev/null 2>&1 || true
    rm -f "$TEST_ENV_FILE" "$BACKEND_LOG"
}

trap cleanup EXIT
trap 'exit 130' INT TERM

check_environment() {
    log_info "Проверка зависимостей..."
    if ! command -v docker >/dev/null 2>&1; then
        log_error "Docker не установлен"
        return 1
    fi
    if ! docker buildx version >/dev/null 2>&1; then
        log_error "docker buildx недоступен"
        return 1
    fi
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker-демон не запущен"
        return 1
    fi
    log_success "Все зависимости установлены"
    local port pids _
    for port in 3000 5000; do
        pids="$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null || true)"
        if [ -z "$pids" ]; then
            continue
        fi
        log_warning "Порт ${port} занят (PID: ${pids//$'\n'/ }) — останавливаю"
        while read -r _pid; do
            [ -n "$_pid" ] && kill "$_pid" 2>/dev/null || true
        done <<< "$pids"
        for _ in $(seq 1 10); do
            pids="$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null || true)"
            [ -z "$pids" ] && break
            sleep 1
        done
        if [ -n "$pids" ]; then
            while read -r _pid; do
                [ -n "$_pid" ] && kill -9 "$_pid" 2>/dev/null || true
            done <<< "$pids"
            sleep 1
            pids="$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null || true)"
            if [ -n "$pids" ]; then
                log_error "Не удалось освободить порт ${port} — останови процесс вручную и перезапусти скрипт"
                return 1
            fi
        fi
    done
    log_success "Порты 3000/5000 свободны"
}

step_deps_root() {
    if [ -f node_modules/.package-lock.json ] && [ node_modules/.package-lock.json -nt package-lock.json ]; then
        log_info "Корень: node_modules свежее lock-файла — npm ci пропущен"
    else
        npm ci
    fi
}

step_deps_backend() {
    if [ -f backend/node_modules/.package-lock.json ] && [ backend/node_modules/.package-lock.json -nt backend/package-lock.json ]; then
        log_info "Бэкенд: node_modules свежее lock-файла — npm ci пропущен"
    else
        (cd backend && npm ci)
    fi
}

step_lint() {
    npm run lint
}

step_typecheck() {
    npm run typecheck
}

step_build() {
    npm run build
}

step_syntax() {
    (cd backend && npm run test:syntax)
}

generate_test_env() {
    {
        echo "PORT=5000"
        echo "NODE_ENV=development"
        echo "DB_HOST=localhost"
        echo "DB_PORT=55432"
        echo "DB_NAME=worker_cabinet"
        echo "DB_USER=postgres"
        echo "DB_PASSWORD=${TEST_PG_PASSWORD}"
        echo "DB_SSL=false"
        echo "JWT_SECRET=${TEST_JWT_SECRET}"
        echo "KEYCLOAK_URL="
        echo "RABBITMQ_URL="
    } > "$TEST_ENV_FILE"
    local var val
    for var in S3_ENDPOINT S3_PUBLIC_URL S3_ACCESS_KEY S3_SECRET_KEY S3_BUCKET; do
        val="$(sed -n "s/^${var}=//p" backend/.env 2>/dev/null | head -n 1 | tr -d '\r')"
        if [ -z "$val" ]; then
            case "$var" in
                S3_ENDPOINT) val="http://localhost:9000" ;;
                S3_PUBLIC_URL) val="" ;;
                S3_ACCESS_KEY) val="minioadmin" ;;
                S3_SECRET_KEY) val="minioadmin123" ;;
                S3_BUCKET) val="worker-cabinet-docs" ;;
            esac
        fi
        echo "${var}=${val}" >> "$TEST_ENV_FILE"
    done
}

step_test_db() {
    docker rm -f "$TEST_PG_NAME" >/dev/null 2>&1 || true
    TEST_PG_PASSWORD="$(openssl rand -hex 16)"
    TEST_JWT_SECRET="$(openssl rand -hex 32)"
    docker run -d --rm --name "$TEST_PG_NAME" \
        -e POSTGRES_PASSWORD="$TEST_PG_PASSWORD" \
        -e POSTGRES_DB=worker_cabinet \
        -p 55432:5432 \
        postgres:16-alpine >/dev/null
    local _ ready=false
    for _ in $(seq 1 30); do
        if docker exec "$TEST_PG_NAME" pg_isready -U postgres -d worker_cabinet >/dev/null 2>&1; then
            ready=true
            break
        fi
        sleep 1
    done
    if [ "$ready" != "true" ]; then
        log_error "Временная БД не готова за 30 с"
        return 1
    fi
    generate_test_env
}

step_migrate() {
    (cd backend && set -a && . ./.env.test && set +a && npm run migrate)
}

step_seed() {
    (cd backend && set -a && . ./.env.test && set +a && npm run seed)
}

step_backend_tests() {
    (cd backend && set -a && . ./.env.test && set +a && npm run test:all)
}

step_backend_server() {
    (cd backend && set -a && . ./.env.test && set +a && export PORT=5000 && exec node src/server.js > .test-server.log 2>&1) &
    BACKEND_PID=$!
    local _ ready=false
    for _ in $(seq 1 30); do
        if curl -sf http://localhost:5000/api/health >/dev/null 2>&1; then
            ready=true
            break
        fi
        sleep 1
    done
    if [ "$ready" != "true" ]; then
        log_error "Бэкенд не поднялся за 30 с (лог: ${BACKEND_LOG})"
        return 1
    fi
    log_success "Бэкенд готов (PID ${BACKEND_PID})"
}

step_e2e() {
    npm run test:ci
}

main() {
    echo "=== Тестовый гейт перед сборкой (${PLATFORM}, v${VERSION}) ==="
    run_step "Проверка окружения" check_environment

    if [ "$SKIP_TESTS" = "true" ]; then
        echo ""
        log_warning "Тесты пропущены (--skip-tests)"
    else
        run_step "Зависимости (корень)" step_deps_root
        run_step "Зависимости (бэкенд)" step_deps_backend
        run_step "Линт (фронтенд)" step_lint
        run_step "Тайпчек (фронтенд)" step_typecheck
        run_step "Сборка (фронтенд)" step_build
        run_step "Синтаксис (бэкенд)" step_syntax
        run_step "Временная БД (postgres)" step_test_db
        run_step "Миграции" step_migrate
        run_step "Сид" step_seed
        run_step "Бэкенд на :5000 (тесты + E2E)" step_backend_server
        run_step "Интеграционные тесты (бэкенд)" step_backend_tests
        run_step "E2E (Playwright)" step_e2e

        cleanup
        print_summary
        echo ""
        log_success "Все фазы пройдены — перехожу к сборке образов"
    fi

    echo ""
    echo "=== Сборка фронтенда (${PLATFORM}) ==="
    docker buildx build --platform "${PLATFORM}" -t "${FULL_FRONTEND_LATEST}" -t "${FULL_FRONTEND_VERSION}" -f Dockerfile.frontend . --push
    echo ""
    echo "=== Сборка бэкенда (${PLATFORM}) ==="
    docker buildx build --platform "${PLATFORM}" -t "${FULL_BACKEND_LATEST}" -t "${FULL_BACKEND_VERSION}" -f Dockerfile.backend . --push

    echo ""
    echo "=== Готово ==="
    echo "Фронтенд: ${FULL_FRONTEND_LATEST} / ${FULL_FRONTEND_VERSION}"
    echo "Бэкенд:   ${FULL_BACKEND_LATEST} / ${FULL_BACKEND_VERSION}"
}

main "$@"
