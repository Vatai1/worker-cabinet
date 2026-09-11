#!/usr/bin/env bash
set -euo pipefail

DOCKER_USER="vatai12"
TAG="latest"
VERSION=$(node -p "require('./package.json').version")
PLATFORM="linux/amd64"

FULL_FRONTEND_LATEST="${DOCKER_USER}/worker-cabinet-frontend:${TAG}"
FULL_FRONTEND_VERSION="${DOCKER_USER}/worker-cabinet-frontend:${VERSION}"
FULL_BACKEND_LATEST="${DOCKER_USER}/worker-cabinet-backend:${TAG}"
FULL_BACKEND_VERSION="${DOCKER_USER}/worker-cabinet-backend:${VERSION}"

echo "=== Сборка фронтенда (${PLATFORM}) ==="
docker buildx build --platform "${PLATFORM}" -t "${FULL_FRONTEND_LATEST}" -t "${FULL_FRONTEND_VERSION}" -f Dockerfile.frontend . --push
echo ""
echo "=== Сборка бэкенда (${PLATFORM}) ==="
docker buildx build --platform "${PLATFORM}" -t "${FULL_BACKEND_LATEST}" -t "${FULL_BACKEND_VERSION}" -f Dockerfile.backend . --push

echo ""
echo "=== Готово ==="
echo "Фронтенд: ${FULL_FRONTEND_LATEST} / ${FULL_FRONTEND_VERSION}"
echo "Бэкенд:   ${FULL_BACKEND_LATEST} / ${FULL_BACKEND_VERSION}"
