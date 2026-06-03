---
name: worker-cabinet
description: Start, develop, and troubleshoot the Worker Cabinet HR management system (React + Express + PostgreSQL + MinIO).
tags: [worker-cabinet, hr, react, express, postgresql, minio, docker]
triggers:
  - worker-cabinet
  - worker cabinet
---

# Worker Cabinet

Full-stack HR management system at `/Users/vatai/worker-cabinet`.

## Architecture

- Frontend: React 18 + TypeScript + Vite (port 3000) + Tailwind CSS
- Backend: Node.js + Express (port 5000) + PostgreSQL 16
- File Storage: MinIO (S3-compatible, ports 9000/9001)
- State: Zustand (auth token in cookies, 7-day expiry)
- Container orchestration: docker-compose (postgres, minio, onlyoffice, hermes-agent)

## Startup Sequence

Infrastructure MUST be running before the Node backend can serve requests:

1. **Docker Desktop** — `open -a Docker`, wait until `docker info` succeeds
2. **Containers** — `docker compose up -d postgres minio` (onlyoffice is optional)
3. **OnlyOffice DB** (if using document editing) — `docker exec worker-cabinet-db psql -U postgres -c "CREATE DATABASE onlyoffice;"` then `docker compose up -d onlyoffice`
4. **Verify** — `docker ps` must show `worker-cabinet-db` as `(healthy)`; onlyoffice as `(healthy)` if enabled
5. **Dev server** — `npm run dev` (starts both frontend + backend concurrently)

If backend returns 500 on login/auth, PostgreSQL is almost certainly not running.

## Common Operations

```bash
npm run dev                                    # Frontend + backend concurrently
npm run lint && npm run typecheck              # After frontend changes
npm run build                                  # Production build
cd backend && npm run migrate                  # Run database migrations
cd backend && npm run seed                     # Seed test data
```

### Single test files

```bash
cd backend && node --test src/tests/auth.test.js
cd backend && node --test --test-name-pattern="JWT Token" src/tests/auth.test.js
```

## Pitfalls

