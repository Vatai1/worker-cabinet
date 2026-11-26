# Обновления из Docker Registry / Nexus

Приложение и сервис управления поставляются готовыми образами. На проде не нужны Git, исходники, npm, Node.js или локальная сборка. На APP помощник исполняется внутри контейнера через ограниченную SSH-команду `docker exec`. На BACKEND отдельный контейнер читает задания из PostgreSQL и управляет существующим Compose-проектом.

Образы собираются и публикуются только на машине сборки. `docker-build-push.sh` публикует frontend, backend и `worker-cabinet-deployment-agent` одной версии. Образ сервиса одинаковый для обоих серверов; роль определяется переменной окружения. Версии приложения обнаруживаются автоматически по Docker Registry HTTP API V2, без GitHub и передачи JSON-манифестов.

## Как находятся версии

Сервис проверяет теги frontend/backend в Registry/Nexus каждые 30 секунд по умолчанию. Интервал задаёт `DEPLOY_REGISTRY_POLL_SECONDS`. Кнопка «Найти новые версии» ставит запрос в очередь. Поиск выполняется не чаще одного раза в 30 секунд, после завершения активного обновления или предыдущей проверки.

В список попадают последние 30 общих стабильных версий `X.Y.Z`, для которых:

- оба образа опубликованы и содержат выбранную платформу, по умолчанию `linux/amd64`;
- OCI-метка `org.opencontainers.image.version` совпадает с тегом;
- метки `org.opencontainers.image.revision` у frontend/backend совпадают;
- манифесты и конфигурации прошли проверку SHA-256.

`latest`, prerelease, неполные пары и образы разных коммитов не предлагаются. Версии сортируются численно. Для запуска сохраняется пара immutable digest, а не изменяемых тегов. Сканирование выполняет GET-запросы к реестру и не скачивает слои образов. `docker pull` выполняется только при обновлении.

Сбой реестра сохраняет прежний каталог в БД, но блокирует новые запуски до успешной проверки. Уже начатое обновление использует сохранённые digest и не прерывается из-за очередного сканирования. Перепубликация существующей версии с другими digest блокируется. Перенос тех же digest в Nexus допустим; история заданий сохраняет первоначальные ссылки.

