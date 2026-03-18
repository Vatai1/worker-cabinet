# AGENTS.md

Guidelines for agentic coding agents working in this repository.

## Project Overview

Worker Cabinet is a full-stack HR management system:
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express + PostgreSQL
- **State Management**: Zustand (persisted to localStorage)
- **File Storage**: AWS S3

## Build/Lint/Test Commands

### Frontend (root)
```bash
npm run dev              # Start both frontend and backend
npm run build            # Build for production (tsc + vite build)
npm run lint             # Run ESLint on .ts/.tsx files
npm run typecheck        # Run TypeScript type checking
```

### Backend
```bash
cd backend
npm run dev              # Start with nodemon (hot reload)
npm run migrate          # Run database migrations
npm run seed             # Seed database
npm run test:auth        # Run auth tests
npm run test:vacation-history  # Run vacation tests
```

### Running a Single Test
```bash
cd backend
node --test src/tests/auth.test.js                          # Run specific file
node --test --test-name-pattern="JWT Token" src/tests/auth.test.js  # Run matching tests
```

## Code Style Guidelines

### TypeScript/React (Frontend)

**Imports Order**: React → External libs → Internal (`@/`) → Types → Utilities

```typescript
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/Card'
import { Calendar, Users } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import type { User } from '@/types'
```

**Naming Conventions**:
- Components: PascalCase (`EditProjectModal.tsx`)
- Hooks: camelCase with `use` prefix (`useAuthStore`)
- Constants: SCREAMING_SNAKE_CASE for global, camelCase for local
- Interfaces: PascalCase (`ProjectDetail`, `Member`)
- CSS: Tailwind with `cn()` utility

**Component Structure**:
```typescript
const STATUS_CONFIG = { active: { label: 'Активный', color: 'text-emerald-600' } }

interface Props { projectId: string; onSave: () => void }

export function MyComponent({ projectId, onSave }: Props) {
  const [state, setState] = useState(null)
  const handleClick = () => {}
  return <div className="...">...</div>
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

    const accessCheck = await query(`SELECT 1 FROM table WHERE id = $1 AND user_id = $2`, [id, userId])
    if (accessCheck.rows.length === 0) return res.status(403).json({ error: 'Forbidden' })

    const result = await query(`INSERT INTO table (field) VALUES ($1) RETURNING *`, [field1])
    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ error: 'Failed to perform operation' })
  }
})
```

**Database Queries**: Use `$1, $2, ...` placeholders, `RETURNING *` for INSERT/UPDATE, `query()` from `../config/database.js`

### Authentication

**Frontend** - `getAuthHeaders()` helper:
```typescript
const getAuthHeaders = () => {
  const authStorage = localStorage.getItem('auth-storage')
  const headers: Record<string, string> = {}
  if (authStorage) {
    try {
      const { state } = JSON.parse(authStorage)
      if (state?.token) headers['Authorization'] = `Bearer ${state.token}`
    } catch {}
  }
  return headers
}
```

**Backend**: Use `authenticateToken` middleware for protected routes.

### Error Handling

**Frontend**:
```typescript
try {
  const res = await fetch(url, options)
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || 'Ошибка')
  }
} catch (error: any) {
  alert(error.message)
}
```

**Backend**:
```javascript
try {
  // Operation
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
    const response = await fetch('http://localhost:5001/api/endpoint')
    assert.strictEqual(response.status, 200)
  })
})
```

### File Organization

```
/
├── components/          # React components (modals/, sections/, ui/)
├── pages/              # Route pages
├── store/              # Zustand stores
├── lib/                # Utilities (cn, formatDate, etc.)
├── types/              # TypeScript types
└── backend/src/
    ├── routes/         # Express routes
    ├── middleware/     # Express middleware
    ├── config/         # Database, S3 config
    └── db/             # Migrations, seeds
```

## Important Notes

1. **Always run lint and typecheck after changes**: `npm run lint && npm run typecheck`
2. **Database schema changes**: Add migration to `backend/src/db/migrate.js`
3. **No comments in code** unless explicitly requested
4. **Russian language** for UI text and error messages
5. **Use path aliases**: Import with `@/` prefix, not relative paths for cross-module imports
6. **Date handling**: Use `formatDate()` from `@/lib/utils` - handles timezone issues with YYYY-MM-DD format
7. **Environment setup**: Copy `.env.example` to `.env` in backend directory
