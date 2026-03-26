# AGENTS.md

Guidelines for agentic coding agents working in this repository.

## Project Overview

Worker Cabinet is a full-stack HR management system:
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express + PostgreSQL
- **State Management**: Zustand (persisted to cookies)
- **File Storage**: AWS S3 / MinIO

## Build/Lint/Test Commands

```bash
# Frontend (root)
npm run dev              # Start both frontend and backend
npm run build            # Build for production
npm run lint             # Run ESLint
npm run typecheck        # Run TypeScript type checking

# Backend
cd backend && npm run dev              # Start with nodemon
cd backend && npm run migrate          # Run database migrations
cd backend && npm run seed             # Seed database
cd backend && npm run test:auth        # Run auth tests

# Run a single test
cd backend && node --test src/tests/auth.test.js
cd backend && node --test --test-name-pattern="JWT Token" src/tests/auth.test.js

# After making changes (MUST run)
npm run lint && npm run typecheck
```

## Code Style Guidelines

### TypeScript/React (Frontend)

**Imports Order**: React → External libs → Internal (`@/`) → Types

```typescript
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Calendar } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/lib/authHeaders'
import { formatDate, getErrorMessage } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/api'
import type { User, Project } from '@/types'
```

**Naming Conventions**:
- Components: PascalCase files (`EditProjectModal.tsx`)
- Hooks: camelCase with `use` prefix (`useAuthStore`)
- Constants: SCREAMING_SNAKE_CASE for global, camelCase for local
- Interfaces: PascalCase (`ProjectDetail`, `Member`)
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

### Backend (Node.js/Express)

**Route Handler Pattern**:
```javascript
router.post('/:id/resource', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { field1 } = req.body
    const userId = req.user.id

    if (!field1?.trim()) return res.status(400).json({ error: 'Field is required' })

    const accessCheck = await query(
      `SELECT 1 FROM table WHERE id = $1 AND user_id = $2`,
      [id, userId]
    )
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const result = await query(
      `INSERT INTO table (field) VALUES ($1) RETURNING *`,
      [field1]
    )
    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ error: 'Failed to perform operation' })
  }
})
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
  res.status(500).json({ error: 'Failed to create' })
} finally {
  client.release()
}
```

**Database Queries**: Use `$1, $2, ...` placeholders. Always use `RETURNING *` for INSERT/UPDATE. Import `query` and `getClient` from `../config/database.js`.

### Authentication

**Frontend**:
```typescript
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/lib/authHeaders'

const res = await fetch(url, { headers: getAuthHeaders() })  // GET
const res = await fetch(url, {
  method: 'POST',
  headers: getAuthHeadersWithContentType(),
  body: JSON.stringify(data),
})  // POST/PUT/DELETE
```

**Backend**:
```javascript
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'

router.get('/protected', authenticateToken, handler)
router.get('/admin-only', authenticateToken, authorizeRoles('admin', 'hr'), handler)
```

### Error Handling

**Frontend**:
```typescript
import { getErrorMessage } from '@/lib/utils'

try {
  const res = await fetch(url, options)
  if (!res.ok) throw new Error((await res.json()).error || 'Ошибка')
} catch (err: unknown) {
  setError(getErrorMessage(err))
}
```

**Backend**:
```javascript
try {
  // operation
} catch (error) {
  console.error('Error context:', error)
  res.status(500).json({ error: 'User-friendly message' })
}
```

### API Response Patterns

- **Success**: Return JSON object or array directly
- **Error**: `{ error: 'Human readable message' }`
- **Status codes**: 200 (GET/PUT), 201 (POST), 400 (validation), 401 (unauthorized), 403 (forbidden), 404 (not found), 500 (server error)

### Testing

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

### File Organization

```
/
├── components/           # React components (modals/, layout/, ui/, forms/, calendar/)
├── pages/               # Route pages
├── store/               # Zustand stores
├── lib/                 # Utilities (cn, formatDate, authHeaders, etc.)
├── types/               # TypeScript type definitions
└── backend/src/
    ├── routes/          # Express route handlers
    ├── middleware/      # Express middleware (auth, upload, etc.)
    ├── services/        # Business logic services
    ├── config/          # Database, S3 configuration
    ├── db/              # Migrations, seeds
    └── tests/           # Test files
```

## Important Notes

1. **Always run lint and typecheck after changes**: `npm run lint && npm run typecheck`
2. **Database schema changes**: Add migration to `backend/src/db/migrate.js`
3. **No comments in code** unless explicitly requested
4. **Russian language** for UI text and error messages
5. **Use path aliases**: Import with `@/` prefix for cross-module imports
6. **Date handling**: Use `formatDate()` from `@/lib/utils` - handles timezone issues with YYYY-MM-DD format
7. **Environment setup**: Copy `backend/.env.example` to `backend/.env` and configure values
8. **Access control**: Check permissions in route handlers before performing operations
