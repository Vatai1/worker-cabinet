# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Worker Cabinet is a full-stack HR management system for managing vacations, employees, departments, projects, and documents.

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS (root directory)
- **Backend**: Node.js + Express + PostgreSQL (`backend/`)
- **State management**: Zustand (auth token persisted to cookies)
- **File storage**: MinIO (S3-compatible)

## Commands

### Frontend (root)
```bash
npm run dev              # Docker infra (deploy/docker-compose.dev-no-kc.yml: Postgres, MinIO…), optional seed prompt, then vite :3000 + backend :5000 + notification worker + mini-agent
npm run build            # Production build (tsc + vite build)
npm run lint             # ESLint on .ts/.tsx files
npm run typecheck        # TypeScript check (no emit)
npm run test:ci          # Playwright e2e (e2e/), uses vite on :3000 (reuses a running one) and the backend on :5000
npx playwright test e2e/vacation/vacation-employee.spec.ts   # Single e2e spec
```

### Backend
```bash
cd backend
npm run dev              # Start with nodemon (hot reload)
npm run migrate          # Run database migrations
npm run seed             # Seed database with test data
npm run test:all         # Run all tests (with concurrency=1)
npm run test:auth        # Run auth tests
npm run test:vacation-history  # Run vacation history tests
node --test src/tests/auth.test.js                                    # Single test file
node --test --test-name-pattern="JWT Token" src/tests/auth.test.js    # Filter by name
```

Backend tests hit the real API at `http://localhost:5000/api` (`src/tests/helpers.js`) and the dev database, so the backend must be running. nodemon restarts on any change under `src/` (including test files) — wait for `GET /api/health` before running. Run several files with `--test-concurrency=1`: they share seeded users and data. Login tokens are cached in `$TMPDIR/worker-cabinet-test-tokens.json` (TTL 5 min); the auth rate limiter (`middleware/rateLimiter.js`) is 10 logins / 15 min outside development, so restart the server or clear that file if logins start failing with 429. Tests run against live dev data and must restore what they touch (e.g. `vacation-full.test.js` and the e2e specs temporarily clear the `purpose` of existing vacation templates, because a purpose is unique per organization).

**Always run after frontend changes:**
```bash
npm run lint && npm run typecheck
```

## Architecture

### Frontend Structure
```
/
├── App.tsx              # Router + ProtectedRoute + role-based redirect
├── core/                # Domain fundamentals
│   ├── admin/           # Admin panel, dictionaries, module settings, analytics
│   ├── auth/            # Login, Profile, authStore
│   ├── employees/       # Employees list, EmployeeProfile
│   └── settings/        # Settings page (user-specific)
├── modules/             # Feature modules (each with pages/components/services/store/types)
│   ├── assistant/       # AI assistant
│   ├── calendar/        # Calendar page
│   ├── departments/     # Departments list, DepartmentDetail
│   ├── documents/       # Document management
│   ├── hierarchy/       # HR org hierarchy (React Flow)
│   ├── notifications/   # Notifications page
│   ├── onboarding/      # HR onboarding, onboarding for new employees
│   ├── projects/        # Projects, ProjectDetail, Roadmap, Documents
│   ├── requests/        # Vacation/leave requests, Manager/Leader dashboards
│   ├── skills/          # Employee skills
│   ├── surveys/         # Surveys, HR surveys, analytics
│   ├── timesheet/       # Manager/HR timesheet
│   └── vacation/        # Vacation management, history, transfers
├── shared/              # Cross-cutting utilities
│   ├── components/      # Layout (Header, Sidebar), UI primitives, ErrorBoundary, ConfirmDialog
│   ├── data/            # requestUtils.ts
│   ├── hooks/           # useModalOpen
│   ├── lib/             # utils, api, authHeaders, cookies, avatar, documentUtils, timesheetCodes
│   ├── pages/           # Dashboard, HRPanel
│   ├── store/           # modulesStore, uiStore, siteSettingsStore, departmentsStore
│   └── types/           # Global TypeScript interfaces
└── docker/              # Docker configs (Hermes agent, DB init scripts)
```

