# Деплой Worker Cabinet

## Один сервер

Используется: `deploy/docker-compose.prod.yml`

Файлы на сервере: `docker-compose.prod.yml`, `deploy/.env.backend.example` → `.env`, `Dockerfile.frontend`, `Dockerfile.backend`, `deploy/nginx.conf`

### 1. Подготовка сервера

```bash
apt install docker.io docker-compose-plugin
mkdir -p /opt/worker-cabinet
```

### 2. Копирование файлов

```bash
scp deploy/docker-compose.prod.yml \
    deploy/.env.backend.example \
    deploy/nginx.conf \
    Dockerfile.frontend \
    Dockerfile.backend \
    docker/init-db/ \
    user@server:/opt/worker-cabinet/
```

### 3. Конфигурация .env

```bash
ssh user@server
cd /opt/worker-cabinet
cp .env.backend.example .env
nano .env
```

Обязательно заполнить: `DB_PASSWORD`, `JWT_SECRET`, `S3_SECRET_KEY`, `ONLYOFFICE_JWT_SECRET`, `RABBITMQ_PASSWORD`, `NOTIFICATION_SECRET`, `HERMES_API_KEY`

### 4. Сборка образов

Сборка на сервере:

```bash
cd /opt/worker-cabinet
docker compose -f docker-compose.prod.yml build
```

Или пуш с машины разработчика:

```bash
npm run docker:build
docker tag worker-cabinet-frontend:latest registry/worker-cabinet-frontend:latest
docker tag worker-cabinet-backend:latest registry/worker-cabinet-backend:latest
docker tag worker-cabinet-notification:latest registry/worker-cabinet-notification:latest
docker push registry/worker-cabinet-frontend:latest
docker push registry/worker-cabinet-backend:latest
docker push registry/worker-cabinet-notification:latest
```

Тогда в `.env` на сервере: `BACKEND_IMAGE=registry/worker-cabinet-backend:latest`, `NOTIFICATION_IMAGE=registry/worker-cabinet-notification:latest`

### 5. Запуск

```bash
docker compose -f docker-compose.prod.yml up -d
```

### 6. Миграции БД

```bash
docker compose -f docker-compose.prod.yml exec backend npm run migrate
```

### 7. Проверка

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
```

- Приложение: `http://SERVER_IP/`
- API: `http://SERVER_IP:5000/`

---

## Два сервера

- **Сервер 1 (APP)** — nginx + frontend, порт 80
- **Сервер 2 (BACKEND)** — backend API + PostgreSQL + MinIO + OnlyOffice + RabbitMQ + notification-service + Hermes

Используется:

- APP: `deploy/docker-compose.app.yml` + `deploy/nginx-app.conf` + `deploy/deploy-app.sh`
- BACKEND: `deploy/docker-compose.backend.yml` + `deploy/deploy-backend.sh`

### Архитектура

```
┌───────────────────────────┐       ┌────────────────────────────────┐
│  APP Сервер (:80)         │       │  BACKEND Сервер                 │
│                           │       │                                │
│  nginx → /api ────────────┼──────►│  backend (:5000)                │
│  nginx → /      (static)  │       │  PostgreSQL (:5432)             │
│                           │       │  MinIO (:9000/:9001)            │
│  docker-compose.app.yml   │       │  OnlyOffice + Redis            │
│  deploy-app.sh            │       │  RabbitMQ (:5672)               │
│                           │       │  notification-service (:5001)   │
└───────────────────────────┘       │  Hermes Agent (:8642 local)      │
      Локальная сеть                │  SearXNG (:8888 local)           │
                                    │  docker-compose.backend.yml     │
                                    │  deploy-backend.sh              │
                                    └────────────────────────────────┘
```

### Сборка и пуш образов (машина разработчика)

```bash
cd worker-cabinet
```

Сборка (multi-arch для amd64 сервера):

```bash
docker buildx build -f Dockerfile.frontend \
  --build-arg VITE_API_BASE_URL=/api \
  --platform linux/amd64,linux/arm64 \
  -t vatai12/worker-cabinet-frontend:latest \
  --push .

docker buildx build -f Dockerfile.backend \
  --platform linux/amd64,linux/arm64 \
  -t vatai12/worker-cabinet-backend:latest \
  --push .

docker buildx build -t worker-cabinet-notification \
  --platform linux/amd64,linux/arm64 \
  -t vatai12/worker-cabinet-notification:latest \
  --push .
```

---

### Сервер бэкенда

#### 1. Копирование файлов

```bash
ssh user@backend-server
mkdir -p /opt/worker-cabinet
```

С машины разработчика:

```bash
scp deploy/docker-compose.backend.yml \
    deploy/deploy-backend.sh \
    deploy/.env.backend.example \
    docker/init-db/ \
    user@backend-server:/opt/worker-cabinet/
```

#### 2. Конфигурация .env

```bash
cd /opt/worker-cabinet
cp .env.backend.example .env
nano .env
```

Обязательные переменные:

