# AGENTS.md

Guidelines for agentic coding agents working in this repository.

## Project Overview

Worker Cabinet is a full-stack HR management system:
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS (root directory)
- **Backend**: Node.js + Express + PostgreSQL (`backend/`)
- **State Management**: Zustand (auth token persisted to cookies)
- **File Storage**: MinIO (S3-compatible)
- **Optional**: Telegram bot for notifications

## Build/Lint/Test Commands

```bash
# Start both frontend and backend
npm run dev

# Frontend checks (MUST run after frontend changes)
npm run lint && npm run typecheck

# Production build
npm run build

# Backend
cd backend && npm run dev              # Start with nodemon (hot reload)
cd backend && npm run migrate          # Run database migrations
cd backend && npm run seed             # Seed database with test data

# Run a single test file
cd backend && node --test src/tests/auth.test.js
cd backend && node --test --test-name-pattern="JWT Token" src/tests/auth.test.js
cd backend && node --test src/tests/vacation-history.test.js
cd backend && node --test src/tests/surveys.test.js
cd backend && node --test src/tests/templates.test.js

# Test users (after seed): ivanov@example.com / petrov@example.com with password123
```

## Code Style

### No Comments
Never add comments unless explicitly requested.

### Language
Russian for all user-facing text and error messages.

### TypeScript/React (Frontend)

**Imports Order**: React → External libs → Internal `@/` components → Icons → Stores → Lib utilities → API → Types

```typescript
import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { FolderKanban, X } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/lib/authHeaders'
import { formatDate, getErrorMessage, cn } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/api'
import type { User, Project } from '@/types'
```

**Naming Conventions**:
- Components: PascalCase files (`EditProjectModal.tsx`), named exports (`export function MyComponent`)
- Hooks: camelCase with `use` prefix (`useAuthStore`, `useModal`)
- Constants: SCREAMING_SNAKE_CASE for file-level, camelCase for local
- Interfaces: PascalCase (`ProjectDetail`, `Props`)
- CSS: Tailwind with `cn()` utility from `@/lib/utils`

**Component Pattern**:
```typescript
interface Props {
  projectId: string
  onSave: () => void
}

export function MyComponent({ projectId, onSave }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/endpoint`, {
        method: 'POST',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ projectId }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Ошибка')
      onSave()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  return <div>...</div>
}
```

**Frontend Auth**:
```typescript
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/lib/authHeaders'

const res = await fetch(url, { headers: getAuthHeaders() })  // GET
const res = await fetch(url, {
  method: 'POST',
  headers: getAuthHeadersWithContentType(),
  body: JSON.stringify(data),
})  // POST/PUT/DELETE
```

**Path Aliases**: Use `@/` prefix for all cross-module imports (maps to repo root via `tsconfig.json` paths + `vite.config.ts` resolve.alias).

### Backend (Node.js/Express)

**ES Modules**: `"type": "module"` — use `import`/`export` syntax, `.js` extensions in imports.

**Route Handler Pattern** — wrap with `asyncHandler` from `../middleware/errors.js`:
```javascript
import { asyncHandler, ValidationError, ForbiddenError } from '../middleware/errors.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { query, getClient } from '../config/database.js'

router.post('/:id/resource', authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params
  const userId = req.user.id

  if (!field1?.trim()) throw new ValidationError('Field is required')

  const accessCheck = await query(
    `SELECT 1 FROM table WHERE id = $1 AND user_id = $2`,
    [id, userId]
  )
  if (accessCheck.rows.length === 0) throw new ForbiddenError()

  const result = await query(
    `INSERT INTO table (field) VALUES ($1) RETURNING *`,
    [field1]
  )
  res.status(201).json(result.rows[0])
}))
```

**Transaction Pattern**:
```javascript
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

**Error Classes** (from `../middleware/errors.js`): `ValidationError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409). Use `asyncHandler` to auto-catch and forward to `errorHandler`.

**Database**: Use `$1, $2, ...` parameterized queries. Always `RETURNING *` for INSERT/UPDATE. Import `query` and `getClient` from `../config/database.js`.

### API Response Patterns

- **Success**: Return JSON object or array directly
- **Error**: `{ error: 'Russian message', code: 'ERROR_CODE' }`
- **Status codes**: 200 (GET/PUT), 201 (POST), 400 (validation), 401 (unauthorized), 403 (forbidden), 404 (not found), 500 (server error)

### Testing (Node.js built-in test runner)

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'

describe('Feature Name', () => {
  beforeEach(async () => { /* Setup */ })
  afterEach(async () => { /* Cleanup */ })

  it('should do something', async () => {
    const response = await fetch('http://localhost:5000/api/endpoint')
    assert.strictEqual(response.status, 200)
    const data = await response.json()
    assert.ok(data.id)
  })
})
```

## File Organization

```
/                              # Frontend root
├── App.tsx                    # Router, ProtectedRoute, role-based redirects
├── pages/                     # One file per route page
├── components/
│   ├── layout/                # Header, Sidebar, Layout
│   ├── modals/                # Dialog components
│   ├── ui/                    # Reusable primitives (Button, Input, Card, Badge, Avatar)
│   ├── forms/                 # Form components
│   └── calendar/              # Calendar components
├── store/                     # Zustand stores (authStore, vacationStore, uiStore, etc.)
├── lib/                       # Utilities: cn(), formatDate(), authHeaders, api, hooks/
├── types/                     # TypeScript interfaces (index.ts, vacation.ts, project.ts, survey.ts)
├── services/                  # API client helpers (vacationApi, surveyApi, etc.)
└── backend/src/
    ├── server.js              # Express app entry point
    ├── routes/                # Route handlers (auth, vacation, users, projects, etc.)
    ├── middleware/             # auth.js (JWT), upload.js (multer), errors.js, rateLimiter.js
    ├── services/              # Business logic services
    ├── config/                # database.js (pg Pool), s3.js (MinIO)
    └── db/                    # migrate.js, seed.js
```

## Roles and Access

Roles: `employee`, `manager`, `hr`, `admin`, `onboarding`

- `manager` → redirected to `/leader`
- `onboarding` → redirected to `/onboarding`, can only access `/onboarding`, `/employees`, `/departments`
- Backend: `authenticateToken` + `authorizeRoles('admin', 'hr')` middleware
- Frontend: `ProtectedRoute`, `HRRoute`, `OnboardingRoute`, `BlockOnboardingRoute` in `App.tsx`

## Important Notes

1. **Always run** `npm run lint && npm run typecheck` after frontend changes
2. **Database schema changes**: Add SQL to `backend/src/db/migrate.js`
3. **Date handling**: Use `formatDate()` from `@/lib/utils` — parses `YYYY-MM-DD` as local date to avoid timezone shifts
4. **Environment**: Copy `deploy/.env.example` to `backend/.env` and configure DB, JWT_SECRET, S3 credentials
5. **API base URL**: `import { API_BASE_URL } from '@/lib/api'` — reads `VITE_API_BASE_URL`, defaults to `http://localhost:5000/api`
6. **Sidebar**: NEVER remove existing nav items from `components/layout/Sidebar.tsx`