### Backend Structure
```
backend/src/
├── server.js            # Express app entry point, registers all routes
├── routes/              # Route handlers (auth, vacation, users, projects, etc.) — 15 groups
├── middleware/          # auth.js (JWT), upload.js (multer), errors.js, rateLimiter.js, csrf.js, validation.js
├── services/            # Business logic (ewsService.js, surveyService.js)
├── config/              # database.js (pg Pool), s3.js (MinIO), notifications.js, keycloak.js
├── worker.js            # notification delivery worker (separate process: `npm run worker`)
├── cron/                # timesheetCron.js (daily timesheet job)
├── db/                  # migrate.js, seed.js, create-indexes.js, default-vacation-templates.js
└── tests/               # Node.js built-in test runner
```

### Roles and Access
User roles: `employee`, `manager`, `hr`, `admin`, `onboarding`

- All roles (including `manager`, `hr`, `admin`, `superadmin`) -> redirected to `/dashboard` on login and on `/`
- `onboarding` -> `/dashboard` bounces to `/onboarding` (`BlockOnboardingRoute`); can only access `/onboarding`, `/employees`, `/departments`; role auto-upgrades to `employee` when all onboarding documents are acknowledged
- Only the department manager can approve/reject vacation requests
- Route-level access uses `authenticateToken` + `requirePermission('<code>')` (`backend/src/lib/permissions.js`) — the admin «Роли и доступы» matrix is enforced. The catalog with per-role defaults lives in `backend/src/lib/permissionCatalog.js`; `migratePermissionsMatrix` upserts it (new codes get their defaults) and resets system roles to defaults once per `MATRIX_VERSION` (`system_settings.permissions_matrix_version`). `admin`/`superadmin` always have every permission. `authorizeGlobalRoles('superadmin')` stays for superadmin-only system routes. Data scope (e.g. manager sees only own department) stays in code — permissions gate capabilities, not scope
- Frontend: `/api/auth/me` returns `permissions`; use `useCan(code)` / `can(code)` from `@/shared/lib/permissions` for routes, sidebar items (`permission` field), HR/admin tabs and feature UI; permissions refetch on `org-changed`
- Frontend route guards: `HRRoute` (hr/admin only), `OnboardingRoute` (onboarding only), `BlockOnboardingRoute` (blocks onboarding users from general routes)

### API Base URL
Frontend reads `VITE_API_BASE_URL` env var, defaults to `http://localhost:5000/api`.
Import as: `import { API_BASE_URL } from '@/shared/lib/api'`

## Code Patterns

### Frontend Auth Headers
```typescript
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'

// GET
const res = await fetch(url, { headers: getAuthHeaders() })

// POST/PUT/DELETE
const res = await fetch(url, {
  method: 'POST',
  headers: getAuthHeadersWithContentType(),
  body: JSON.stringify(data),
})
```

### Frontend Error Handling
```typescript
import { getErrorMessage } from '@/shared/lib/utils'

try {
  const res = await fetch(url, options)
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || 'Ошибка')
  }
} catch (err: unknown) {
  setError(getErrorMessage(err))
}
```

### Backend Route Handler Pattern
```javascript
import { asyncHandler, ValidationError, ForbiddenError } from '../middleware/errors.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { query, getClient } from '../config/database.js'

router.post('/:id/resource', authenticateToken, asyncHandler(async (req, res) => {
  if (!field?.trim()) throw new ValidationError('Поле обязательно')
  const check = await query('SELECT 1 FROM table WHERE id = $1 AND user_id = $2', [id, req.user.id])
  if (check.rows.length === 0) throw new ForbiddenError()
  const result = await query('INSERT INTO table (field) VALUES ($1) RETURNING *', [field])
  res.status(201).json(result.rows[0])
}))
```

