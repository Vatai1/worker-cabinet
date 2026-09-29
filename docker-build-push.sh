#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DOCKER_USER="vatai12"
PLATFORM="linux/amd64"
IMAGE_NODE_MAJOR=20

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

usage() {
    cat <<'USAGE'
Использование: ./docker-build-push.sh [флаги]

  --skip-tests       пропустить тестовый гейт (линт, тайпчек, тесты, E2E)
  --allow-dirty      разрешить незакоммиченные изменения (образ всё равно собирается из HEAD)
  --allow-unpushed   разрешить сборку коммита, которого нет в upstream
  --kill-ports       без вопросов останавливать процессы на портах 3000/5000
  --force-version    перезаписать уже опубликованный тег версии
  -h, --help         показать эту справку
USAGE
}

SKIP_TESTS=false
ALLOW_DIRTY=false
ALLOW_UNPUSHED=false
KILL_PORTS=false
FORCE_VERSION=false
for arg in "$@"; do
    case "$arg" in
        --skip-tests) SKIP_TESTS=true ;;
        --allow-dirty) ALLOW_DIRTY=true ;;
        --allow-unpushed) ALLOW_UNPUSHED=true ;;
        --kill-ports) KILL_PORTS=true ;;
        --force-version) FORCE_VERSION=true ;;
        -h|--help) usage; exit 0 ;;
        *) log_error "Неизвестный флаг: ${arg}"; usage; exit 2 ;;
    esac
done

VERSION="$(git show HEAD:package.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).version))")"
COMMIT="$(git rev-parse --short HEAD)"

FRONTEND_IMAGE="${DOCKER_USER}/worker-cabinet-frontend"
BACKEND_IMAGE="${DOCKER_USER}/worker-cabinet-backend"

RESULTS=()
BACKEND_PID=""
BUILD_DIR=""
TEST_PG_NAME="wc-test-pg"
TEST_PG_PORT=55432
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

stop_test_env() {
    if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    BACKEND_PID=""
    docker stop "$TEST_PG_NAME" >/dev/null 2>&1 || true
    rm -f "$TEST_ENV_FILE" "$BACKEND_LOG"
}

cleanup() {
    stop_test_env
    if [ -n "${BUILD_DIR:-}" ] && [ -d "$BUILD_DIR" ]; then
        rm -rf "$BUILD_DIR"
    fi
}

trap cleanup EXIT
trap 'exit 130' INT TERM

port_pids() {
    lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null || true
}

free_port() {
    local port="$1" pids answer _
    pids="$(port_pids "$port")"
    [ -z "$pids" ] && return 0

    local desc
    desc="$(ps -o pid=,command= -p "$(echo "$pids" | paste -sd, -)" 2>/dev/null | sed 's/^/    /' || true)"
    log_warning "Порт ${port} занят:"
    echo "$desc"

    if [ "$KILL_PORTS" != "true" ]; then
        if [ -t 0 ]; then
            read -r -p "Остановить эти процессы? [y/N] " answer
            case "$answer" in
                y|Y|д|Д) ;;
                *) log_error "Порт ${port} занят — останови процесс сам или запусти с --kill-ports"; return 1 ;;
            esac
        else
            log_error "Порт ${port} занят — останови процесс сам или запусти с --kill-ports"
            return 1
        fi
    fi

    while read -r _pid; do
        [ -n "$_pid" ] && kill "$_pid" 2>/dev/null || true
    done <<< "$pids"
    for _ in $(seq 1 10); do
        pids="$(port_pids "$port")"
        [ -z "$pids" ] && return 0
        sleep 1
    done
    while read -r _pid; do
        [ -n "$_pid" ] && kill -9 "$_pid" 2>/dev/null || true
    done <<< "$pids"
    sleep 1
    if [ -n "$(port_pids "$port")" ]; then
        log_error "Не удалось освободить порт ${port}"
        return 1
    fi
}

check_environment() {
    log_info "Проверка зависимостей..."
    local tool missing=()
    for tool in docker git node npm curl lsof openssl tar; do
        command -v "$tool" >/dev/null 2>&1 || missing+=("$tool")
    done
    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Не найдены: ${missing[*]}"
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
    if ! grep -qE '"(https://index\.docker\.io/v1/|docker\.io|registry-1\.docker\.io)"' "${DOCKER_CONFIG:-$HOME/.docker}/config.json" 2>/dev/null; then
        log_error "Нет входа в Docker Hub — выполни docker login"
        return 1
    fi
    local host_node_major
    host_node_major="$(node -p 'process.versions.node.split(".")[0]')"
    if [ "$host_node_major" != "$IMAGE_NODE_MAJOR" ]; then
        log_warning "Тесты идут на Node ${host_node_major}, а образ работает на Node ${IMAGE_NODE_MAJOR} — поведение может отличаться"
    fi
    log_success "Все зависимости на месте, вход в Docker Hub есть"
}