Протокол: [Registry API V2](https://distribution.github.io/distribution/spec/api/), [Bearer-авторизация](https://distribution.github.io/distribution/spec/auth/token/). Поддерживаются Basic, Bearer и пагинация списка тегов. Реестр должен предоставлять `/v2/<repository>/tags/list`, manifests и blobs. Если Docker pull через Nexus работает, но `tags/list` недоступен, необходимо открыть этот read-only API на стороне Nexus — доступа к GitHub всё равно не требуется.

## Что остаётся на серверах

Compose, `.env`, стандартные SSH-ключи/known_hosts и сертификаты при необходимости. Данные приложения, резервные копии и флаг обслуживания хранятся в подключаемых каталогах. Исходники и исполняемые JS-файлы находятся внутри образов; Docker CLI и Compose plugin также включены в образ сервиса, их не нужно монтировать с хоста.

`DEPLOY_ROOT` подключается в контейнер по тому же абсолютному пути, что на хосте. Он должен содержать действующий Compose и `.env`; Docker daemon использует абсолютные пути файлов из этого Compose. Не меняйте имя существующего проекта приложения: это может изменить сети и тома.

Проверка проекта без вывода секретов:

```bash
docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' worker-cabinet-backend
docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' worker-cabinet-frontend
```

Проверьте фактические имена контейнеров; примеры предполагают сервисы `backend`, `notification-worker`, `postgres` и `frontend`. Полный `docker inspect`/`compose config` может содержать секреты — не публикуйте его в чат.

## Установка на BACKEND

После публикации нового релиза доставьте на сервер только:

- `deploy/docker-compose.deployment-agent.yml`;
- `deploy/agent/.env.example`, сохранённый как `.env.deployment-agent` рядом с Compose.

Установите `DEPLOY_AGENT_IMAGE` на опубликованный тег или, предпочтительно, digest образа `worker-cabinet-deployment-agent`. Значение `VERSION` в примере — placeholder, не опубликованный тег. В примере роль backend, приложение находится в `/root`, проект `root`, сеть `root_worker-cabinet-network`. Укажите фактические значения.

`DEPLOY_PROJECT`, `DEPLOY_COMPOSE_FILE`, `DEPLOY_APP_ENV_FILE`, `DEPLOY_BACKUP_DIR` относятся к действующему приложению. Сам сервис запускается отдельным проектом, например `wc-deployment-control`.

Укажите `DB_HOST=postgres` и внутренний порт PostgreSQL в общей существующей Docker-сети. Имя базы для текущего монолитного мигратора — `worker_cabinet`. Не открывайте PostgreSQL наружу ради агента. Перенесите пароль в закрытый `.env` на сервере, не выводя его в журнал.

### Nexus и приватные образы

Пример согласованных параметров:

```dotenv
DEPLOY_REGISTRY_URL=https://nexus.example.ru:5000
DEPLOY_BACKEND_REPOSITORY=nexus.example.ru:5000/vatai12/worker-cabinet-backend
DEPLOY_FRONTEND_REPOSITORY=nexus.example.ru:5000/vatai12/worker-cabinet-frontend
DEPLOY_REGISTRY_USERNAME=readonly-deploy
DEPLOY_REGISTRY_PASSWORD=SERVER_SECRET
DEPLOY_REGISTRY_POLL_SECONDS=30
DEPLOY_PLATFORM=linux/amd64
```

API URL — адрес Docker connector Nexus; у некоторых конфигураций есть дополнительный путь, который можно включить в `DEPLOY_REGISTRY_URL`. Имена репозиториев должны совпадать с путями, доступными этому connector. Для закрытой сети используйте Nexus, а не публичный `registry-1.docker.io` из примера по умолчанию.

Если Nexus уже настроен как daemon mirror и действующие ссылки `vatai12/...` работают без явного hostname, можно сохранить их и указать Nexus только как API URL. Для приватных репозиториев предпочтительны полные имена Nexus: login, API и pull тогда используют один registry host. При legacy mirror-подключении потребуется существующая рабочая конфигурация авторизации Docker; её можно подключить через отдельный Compose override вместо стандартного tmpfs `/run/docker`.

Секреты реестра задаются только в `.env`; сервис выполняет `docker login --password-stdin` внутри контейнера и хранит Docker credentials в tmpfs `/run/docker`. На APP задайте аналогичные credentials для чтения frontend. Пользователям админки эти секреты не возвращаются.

HTTPS обязателен по умолчанию. Для внутреннего HTTP-реестра необходимо явное `DEPLOY_REGISTRY_ALLOW_HTTP=true`. Для собственного CA подключите его в контейнер и задайте `NODE_EXTRA_CA_CERTS`; Docker daemon на каждом хосте должен доверять реестру независимо от Node.js. Не отключайте проверку TLS. Если Bearer realm расположен на другом внутреннем origin, явно добавьте его в `DEPLOY_REGISTRY_AUTH_ORIGINS` через запятую. Для Docker Hub `https://auth.docker.io` разрешён автоматически. Credentials не передаются произвольным redirect/pagination origins.

Подготовьте существующий отдельный SSH-ключ и проверенный `known_hosts` в `/etc/worker-cabinet/deploy-ssh`. Права каталога `700`, ключа `600`. Путь можно изменить через `DEPLOY_SSH_DIRECTORY`. Поддерживается `DEPLOY_SSH_PORT`, по умолчанию 22; конфигурация `~/.ssh/config` не используется.

Запуск из каталога с двумя файлами:

```bash
docker compose --project-name wc-deployment-control --env-file .env.deployment-agent -f docker-compose.deployment-agent.yml pull
docker compose --project-name wc-deployment-control --env-file .env.deployment-agent -f docker-compose.deployment-agent.yml up -d --no-build
docker compose --project-name wc-deployment-control --env-file .env.deployment-agent -f docker-compose.deployment-agent.yml logs --tail=100
```

В production Compose нет `build:` и подключения исходников. Публичных портов у сервиса нет.

## Установка на APP

Доставьте `deploy/docker-compose.frontend-agent.yml` и `deploy/agent/.env.frontend.example`. Сохраните пример как `.env.frontend-agent` рядом с Compose и заполните фактические значения. Укажите готовый `DEPLOY_AGENT_IMAGE` той же версии.

Роль frontend, `DEPLOY_ROOT`, `DEPLOY_PROJECT`, `DEPLOY_COMPOSE_FILE`, `DEPLOY_APP_ENV_FILE`, `DEPLOY_FRONTEND_REPOSITORY` относятся к действующему frontend. `DEPLOY_MAINTENANCE_DIR` указывает на существующий каталог обслуживания. Он должен быть подключён в nginx по пути `/etc/nginx/maintenance`; изменения фронтенд-образа и nginx из 2.4.64 должны уже присутствовать.

```bash
docker compose --project-name wc-frontend-control --env-file .env.frontend-agent -f docker-compose.frontend-agent.yml pull
docker compose --project-name wc-frontend-control --env-file .env.frontend-agent -f docker-compose.frontend-agent.yml up -d --no-build
```

Помощник находится в постоянно запущенном контейнере `worker-cabinet-frontend-agent`. Он не публикует сетевых портов. В `authorized_keys` отдельного пользователя `wc-deploy` замените прежнюю принудительную команду с `/usr/bin/node /root/...` на:

```text
restrict,command="/usr/bin/docker exec --interactive worker-cabinet-frontend-agent node /app/deploy/agent/frontend.mjs" ssh-ed25519 ACTUAL_PUBLIC_KEY
```

Проверьте фактический путь к Docker на APP. Пользователю нужны доступ к Docker и стандартная shell для SSH; доступ к `/root` с хоста и Node.js на хосте больше не нужны. Docker даёт широкие права на сервере — ключ должен использоваться только для деплоя. Сохраните права `.ssh`/`authorized_keys` и остальные ключи.

Проверка с BACKEND выполняется **из контейнера** deployment-agent, а не через Node.js на хосте:

```bash
docker compose --project-name wc-deployment-control --env-file .env.deployment-agent -f docker-compose.deployment-agent.yml exec -T deployment-agent sh -c 'printf "%s" "{\"action\":\"inspect\"}" | ssh -F /dev/null -T -p "$DEPLOY_SSH_PORT" -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -o UserKnownHostsFile="$DEPLOY_SSH_KNOWN_HOSTS" -i "$DEPLOY_SSH_KEY" "$DEPLOY_SSH_TARGET"'
```

Ожидается JSON состояния frontend. Проверка исключает one-off контейнеры миграций по Compose labels и совместима с поведением Compose v5 из продового отчёта.

## Переход с установки 2.4.64 из продового отчёта

1. Выпустите новую версию с этими изменениями. До выпуска новый готовый образ агента отсутствует; не используйте старый 2.4.64/случайный `latest` как замену.
2. Сохраните закрытые копии действующих `.env`, Compose и параметров сервиса. Не удаляйте `/root/backups`, БД, данные, SSH-ключи или флаг обслуживания.
3. Убедитесь, что нет `queued`, `running` или `recovery_required` заданий. Завершите/восстановите их прежним агентом до смены конфигурации репозиториев.
4. Обновите приложение по обычному сценарию из нового образа с миграцией. Она добавляет поля состояния сканирования в `deployment_state`, сохраняя настройки и историю. Обычный updater не обновляет собственный контейнер.
5. Подготовьте APP-контейнер помощника и его `.env`, скачайте готовый образ, запустите его отдельным проектом. Старую SSH-команду пока сохраните в резервной копии.
6. Остановите только старый deployment-agent. Не оставляйте два агента на разных настройках: advisory lock исключает работу второго, но старая конфигурация не должна снова захватить управление.
7. Переключите `authorized_keys` на `docker exec`, запустите новый backend deployment-agent из готового образа и проверьте SSH, БД, Docker и Nexus.
8. Сохраните в админке действующие URL сайта/API, дождитесь успешного поиска. При сохранении тех же digest новый registry hostname допустим; содержимое уже опубликованной версии менять нельзя.
9. Проверьте контролируемое обновление в согласованное окно, затем удалите старые bind mounts Docker CLI/Compose plugin, исходников и JSON-конфигов. Новые сервисы не должны зависеть от `/opt/worker-cabinet-deployer`, `/root/deploy/agent`, Node.js на хостах или локального `Dockerfile.deployment-agent.local`.
10. Только после успешной проверки удалите устаревшие исходники/скрипты и лишний host Node.js, если они не используются другими приложениями. Нужные SSH-конфиги, CA, рабочие `.env`, Compose, данные и копии остаются.

Каталог `/root/releases/index.json` больше не участвует в обычном обнаружении версий; переносить следующий JSON вручную не нужно. Старые файлы можно оставить архивом до проверки. Источником каталога является Nexus, результат хранится в PostgreSQL.

## Работа и восстановление

Откройте `/admin/global?tab=deployment` под глобальным superadmin без имперсонации. Отображаются источник и время последней успешной проверки, версии контейнеров, доступные релизы и история. Поиск версий не запускает установку автоматически: администратор выбирает релиз и подтверждает обновление.

Порядок обновления: preflight → параллельный pull → обслуживание → остановка API/worker → custom dump PostgreSQL и проверка архива → однократные миграции → API/worker и health → frontend → проверки сайта/API → снятие обслуживания. Миграционный Compose override передаётся через stdin, временные JS/JSON-файлы на хосте не создаются. Worker больше не наследует неподходящий HTTP-healthcheck API в поставляемом backend Compose. В действующем серверном Compose добавьте для `notification-worker` `healthcheck: { disable: true }`, если у него осталась именно унаследованная HTTP-проверка API; собственную корректную проверку worker сохраняйте.

При ошибке после начала изменений сохраняется `recovery_required`. Не удаляйте блокировку вручную и не повторяйте миграции вслепую. Проверьте `wc-migration-UUID`, БД и совместимость текущих образов. После ручного восстановления нажмите «Проверить восстановление». Автоматического отката БД нет. Dump-файлы и миграционные контейнеры не удаляются автоматически; срок хранения и внешнее хранение копий настраиваются отдельно.

## Проверки для разработчика

Эти команды выполняются на машине разработки/сборки, не на проде:

```bash
node --test backend/src/tests/deployment.test.js backend/src/tests/deployment-registry.test.js
DEPLOY_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/worker_cabinet node --test backend/src/tests/deployment-api.test.js
DEPLOY_DOCKER_TEST=1 DEPLOY_TEST_AGENT_IMAGE=worker-cabinet-deployment-agent:test node --test backend/src/tests/deployment-docker.test.js
npx vitest run core/admin/pages/tabs/DeploymentTab.test.tsx --environment jsdom
npm run lint
npm run typecheck
npm run build
docker build -f deploy/Dockerfile.deployment-agent -t worker-cabinet-deployment-agent:test .
```

Для API-тестов используйте выделенную БД: они создают отдельную временную схему. Для production-развёртывания нужны только готовые образы и серверные конфигурации. Release-скрипт собирает и публикует все три образа из HEAD; на закрытых серверах `--build` не используется.