### Backend Transaction Pattern
```javascript
import { getClient } from '../config/database.js'

const client = await getClient()
try {
  await client.query('BEGIN')
  const result = await client.query(`INSERT INTO ... RETURNING *`, [...])
  await client.query('COMMIT')
  res.status(201).json(result.rows[0])
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  client.release()
}
```

## Sidebar Navigation Rules

**NEVER remove existing nav items from the sidebar** (`shared/components/layout/Sidebar.tsx`).

Each role has its own navigation function (`getEmployeeNavigation`, `getManagerNavigation`, `getHRNavigation`). When adding items to one role, verify all other roles also have the equivalent items where appropriate. The current expected items per role:

- **employee**: Дашборд, Отпуск, Опросы, Работники, Отделы, Проекты, Профиль, Заявления, Документы, Уведомления
- **manager**: Дашборд, Профиль, Работники, Отделы, Проекты, Отпуск, Табель, Опросы, Документы, Уведомления
- **hr/admin**: Дашборд, Профиль, Иерархия, HR (Опросы, Онбординг, Отпуск, Справочники, Табель), Мои опросы, Отпуск, Работники, Отделы, Проекты, Документы, Уведомления
- **onboarding**: Онбординг, Работники, Отделы

Every role has "Отделы" → `/departments` (under "Работа"; "Основное" for onboarding) — "Отпуск" and "Работники" live as flat items directly under the "Работа" section (previously nested under an "Отдел" accordion for employee/manager). Department management for HR/admin still lives under Справочники → Отделы (a tab, not a top-level nav item). "Основное" and "Работа" section groups are expanded by default; all section expand/collapse state persists in the `sidebar_expanded_sections` cookie.

## Key Subsystems

### Onboarding (`/hr/onboarding`, `/onboarding`)
HR creates a user with role `onboarding` and assigns document templates in one request (`POST /api/onboarding`). The employee acknowledges each document (`POST /api/onboarding/me/documents/:id/acknowledge`); when all are done, a transaction atomically sets `role = 'employee'`, marks completion, and inserts HR notifications. Backend route order in `onboarding.js` matters: `/templates`, `/me`, `/me/documents/:id/acknowledge` must precede `/:id` to avoid Express matching literal paths as params.

### File Uploads
`backend/src/middleware/upload.js` exports multer instances: `uploadDocument` (user docs), `uploadTemplate` (HR document templates, PDF/DOCX <= 20 MB). MinIO helpers in `backend/src/config/s3.js`: `uploadToS3`, `getS3FileUrl`, `deleteFromS3`. Key format for onboarding templates: `onboarding-templates/{templateId}/{timestamp}.{ext}`.

### Timesheet / Табель (`/leader/timesheet`, `/hr/timesheet`)
Accessible to `manager`, `hr`, `admin`. Tables: `timesheets` (one per department/month) and `timesheet_entries` (one per employee/day). Statuses: `draft` -> `submitted` -> `approved`; only `hr`/`admin` can approve or revert. Managers can only transition `draft->submitted`.

On creation (`POST /api/timesheet`), entries are auto-filled for the entire month: weekends -> `В`, approved vacations -> `ОТ`, weekdays -> `Я`/8h. Future dates cannot be edited. Approved timesheets are locked.

Bulk update via `PUT /api/timesheet/:id/entries` (upsert by `timesheet_id + employee_id + date`). Export endpoints: `GET /api/timesheet/:id/export/excel` (ExcelJS) and `/export/pdf` (PDFKit, landscape A4).

A user can manage several departments (`departments.manager_id`, no uniqueness). Manager access is scoped to all of them (`getManagerDepartments` checks `departments.manager_id` then `users.department_id`); `GET /api/timesheet/my-departments` feeds the department switcher in `ManagerTimesheet`, and `POST /api/timesheet` without `department_id` returns 400 when there is more than one. HR/admin see all departments.