check_git() {
    local changed untracked
    changed="$(git status --porcelain --untracked-files=no)"
    untracked="$(git status --porcelain --untracked-files=normal | grep '^??' || true)"
    if [ -n "$changed" ]; then
        if [ "$ALLOW_DIRTY" = "true" ]; then
            log_warning "Есть незакоммиченные изменения — в образ они НЕ попадут, собирается HEAD (${COMMIT}):"
            echo "$changed" | sed 's/^/    /'
        else
            log_error "Есть незакоммиченные изменения — закоммить их или запусти с --allow-dirty:"
            echo "$changed" | sed 's/^/    /'
            return 1
        fi
    fi
    if [ -n "$untracked" ]; then
        log_warning "Неотслеживаемые файлы в образ не попадут:"
        echo "$untracked" | sed 's/^/    /'
    fi

    if ! git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
        if [ "$ALLOW_UNPUSHED" != "true" ]; then
            log_error "У ветки нет upstream — запушь её или запусти с --allow-unpushed"
            return 1
        fi
        log_warning "У ветки нет upstream"
        return 0
    fi
    git fetch -q || log_warning "git fetch не удался — проверяю по локальным данным"
    if ! git merge-base --is-ancestor HEAD '@{u}'; then
        if [ "$ALLOW_UNPUSHED" = "true" ]; then
            log_warning "Коммит ${COMMIT} ещё не запушен"
        else
            log_error "Коммит ${COMMIT} ещё не запушен — сделай git push или запусти с --allow-unpushed"
            return 1
        fi
    fi
    log_success "Собирается коммит ${COMMIT}, версия ${VERSION}"
}

