# Hermes Agent Docker Sidecar Setup

## Service Definition

The `hermes-agent` service is defined in the **main** `docker-compose.yml` (project root), not a separate file. It runs alongside postgres, minio, onlyoffice, and other infrastructure.

```yaml
# In docker-compose.yml (root)
  hermes-agent:
    image: nousresearch/hermes-agent:latest
    container_name: worker-cabinet-hermes
    restart: unless-stopped
    volumes:
      - ./docker/hermes/data:/opt/data
    env_file:
      - path: ./docker/hermes/data/.env
        required: false
    environment:
      - HERMES_UID=${HERMES_UID:-1000}
      - HERMES_GID=${HERMES_GID:-1000}
      - HERMES_HOME=/opt/data
      - API_SERVER_ENABLED=true
      - API_SERVER_KEY=${HERMES_API_KEY:-wc-assistant-secret}
      - API_SERVER_HOST=0.0.0.0
      - API_SERVER_PORT=8642
      - API_SERVER_CORS_ORIGINS=http://localhost:3000,http://localhost:5000
      - SEARXNG_URL=http://searxng:8080
    ports:
      - "127.0.0.1:8642:8642"
    command: ["gateway", "run"]
    networks:
      - worker-cabinet-network
    depends_on:
      searxng:
        condition: service_healthy
```

Port 8642 chosen to avoid conflict with the main Hermes agent. Port bound to `127.0.0.1` only (no external access).

## Startup

Hermes-agent is included in the `deploy/deploy.js` service list, so `npm run deploy:dev` starts it automatically.

Manual: `docker compose up -d hermes-agent`

## Admin Panel Configuration

Settings → Ассистент tab has a dedicated "Hermes Agent (встроенный)" section:

1. **Toggle** — enables/disables built-in Hermes. When toggled ON, auto-fills `assistant_api_url` and `assistant_api_key` from port/key fields
2. **Проверить** button — pings `http://127.0.0.1:{port}/health`, shows "Запущен" / "Остановлен"
3. **Port** and **API key** fields — configure connection details
4. Hint text shows: `docker compose up -d hermes-agent`

DB settings (system_settings keys):
- `assistant_hermes_enabled` — `'true'`/`'false'`
- `assistant_hermes_port` — default `'8642'`
- `assistant_hermes_api_key` — shared secret for API Server

## Verification

```bash
# Health check
curl http://127.0.0.1:8642/health
# Expected: {"status":"ok"}

# Test chat completion (replace YOUR_KEY)
curl -s http://127.0.0.1:8642/v1/chat/completions \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"hermes-agent","messages":[{"role":"user","content":"test"}]}'
# Expected: SSE stream or {"choices":[{"message":{"content":"..."}}]}

# Container logs
docker logs worker-cabinet-hermes --since 5m

# Check container health
docker ps --filter name=worker-cabinet-hermes
```

## How It Works

1. Worker Cabinet backend reads `system_settings` for `assistant_api_url`, `assistant_api_key`, `assistant_model`
2. On `POST /api/assistant/chat`, backend builds OpenAI-format payload with `stream: true` and sends to the configured URL. Uses `config.temperature`, `config.maxTokens`, `config.historyLimit` from `system_settings` (not hardcoded).
3. Hermes API server validates Bearer token against `API_SERVER_KEY`, processes via the configured provider (e.g., z.ai/glm-5.1)
4. Response comes back as SSE stream — backend proxies chunks to frontend via `res.write()`, then saves full message to DB

## Critical: Gateway Profile vs Root Config

Hermes Gateway does **NOT** use the root `/opt/data/config.yaml`. It creates/uses a **profile** at `/opt/data/profiles/<profile_id>/` (e.g., `hghg`). This profile has its own `config.yaml`, `.env`, `state.db`, `sessions/`, etc.

**This means:**
- Editing `~/.hermes/config.yaml` on the host does NOT affect the gateway
- The gateway's model, provider, and API key come from the profile's config
- `hermes config show` inside the container reveals the profile path (e.g., `Config: /opt/data/profiles/hghg/config.yaml`)

**Correct configuration flow:**

