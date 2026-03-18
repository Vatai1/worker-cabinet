# AGENTS.md

Guidelines for agentic coding agents working in this repository.

## Project Overview

Worker Cabinet is a full-stack HR management system:
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express + PostgreSQL
- **State Management**: Zustand (persisted to localStorage) + TanStack Query (server state)
- **File Storage**: AWS S3 (or MinIO for local dev)

## Build/Lint/Test Commands

### Frontend (root directory)
```bash
npm run dev              # Start both frontend and backend in parallel
npm run dev:frontend     # Start only frontend (Vite on port 5173)
npm run dev:backend      # Start only backend
npm run build            # Production build (tsc + vite build)
npm run lint             # Run ESLint on .ts/.tsx files
npm run typecheck        # Run TypeScript type checking
```

### Backend
```bash
cd backend
npm run dev              # Start with nodemon (hot reload)
npm run start            # Production start
npm run migrate          # Run database migrations
npm run seed             # Seed database with test data
npm run init:s3          # Initialize S3 bucket
npm run init:templates   # Initialize template folders
```

### Running Tests
```bash
# Run all tests in a file
cd backend
node --test src/tests/auth.test.js
node --test src/tests/vacation-history.test.js
node --test src/tests/documents.test.js

# Run specific test by name pattern
node --test --test-name-pattern="JWT Token" src/tests/auth.test.js

# Run all backend tests
npm run test:auth
npm run test:vacation-history
```

## Code Style Guidelines

### TypeScript/React (Frontend)

**Imports Order** (use path aliases with `@/`):
```typescript
// 1. React
import { useState, useEffect } from 'react'
// 2. External libraries (react-router, date-fns, lucide)
import { useParams, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Calendar, Users } from 'lucide-react'
// 3. Internal components (@/)
import { Card, CardContent } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
// 4. Store
import { useAuthStore } from '@/store/authStore'
// 5. Types
import type { User, VacationRequest } from '@/types'
// 6. Utilities (always last)
import { cn, formatDate } from '@/lib/utils'
```

**Naming Conventions**:
- **Components**: PascalCase files (`EditProjectModal.tsx`)
- **Hooks/Functions**: camelCase (`useAuthStore`, `handleApprove`)
- **Constants**: SCREAMING_SNAKE_CASE for global, camelCase for local
- **Interfaces/Types**: PascalCase (`VacationRequest`, `ModalProps`)
- **CSS**: Use Tailwind with `cn()` utility for conditional classes

**Component Structure**:
```typescript
const STATUS_CONFIG = { active: { label: 'Активный', color: 'text-emerald-600' } }

interface Props { projectId: string; onSave: () => void; loading?: boolean }

export function MyComponent({ projectId, onSave, loading }: Props) {
  const [state, setState] = useState(null)
  const user = useAuthStore(state => state.user)
  
  const handleClick = () => { /* handler logic */ }
  
  return <div className="...">...</div>
}
```

### Backend (Node.js/Express)

**Route Handler Pattern**:
```javascript
import express from 'express'
import { query, getClient } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'

const router = express.Router()

router.post('/:id/resource', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { field1, field2 } = req.body
    const userId = req.user.id

    // 1. Validate input
    if (!field1?.trim()) return res.status(400).json({ error: 'Field is required' })

    // 2. Check access (403 for forbidden)
    const accessCheck = await query('SELECT 1 FROM table WHERE id = $1 AND user_id = $2', [id, userId])
    if (accessCheck.rows.length === 0) return res.status(403).json({ error: 'Forbidden' })

    // 3. Perform operation
    const result = await query('INSERT INTO table (field) VALUES ($1) RETURNING *', [field1])
    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error in resource:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
```

**Database Queries**:
- Always use parameterized queries with `$1, $2, ...` placeholders
- Use `RETURNING *` for INSERT/UPDATE to get created/updated rows
- Import `query` and `getClient` from `../config/database.js`

### Authentication