| Переменная               | Значение                                      |
|--------------------------|-----------------------------------------------|
| `BACKEND_IMAGE`          | `vatai12/worker-cabinet-backend:latest`       |
| `NOTIFICATION_IMAGE`     | `vatai12/worker-cabinet-notification:latest`   |
| `DB_PASSWORD`            | пароль PostgreSQL                             |
| `JWT_SECRET`             | секрет подписи JWT                            |
| `S3_SECRET_KEY`          | секретный ключ MinIO                           |
| `ONLYOFFICE_JWT_SECRET` | секрет OnlyOffice JWT                           |
| `RABBITMQ_PASSWORD`      | пароль RabbitMQ                                |
| `NOTIFICATION_SECRET`   | секрет уведомлений                             |
| `HERMES_API_KEY`         | API ключ Hermes Agent                         |

Keycloak (если используется):

| Переменная                | Значение                                              |
|---------------------------|-------------------------------------------------------|
| `KEYCLOAK_URL`            | `http://host.docker.internal:8081`                     |
| `KEYCLOAK_PUBLIC_URL`    | `http://<BACKEND_SERVER_IP>:8081`                     |
| `KEYCLOAK_REALM`          | `worker-cabinet`                                      |
| `KEYCLOAK_CLIENT_ID`      | `worker-cabinet`                                      |
| `KEYCLOAK_CLIENT_SECRET` | клиентский секрет                                     |

#### 3. Деплой

```bash
chmod +x deploy-backend.sh
./deploy-backend.sh deploy
```

Автоматически: pull образов → пересоздание контейнеров → миграции.

Команды скрипта:

| Команда     | Описание         |
|-------------|------------------|
| `deploy`    | Полный деплой    |
| `pull`      | Загрузка образов |
| `start`     | Запуск           |
| `stop`      | Остановка        |
| `restart`   | Перезапуск       |
| `logs`      | Логи             |
| `status`    | Статус           |
| `migrate`   | Миграции         |

#### 4. Keycloak (если нужен SSO)

Скопировать `docker/keycloak-test/` и `realm-export.json` на сервер бэкенда или отдельный сервер.

---

### Сервер приложений (APP)

#### 1. Копирование файлов

```bash
scp deploy/docker-compose.app.yml \
    deploy/deploy-app.sh \
    deploy/.env.app.example \
    deploy/nginx-app.conf \
    user@app-server:/opt/worker-cabinet/
```

#### 2. Конфигурация .env

```bash
cd /opt/worker-cabinet
cp .env.app.example .env
nano .env
```

Обязательные переменные:

| Переменная          | Значение                                 |
|---------------------|------------------------------------------|
| `FRONTEND_IMAGE`    | `vatai12/worker-cabinet-frontend:latest`  |
| `BACKEND_HOST`      | IP сервера бэкенда в локальной сети      |
| `BACKEND_PORT`      | `5000`                                   |
| `APP_PORT`          | `80`                                     |
| `NGINX_SERVER_NAME` | домен или `_`                             |

> `BACKEND_HOST` — IP или hostname сервера бэкенда в локальной сети, т.к. nginx фронтенда проксирует `/api` туда.

#### 3. Деплой

```bash
chmod +x deploy-app.sh
./deploy-app.sh deploy
```

Команды скрипта:

| Команда   | Описание         |
|-----------|------------------|
| `deploy`  | Полный деплой    |
| `pull`    | Загрузка образов |
| `start`   | Запуск           |
| `stop`    | Остановка        |
| `restart` | Перезапуск       |
| `logs`    | Логи             |
| `status`  | Статус           |

---

### Порты

**APP Сервер** (открыть извне):

| Порт | Сервис   |
|------|----------|
| 80   | HTTP (nginx) |

**BACKEND Сервер** (закрыть извне, кроме API):

| Порт  | Сервис               | Доступ    |
|-------|----------------------|-----------|
| 5000  | Backend API          | сеть      |
| 5432  | PostgreSQL           | закрыть   |
| 9000  | MinIO S3 API         | закрыть   |
| 9001  | MinIO Console        | закрыть   |
| 5672  | RabbitMQ             | закрыть   |
| 15672 | RabbitMQ Management  | закрыть   |
| 5001  | Notification service | закрыть   |
| 8642  | Hermes Agent         | localhost |
| 8888  | SearXNG              | localhost |

Рекомендация: слушать API только на internal IP:

```yaml
ports:
  - "10.0.0.x:5000:5000"
```

---

### Обновление

1. Машина разработчика:

```bash
npm run docker:build
# tag + push (или --push в buildx)
```

2. BACKEND сервер:

```bash
./deploy-backend.sh deploy
```

3. APP сервер:

```bash
./deploy-app.sh deploy
```

Порядок: сначала BACKEND, потом APP (reverse proxy терпит короткий даунтайм бэкенда).

---

### Политика безопасности

- PostgreSQL, MinIO, RabbitMQ — закрыть порты извне
- Все секреты (`DB_PASSWORD`, `JWT_SECRET` и т.д.) — сильные, уникальные, не в git
- Hermes Agent и SearXNG — биндятся на `127.0.0.1`
- OnlyOffice — за reverse proxy, JWT включён
- Для production: добавить HTTPS (certbot/letsencrypt) на APP сервере перед nginx (либо добавить certbot контейнер в `docker-compose.app.yml`)