Frontend: `modules/timesheet/pages/ManagerTimesheet.tsx` for manager, `shared/components/timesheet/TimesheetGrid.tsx` for the editable grid. Attendance codes and colors defined in `@/shared/lib/timesheetCodes`.

### HR Hierarchy (`/my-hierarchy`)
One entry point for everyone: sidebar «Иерархия» → `/my-hierarchy` (read-only view). Users with hr/admin/superadmin role see «Редактировать», which opens the `HRHierarchy` editor for the current org. The former HR-panel tab was removed; `/hr?tab=hierarchy` redirects to `/my-hierarchy`.

React Flow (`@xyflow/react`) canvas. Lazy-loaded via `React.lazy`. Nodes: `department`, `employee`, `text`. All handles are `type="source"` with `ConnectionMode.Loose`. Custom `EditableEdge`: smoothstep rendering by default, switches to polyline when `data.waypoints` array is populated.

### Production Calendar (производственный календарь)
Data lives in `backend/src/db/productionCalendar.js` (per year, source consultant.ru) and is upserted into `calendar_holidays (day, year, description, kind)` by `migrate.js`. `kind`: `holiday` — non-working holiday per ТК РФ ст. 112 (including ones falling on weekends), `transfer` — transferred day off, `shortened` — shortened working day (incl. working Saturdays). Vacation duration subtracts only `holiday` days (ст. 120); transferred days off are part of the vacation. `GET /api/vacation/production-calendar?year=` feeds `YearCalendar` (falls back to hardcoded ст. 112 dates when a year is not loaded). To add a year, append it to `PRODUCTION_CALENDAR`.

### Day-offs (отгулы) and leave adjustments
Optional: module `day_offs` (Модули) turns the whole feature off per org (backend `isModuleEnabledForOrg`), permissions `day_off:take` / `day_off:grant` per role. HR/admin grant or deduct days via `POST /api/vacation/adjustments` (`leave_adjustments`: `kind` `vacation` | `day_off`, signed `days`, mandatory `comment`). `vacation` adds to `vacation_balances.total_days` for `year`; `day_off` is a separate counter: available = granted − approved − on_approval `day_off` requests (`dayOffBalance()` in `vacation.js`). Vacation type `day_off` («Отгул»): counted in working days, ignores the department vacation block and the 14-day notice (frontend opens the create modal in day-off-only mode), never touches the annual balance (guards in create/edit/approve/reject/cancel), cannot be transferred, fills timesheet with `НВ`. Day-offs are not tied to a year. Managers can grant/see adjustments only for subordinates (`adjustmentScopeUserIds`: users of departments they manage + descendants, and users whose `manager_id` is them); hr/admin see the whole org. Managers may grant only `day_off`. UI: HR → Отпуск → «Отгулы» tab and the same `LeaveAdjustmentsPanel` on `/vacation?tab=adjustments` for managers — day-offs only (grant form for several employees, employees table, history — all with filters; `GET /api/vacation/adjustments/all?kind=day_off` returns `scope`, `people`, `employees`, `items`); extra vacation days are granted only in the HR employee modal, HR employee modal → tab «Отпуск» → «Начисление отгулов и дней отпуска» (`LeaveAdjustmentsSection`), `/vacation` → «Отгулы» card for every role (always shown; «Взять отгул» opens `CreateVacationFormModal` preset to `day_off`). Day-off requests go through exactly the same approval as vacations (same `approver_id` resolution and hierarchy settings).