check_version_tags() {
    local image exists=()
    for image in "$FRONTEND_IMAGE" "$BACKEND_IMAGE"; do
        if docker buildx imagetools inspect "${image}:${VERSION}" >/dev/null 2>&1; then
            exists+=("${image}:${VERSION}")
        fi
    done
    if [ ${#exists[@]} -gt 0 ]; then
        if [ "$FORCE_VERSION" = "true" ]; then
            log_warning "Тег будет перезаписан: ${exists[*]}"
        else
            log_error "Версия ${VERSION} уже опубликована (${exists[*]}) — подними версию или запусти с --force-version"
            return 1
        fi
    fi
    log_success "Тег ${VERSION} свободен"
}

check_ports() {
    free_port 3000 || return 1
    free_port 5000 || return 1
    docker rm -f "$TEST_PG_NAME" >/dev/null 2>&1 || true
    if [ -n "$(port_pids "$TEST_PG_PORT")" ]; then
        log_error "Порт ${TEST_PG_PORT} (временная БД) занят другим процессом"
        return 1
    fi
    log_success "Порты 3000/5000/${TEST_PG_PORT} свободны"
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
    npx vite build
}

step_syntax() {
    (cd backend && npm run test:syntax)
}

generate_test_env() {
    {
        echo "PORT=5000"
        echo "NODE_ENV=development"
        echo "DB_HOST=localhost"
        echo "DB_PORT=${TEST_PG_PORT}"
        echo "DB_NAME=worker_cabinet"
        echo "DB_USER=postgres"
        echo "DB_PASSWORD=${TEST_PG_PASSWORD}"
        echo "DB_SSL=false"
        echo "JWT_SECRET=${TEST_JWT_SECRET}"
        echo "KEYCLOAK_URL="
        echo "RABBITMQ_URL="
        (cd backend && node --input-type=module -e "import webpush from 'web-push'; const k = webpush.generateVAPIDKeys(); console.log('VAPID_PUBLIC_KEY=' + k.publicKey); console.log('VAPID_PRIVATE_KEY=' + k.privateKey)")
        echo "VAPID_SUBJECT=mailto:e2e@example.com"
    } > "$TEST_ENV_FILE" || return 1
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
        [ "$var" = "S3_BUCKET" ] && val="${val}-test"
        echo "${var}=${val}" >> "$TEST_ENV_FILE"
    done
    local key
    if [ -f backend/.env ]; then
        sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' backend/.env | tr -d '\r' | while IFS= read -r key; do
            grep -q "^${key}=" "$TEST_ENV_FILE" || echo "${key}=" >> "$TEST_ENV_FILE"
        done
    fi
}

step_test_db() {
    TEST_PG_PASSWORD="$(openssl rand -hex 16)" || return 1
    TEST_JWT_SECRET="$(openssl rand -hex 32)" || return 1
    docker run -d --rm --name "$TEST_PG_NAME" \
        -e POSTGRES_PASSWORD="$TEST_PG_PASSWORD" \
        -e POSTGRES_DB=worker_cabinet \
        -p "${TEST_PG_PORT}:5432" \
        postgres:16-alpine >/dev/null || return 1
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
    (cd backend && set -a && . ./.env.test && set +a && exec node src/server.js > .test-server.log 2>&1) &
    BACKEND_PID=$!
    local _ ready=false
    for _ in $(seq 1 30); do
        if curl -sf http://localhost:5000/api/health >/dev/null 2>&1; then
            ready=true
            break
        fi
        if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
            break
        fi
        sleep 1
    done
    if [ "$ready" != "true" ]; then
        log_error "Бэкенд не поднялся за 30 с — последние строки лога:"
        tail -n 30 "$BACKEND_LOG" 2>/dev/null | sed 's/^/    /' || true
        return 1
    fi
    log_success "Бэкенд готов (PID ${BACKEND_PID})"
}

step_e2e() {
    PLAYWRIGHT_HTML_OPEN=never npm run test:ci -- --reporter=line
}

step_export_source() {
    BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/wc-build.XXXXXX")" || return 1
    git archive --format=tar HEAD | tar -x -C "$BUILD_DIR" || return 1
    if find "$BUILD_DIR" -name '.env' -o -name 'node_modules' | grep -q .; then
        log_error "В экспорт попали .env или node_modules — проверь, что они не закоммичены"
        return 1
    fi
    log_success "Исходники коммита ${COMMIT} выгружены в ${BUILD_DIR}"
}

step_build_frontend() {
    docker buildx build --platform "${PLATFORM}" \
        -t "${FRONTEND_IMAGE}:${VERSION}" \
        --label "org.opencontainers.image.version=${VERSION}" \
        --label "org.opencontainers.image.revision=${COMMIT}" \
        -f "${BUILD_DIR}/Dockerfile.frontend" "${BUILD_DIR}" --push
}

step_build_backend() {
    docker buildx build --platform "${PLATFORM}" \
        -t "${BACKEND_IMAGE}:${VERSION}" \
        --label "org.opencontainers.image.version=${VERSION}" \
        --label "org.opencontainers.image.revision=${COMMIT}" \
        -f "${BUILD_DIR}/Dockerfile.backend" "${BUILD_DIR}" --push
}

step_tag_latest() {
    docker buildx imagetools create -t "${FRONTEND_IMAGE}:latest" "${FRONTEND_IMAGE}:${VERSION}" || return 1
    docker buildx imagetools create -t "${BACKEND_IMAGE}:latest" "${BACKEND_IMAGE}:${VERSION}" || return 1
}

main() {
    echo "=== Сборка и публикация (${PLATFORM}, v${VERSION}, ${COMMIT}) ==="
    run_step "Проверка окружения" check_environment
    run_step "Проверка git" check_git
    run_step "Проверка тега версии" check_version_tags

    if [ "$SKIP_TESTS" = "true" ]; then
        echo ""
        log_warning "Тесты пропущены (--skip-tests)"
    else
        run_step "Порты" check_ports
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

        stop_test_env
        log_success "Все тесты пройдены — перехожу к сборке образов"
    fi

    echo ""
    run_step "Экспорт исходников коммита" step_export_source
    echo ""
    echo "=== Сборка фронтенда (${PLATFORM}) ==="
    run_step "Образ фронтенда ${VERSION}" step_build_frontend
    echo ""
    echo "=== Сборка бэкенда (${PLATFORM}) ==="
    run_step "Образ бэкенда ${VERSION}" step_build_backend
    run_step "Тег latest для обоих образов" step_tag_latest

    print_summary
    echo ""
    echo "=== Готово ==="
    echo "Фронтенд: ${FRONTEND_IMAGE}:${VERSION} (+ latest)"
    echo "Бэкенд:   ${BACKEND_IMAGE}:${VERSION} (+ latest)"
    echo "Коммит:   ${COMMIT}"
}

main
