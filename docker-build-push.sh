#!/usr/bin/env bash
set -euo pipefail

DOCKER_USER="vatai12"
TAG="latest"
VERSION=$(git rev-parse --short HEAD)

FULL_FRONTEND_LATEST="${DOCKER_USER}/worker-cabinet-frontend:${TAG}"
FULL_FRONTEND_VERSION="${DOCKER_USER}/worker-cabinet-frontend:${VERSION}"
FULL_BACKEND_LATEST="${DOCKER_USER}/worker-cabinet-backend:${TAG}"
FULL_BACKEND_VERSION="${DOCKER_USER}/worker-cabinet-backend:${VERSION}"

echo "=== Сборка фронтенда ==="
docker build -t worker-cabinet-frontend:${TAG} -t worker-cabinet-frontend:${VERSION} -f Dockerfile.frontend .
echo "=== Пуш фронтенда ==="
docker push "${FULL_FRONTEND_LATEST}"
docker push "${FULL_FRONTEND_VERSION}"

echo ""
echo "=== Сборка бэкенда ==="
docker build -t worker-cabinet-backend:${TAG} -t worker-cabinet-backend:${VERSION} -f Dockerfile.backend .
echo "=== Пуш бэкенда ==="
docker push "${FULL_BACKEND_LATEST}"
docker push "${FULL_BACKEND_VERSION}"

echo ""
echo "=== Готово ==="
echo "Фронтенд: ${FULL_FRONTEND_LATEST} / ${FULL_FRONTEND_VERSION}"
echo "Бэкенд:   ${FULL_BACKEND_LATEST} / ${FULL_BACKEND_VERSION}"