1. Set model and provider via `hermes config set` inside the container:
   ```bash
   docker exec worker-cabinet-hermes hermes config set model.default glm-4.5
   docker exec worker-cabinet-hermes hermes config set model.provider zai
   ```

2. Create `.env` in the profile directory with provider API keys. **Cannot use `docker exec echo`** — secret redaction replaces values. Use `docker cp` from host:
   ```bash
   echo "GLM_API_KEY=<full_key>" > /tmp/hermes-profile-env
   echo "GLM_BASE_URL=https://api.z.ai/api/coding/paas/v4" >> /tmp/hermes-profile-env
   docker cp /tmp/hermes-profile-env worker-cabinet-hermes:/opt/data/profiles/hghg/.env
   ```

3. Restart: `docker restart worker-cabinet-hermes`

**How to discover the profile ID:**
```bash
docker exec worker-cabinet-hermes hermes config show 2>&1 | grep 'Config:'
# Output: Config: /opt/data/profiles/hghg/config.yaml
```

Or list profiles: `docker exec worker-cabinet-hermes ls /opt/data/profiles/`

**Why `env_file` in docker-compose is still needed:** Even though the profile has its own `.env`, the container-level env vars (from `env_file`) are needed for `hermes config set` and `hermes chat` to see provider keys. The `docker-compose.yml` should include:
```yaml
env_file:
  - path: ./docker/hermes/data/.env
    required: false
environment:
  - HERMES_HOME=/opt/data
```

**Volume mount is project-local:** The Hermes data directory is `./docker/hermes/data/` in the project repo (NOT `~/.hermes`). This means the config, sessions, and profiles travel with the project. The `.env` with API keys is also stored there and excluded from git via `.gitignore`.

**Secret redaction blocks `docker exec` reads:** When `security.redact_secrets: true` (default), `docker exec ... cat .env` shows redacted keys (e.g., `GLM_API_KEY=2aa7f6...IYf3`). The actual file on disk has the full key — it's only the output that's redacted. To verify file contents, compare byte count: `docker exec wc -c /opt/data/profiles/hghg/.env` vs host file.

## CLI Access Inside Container

The container runs `hermes gateway run` (API server mode, no web UI). To access the interactive CLI chat:

```bash
# Interactive chat (requires TTY)
docker exec -it worker-cabinet-hermes hermes chat

# One-shot query (no TTY needed)
docker exec worker-cabinet-hermes hermes chat -q "Привет, что умеешь?"

# List available subcommands
docker exec worker-cabinet-hermes hermes --help
```

Note: The CLI uses the same profile as the gateway. No browser UI exists; the `/assistant` page in Worker Cabinet is the web interface for Hermes.

## Troubleshooting

