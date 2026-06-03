# Worker Cabinet Resource Requirements

## Docker Containers (7 services)

| Service | Image | RAM (idle) | Disk (image) |
|---|---|---|---|
| OnlyOffice | onlyoffice/documentserver | ~1 GB | 5.67 GB |
| Hermes Agent | nousresearch/hermes-agent | ~350 MB | 4.78 GB |
| SearXNG | searxng/searxng | ~160 MB | 370 MB |
| RabbitMQ | rabbitmq:3-management-alpine | ~135 MB | 275 MB |
| MinIO | minio/minio | ~110 MB | 228 MB |
| PostgreSQL | postgres:16-alpine | ~30 MB | 388 MB |
| Redis | redis:7-alpine | ~10 MB | 61 MB |
| **Total** | | **~1.8 GB** | **~11.8 GB** |

## Node.js (Frontend + Backend)

| Component | Disk |
|---|---|
| Frontend node_modules | 328 MB |
| Backend node_modules | 122 MB |
| Source code | ~2 MB |
| PostgreSQL DB | ~12 MB |

## Recommendations by Scale

### Development (1 developer)

- RAM: 8 GB
- CPU: 4 cores
- Disk: 30 GB SSD
- Docker Desktop: 6 GB memory, 4 CPU

### Small production (up to 50 users)

- RAM: 16 GB
- CPU: 8 cores
- Disk: 100 GB SSD

### Medium production (up to 200 users)

| Service | RAM | CPU | Disk |
|---|---|---|---|
| OnlyOffice | 4 GB | 2 | 50 GB SSD |
| Hermes Agent | 2 GB | 2 | 20 GB SSD |
| PostgreSQL | 4 GB | 4 | 100 GB SSD |
| MinIO | 1 GB | 1 | 200 GB SSD (files) |
| RabbitMQ | 1 GB | 1 | 20 GB SSD |
| Redis | 256 MB | 0.5 | 5 GB |
| SearXNG | 512 MB | 1 | 5 GB |
| Node.js (frontend+backend) | 1 GB | 2 | 10 GB |
| **Total** | **~14 GB** | **~13.5 cores** | **~410 GB** |

**Single server recommendation:** 24 GB RAM, 16 cores, 500 GB NVMe SSD

**Two-server split (recommended):**

| Server | Services | RAM | CPU | Disk |
|---|---|---|---|---|
| App | Node.js, Hermes, SearXNG, RabbitMQ, Redis, MinIO | 8 GB | 8 cores | 300 GB SSD |
| DB + Docs | PostgreSQL, OnlyOffice | 16 GB | 8 cores | 500 GB SSD |

Add ~200 GB for backups and ~1 GB for monitoring (Prometheus + Grafana).

## Ports

| Port | Service | Notes |
|---|---|---|
| 3000 | Frontend (Vite) | |
| 5000 | Backend (Express) | |
| 5432 | PostgreSQL | |
| 8642 | Hermes Agent API | |
| 8888 | SearXNG | |
| 9000 | MinIO API | |
| 9001 | MinIO Console | |
| 8080 | OnlyOffice | |
| 5672 | RabbitMQ AMQP | |
| 15672 | RabbitMQ Management | |