- **Git pull conflicts with local UI changes**: `Sidebar.tsx` and `uiStore.ts` frequently have local modifications that conflict with remote. User prefers discarding local changes (`git checkout -- <files> && git pull`).
- **500 on login = no database**: The backend starts fine without PostgreSQL but every DB query fails silently. Check `docker ps` first.
- **Docker daemon not running**: On macOS, Docker Desktop must be opened manually (`open -a Docker`). Wait for daemon readiness before `docker compose up`.
- **OnlyOffice needs `onlyoffice` database**: The OnlyOffice container requires a PostgreSQL database named `onlyoffice` to exist. It is NOT auto-created by the project's `migrate.js` or seed. If the container shows `(unhealthy)` and logs `FATAL: database "onlyoffice" does not exist`, create it manually: `docker exec worker-cabinet-db psql -U postgres -c "CREATE DATABASE onlyoffice;"` then restart onlyoffice. Check container name with `docker ps --format "{{.Names}}"` — may vary.
- **`npm install` in both roots**: After pulling, run `npm install` in repo root AND in `backend/` — both have separate `package.json`.
- **Backend logs invisible with `npm run dev` from root**: The root `package.json` runs `concurrently` to start both frontend (Vite) and backend (nodemon). Backend `console.log`/`console.error` output goes to the concurrently-managed subprocess and is NOT visible via `process(action='log')`. To debug backend issues (e.g., verify route changes took effect), kill the combined process and run `cd backend && npm run dev` in a separate terminal. This gives direct visibility into backend logs.
- **Nodemon may not restart after patches**: When patching backend route files, verify nodemon actually restarted by checking the PID change. If process logs show 0 lines after a `touch` or patch, nodemon may not have triggered. Kill the process and restart manually.
- **Docker sidecar `localhost` vs `127.0.0.1`**: When the Node.js backend connects to a Docker-containerized service (Hermes, MinIO, etc.), always use `127.0.0.1` not `localhost`. Node.js resolves `localhost` to `::1` (IPv6) on macOS, but Docker port-mapping binds `0.0.0.0` (IPv4 only). The connection silently fails with no helpful error message.
- **404 on API route = missing route handler**: The DB schema (`migrate.js`), seed data, and frontend API calls (`services/*Api.ts`) can all reference an endpoint that simply has no `router.get/post/delete` in the corresponding route file. Debug path: grep the route path across `backend/src/` and `src/`/`modules/`/`core/` — if the table exists but no route does, add the handler. Check frontend types and test files for expected request/response shapes.
- **Express route ordering**: Literal paths (`/restrictions`, `/check-restrictions`) must be registered before parameterized paths (`/:id`) on the same router. Express matches top-to-bottom.
- **sed `a\` appends AFTER the matching line**: `sed -i '' '57 a\  useModalOpen(isOpen)'` inserts on line 58 (after line 57). If you meant to insert inside a specific block, verify the line number is correct. When doing mass file edits across files with different structures, prefer Python `readlines()` with a regex/pattern match over line-number-based sed.
- **vacation.js uses try/catch, NOT asyncHandler**: Unlike other route files, `backend/src/routes/vacation.js` does NOT import `asyncHandler` from `middleware/errors.js`. All route handlers use manual `try/catch` with `res.status().json()`. Using `asyncHandler()` wrapper will crash the server with `ReferenceError: asyncHandler is not defined`. Always check existing patterns in a file before adding new routes — don't assume all route files share the same wrapper style.
- **Large file corruption via output truncation**: Files >~50KB (like `vacation.js` at 58KB, 1675 lines) can trigger `[OUTPUT TRUNCATED - N chars omitted out of M total]` artifacts in tool output. If this truncated output gets written back into the source file via `execute_code` Python or `sed`, the file becomes corrupted with literal `[OUTPUT TRUNCATED...]` text inside. This happened to `vacation.js` — the corrupted section destroyed the approve/reject/cancel route handlers. **Fix pattern**: For large files, use Python `open()/readlines()/writelines()` directly (never relay through tools that truncate output), and verify with `node -c file.js` after any edit. If truncation corrupted a file, find the `[OUTPUT TRUNCATED` line, identify the surrounding valid code boundaries, delete the garbage lines, and rewrite the missing routes from scratch.
- **Missing vacation approve/reject/cancel routes**: `vacationApi.ts` calls `POST /requests/:id/approve`, `POST /requests/:id/reject`, `POST /requests/:id/cancel`. These routes exist in `vacation.js` (lines ~566-671). All use manual try/catch (not asyncHandler). Each handler: BEGIN tx → check request exists and status is `on_approval` → update `vacation_balances` → insert `vacation_request_status_history` → UPDATE request → COMMIT. Status codes: `approved`, `rejected`, `cancelled_by_employee`. Rejection requires `reason` in body.
- **Missing vacation transfer request route**: `vacationApi.ts` calls `POST /requests/:id/transfer` to create a transfer request. This route was missing and returned 404. Handler: validates original request exists + is `approved` + belongs to user → calculates new duration → INSERT new request with `transferred_from_id`, `transfer_reason`, `transfer_requested_at` → status `on_approval` → INSERT history. See `vacation.js` around line 672. The transfer approve/reject/cancel routes are at `POST /requests/:id/transfer/{approve,reject,cancel}`.
- **Manager role missing data fetch**: In `Vacation.tsx`, the `isManager` branch called `fetchAllRequests()` but NOT `fetchDepartmentRequests()`. This left `departmentRequests` empty, so the "Заявки на согласовании" section never rendered for managers. If a UI section depends on store data (e.g., `departmentRequests.filter(...).length > 0`), verify ALL roles that should see it trigger the corresponding fetch. The fix was adding `fetchDepartmentRequests(user.departmentId || '1')` to the `isManager` branch.
- **Manager can't approve/reject vacation requests**: `VacationDetailModal` received `onApprove`/`onReject` only when `user.id === String(detailRequest.departmentManagerId)`. This is too narrow — it misses managers whose `department_manager_id` in `departments` table doesn't match. Fix: use `isDepartmentManager` flag instead, which already checks role (manager/hr/admin) OR `departmentManagerId` match. Pattern: when action buttons depend on authorization, prefer a pre-computed boolean flag over inline ID comparison.

## Test Credentials

After `npm run seed`: admin@example.com, ivanov@example.com, petrov@example.com — password: `password123`

## Dark Theme

The project uses CSS-variable-based theming (`index.css` `:root`/`.dark` + `darkMode: 'class'` in Tailwind). All `bg-white` (26 files, 118 occurrences) and hardcoded hex/rgba in admin module components (VacationSettings, NotificationsSettings, CalendarSettings, SettingFormElements, ModuleSettingsModal, AuthSettings) have been replaced with CSS variable-based classes as of 2026-06-02. Browser form controls (input, select, option, date/time pickers) have global `@layer base` styles in `index.css`. Alert/status boxes (bg-emerald-50, bg-amber-50 etc.) replaced with `bg-[hsl(var(--success)/0.1)]` pattern. See `references/dark-theme-audit.md` for full audit details, replacement mapping, and fix patterns.
See `templates/vacation-application-template.txt` for the DOCX vacation application template text and placeholder reference.
See `templates/vacation-transfer-template.txt` for the DOCX vacation transfer application template text and placeholder reference.

## Modal + Sidebar Pattern

When any modal opens, the sidebar should slide out. Implementation uses an `openModals` counter in `useUIStore`:

1. `shared/store/uiStore.ts` has `openModals: number`, `openModal()`, `closeModal()` 
2. `shared/hooks/useModalOpen.ts` — custom hook `useModalOpen(isOpen: boolean)` that calls `openModal()` on mount and `closeModal()` on unmount
3. `shared/components/layout/Sidebar.tsx` — sidebar gets `-translate-x-full` when `openModals > 0`, overlay also hidden
4. Every modal component calls `useModalOpen(isOpen)` — hook import + call added to all 7 modals: ModuleSettingsModal, CreateVacationModal, CreateVacationFormModal, VacationTransferModal, RestrictionModal, VacationDetailModal, VacationHistoryModal

**Adding a new modal**: Import `useModalOpen` from `@/shared/hooks/useModalOpen` and call `useModalOpen(isOpen)` in the component body (AFTER the function signature closing `}`, NOT inside the destructuring). The sidebar will auto-hide.

**Pitfall — inserting into destructuring**: When mass-adding `useModalOpen(isOpen)` to multiple modal files, it's easy to accidentally insert it inside the `{ isOpen, ... }: Props` destructuring block instead of after it. This causes a Babel parse error (`Unexpected token`). Always verify: `useModalOpen(isOpen)` must be a standalone statement in the function body, indented at the same level as `useState` calls. If using sed/python to mass-edit, match on `}: SomeProps) {` and insert AFTER that line — never match on `  isOpen,` and insert after it.

## Document Generation (vacation)

`POST /api/vacation/generate-application` — generates DOCX via docxtemplater. Body: `{ year, templateId }`. The template is fetched from MinIO (`document_templates` table, purpose `vacation_template`).

`POST /api/vacation/generate-transfer-application` — generates transfer DOCX. Body: `{ templateId, transferIds: number[] }`. Purpose: `vacation_transfer_template`. Only fetches transfers with `approved` status. See `templates/vacation-transfer-template.txt` for template text and placeholders.

### Template placeholders

Root level: `{full_name}`, `{short_name}`, `{last_name}`, `{first_name}`, `{middle_name}`, `{position}`, `{department}`, `{year}`, `{date_today}`, `{vacations_count}`, `{total_days}`

Loop (`{#vacations}` ... `{/vacations}`): `{num}`, `{type}`, `{start}`, `{end}`, `{days}`, `{status}`

Dates are formatted as `ДД.ММ.ГГГГ` (Russian locale). `full_name` is "Фамилия Имя Отчество", `short_name` is "Фамилия И.О."

### Generating templates on this machine

Use system Python for python-docx: `/Library/Developer/CommandLineTools/usr/bin/python3` (3.9.6). Homebrew Python 3.14 has broken libexpat linkage. Install with `/Library/Developer/CommandLineTools/usr/bin/python3 -m pip install python-docx`.

## Adding a New Feature Module

Full-stack feature addition checklist (e.g., "Assistant" module):

### Frontend

1. **Types** — `modules/<name>/types/index.ts` — TypeScript interfaces
2. **API service** — `modules/<name>/services/<name>Api.ts` — fetch calls using `getAuthHeaders()` / `getAuthHeadersWithContentType()` from `@/shared/lib/authHeaders`, `API_BASE_URL` from `@/shared/lib/api`
3. **Page component** — `modules/<name>/pages/<Name>.tsx` — named export, standard pattern with `useState`, `useEffect`
4. **App.tsx** — import page, add `<Route path="<name>" element={<BlockOnboardingRoute><<Name> /></BlockOnboardingRoute>} />` inside the protected layout routes
5. **Sidebar.tsx** — add nav item to ALL FIVE role navigation functions: `getOnboardingNavigation`, `getEmployeeNavigation`, `getManagerNavigation`, `getHRNavigation`, `getAdminNavigation`. Import icon from lucide-react. Section `'Основное'` for primary features.

### Backend

6. **Route file** — `backend/src/routes/<name>.js` — ES modules, `import { Router } from 'express'`, use `authenticateToken` middleware. Follow try/catch pattern (check existing file — some files use `asyncHandler`, some use manual try/catch). Add JSDoc `@swagger` annotations before each route.
7. **Register in server.js** — import route file, add `app.use('/api/<name>', <name>Routes)`
8. **Migration** — add `CREATE TABLE IF NOT EXISTS` block in `backend/src/db/migrate.js` before `console.log('✅ Tables created')`. Run with `cd backend && npm run migrate`.

## Document Generation Pitfall — Status Filtering

When building document generation queries (e.g., `generate-application`), ALWAYS filter by request status. The SQL must include `AND rs.code = 'approved'` (or the appropriate status). Without this filter, cancelled/rejected requests appear in generated documents. This was a real bug in `POST /vacation/generate-application` where the query only filtered by `user_id` and `year` but pulled ALL statuses including cancelled ones.

## System Settings (Admin Panel Config)

Settings are stored in `system_settings` table (key/value/description). The admin panel's SettingsTab auto-renders all rows — boolean values (`'true'`/`'false'`) render as Switch toggles, everything else as Input fields.

**To add new admin-configurable settings:**
1. Add entries to the seed array in `migrate.js` (~line 1343): `{ key: 'my_setting', value: 'default', desc: 'Description shown in UI' }`
2. Use `ON CONFLICT (key) DO NOTHING` — safe to re-run migrate
3. Run `cd backend && npm run migrate`
4. Settings appear automatically in admin panel → Settings tab → "Системные настройки" card

**To read settings from backend routes:** query `system_settings` by key, not env vars. Example from `assistant.js`:
```javascript
const result = await query(`SELECT key, value FROM system_settings WHERE key IN ('key1', 'key2')`)
const map = Object.fromEntries(result.rows.map(r => [r.key, r.value]))
```

This pattern avoids restarting the server when settings change.

## Admin Panel — Adding a New Tab

The admin panel (`AdminPanel.tsx`) has a tab system with grouped navigation. To add a new settings tab:

1. **TabId type** — add the new id to the union type (line ~29): `type TabId = '...' | 'newtab'`
2. **TAB_GROUPS** — add entry to the appropriate group object (line ~45): `{ id: 'newtab', name: 'Name', icon: IconName, description: 'Desc', color: 'from-X-500 to-Y-600' }`
3. **Import icon** — add to the lucide-react import block (line ~17-26)
4. **Render condition** — add `{activeTab === 'newtab' && <NewTabComponent />}` (line ~330-341)
5. **Component** — create as a separate function component in the same file. Pattern: fetches `admin/settings` filtered by key prefix, renders Card with inputs, saves via `PUT admin/settings`. For sensitive fields (API keys), use `<Input type="password">`. For long text (prompts), use `<textarea>`.

**Pattern for feature-specific settings tabs:** Fetch ALL settings from `admin/settings`, filter client-side by key prefix (e.g., `s.key.startsWith('assistant_')`). This avoids needing a new backend endpoint. The save reuses the existing `PUT /admin/settings` with filtered entries.

**Pitfall — JSX structure when editing AdminPanel.tsx:** The file is ~3400 lines. When patching Card sections, be precise with the opening/closing tags. A common mistake is accidentally duplicating or dropping a `<Card>` boundary, which breaks the JSX tree. Always verify with `npx tsc --noEmit --pretty false | grep AdminPanel` after edits.

## Assistant Module

AI chat assistant at `/assistant`, implemented as:
- Frontend: `modules/assistant/pages/Assistant.tsx` — chat UI with persistent sessions, streaming, tool-call display
- API: `modules/assistant/services/assistantApi.ts` — SSE streaming client with `onText`/`onToolCall` callbacks
- Backend: `backend/src/routes/assistant.js` — SSE proxy to OpenAI-compatible API
- Types: `modules/assistant/types/index.ts` — `ChatMessage` (with `streaming`, `toolCalls`), `ChatSession`

### Database Tables

- `assistant_sessions` — id (TEXT PK), user_id, title, created_at
- `assistant_messages` — id (SERIAL PK), session_id (FK → assistant_sessions ON DELETE CASCADE), user_id, role, content, created_at

### Backend Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/assistant/sessions` | List user's sessions (no messages, with message_count) |
| GET | `/api/assistant/sessions/:id` | Session + messages (ordered by created_at ASC) |
| DELETE | `/api/assistant/sessions/:id` | Delete session + cascade messages |
| POST | `/api/assistant/chat` | Send message with `sessionId`, creates session on first message. **SSE streaming** if upstream returns `text/event-stream`, otherwise JSON fallback |
| GET | `/api/assistant/history` | Legacy: messages without session_id |
| DELETE | `/api/assistant/history` | Legacy: delete messages without session_id |

### Streaming Architecture

1. Frontend calls `POST /chat` with `{ message, sessionId, history }`
2. Backend sends `stream: true` to the AI API
3. If upstream responds with SSE (`text/event-stream`): backend proxies chunks directly via `res.write()`, accumulating full text for DB save, then `res.end()`
4. If upstream responds with JSON: returns `{ response: text }` (fallback)
5. Frontend `readStream()` parses SSE deltas: `delta.content` → text, `delta.tool_calls[].function.name` → tool labels

### Assistant Token Generation (User-scoped API access)

The assistant can act on behalf of the user by receiving a **short-lived JWT** (5 min) in its system prompt. This lets Hermes call Worker Cabinet API endpoints (vacation requests, documents, etc.) with the user's permissions — without exposing the real session token.

**Pattern (in `assistant.js` `POST /chat`):**
1. Backend generates a scoped JWT: `jwt.sign({ id: userId, scope: 'assistant' }, JWT_SECRET, { expiresIn: '5m' })`
2. System prompt includes: user info + API base URL + `Bearer <token>` + instructions ("never show token to user", "confirm destructive actions")
3. The token is validated by the same `authenticateToken` middleware (it checks `decoded.id` → looks up user in DB)
4. Optional: add `scope: 'assistant'` check in middleware to restrict which endpoints the assistant token can access

**Why not pass the real JWT:** The real token has a 7-day lifetime and grants full session access. If leaked via logs or LLM output, the damage window is huge. The 5-minute token auto-expires and is regenerated on every chat message.

**Security considerations:**
- Token lives only 5 minutes — even if leaked in logs, it expires fast
- `scope: 'assistant'` field allows backend to restrict access per-endpoint
- `userId` is embedded in the JWT payload — cannot be tampered with without JWT_SECRET
- Hermes is instructed to never display the token to the user
- Each `/chat` request generates a fresh token, so the assistant always has a valid one

**Pitfall — token in system prompt vs user messages:** The token goes in the `system` role message, NOT in `user` messages. This prevents it from appearing in chat history stored in the DB. The system prompt is reconstructed fresh on every `/chat` call.

### Frontend Session Lifecycle

- On mount: `GET /sessions` → sidebar with session titles (no messages)
- On click session: **always** `GET /sessions/:id` from API (no client-side cache — messages are always fresh from DB)
- "Новый чат" button creates local session immediately (id generated client-side)
- First `POST /chat` with new sessionId auto-creates session + saves first message in DB
- During active streaming, `streamingIdRef` prevents re-fetching the current session
- Tool calls rendered as labeled pills (Wrench icon + Russian label from `TOOL_LABELS` map)
- Streaming indicator: while `msg.streaming === true`, a blinking vertical cursor (`animate-pulse` span) appears after the text content. Before first text arrives, a spinning `Loader2` is shown. The cursor disappears when `streaming` flips to `false`

Settings (in `system_settings`, all prefixed `assistant_`):
- `assistant_api_url` — OpenAI-compatible chat completions endpoint
- `assistant_api_key` — API key (rendered as password input)
- `assistant_model` — model name (default: `gpt-4o-mini`)
- `assistant_system_prompt` — system role text
- `assistant_hermes_enabled` — `'true'`/`'false'` — toggle built-in Hermes Agent (Docker)
- `assistant_hermes_port` — port for Hermes API Server (default: `8642`)
- `assistant_hermes_api_key` — API key for Hermes API Server
- `assistant_hermes_provider` — LLM provider for Hermes (`zai`, `openrouter`, `anthropic`, etc.)
- `assistant_hermes_model` — model name for Hermes (default: `glm-5.1`)
- `assistant_hermes_provider_api_key` — API key for the LLM provider
- `assistant_hermes_provider_base_url` — custom base URL (optional)
- `assistant_hermes_toolsets` — comma-separated enabled toolsets
- `assistant_hermes_approvals` — command approval mode (`manual`/`smart`/`off`)
- `assistant_hermes_max_turns` — max agent iterations (default: `150`)
- `assistant_temperature` — float 0.0–2.0, controls creativity (default: `0.7`)
- `assistant_max_tokens` — int, max response length (default: `2048`)
- `assistant_history_limit` — int, how many recent messages to include in context (default: `20`)

Backend `getAssistantConfig()` reads ALL `assistant_%` keys (`WHERE key LIKE 'assistant_%'`) and parses numeric values with fallback defaults. The `POST /chat` endpoint uses `config.temperature`, `config.maxTokens`, `config.historyLimit` in the AI API request body — no hardcoded values.

Admin panel `AssistantSettingsTab` has 4 structured Card sections:
1. **Hermes Agent** — toggle, port, API key, health check button
2. **Параметры модели** — model name, temperature slider (0–2 with visual labels), max tokens, history limit
3. **API подключение** — URL and key (shows auto-fill hint when Hermes enabled)
4. **Системный промпт** — textarea for the system prompt

### Hermes Agent as AI Backend (Docker Sidecar)

The assistant can use a locally-running Hermes Agent container instead of an external OpenAI API. Hermes provides an OpenAI-compatible `/v1/chat/completions` endpoint.

The `hermes-agent` service is defined in the **main `docker-compose.yml`** alongside postgres, minio, etc. It starts automatically with `npm run deploy:dev` (or `docker compose up -d hermes-agent`).

**Admin panel toggle:** Settings → Ассистент → "Hermes Agent (встроенный)" toggle. When enabled, it auto-fills `assistant_api_url` and `assistant_api_key` from the Hermes port/key settings. A "Проверить" button pings `http://127.0.0.1:{port}/health` to show running/stopped status.

**Manual setup:**
1. `docker compose up -d hermes-agent`
2. Verify: `curl http://localhost:8642/health` → `{"status":"ok"}`
3. In admin panel: enable Hermes toggle, set port and API key, save
4. Or manually update `system_settings`: `assistant_api_url` = `http://127.0.0.1:8642/v1/chat/completions`, `assistant_api_key` = the shared secret, `assistant_model` = `hermes-agent`

**Key env vars for hermes-agent container:**
- `API_SERVER_ENABLED=true` — enables OpenAI-compatible endpoint
- `API_SERVER_KEY` — shared secret (auth for `/v1/chat/completions`)
- `API_SERVER_PORT=8642`
- Volume: `./docker/hermes/data:/opt/data` — project-local config (providers, .env with LLM API keys, excluded from git)

**Pitfall — JWT token expiration in API calls**: When making direct API calls to Worker Cabinet endpoints (vacation requests, balance checks, etc.), JWT tokens have a 5-minute lifetime by design. If you get "Invalid or expired token" errors:
1. First verify the API endpoint is reachable with `curl -I http://172.20.10.2:5000/api`
2. Check if the issue is URL path - endpoints require `/api` prefix: `http://172.20.10.2:5000/api/vacation/requests`
3. For new tokens: login through the web interface at `http://localhost:3000` to get a fresh JWT
4. For programmatic access, implement token refresh logic or use the 5-minute token pattern described in the Assistant section

**Debugging API connectivity**:
```bash
# Check if server responds
curl -I http://172.20.10.2:5000/api

# Check if auth works (should return "Access token required")
curl -X GET http://172.20.10.2:5000/api/vacation/requests

# Check if token is valid
curl -X GET http://172.20.10.2:5000/api/vacation/requests \
  -H "Authorization: Bearer <YOUR_TOKEN>"
```

**Common API error patterns**:
- "Not Found" = missing `/api` prefix in URL or incorrect endpoint path
- "Access token required" = no Authorization header provided
- "Invalid or expired token" = JWT expired (5-minute lifetime) or malformed
- Connection refused = backend server not running (check `docker ps` for healthy status)

Pitfall — Node.js `localhost` resolves to IPv6:** Node.js `fetch("http://localhost:8642/...")` may resolve `localhost` to `::1` (IPv6). Docker container port-mapping typically only binds IPv4 (`0.0.0.0`). The request silently fails (connection refused) with no helpful error. **Always use `127.0.0.1` instead of `localhost`** in `assistant_api_url` and any backend-to-Docker URLs.

**Pitfall — Gateway uses profile config, not root config:** Hermes Gateway does NOT read `/opt/data/config.yaml`. It creates a profile at `/opt/data/profiles/<id>/` (e.g., `hghg`) with its own `config.yaml` and `.env`. Editing the root config has no effect on the gateway. To configure: `docker exec worker-cabinet-hermes hermes config set model.default <model>` and create `.env` in the profile dir via `docker cp` (not `docker exec echo` — secret redaction corrupts output). See `references/hermes-sidecar-setup.md` for the full profile configuration flow.

**Pitfall — `env_file` required in docker-compose:** The `docker/hermes/data/.env` file mounted via volume is NOT automatically sourced by the container. Add `env_file:` to the hermes-agent service definition to pass provider API keys (`GLM_API_KEY`, `GLM_BASE_URL`, etc.) as environment variables. Also add `HERMES_HOME=/opt/data` to the `environment` block. The volume mount is `./docker/hermes/data:/opt/data` (project-local, NOT `~/.hermes`).

**Pitfall — Container-to-host API URL must use `host.docker.internal`:** When the assistant (Hermes in Docker) needs to call Worker Cabinet API (on host), `http://localhost:5000/api` and `http://127.0.0.1:5000/api` resolve INSIDE the container, not to the host. Use `http://host.docker.internal:5000/api` instead. This is set as `apiBaseUrl` in `assistant.js` (`ASSISTANT_API_BASE_URL` env var, defaults to `http://host.docker.internal:5000/api`). If Hermes reports "Invalid or expired token" when calling the API, the URL is likely wrong (pointing inside container) rather than the token being bad. Verify from inside the container: `docker exec worker-cabinet-hermes python3 -c "import urllib.request; print(urllib.request.urlopen('http://host.docker.internal:5000/api/settings/public').read()[:100])"`.

**Pitfall — Profile directory wiped on container recreation:** `docker compose up -d hermes-agent` may RECREATE the container (if config changed). Recreation can wipe the profile directory (`/opt/data/profiles/hghg/`), losing `config.yaml` and `.env`. Hermes then falls back to root `/opt/data/config.yaml`. After any `docker compose up` that recreates the container, re-verify: `docker exec worker-cabinet-hermes hermes config show | grep 'Config:'`. If it shows root config, re-run `hermes config set model.default` and `hermes config set model.provider`, and re-copy `.env` to the profile via `docker cp`. Alternatively, write config directly to root `/opt/data/config.yaml` (on the volume mount at `~/.hermes/config.yaml` on host) which persists across recreations.

**Pitfall — Z.AI `base_url` must be explicit:** The Z.AI provider uses a non-standard base URL (`https://api.z.ai/api/coding/paas/v4` instead of the default). Hermes auto-detects `GLM_API_KEY` from env but does NOT know the custom base URL. Set it explicitly: `docker exec worker-cabinet-hermes hermes config set providers.zai.base_url 'https://api.z.ai/api/coding/paas/v4'`. Without this, Hermes sends requests to the wrong endpoint or the model name resolves as empty.

**Pitfall — Container recreation may switch config location:** `docker compose up -d` (which recreates the container) can cause Hermes to switch from using a profile config back to the root config at `/opt/data/config.yaml`. After recreation, always verify which config is active: `docker exec worker-cabinet-hermes hermes config show | grep 'Config:'`. If it points to the root config, `hermes config set` writes there. The root config is on the volume and persists, but profile configs may be lost on recreation.

**Pitfall — deploy.js service list:** The `deploy/deploy.js` `startServices()` function has a hardcoded list of services to start. When adding a new service to `docker-compose.yml`, add it to the list on the `docker-compose up -d ...` line in `startServices()`.

### SearXNG Search Backend (Docker Sidecar)

SearXNG provides web search for Hermes Agent. It runs as a Docker container and aggregates results from multiple search engines (Google, DuckDuckGo, Wikipedia, and optionally Yandex).

**Why SearXNG instead of direct Yandex:** Hermes Agent has no built-in Yandex search provider. Available backends are: `searxng`, `ddgs` (DuckDuckGo), `tavily`, `brave-free`, `exa`, `firecrawl`, `parallel`, `xai`. SearXNG is the only one that can proxy Yandex results.

**Service definition** is in the main `docker-compose.yml`:
- Container: `worker-cabinet-searxng`, image: `searxng/searxng:latest`
- Host port: **8888** (not 8080 — OnlyOffice already uses 8080)
- Config mounted read-only: `./docker/searxng/settings.yml:/etc/searxng/settings.yml:ro`
- Health check: `wget --spider -q http://localhost:8080/healthz`
- `hermes-agent` has `depends_on: searxng: condition: service_healthy` and `SEARXNG_URL=http://searxng:8080` (container-to-container uses internal port 8080)
- Hermes config gets `web: { search_backend: "searxng" }` and `.env` gets `SEARXNG_URL`

**Settings (system_settings keys):**
- `assistant_search_backend` — backend name (`searxng`, `ddgs`, `tavily`, `brave-free`), default `searxng`
- `assistant_searxng_url` — URL for SearXNG instance, default `http://localhost:8888` (host-side URL for admin panel checks)

**Frontend:** `AssistantSettingsTab` has a "Поиск" section with select dropdown for backend and conditional URL/API key input.

**Pitfall — Yandex `language: ru-RU` not supported:** The SearXNG Yandex engine does not accept a `language` parameter in `settings.yml`. Setting `language: ru-RU` causes `ValueError: engine 'yandex' / language: 'ru-RU' not supported` and the container crashes in a restart loop. Use `default_lang: "ru"` at the `search:` level instead.

**Pitfall — Yandex `ambiguous shortcut: ya`:** Yandex is already included in SearXNG's default engines with shortcut `ya`. If you add a custom `- name: yandex` entry with `engine: yandex`, it conflicts. Fix: just set `- name: yandex` with `disabled: false` (no `engine:` or `shortcut:` override) to enable the built-in one.

**Pitfall — Yandex "ошибка разбора" (parse error):** Even when enabled, Yandex frequently returns parse errors in SearXNG because Yandex aggressively blocks scraping. This is a known SearXNG issue. Google + DuckDuckGo results are reliable fallbacks for Russian-language queries. Yandex may work intermittently.

**Pitfall — Port 8080 conflict:** OnlyOffice Document Server uses port 8080. SearXNG must use a different host port (8888). The internal container port stays 8080. In docker-compose: `ports: ["127.0.0.1:8888:8080"]`.

**Pitfall — searxng URL differs between host and Docker:** Hermes Agent container uses `http://searxng:8080` (Docker network DNS). The admin panel / browser uses `http://localhost:8888` (host port mapping). The `SEARXNG_URL` env var for the Hermes container should be `http://searxng:8080`, NOT `http://localhost:8888`.

**Verification:**
```bash
docker ps --filter name=searxng
curl -s "http://localhost:8888/search?q=test&format=json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('results',[])), 'results')"
```

### Hermes Agent Configuration from Admin Panel

The admin panel can configure the Hermes Agent itself (not just the API connection) — writing `docker/hermes/data/config.yaml` and `docker/hermes/data/.env` on disk (project-local), then restarting the Docker container. This lets admins change the LLM provider, model, API key, toolsets, and agent behavior without SSH/CLI access.

**Backend endpoint:** `POST /api/admin/assistant/hermes-config` (admin-only, defined in `backend/src/routes/admin.js`).

How it works:
1. Reads all `assistant_hermes_*` keys from `system_settings`
2. Maps provider name → env var name (e.g., `zai` → `GLM_API_KEY`, `openrouter` → `OPENROUTER_API_KEY`)
3. Merges new config into existing `docker/hermes/data/config.yaml` (model, provider, toolsets, agent.max_turns, approvals.mode, terminal, compression, security)
4. Updates `docker/hermes/data/.env` with provider API key and base URL
5. Runs `docker restart worker-cabinet-hermes`
6. Logs to audit trail

**Hermes-specific system_settings keys (prefixed `assistant_hermes_`):**
- `assistant_hermes_provider` — LLM provider (`zai`, `openrouter`, `anthropic`, `openai`, `deepseek`, `xai`, `google`)
- `assistant_hermes_model` — model name (e.g., `glm-5.1`)
- `assistant_hermes_provider_api_key` — API key for the LLM provider
- `assistant_hermes_provider_base_url` — optional custom base URL
- `assistant_hermes_toolsets` — comma-separated toolset list (`web,terminal,file,browser`, etc.)
- `assistant_hermes_approvals` — command approval mode (`manual`, `smart`, `off`)
- `assistant_hermes_max_turns` — max agent iterations (default `150`)

**Frontend:** `AssistantSettingsTab` in `AdminPanel.tsx` — when Hermes toggle is enabled, shows provider select, model input, API key, base URL, toolset toggle buttons, approval mode select, max turns, and "Применить и перезапустить" button that calls the backend endpoint.

**Pitfall — `js-yaml` is available in backend:** The `js-yaml` package is already installed as a transitive dependency. Use `import('js-yaml')` dynamically in the route handler.

**Pitfall — provider env var mapping:** Each provider maps to a specific env var name. The mapping is hardcoded in the backend. When adding a new provider, add both the `PROVIDERS` array in the frontend `AssistantSettingsTab` and the `providerEnvMap` in the backend `POST /assistant/hermes-config` handler.

**Pitfall — "настройка Hermes Agent" means the agent's own config, NOT the API connection:** When the user says "настройка Hermes Agent", they mean configuring the agent itself — provider, model, API key, toolsets, approvals, max_turns — the values that go into `config.yaml` and `.env`. They do NOT mean the generic `assistant_api_url`/`assistant_api_key`/`assistant_temperature`/`assistant_max_tokens` connection parameters. These are two different layers: (1) how Worker Cabinet talks to Hermes (the API connection), and (2) how Hermes is configured internally (provider, model, tools). The user will explicitly say "настройка Hermes Agent" for layer 2. If you only add/modify layer 1 settings, the user will repeat the request until you address layer 2.

See `references/hermes-sidecar-setup.md` for the full docker-compose config and verification steps.
See `references/searxng-setup.md` for SearXNG search backend setup, URL reference, and troubleshooting.
See `references/resource-requirements.md` for RAM, CPU, and disk estimates by deployment scale.
See `references/dark-theme-audit.md` for dark theme replacement patterns.

## CORS Configuration (Dynamic Origin)

The backend CORS was changed from a static origin array to a dynamic callback function. This allows LAN access without hardcoding IPs:

```javascript
app.use(cors({
  origin: (origin, callback) => {
    const allowed = ['http://localhost:3000', ...].filter(Boolean)
    if (!origin || allowed.includes(origin) || /^http:\/\/172\.\d+\.\d+\.\d+:3000$/.test(origin)) {
      callback(null, true)
    } else {
      callback(null, true)  // tighten for production
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
```

This pattern supports any device on the `172.x.x.x` subnet. Both branches currently allow access — tighten the `else` branch (`callback(new Error('Not allowed'))`) for production.

## LAN / External Access

By default, frontend only listens on `localhost` (no external access). To access from another computer on the local network:

1. **Vite host binding** — `vite.config.ts` must have `host: '0.0.0.0'` in the `server` block. Without it, Vite only listens on `[::1]` (localhost).

2. **CORS must allow the LAN origin** — `backend/src/server.js` CORS config was changed from a static array to a dynamic callback that accepts any `172.x.x.x:3000` origin (and all other origins as well). When exposing to LAN, edit the callback regex/pattern to match your subnet.

3. **Docker services bound to `127.0.0.1`** are NOT accessible from other machines (Hermes on 8642, SearXNG on 8888). Remove the `127.0.0.1:` prefix from port mappings in docker-compose if external access is needed.

4. **Find your LAN IP**: `ipconfig getifaddr en0` (macOS WiFi). Access frontend at `http://<LAN_IP>:3000`.

**Pitfall — CORS preflight fails silently**: If CORS doesn't include the requesting origin, the browser blocks ALL API calls with no helpful error. The preflight OPTIONS request returns without `Access-Control-Allow-Origin`. Fix: use dynamic origin callback instead of static array. The current implementation uses a callback function that checks against a static allowlist plus a regex for `172.x.x.x:3000` origins (LAN subnet). All origins are accepted (both branches call `callback(null, true)`) — tighten this for production.

## Resource Requirements

See `references/resource-requirements.md` for RAM, CPU, and disk estimates by scale (dev / 50 users / 200 users).

## Key Paths

- API base: `http://localhost:5000/api`
- Swagger UI: `http://localhost:5000/api-docs` (dev only)
- Swagger JSON: `http://localhost:5000/api-docs.json`
- Frontend: `http://localhost:3000`
- MinIO Console: `http://localhost:9001` (minioadmin / minioadmin123)

## Environment

```bash
cp backend/.env.example backend/.env
# Configure: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, JWT_SECRET, S3_*, TELEGRAM_BOT_TOKEN
```