### Travel to the vacation destination (проезд)
Not stored as state — `backend/src/lib/travel.js` derives it from history. Two-year periods run from `users.hire_date`; in the first period the right starts after 6 months of work (ТК ст. 325), in later periods at their start. A period is used when an `approved` request with `has_travel` starts in it (rejected/cancelled ones don't count); an `on_approval` travel request blocks new ones. The only stored value is the HR override `users.travel_available_from` (`PUT /api/vacation/travel/:userId`). `GET /api/vacation/travel/:userId` returns all periods for the HR employee modal (tab «Отпуск»); `GET /vacation/balance/:userId` exposes `travel_available`, `travel_pending`, `travel_next_available_date`, `travel_available_until`. Create/edit/transfer check it server-side via `assertTravelAllowed`. The `vacation_balances.travel_*` columns are legacy and unused.

### Notifications delivery
`notify()` / `notifyBatch()` (`backend/src/config/notifications.js`) only insert into `notification_queue` — pass `db: client` to write inside the business transaction (vacation flows, bug reports, mailings, survey publish already do). An `AFTER INSERT` trigger emits `pg_notify('notification_created')` on commit: every web instance re-sends the unread count over WebSocket (`lib/unreadBroadcast.js`, works with several instances), and the worker (`src/worker.js`, compose service `notification-worker`, same image) wakes up. The worker (`lib/notificationDelivery.js`) claims rows with `FOR UPDATE SKIP LOCKED`: email via SMTP (`MAIL_*`, Яндекс 360 — `smtp.yandex.ru:465` + app password, `MAIL_RATE_PER_MINUTE`), retries with backoff 1/5/30/120/360 min, `failed` after `NOTIFY_MAX_ATTEMPTS` (5); push is a separate `push_status`. Templates in `lib/notificationEmail.js` (links built from `APP_URL`/`FRONTEND_URL`). Admin → Система → «Доставка уведомлений» shows queue/failed/oldest and retries failed. No RabbitMQ.

### Presence + Telemetry
Presence rides on the existing notification WebSocket (`backend/src/config/ws.js`): the client (`useNotificationWs`) sends `{event:'activity'}` at most once a minute on user input; `getPresence()` derives `online` (activity < 5 min) / `away` (tab open, idle) and everything else is `offline` with `users.last_seen_at`. Admin tab «Сейчас на сайте» (`core/admin/components/OnlineUsersTab.tsx`, `GET /api/admin/online`, polls 30 s).

`shared/lib/telemetry.ts` (installed in `main.tsx`) keeps the last 100 user actions in memory: clicks, field changes with values (passwords/hidden/cc fields skipped), navigation, non-GET and failed requests. They are attached to bug reports (`bug_reports.actions`); uncaught JS errors and ErrorBoundary crashes go to `POST /api/bug-reports/client-error` → `error_log` with `module = 'frontend'` and the last 30 actions (same message deduped for 5 min).

Bug reports (`routes/bugReports.js`) take an auto screenshot plus up to 5 user images (`images` field, PNG/JPEG/GIF/WebP ≤ 10 MB, keys in `bug_reports.image_s3_keys`); `GET /api/bug-reports/:id/screenshot` returns presigned URLs for both.

### Keycloak login → organization
`syncUserOrganizations` (`middleware/auth.js`) runs on every KC login. The organization comes from `groups` (slug, `org-` prefix stripped); if there are no groups, from the `company` claim (matched to `organizations.name` ignoring case, quotes and extra spaces, or to the slug; created if missing); otherwise the default org (id 1). Memberships outside the resolved orgs are deactivated. The `login` audit row stores the received claims and `applied.orgSource` (`groups` | `company` | `default`).

### Declensions (родительный падеж) for document templates
Heuristics live in `backend/src/lib/nameGenitive.js`, and the saved value always wins over the suggestion:
- **Full name:** stored in `users.name_genitive` (JSONB). The employee is asked on first application generation (`useNameGenitiveGate` in `shared/components/NameGenitive.tsx`) and can edit it in Settings; HR edits it in the HR employee card via `/api/users/:id/name-genitive`.
- **Department:** stored in `departments.name_genitive`, editable in department settings and on the «Склонения» tab of Шаблоны документов.
- **Position:** stored in the `position_genitives` table, keyed by position name and global.

Renaming a department or position drops its manual value. The vacation generate endpoints add `*_gen` placeholders: `full_name_gen`, `short_name_gen`, `department_gen`, `position_gen`, etc. Keep the placeholder list in `shared/lib/docPlaceholders.ts` in sync. Document template `purpose` is unique per organization (`idx_dt_org_purpose`).

### System settings
- **Storage:** `system_settings` has `key` as its primary key, so settings are global (no per-org overrides). `PUT /api/admin/settings` is superadmin-only.
- **Internal markers:** `permissions_matrix_version` and `notification_delivery_version` are migration markers. They are hidden from the API and cannot be written.
- **Login page:** reads only `login_title`, `login_subtitle` and `login_demo_buttons` via `/api/settings/public`. The admin preview (`core/admin/components/LoginPreview.tsx`) renders the same `LoginHero` component as `Login.tsx`.

### Vacation cancel rules and reference documents
- **Cancelling** (`POST /api/vacation/requests/:id/cancel`): a vacation whose end date has passed cannot be cancelled by anyone. While the employee's department has `vacation_requests_blocked`, an approved vacation can be cancelled only by users with `vacation:manage`; day-offs are exempt.
- **Educational leave** requires an uploaded reference document:
  - The file is uploaded first via `POST /api/vacation/reference-documents` and stored under `vacation-references/{userId}/`.
  - Its key is then sent as `referenceDocumentKey` when creating or editing the request; `vacationApi` does this when `referenceFile` is set.
  - `GET /api/vacation/requests/:id/reference-document` returns a presigned URL to the author, approver, line/department manager and `vacation:manage` only.

### Tables
`shared/components/ui/DataTable.tsx` provides `TableCard`, `TableSearch`, `useTableSort`, `FilterHeader` (multi-select column filter in a portal) and `RowAction`; HR employees and the dictionaries (departments, positions, vacation types, tags) use it. Keep a table mounted while it refetches (dim it instead of swapping in a skeleton), otherwise an open filter popover unmounts after each pick.

### AI Assistant
Backend proxy to OpenAI-compatible API. Config stored in `system_settings` table (4 keys). Admin UI exists in AdminPanel. Frontend: `modules/assistant/`.

### Calendar + Exchange Integration
Backend fetches events from MS Exchange via EWS/NTLM (`services/ewsService.js`). Calendar page (`modules/calendar/CalendarPage.tsx`) imports vacation data from `modules/vacation/`.

## Important Notes

- **Path aliases**: Use `@/` prefix for all imports (maps to repo root). Example: `@/shared/lib/utils`, `@/modules/vacation/types/vacation`
- **Date handling**: Use `formatDate()` from `@/shared/lib/utils` -- the pg pool returns DATE columns as plain `YYYY-MM-DD` strings (timezone shift prevention configured in `database.js`)
- **Database changes**: Add SQL to `backend/src/db/migrate.js` (monolithic migration, idempotent)
- **UI language**: Russian for all user-facing text and error messages
- **No code comments** unless explicitly requested
- **localStorage only for per-device preferences**: user data is stored server-side (PostgreSQL, cookies for auth); `localStorage` is allowed only for device-local UI settings (dark mode `darkMode`, push toggle `pushNotifications`) via `readLocalPref`/`writeLocalPref` from `@/shared/lib/localPrefs`
- **API responses**: Return data directly on success; `{ error: 'message' }` on failure
- **Environment**: Copy `deploy/.env.example` to `backend/.env` and configure DB, JWT_SECRET, S3 credentials
- **Test users** (after seed): `admin@example.com` / `ivanov@example.com` / `petrov@example.com` with `password123`
- **Swagger**: JSDoc annotations on all route files. Spec at `GET /api-docs.json`, custom UI at `GET /api-docs` (dev only)
