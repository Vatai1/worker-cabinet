# SearXNG Search Backend Setup

## Docker Service

```yaml
# In docker-compose.yml (root)
  searxng:
    image: searxng/searxng:latest
    container_name: worker-cabinet-searxng
    restart: unless-stopped
    volumes:
      - ./docker/searxng/settings.yml:/etc/searxng/settings.yml:ro
    ports:
      - "127.0.0.1:8888:8080"
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8080/healthz"]
      interval: 15s
      timeout: 5s
      retries: 3
    networks:
      - worker-cabinet-network
```

Host port 8888 (not 8080 — OnlyOffice uses 8080). Internal port 8080 stays.

## settings.yml

Located at `docker/searxng/settings.yml`. Key points:
- `use_default_settings: true` — inherits SearXNG defaults (includes Yandex as a disabled engine)
- `search.default_lang: "ru"` — Russian language results
- `search.formats: [html, json]` — JSON format required for API access
- Enable Yandex: just `- name: yandex` with `disabled: false` (no engine/shortcut override — it's in defaults already)
- Disable unwanted engines: `- name: bing` with `disabled: true`

## Hermes Agent Integration

Hermes reads `SEARXNG_URL` env var and `web.search_backend` from config.yaml.

The `POST /api/admin/assistant/hermes-config` endpoint writes both:
1. `~/.hermes/config.yaml` → `web: { search_backend: "searxng" }`
2. `~/.hermes/.env` → `SEARXNG_URL=http://searxng:8080` (Docker network URL for the container)

The hermes-agent container has `SEARXNG_URL=http://searxng:8080` in its docker-compose environment section as well (override). The `depends_on: searxng: condition: service_healthy` ensures ordering.

## URL Reference

| Context | URL |
|---------|-----|
| Browser / admin panel | `http://localhost:8888` |
| Hermes Agent container | `http://searxng:8080` |
| Backend Node.js | `http://127.0.0.1:8888` |
| system_settings `assistant_searxng_url` | `http://localhost:8888` (for display/admin checks) |

## Verification

```bash
# Container running?
docker ps --filter name=searxng

# Search test (host)
curl -s "http://localhost:8888/search?q=test&format=json&language=ru" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('results',[])), 'results')"

# Check which engines responded
curl -s "http://localhost:8888/search?q=test&format=json&language=ru" | python3 -c "import sys,json; d=json.load(sys.stdin); engines=set(); [engines.add(r.get('engine','?')) for r in d.get('results',[])]; print('Engines:', ', '.join(sorted(engines)))"

# Check specific engine
curl -s "http://localhost:8888/search?q=test&format=json&engines=yandex" | python3 -c "import sys,json; d=json.load(sys.stdin); print('unresponsive:', d.get('unresponsive_engines',[]))"
```

## Troubleshooting

- **Container crash loop with `ambiguous shortcut: ya`**: Yandex engine is already in defaults. Remove `engine:` and `shortcut:` from custom entry. Just use `- name: yandex` + `disabled: false`.
- **`language: ru-RU` ValueError**: SearXNG Yandex engine doesn't support per-engine language override. Remove `language:` line, use `search.default_lang: "ru"` instead.
- **Port 8080 bind failed**: OnlyOffice already uses 8080. Change host port mapping to `8888:8080`.
- **Yandex returns "ошибка разбора"**: Known issue — Yandex blocks scraping. No fix. Google and DuckDuckGo still return Russian results.
- **`Cannot GET /search`**: JSON format not enabled in settings. Check `search.formats` includes `json`. Also verify settings.yml is mounted correctly (container logs show config parse errors).
- **Container not started by deploy.js**: Add `searxng` to the `startServices()` function in `deploy/deploy.js`.