- **"Hermes isn't configured yet — no API keys or providers found"**: The gateway profile has no model/provider/API key. Fix via `hermes config set` + `.env` in profile dir (see "Critical: Gateway Profile vs Root Config" above).
- **"model:The model code cannot be empty" (Z.AI 400)**: Hermes sends an empty model name to the provider. The profile config's `model.default` is empty. Run `docker exec worker-cabinet-hermes hermes config set model.default <model_name>`.
- **"Invalid API key" from provider**: The profile's `.env` is missing or has a wrong API key. Check with `docker exec worker-cabinet-hermes hermes config show | grep -i GLM`. Re-create the profile `.env` via `docker cp` from host (not `docker exec echo` — secret redaction will corrupt it).
- **"Ошибка связи с AI-сервисом"**: Backend catch block fired — the Node.js process couldn't reach Hermes. Check: (a) container running `docker ps`, (b) URL uses `127.0.0.1` not `localhost`, (c) API key matches between DB and container env.
- **Container logs empty (no requests arriving)**: Backend isn't reaching the container at all. Likely the URL is wrong or Node.js IPv6 resolution issue. Use `127.0.0.1` explicitly.
- **Direct curl works but backend doesn't**: Same IPv6 issue — Node.js `fetch("http://localhost:...")` resolves to `::1`. Fix the URL in `system_settings` to use `127.0.0.1`.
- **deploy.js didn't start hermes-agent**: The `deploy/deploy.js` `startServices()` function has a hardcoded service list on the `docker-compose up -d` line. If a new service was added to `docker-compose.yml` but not to this list, it won't start with `npm run deploy:dev`. Add it to the array.
- **Root config.yaml edits have no effect**: Gateway uses profile config at `/opt/data/profiles/<id>/config.yaml`, NOT `/opt/data/config.yaml`. Verify with `docker exec worker-cabinet-hermes hermes config show | grep Config:`.
- **Container recreation switches to root config**: `docker compose up -d` recreates the container and may delete/reset the profile directory. After recreation, Hermes may fall back to using `/opt/data/config.yaml` (root) instead of a profile. Always verify with `hermes config show | grep Config:`. If using root config, set model/provider/base_url there via `hermes config set`.
- **Z.AI custom base_url required**: The Z.AI coding API uses `https://api.z.ai/api/coding/paas/v4`, not the default endpoint. Hermes auto-detects `GLM_API_KEY` from env but does NOT infer the base URL. Set explicitly: `docker exec worker-cabinet-hermes hermes config set providers.zai.base_url 'https://api.z.ai/api/coding/paas/v4'`. Without this, requests fail with "model: The model code cannot be empty" (HTTP 400) because the default endpoint doesn't recognize the model name.
- **`hermes config set` writes to active config location**: Whether the active config is root or profile, `hermes config set` writes to the correct file. Always use `hermes config set` rather than editing YAML directly.

## Config Restoration After Container Recreation

When `docker compose up -d` recreates the container (e.g., after docker-compose.yml changes), the profile directory may be reset. The root config on the volume (`/opt/data/config.yaml`) persists, but Hermes may switch between using the profile and the root config.

**Quick restoration procedure:**

```bash
# 1. Check which config is active
docker exec worker-cabinet-hermes hermes config show 2>&1 | grep 'Config:'

# 2. If root config (e.g., /opt/data/config.yaml):
docker exec worker-cabinet-hermes hermes config set model.default glm-4.5
docker exec worker-cabinet-hermes hermes config set model.provider zai
docker exec worker-cabinet-hermes hermes config set providers.zai.base_url 'https://api.z.ai/api/coding/paas/v4'

# 3. If profile config (e.g., /opt/data/profiles/hghg/config.yaml):
# Same commands work — hermes config set targets the active location
# But also need to create .env in profile dir:
GLM_KEY=$(grep GLM_API_KEY docker/hermes/data/.env | cut -d= -f2)
GLM_URL=$(grep GLM_BASE_URL docker/hermes/data/.env | cut -d= -f2)
echo "GLM_API_KEY=$GLM_KEY" > /tmp/hermes-profile-env
echo "GLM_BASE_URL=$GLM_URL" >> /tmp/hermes-profile-env
docker cp /tmp/hermes-profile-env worker-cabinet-hermes:/opt/data/profiles/hghg/.env

# 4. Always restart after config changes
docker restart worker-cabinet-hermes

# 5. Verify
sleep 10
docker exec worker-cabinet-hermes hermes config show 2>&1 | grep -E 'Model|Provider'
```

**Automated restoration:** Consider adding a healthcheck or entrypoint script that runs `hermes config set` on startup if model is empty. The current workaround is manual — run the commands above after any `docker compose up -d` that recreates the container.

## Z.AI Provider-Specific Notes

- **API endpoint**: `https://api.z.ai/api/coding/paas/v4` (NOT the default GLM endpoint)
- **Model names**: `glm-4.5` works. `glm-5.1` may require a different API key tier. `glm-5-turbo` is not recognized.
- **Error `1214 model code cannot be empty`**: Hermes sends an empty model name when the profile/root config has `model.default` unset, or when the Z.AI base_url is wrong (requests go to default endpoint which doesn't recognize the model).
- **Direct API test** (bypasses Hermes): `curl -s https://api.z.ai/api/coding/paas/v4/chat/completions -H "Authorization: Bearer $GLM_API_KEY" -H "Content-Type: application/json" -d '{"model":"glm-4.5","messages":[{"role":"user","content":"ping"}]}'`