**Frontend** - Use `getAuthHeaders()` helper for API calls:
```typescript
const getAuthHeaders = () => {
  const authStorage = localStorage.getItem('auth-storage')
  const headers: Record<string, string> = {}
  if (authStorage) {
    try {
      const { state } = JSON.parse(authStorage)
      if (state?.token) headers['Authorization'] = `Bearer ${state.token}`
    } catch { /* ignore parse errors */ }
  }
  return headers
}
```

**Backend**: Use `authenticateToken` middleware for protected routes, `authorizeRoles` for role-based access.

### Error Handling

**Frontend**:
```typescript
try {
  const res = await fetch(url, options)
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || 'Произошла ошибка')
  }
} catch (error: any) {
  alert(error.message)
}
```

**Backend**:
```javascript
try {
  // operation
} catch (error) {
  console.error('Context:', error)
  res.status(500).json({ error: 'User-friendly message in Russian' })
}
```

### API Response Patterns

- **Success**: Return JSON object or array directly
- **Error**: `{ error: 'Human readable message in Russian' }`
- **Status codes**: 200 (GET/PUT), 201 (POST), 400 (validation), 401 (unauthorized), 403 (forbidden), 404 (not found), 500 (server error)

### Modal Component Usage

```typescript
import { Modal } from '@/components/ui/Modal'

<Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
  <div className="p-6 border-b"><h2>Title</h2></div>
  <div className="p-6">{/* Content */}</div>
</Modal>
```

### TanStack Query (Data Fetching)

Use TanStack Query for server state management instead of manual fetch + useState.

**Basic Query**:
```typescript
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/hooks/useApi'

function MyComponent({ userId }: { userId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => apiRequest<User>(`/users/${userId}`),
    enabled: !!userId,
  })
  
  if (isLoading) return <div>Загрузка...</div>
  if (error) return <div>Ошибка</div>
  return <div>{data.firstName}</div>
}
```

**Mutation with Cache Invalidation**:
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'

function useUpdateUser() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (user: User) => apiRequest(`/users/${user.id}`, {
      method: 'PUT',
      body: JSON.stringify(user),
    }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}
```

**Available Hooks** (in `@/hooks/`):
- `useApiQuery<T>(key, url, options)` - generic query hook
- `useApiMutation<T, V>(url, method)` - generic mutation hook
- `useVacationRequests(userId)` - fetch user's vacation requests
- `useVacationBalance(userId)` - fetch user's vacation balance
- `useCreateVacationRequest()` - create new vacation request

### Testing (Node.js built-in test runner)

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'

describe('Feature Name', () => {
  let testId
  beforeEach(async () => { /* Setup */ })
  afterEach(async () => { /* Cleanup */ })
  
  it('should do something', async () => {
    const response = await fetch('http://localhost:5000/api/endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field: 'value' })
    })
    assert.strictEqual(response.status, 200)
  })
})
```

### File Organization

```
/
├── components/         # React components (modals/, sections/, ui/)
├── pages/              # Route pages
├── hooks/              # Custom hooks (useApi, useVacationApi, etc.)
├── store/              # Zustand stores
├── lib/                # Utilities (cn, formatDate, formatCurrency)
├── types/              # TypeScript types
├── services/           # API service functions
└── backend/src/
    ├── routes/         # Express routes
    ├── middleware/     # Express middleware
    ├── config/         # Database, S3 config
    └── db/             # Migrations, seeds
```

## Important Rules

1. **Always run typecheck after changes**: `npm run typecheck`
2. **No comments in code** unless explicitly requested by user
3. **Russian language** for all UI text and error messages shown to users
4. **Use path aliases**: Import with `@/` prefix, not relative paths for cross-module imports
5. **Date handling**: Use `formatDate()` from `@/lib/utils` for date display - it handles timezone issues correctly
6. **Environment setup**: Copy `backend/.env.example` to `backend/.env` and configure
7. **Early returns**: Use early returns for validation errors (400) and access checks (403)
8. **Never catch specific errors** - use generic error handling with console.error for debugging
9. **Commit after significant changes**: Create a git commit after each substantial feature completion, bug fix, or refactoring step
