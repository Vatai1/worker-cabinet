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
npm run dev              # Start both frontend and backend concurrently
npm run build            # Production build (tsc + vite build)
npm run lint             # ESLint on .ts/.tsx files
npm run typecheck        # TypeScript check (no emit)
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
├── notification-service/ # Separate Express microservice (RabbitMQ consumer + mailer)
└── docker/              # Docker configs (Hermes agent, DB init scripts)
```

### Backend Structure
```
backend/src/
├── server.js            # Express app entry point, registers all routes
├── routes/              # Route handlers (auth, vacation, users, projects, etc.) — 15 groups
├── middleware/          # auth.js (JWT), upload.js (multer), errors.js, rateLimiter.js, csrf.js, validation.js
├── services/            # Business logic (ewsService.js, surveyService.js)
├── config/              # database.js (pg Pool), s3.js (MinIO), rabbitmq.js, notifications.js, keycloak.js
├── cron/                # timesheetCron.js (daily timesheet job)
├── db/                  # migrate.js, seed.js, create-indexes.js, default-vacation-templates.js
└── tests/               # Node.js built-in test runner
```

### Roles and Access
User roles: `employee`, `manager`, `hr`, `admin`, `onboarding`

- `manager` -> redirected to `/leader` on login
- `onboarding` -> redirected to `/onboarding`, can only access `/onboarding`, `/employees`, `/departments`; role auto-upgrades to `employee` when all onboarding documents are acknowledged
- Other roles -> redirected to `/dashboard`
- Only the department manager can approve/reject vacation requests
- Route-level access uses `authenticateToken` + `authorizeRoles()` middleware
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

- **employee**: Дашборд, Отпуск, Опросы, Сотрудники, Отделы, Проекты, Профиль, Заявления, Документы, Уведомления
- **manager**: Дашборд, Профиль, Сотрудники, Отделы, Проекты, Рассмотреть заявки, Отпуск, Табель, Опросы, Документы, Уведомления
- **hr/admin**: Дашборд, Профиль, HR (Опросы, Онбординг, Отпуск, Иерархия, Справочники, Табель), Мои опросы, Отпуск, Сотрудники, Отделы, Проекты, Документы, Уведомления
- **onboarding**: Онбординг, Сотрудники, Отделы

## Key Subsystems

### Onboarding (`/hr/onboarding`, `/onboarding`)
HR creates a user with role `onboarding` and assigns document templates in one request (`POST /api/onboarding`). The employee acknowledges each document (`POST /api/onboarding/me/documents/:id/acknowledge`); when all are done, a transaction atomically sets `role = 'employee'`, marks completion, and inserts HR notifications. Backend route order in `onboarding.js` matters: `/templates`, `/me`, `/me/documents/:id/acknowledge` must precede `/:id` to avoid Express matching literal paths as params.

### File Uploads
`backend/src/middleware/upload.js` exports multer instances: `uploadDocument` (user docs), `uploadTemplate` (HR document templates, PDF/DOCX <= 20 MB). MinIO helpers in `backend/src/config/s3.js`: `uploadToS3`, `getS3FileUrl`, `deleteFromS3`. Key format for onboarding templates: `onboarding-templates/{templateId}/{timestamp}.{ext}`.

### Timesheet / Табель (`/leader/timesheet`, `/hr/timesheet`)
Accessible to `manager`, `hr`, `admin`. Tables: `timesheets` (one per department/month) and `timesheet_entries` (one per employee/day). Statuses: `draft` -> `submitted` -> `approved`; only `hr`/`admin` can approve or revert. Managers can only transition `draft->submitted`.

On creation (`POST /api/timesheet`), entries are auto-filled for the entire month: weekends -> `В`, approved vacations -> `ОТ`, weekdays -> `Я`/8h. Future dates cannot be edited. Approved timesheets are locked.

Bulk update via `PUT /api/timesheet/:id/entries` (upsert by `timesheet_id + employee_id + date`). Export endpoints: `GET /api/timesheet/:id/export/excel` (ExcelJS) and `/export/pdf` (PDFKit, landscape A4).

Manager access is scoped to their department (`getManagerDepartmentId` checks `departments.manager_id` then `users.department_id`). HR/admin see all departments.

Frontend: `modules/timesheet/pages/ManagerTimesheet.tsx` for manager, `shared/components/timesheet/TimesheetGrid.tsx` for the editable grid. Attendance codes and colors defined in `@/shared/lib/timesheetCodes`.

### HR Hierarchy (`/hr/hierarchy`)
React Flow (`@xyflow/react`) canvas. Lazy-loaded via `React.lazy`. Nodes: `department`, `employee`, `text`. All handles are `type="source"` with `ConnectionMode.Loose`. Custom `EditableEdge`: smoothstep rendering by default, switches to polyline when `data.waypoints` array is populated.

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
- **No localStorage**: all user data stored server-side (PostgreSQL, cookies for auth)
- **API responses**: Return data directly on success; `{ error: 'message' }` on failure
- **Environment**: Copy `deploy/.env.example` to `backend/.env` and configure DB, JWT_SECRET, S3 credentials
- **Test users** (after seed): `admin@example.com` / `ivanov@example.com` / `petrov@example.com` with `password123`
- **Swagger**: JSDoc annotations on all route files. Spec at `GET /api-docs.json`, custom UI at `GET /api-docs` (dev only)
