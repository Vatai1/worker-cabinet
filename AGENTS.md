# AGENTS.md

Guidelines for agentic coding agents working in this repository.

## Project Overview

Worker Cabinet is a full-stack HR management system:
- **Frontend**: React 18 + TypeScript + Vite (port 3000) + Tailwind CSS (root directory)
- **Backend**: Node.js + Express (port 5000) + PostgreSQL (`backend/`)
- **State Management**: Zustand (auth token persisted to cookies, 7-day expiry)
- **File Storage**: MinIO (S3-compatible)
- **API Docs**: Custom dark-themed Swagger UI at `/api-docs` (dev only), spec at `/api-docs.json`

## Build/Lint/Test Commands

```bash
npm run dev                                  # Start frontend + backend concurrently
npm run lint && npm run typecheck            # MUST run after frontend changes
npm run build                                # Production build

cd backend && npm run dev                    # Backend with nodemon hot reload
cd backend && npm run migrate                # Run database migrations
cd backend && npm run seed                   # Seed test data

# Run a single test file (requires running PostgreSQL)
cd backend && node --test src/tests/auth.test.js
cd backend && node --test --test-name-pattern="JWT Token" src/tests/auth.test.js
cd backend && node --test src/tests/vacation-history.test.js
cd backend && node --test src/tests/surveys.test.js
cd backend && node --test src/tests/timesheet.test.js

# Test users (after seed): admin@example.com / ivanov@example.com / petrov@example.com — password: password123
```

## Code Style

### No Comments
Never add comments unless explicitly requested.

### Language
Russian for all user-facing text and error messages.

### TypeScript/React (Frontend)

**Imports Order**: React → External libs → `@/` components → Icons → Stores → Lib utilities → API → Types

```typescript
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { FolderKanban } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/lib/authHeaders'
import { formatDate, formatDateTime, getErrorMessage, cn } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/api'
import type { User, Project } from '@/types'
```

**Naming**: PascalCase files + named exports (`export function MyComponent`). Interfaces: `Props`, `ProjectDetail`. Constants: SCREAMING_SNAKE_CASE (file-level). CSS: Tailwind with `cn()`.

**Component Pattern**:
```typescript
interface Props { projectId: string; onSave: () => void }

export function MyComponent({ projectId, onSave }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/endpoint`, {
        method: 'POST', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ projectId }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Ошибка')
      onSave()
    } catch (err: unknown) { setError(getErrorMessage(err)) }
    finally { setLoading(false) }
  }
  return <div>...</div>
}
```

**Frontend Auth**: `getAuthHeaders()` for GET, `getAuthHeadersWithContentType()` for POST/PUT/DELETE. Both read token from `auth_token` cookie. **Path alias**: `@/` → repo root.

**Utilities** (`lib/utils.ts`): `cn()` Tailwind merge, `formatDate()`/`formatDateTime()` Russian locale, `formatCurrency()` RUB, `getErrorMessage()` extract from `unknown`.

### Backend (Node.js/Express)

**ES Modules**: `"type": "module"` — `import`/`export`, `.js` extensions in imports.

**Route Handler** — wrap with `asyncHandler`:
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

**Transaction Pattern**:
```javascript
const client = await getClient()
try {
  await client.query('BEGIN')
  const result = await client.query('INSERT INTO ... RETURNING *', [...])
  await client.query('COMMIT')
  res.status(201).json(result.rows[0])
} catch (error) { await client.query('ROLLBACK'); throw error }
finally { client.release() }
```

**Error Classes** (`middleware/errors.js`): `ValidationError`(400), `UnauthorizedError`(401), `ForbiddenError`(403), `NotFoundError`(404), `ConflictError`(409). `asyncHandler` auto-catches; `errorHandler` also handles JWT + Postgres unique/FK violations.

**Database**: `$1, $2...` parameterized queries. `RETURNING *` for INSERT/UPDATE. DATE columns return raw `YYYY-MM-DD` (custom pg parser). **15 route groups** under `/api` prefix.

### API Responses

- **Success**: JSON object/array directly
- **Error**: `{ error: 'Russian message', code: 'ERROR_CODE' }`
- **Status**: 200(GET/PUT), 201(POST), 400(validation), 401(unauthorized), 403(forbidden), 404(not found), 409(conflict), 500(server)

### Swagger/API Documentation

JSDoc annotations on all route files generate OpenAPI 3.0 spec via `swagger-jsdoc` (`backend/src/config/swagger.js`).
- Spec JSON: `GET /api-docs.json`
- Custom UI: `GET /api-docs` (serves `backend/public/api-docs.html`, dev only)
- Tags: Auth, Users, Vacation, Projects, Documents, Notifications, Departments, Surveys, Onboarding, Hierarchy, Dictionaries, Timesheet, Calendar, Telegram
- When adding new routes, add JSDoc `@swagger` annotation before the `router.get/post/...` call
- YAML descriptions with colons must be quoted: `description: 'Доступно для ролей: hr, admin'`

## Roles and Access

Roles: `employee`, `manager`, `hr`, `admin`, `onboarding`
- `manager` → `/leader`, `onboarding` → `/onboarding` (restricted to `/onboarding`, `/employees`, `/departments`)
- Backend: `authenticateToken` + `authorizeRoles('admin', 'hr')`
- Frontend guards in `App.tsx`: `ProtectedRoute`, `HRRoute`, `ManagerRoute`, `OnboardingRoute`, `BlockOnboardingRoute`

## Important Notes

1. **Always run** `npm run lint && npm run typecheck` after frontend changes
2. **Always update Swagger** when modifying API routes — add or update JSDoc `@swagger` annotations for new/changed endpoints, keep them consistent with actual request/response shapes and status codes
2. **Schema changes**: Add SQL to `backend/src/db/migrate.js` (monolithic migration, idempotent)
3. **Date handling**: `formatDate()` from `@/lib/utils` — parses `YYYY-MM-DD` as local date (pg pool configured to return DATE as raw strings)
4. **Environment**: `cp backend/.env.example backend/.env` — configure `DB_*`, `JWT_SECRET` (required, no fallback), `S3_*`, `TELEGRAM_BOT_TOKEN`
5. **API base URL**: `import { API_BASE_URL } from '@/lib/api'` — reads `VITE_API_BASE_URL`, defaults to `http://localhost:5000/api`
6. **Sidebar**: NEVER remove existing nav items from `components/layout/Sidebar.tsx`
7. **Route file order matters**: In `onboarding.js`, literal paths (`/templates`, `/me`) must precede parameterized paths (`/:id`) to avoid Express matching them as params
8. **Vite port auto-kill**: `vite.config.ts` includes a plugin that kills processes on port 3000 before starting dev server (Windows-only `taskkill`)
