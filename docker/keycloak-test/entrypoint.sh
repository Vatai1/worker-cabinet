#!/bin/bash
set -e

echo "[entrypoint] Starting Keycloak in background..."
/opt/keycloak/bin/kc.sh start-dev --import-realm --http-relative-path=/ &
KC_PID=$!

echo "[entrypoint] Waiting for Keycloak to be ready..."
RETRIES=0
until curl -sf http://localhost:9000/health/ready 2>/dev/null; do
  sleep 2
  RETRIES=$((RETRIES + 1))
  if [ $RETRIES -ge 60 ]; then
    echo "[entrypoint] Keycloak failed to start after 120s"
    exit 1
  fi
done
echo "[entrypoint] Keycloak ready, patching SSL..."

/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user "${KEYCLOAK_ADMIN:-admin}" --password "${KEYCLOAK_ADMIN_PASSWORD:-admin123}" 2>/dev/null
/opt/keycloak/bin/kcadm.sh update realms/master -s sslRequired=none 2>/dev/null && echo "[entrypoint] master: sslRequired=none" || echo "[entrypoint] WARN: failed to patch master"
/opt/keycloak/bin/kcadm.sh update realms/worker-cabinet -s sslRequired=none 2>/dev/null && echo "[entrypoint] worker-cabinet: sslRequired=none" || echo "[entrypoint] WARN: failed to patch worker-cabinet"

echo "[entrypoint] SSL patching done"
wait $KC_PID
