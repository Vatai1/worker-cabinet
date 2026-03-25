# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Worker Cabinet is a full-stack HR management system for managing vacations, employees, departments, projects, and documents.

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS (root directory)
- **Backend**: Node.js + Express + PostgreSQL (`backend/`)
- **State management**: Zustand (auth token persisted to cookies)
- **File storage**: MinIO (S3-compatible)
- **Optional**: Telegram bot for notifications

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
npm run test:auth        # Run auth tests
npm run test:vacation-history  # Run vacation history tests
node --test src/tests/auth.test.js                                    # Single test file
node --test --test-name-pattern="JWT Token" src/tests/auth.test.js    # Filter by name
node --test src/tests/surveys.test.js
node --test src/tests/templates.test.js
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
├── pages/               # One file per route
├── components/
│   ├── layout/          # Header, Sidebar, Layout (wraps all protected pages)
│   ├── modals/          # Dialog components
│   ├── ui/              # Reusable primitives (Button, Input, Card, etc.)
│   ├── forms/           # Form components
│   └── calendar/        # Calendar-specific components
├── store/               # Zustand stores (authStore, vacationStore, etc.)
├── lib/                 # Utilities: cn(), formatDate(), authHeaders, api.ts
├── types/               # TypeScript interfaces (index.ts, vacation.ts, project.ts)
└── services/            # API client helpers
```

### Backend Structure
```
backend/src/
├── server.js            # Express app entry point, registers all routes
├── routes/              # Route handlers (auth, vacation, users, projects, etc.)
├── middleware/          # auth.js (JWT), upload.js (multer), errors.js, rateLimiter.js
├── services/            # Business logic (vacationService, userService, etc.)
├── config/              # database.js (pg Pool), s3.js (MinIO client)
└── db/                  # migrate.js, seed.js, schema.sql
```

### Roles and Access
User roles: `employee`, `manager`, `hr`, `admin`, `onboarding`

- `manager` → redirected to `/leader` on login
- `onboarding` → redirected to `/onboarding`, can only access `/onboarding`, `/employees`, `/departments`; role auto-upgrades to `employee` when all onboarding documents are acknowledged
- Other roles → redirected to `/dashboard`
- Only the department manager can approve/reject vacation requests
- Route-level access uses `authenticateToken` + `authorizeRoles()` middleware
- Frontend route guards: `HRRoute` (hr/admin only), `OnboardingRoute` (onboarding only), `BlockOnboardingRoute` (blocks onboarding users from general routes)

### API Base URL
Frontend reads `VITE_API_BASE_URL` env var, defaults to `http://localhost:5000/api`.
Import as: `import { API_BASE_URL } from '@/lib/api'`

## Code Patterns

### Frontend Auth Headers
```typescript
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/lib/authHeaders'

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
import { getErrorMessage } from '@/lib/utils'

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
import { authenticateToken } from '../middleware/auth.js'
import { query } from '../config/database.js'

router.post('/:id/resource', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id
    // always parameterized queries with $1, $2, ...
    const result = await query(
      `INSERT INTO table (field) VALUES ($1) RETURNING *`,
      [id]
    )
    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ error: 'User-friendly message' })
  }
})
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
  res.status(500).json({ error: 'Failed to create' })
} finally {
  client.release()
}
```

## Sidebar Navigation Rules

**NEVER remove existing nav items from the sidebar** (`components/layout/Sidebar.tsx`).

Each role has its own navigation function (`getEmployeeNavigation`, `getManagerNavigation`, `getHRNavigation`). When adding items to one role, verify all other roles also have the equivalent items where appropriate. The current expected items per role:

- **employee**: Дашборд, Отпуск, Опросы, Сотрудники, Отделы, Проекты, Профиль, Заявления, Документы, Уведомления
- **manager**: Дашборд, Профиль, Сотрудники, Отделы, Проекты, Рассмотреть заявки, Отпуск, Опросы, Документы, Уведомления
- **hr/admin**: Дашборд, Профиль, HR (Опросы, Онбординг, Шаблоны документов, Иерархия), Мои опросы, Отпуск, Сотрудники, Отделы, Проекты, Документы, Уведомления
- **onboarding**: Онбординг, Сотрудники, Отделы

## Key Subsystems

### Onboarding (`/hr/onboarding`, `/onboarding`)
HR creates a user with role `onboarding` and assigns document templates in one request (`POST /api/onboarding`). The employee acknowledges each document (`POST /api/onboarding/me/documents/:id/acknowledge`); when all are done, a transaction atomically sets `role = 'employee'`, marks completion, and inserts HR notifications. Backend route order in `onboarding.js` matters: `/templates`, `/me`, `/me/documents/:id/acknowledge` must precede `/:id` to avoid Express matching literal paths as params.

### File Uploads
`backend/src/middleware/upload.js` exports multer instances: `uploadDocument` (user docs), `uploadTemplate` (HR document templates, PDF/DOCX ≤ 20 MB). MinIO helpers in `backend/src/config/s3.js`: `uploadToS3`, `getS3FileUrl`, `deleteFromS3`. Key format for onboarding templates: `onboarding-templates/{templateId}/{timestamp}.{ext}`.

### HR Hierarchy (`/hr/hierarchy`)
React Flow (`@xyflow/react`) canvas stored in `localStorage` key `hr-hierarchy-v1`. Lazy-loaded via `React.lazy`. Nodes: `department`, `employee`, `text`. All handles are `type="source"` with `ConnectionMode.Loose` to allow connections from any point. Custom `EditableEdge`: smoothstep rendering by default, switches to polyline when `data.waypoints` array is populated. Waypoints are materialized from smoothstep corners on first click to preserve route shape.

## Important Notes

- **Path aliases**: Use `@/` prefix for all cross-module imports (maps to repo root)
- **Date handling**: Use `formatDate()` from `@/lib/utils` — the pg pool returns DATE columns as plain `YYYY-MM-DD` strings (timezone shift prevention configured in `database.js`)
- **Database changes**: Add SQL to `backend/src/db/migrate.js`
- **UI language**: Russian for all user-facing text and error messages
- **No code comments** unless explicitly requested
- **API responses**: Return data directly on success; `{ error: 'message' }` on failure
- **Environment**: Copy `deploy/.env.example` to `backend/.env` and configure DB, JWT_SECRET, S3 credentials
- **Test users** (after seed): `ivanov@example.com` / `petrov@example.com` with `password123`
