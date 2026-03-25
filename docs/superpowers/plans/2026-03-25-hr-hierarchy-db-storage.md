# HR Hierarchy DB Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move HR hierarchy storage from `localStorage` to PostgreSQL so all HR users share one canonical state.

**Architecture:** A singleton `hr_hierarchy` table holds one JSONB row with the full React Flow graph (`{ nodes, edges, viewport }`). Two endpoints — `GET /api/hierarchy` (any authenticated user) and `PUT /api/hierarchy` (hr/admin only) — replace localStorage reads and writes in the frontend.

**Tech Stack:** Node.js + Express + PostgreSQL (`pg`), React 18 + TypeScript, `@xyflow/react`

---

### Task 1: DB migration

**Files:**
- Modify: `backend/src/db/migrate.js`

- [ ] **Step 1: Add migration block**

Find the last migration block in `backend/src/db/migrate.js`. Each block follows this pattern:
```js
if (currentVersion < N) {
  await db.query(`...SQL...`)
  await db.query(`UPDATE db_version SET version = N`)
  currentVersion = N
}
```

Increment `N` to the next unused version number (check the last `UPDATE db_version SET version =` line to find the current max).

Add the block:
```js
if (currentVersion < N) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS hr_hierarchy (
      id INTEGER PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}',
      updated_at TIMESTAMP DEFAULT NOW(),
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT single_row CHECK (id = 1)
    )
  `)
  await db.query(`UPDATE db_version SET version = N`)
  currentVersion = N
}
```

- [ ] **Step 2: Run migration**

```bash
cd backend && npm run migrate
```

Expected: no errors, migration completes successfully.

- [ ] **Step 3: Verify table exists**

```bash
cd backend && node -e "import('./src/config/database.js').then(({query})=>query('SELECT column_name FROM information_schema.columns WHERE table_name=\\'hr_hierarchy\\'').then(r=>console.log(r.rows)))"
```

Expected: rows for `id`, `data`, `updated_at`, `updated_by`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/migrate.js
git commit -m "feat: add hr_hierarchy table migration"
```

---

### Task 2: Backend route

**Files:**
- Create: `backend/src/routes/hierarchy.js`
- Modify: `backend/src/server.js` (lines 15–16, add import and app.use)

- [ ] **Step 1: Write test file**

Create `backend/src/tests/hierarchy.test.js`:

```js
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { query } from '../config/database.js'

// Clean up before and after
before(async () => {
  await query('DELETE FROM hr_hierarchy')
})
after(async () => {
  await query('DELETE FROM hr_hierarchy')
})

describe('GET /api/hierarchy', () => {
  it('returns empty default when no row exists', async () => {
    const result = await query('SELECT * FROM hr_hierarchy WHERE id = 1')
    assert.equal(result.rows.length, 0)
    // Simulating route logic: no row → default
    const data = result.rows[0]?.data ?? { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
    assert.deepEqual(data.nodes, [])
    assert.deepEqual(data.edges, [])
  })
})

describe('PUT /api/hierarchy (upsert logic)', () => {
  it('inserts row on first save', async () => {
    const payload = { nodes: [{ id: '1' }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
    await query(
      `INSERT INTO hr_hierarchy (id, data, updated_at, updated_by)
       VALUES (1, $1, NOW(), NULL)
       ON CONFLICT (id) DO UPDATE
         SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
      [JSON.stringify(payload)]
    )
    const result = await query('SELECT data FROM hr_hierarchy WHERE id = 1')
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0].data.nodes.length, 1)
  })

  it('overwrites on second save', async () => {
    const payload = { nodes: [{ id: '1' }, { id: '2' }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
    await query(
      `INSERT INTO hr_hierarchy (id, data, updated_at, updated_by)
       VALUES (1, $1, NOW(), NULL)
       ON CONFLICT (id) DO UPDATE
         SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
      [JSON.stringify(payload)]
    )
    const result = await query('SELECT data FROM hr_hierarchy WHERE id = 1')
    assert.equal(result.rows[0].data.nodes.length, 2)
  })

  it('rejects second row (single_row constraint)', async () => {
    await assert.rejects(
      () => query('INSERT INTO hr_hierarchy (id, data) VALUES (2, \'{}\'::jsonb)'),
      /violates check constraint/
    )
  })
})
```

- [ ] **Step 2: Run tests (expect failures before implementation)**

```bash
cd backend && node --test src/tests/hierarchy.test.js
```

Expected: tests that test DB logic directly pass (they use `query` directly); constraint test passes too since the table exists.

- [ ] **Step 3: Create route file**

Create `backend/src/routes/hierarchy.js`:

```js
import express from 'express'
import { query } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'

const router = express.Router()

const DEFAULT_DATA = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }

router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query('SELECT data, updated_at, updated_by FROM hr_hierarchy WHERE id = 1')
    if (result.rows.length === 0) {
      return res.json({ data: DEFAULT_DATA, updated_at: null, updated_by: null })
    }
    res.json(result.rows[0])
  } catch (error) {
    console.error('GET /hierarchy error:', error)
    res.status(500).json({ error: 'Не удалось загрузить иерархию' })
  }
})

router.put('/', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  const { nodes, edges, viewport } = req.body
  if (!nodes || !edges) {
    return res.status(400).json({ error: 'Поля nodes и edges обязательны' })
  }
  try {
    const data = JSON.stringify({ nodes, edges, viewport: viewport ?? DEFAULT_DATA.viewport })
    const result = await query(
      `INSERT INTO hr_hierarchy (id, data, updated_at, updated_by)
       VALUES (1, $1, NOW(), $2)
       ON CONFLICT (id) DO UPDATE
         SET data = EXCLUDED.data,
             updated_at = EXCLUDED.updated_at,
             updated_by = EXCLUDED.updated_by
       RETURNING updated_at`,
      [data, req.user.id]
    )
    res.json({ updated_at: result.rows[0].updated_at })
  } catch (error) {
    console.error('PUT /hierarchy error:', error)
    res.status(500).json({ error: 'Не удалось сохранить иерархию' })
  }
})

export default router
```

- [ ] **Step 4: Register route in server.js**

In `backend/src/server.js`, add after line 15 (`import onboardingRoutes`):
```js
import hierarchyRoutes from './routes/hierarchy.js'
```

Add after line 68 (`app.use('/api/onboarding', onboardingRoutes)`):
```js
app.use('/api/hierarchy', hierarchyRoutes)
```

- [ ] **Step 5: Run tests**

```bash
cd backend && node --test src/tests/hierarchy.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Manual smoke test (optional)**

Start backend: `cd backend && npm run dev`

```bash
# GET with no data
curl -H "Authorization: Bearer <token>" http://localhost:5000/api/hierarchy
# Expected: {"data":{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}},"updated_at":null,"updated_by":null}

# PUT
curl -X PUT -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"nodes":[{"id":"1"}],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}' \
  http://localhost:5000/api/hierarchy
# Expected: {"updated_at":"..."}

# GET after PUT
curl -H "Authorization: Bearer <token>" http://localhost:5000/api/hierarchy
# Expected: data with nodes:[{id:"1"}]
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/hierarchy.js backend/src/server.js backend/src/tests/hierarchy.test.js
git commit -m "feat: add GET/PUT /api/hierarchy endpoints"
```

---

### Task 3: Frontend — replace localStorage with API

**Files:**
- Modify: `pages/HRHierarchy.tsx`

Key locations in the current file:
- Line 33: lucide-react imports (remove `Trash2` from header area — but keep it, it's used in context menus at lines 1005 and 1050)
- Line 36: `import { getAuthHeaders } from '@/lib/authHeaders'` — add `getAuthHeadersWithContentType`
- Line 292: `const STORAGE_KEY = 'hr-hierarchy-v1'` — remove
- Lines 551–552: state declarations — add `hierarchyLoading` and `saving`
- Lines 603–612: `useEffect` that reads from `localStorage` — replace with API fetch
- Line 798: `save` function — replace with API PUT
- Line 799: `clear` function — remove entirely
- Lines 818–824: Save + Clear buttons in header — remove Clear button, update Save button

- [ ] **Step 1: Update authHeaders import (line 36)**

Change:
```ts
import { getAuthHeaders } from '@/lib/authHeaders'
```
To:
```ts
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/lib/authHeaders'
```

- [ ] **Step 2: Remove STORAGE_KEY constant (line 292)**

Remove the line:
```ts
const STORAGE_KEY = 'hr-hierarchy-v1'
```

- [ ] **Step 3: Add new state variables**

After line 552 (`const [error, setError] = useState<string | null>(null)`), add:
```ts
const [hierarchyLoading, setHierarchyLoading] = useState(true)
const [saving, setSaving] = useState(false)
const [savedLabel, setSavedLabel] = useState(false)
```

- [ ] **Step 4: Replace localStorage useEffect with API fetch**

Replace the entire `useEffect` block at lines 603–612:
```ts
useEffect(() => {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    try {
      const { nodes: n, edges: e } = JSON.parse(saved)
      if (n) setNodes(n)
      if (e) setEdges((e as Edge[]).map(ed => ({ ...ed, type: 'editable' })))
    } catch { /* ignore */ }
  }
}, [setNodes, setEdges])
```

With:
```ts
useEffect(() => {
  const loadHierarchy = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/hierarchy`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Не удалось загрузить иерархию')
      const { data } = await res.json()
      if (data.nodes) setNodes(data.nodes)
      if (data.edges) setEdges((data.edges as Edge[]).map((ed: Edge) => ({ ...ed, type: 'editable' })))
      if (data.viewport) rfInstanceRef.current?.setViewport(data.viewport ?? { x: 0, y: 0, zoom: 1 })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setHierarchyLoading(false)
    }
  }
  loadHierarchy()
}, [setNodes, setEdges])
```

- [ ] **Step 5: Replace save function and remove clear function**

Replace lines 798–799:
```ts
const save = () => rfInstance && localStorage.setItem(STORAGE_KEY, JSON.stringify(rfInstance.toObject()))
const clear = () => { setNodes([]); setEdges([]); localStorage.removeItem(STORAGE_KEY) }
```

With:
```ts
const save = async () => {
  const inst = rfInstanceRef.current
  if (!inst) return
  setSaving(true)
  try {
    const { nodes: n, edges: e, viewport } = inst.toObject()
    const res = await fetch(`${API_BASE_URL}/hierarchy`, {
      method: 'PUT',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify({ nodes: n, edges: e, viewport }),
    })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(d.error || 'Не удалось сохранить иерархию')
    }
    setSavedLabel(true)
    setTimeout(() => setSavedLabel(false), 2000)
  } catch (err) {
    setError(getErrorMessage(err))
  } finally {
    setSaving(false)
  }
}
```

- [ ] **Step 6: Update Save button, remove Clear button**

Replace the header button group (lines 817–825):
```tsx
<div className="flex gap-2">
  <Button size="sm" variant="outline" onClick={save}>
    <Save className="h-4 w-4 mr-1.5" />
    Сохранить
  </Button>
  <Button size="sm" variant="outline" onClick={clear} title="Очистить холст">
    <Trash2 className="h-4 w-4" />
  </Button>
</div>
```

With:
```tsx
<div className="flex items-center gap-2">
  {savedLabel && <span className="text-xs text-green-600 dark:text-green-400">Сохранено</span>}
  <Button size="sm" variant="outline" onClick={save} disabled={saving}>
    <Save className="h-4 w-4 mr-1.5" />
    {saving ? 'Сохранение...' : 'Сохранить'}
  </Button>
</div>
```

- [ ] **Step 7: Lint and typecheck**

```bash
cd /path/to/root && npm run lint && npm run typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add pages/HRHierarchy.tsx
git commit -m "feat: load and save HR hierarchy from PostgreSQL instead of localStorage"
```
