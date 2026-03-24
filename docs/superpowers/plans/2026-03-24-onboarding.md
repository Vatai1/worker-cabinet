# Onboarding System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full onboarding system where HR creates new users with restricted `onboarding` role, assigns document templates, and the employee acknowledges each document until their role auto-upgrades to `employee`.

**Architecture:** Backend: one new route file (`backend/src/routes/onboarding.js`) registered at `/api/onboarding`, handles both employee self-service (`/me`) and HR management endpoints. Frontend: two new pages — `pages/Onboarding.tsx` (employee view) and `pages/HROnboarding.tsx` (HR two-tab panel). Access control enforced via new route guards in `App.tsx` and restricted sidebar navigation for the `onboarding` role.

**Tech Stack:** Express + PostgreSQL (pg transactions), React 18 + TypeScript, Zustand (authStore.checkAuth for role refresh), multer (reused `uploadTemplate` instance), MinIO (reused `uploadToS3`/`deleteFromS3`), bcryptjs (password hashing), lucide-react icons, existing UI primitives (Card, Button, Input, Badge, Avatar).

---

## File Map

**Create:**
- `backend/src/routes/onboarding.js` — all onboarding route handlers
- `pages/Onboarding.tsx` — employee-facing onboarding page
- `pages/HROnboarding.tsx` — HR two-tab management page

**Modify:**
- `backend/src/db/migrate.js` — add `onboarding` enum value + 3 new tables
- `backend/src/server.js` — register `/api/onboarding` routes
- `types/index.ts` — add `'onboarding'` to `UserRole`
- `App.tsx` — add `OnboardingRoute`/`BlockOnboardingRoute` guards + new routes
- `components/layout/Sidebar.tsx` — add `getOnboardingNavigation()` + role dispatch

---

## Task 1: Database Migration

**Files:**
- Modify: `backend/src/db/migrate.js`

- [ ] **Step 1: Add `onboarding` enum value**

In `migrate.js`, after the `try/catch` block that adds `director` to `user_role_enum` (around line 100–111), add:

```javascript
try {
  await db.query(`ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'onboarding'`)
  console.log('  ✓ onboarding value added to user_role_enum')
} catch (e) {
  if (!e.message.includes('already exists')) {
    console.log('  - onboarding enum:', e.message)
  }
}
```

- [ ] **Step 2: Add 3 new tables**

At the end of the table-creation block (after all existing `CREATE TABLE IF NOT EXISTS` statements), add:

```javascript
await db.query(`
  CREATE TABLE IF NOT EXISTS onboarding_templates (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content_text TEXT,
    file_key VARCHAR(500),
    CONSTRAINT content_or_file CHECK (content_text IS NOT NULL OR file_key IS NOT NULL),
    department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    position VARCHAR(255),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
  )
`).catch(e => console.log('  - onboarding_templates:', e.message))

await db.query(`
  CREATE TABLE IF NOT EXISTS employee_onboarding (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    started_by INTEGER REFERENCES users(id),
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
  )
`).catch(e => console.log('  - employee_onboarding:', e.message))

await db.query(`
  CREATE TABLE IF NOT EXISTS employee_onboarding_documents (
    id SERIAL PRIMARY KEY,
    onboarding_id INTEGER REFERENCES employee_onboarding(id) ON DELETE CASCADE,
    template_id INTEGER REFERENCES onboarding_templates(id) ON DELETE RESTRICT,
    acknowledged_at TIMESTAMP,
    UNIQUE (onboarding_id, template_id)
  )
`).catch(e => console.log('  - employee_onboarding_documents:', e.message))
```

- [ ] **Step 3: Run migration**

```bash
cd backend && npm run migrate
```

Expected: `✓ onboarding value added to user_role_enum`, then `onboarding_templates`, `employee_onboarding`, `employee_onboarding_documents` created (no errors).

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/migrate.js
git commit -m "feat: add onboarding tables and role enum value"
```

---

## Task 2: Backend — Onboarding Routes

**Files:**
- Create: `backend/src/routes/onboarding.js`

**Route registration order** (critical — Express matches `/me` as `/:id` if order is wrong):
```
GET    /templates
POST   /templates
PUT    /templates/:id
DELETE /templates/:id
GET    /me
POST   /me/documents/:id/acknowledge
GET    /
POST   /
GET    /:id
DELETE /:id
```

- [ ] **Step 1: Create the route file**

Create `backend/src/routes/onboarding.js`:

```javascript
import express from 'express'
import bcrypt from 'bcryptjs'
import { query, getClient } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { uploadTemplate as uploadTemplateMiddleware } from '../middleware/upload.js'
import { uploadToS3, getS3FileUrl, deleteFromS3 } from '../config/s3.js'

const router = express.Router()

// ─── TEMPLATE ENDPOINTS (HR/admin) ────────────────────────────────────────────

router.get('/templates', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const { department_id, position } = req.query
    let sql = `
      SELECT t.*, d.name as department_name
      FROM onboarding_templates t
      LEFT JOIN departments d ON t.department_id = d.id
      WHERE 1=1
    `
    const params = []
    if (department_id) {
      sql += ` AND t.department_id = $${params.length + 1}`
      params.push(department_id)
    }
    if (position) {
      sql += ` AND t.position ILIKE $${params.length + 1}`
      params.push(`%${position}%`)
    }
    sql += ' ORDER BY t.created_at DESC'
    const result = await query(sql, params)
    res.json(result.rows)
  } catch (error) {
    console.error('GET /onboarding/templates error:', error)
    res.status(500).json({ error: 'Ошибка загрузки шаблонов' })
  }
})

router.post('/templates', authenticateToken, authorizeRoles('hr', 'admin'), uploadTemplateMiddleware.single('file'), async (req, res) => {
  try {
    const { title, content_text, department_id, position } = req.body
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Название обязательно' })
    }
    if (!content_text && !req.file) {
      return res.status(400).json({ error: 'Необходимо указать текст или загрузить файл' })
    }

    const insertResult = await query(
      `INSERT INTO onboarding_templates (title, content_text, department_id, position, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [title.trim(), content_text || null, department_id || null, position || null, req.user.id]
    )
    const id = insertResult.rows[0].id

    let file_key = null
    if (req.file) {
      const ext = req.file.originalname.split('.').pop()
      file_key = `onboarding-templates/${id}/${Date.now()}.${ext}`
      await uploadToS3(req.file, file_key)
      await query('UPDATE onboarding_templates SET file_key = $1 WHERE id = $2', [file_key, id])
    }

    const result = await query(
      'SELECT t.*, d.name as department_name FROM onboarding_templates t LEFT JOIN departments d ON t.department_id = d.id WHERE t.id = $1',
      [id]
    )
    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('POST /onboarding/templates error:', error)
    res.status(500).json({ error: 'Ошибка создания шаблона' })
  }
})

router.put('/templates/:id', authenticateToken, authorizeRoles('hr', 'admin'), uploadTemplateMiddleware.single('file'), async (req, res) => {
  try {
    const { id } = req.params
    const { title, content_text, department_id, position } = req.body

    const existing = await query('SELECT * FROM onboarding_templates WHERE id = $1', [id])
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Шаблон не найден' })
    }
    const template = existing.rows[0]

    let file_key = template.file_key
    if (req.file) {
      if (template.file_key) {
        await deleteFromS3(template.file_key)
      }
      const ext = req.file.originalname.split('.').pop()
      file_key = `onboarding-templates/${id}/${Date.now()}.${ext}`
      await uploadToS3(req.file, file_key)
    }

    await query(
      `UPDATE onboarding_templates SET title = $1, content_text = $2, department_id = $3, position = $4, file_key = $5 WHERE id = $6`,
      [
        title?.trim() || template.title,
        content_text !== undefined ? (content_text || null) : template.content_text,
        department_id !== undefined ? (department_id || null) : template.department_id,
        position !== undefined ? (position || null) : template.position,
        file_key,
        id,
      ]
    )

    const result = await query(
      'SELECT t.*, d.name as department_name FROM onboarding_templates t LEFT JOIN departments d ON t.department_id = d.id WHERE t.id = $1',
      [id]
    )
    res.json(result.rows[0])
  } catch (error) {
    console.error('PUT /onboarding/templates/:id error:', error)
    res.status(500).json({ error: 'Ошибка обновления шаблона' })
  }
})

router.delete('/templates/:id', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const { id } = req.params

    const inUse = await query(
      'SELECT 1 FROM employee_onboarding_documents WHERE template_id = $1 LIMIT 1',
      [id]
    )
    if (inUse.rows.length > 0) {
      return res.status(400).json({ error: 'Шаблон используется в онбординге' })
    }

    const existing = await query('SELECT file_key FROM onboarding_templates WHERE id = $1', [id])
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Шаблон не найден' })
    }
    if (existing.rows[0].file_key) {
      await deleteFromS3(existing.rows[0].file_key)
    }

    await query('DELETE FROM onboarding_templates WHERE id = $1', [id])
    res.json({ success: true })
  } catch (error) {
    console.error('DELETE /onboarding/templates/:id error:', error)
    res.status(500).json({ error: 'Ошибка удаления шаблона' })
  }
})

// ─── EMPLOYEE ENDPOINTS ────────────────────────────────────────────────────────

// GET /me — MUST precede /:id
router.get('/me', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'onboarding') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const onboarding = await query(
      `SELECT eo.*, u.first_name, u.last_name, u.position
       FROM employee_onboarding eo
       JOIN users u ON eo.user_id = u.id
       WHERE eo.user_id = $1 AND eo.completed_at IS NULL`,
      [req.user.id]
    )
    if (onboarding.rows.length === 0) {
      return res.status(404).json({ error: 'Онбординг не найден' })
    }
    const ob = onboarding.rows[0]

    const docs = await query(
      `SELECT eod.id, eod.template_id, eod.acknowledged_at,
              ot.title, ot.content_text, ot.file_key
       FROM employee_onboarding_documents eod
       JOIN onboarding_templates ot ON eod.template_id = ot.id
       WHERE eod.onboarding_id = $1
       ORDER BY eod.id`,
      [ob.id]
    )

    res.json({
      id: ob.id,
      userId: ob.user_id,
      startedAt: ob.started_at,
      firstName: ob.first_name,
      lastName: ob.last_name,
      position: ob.position,
      documents: docs.rows.map(d => ({
        id: d.id,
        templateId: d.template_id,
        title: d.title,
        contentText: d.content_text,
        fileKey: d.file_key,
        fileUrl: d.file_key ? getS3FileUrl(d.file_key) : null,
        acknowledgedAt: d.acknowledged_at,
      })),
    })
  } catch (error) {
    console.error('GET /onboarding/me error:', error)
    res.status(500).json({ error: 'Ошибка загрузки онбординга' })
  }
})

router.post('/me/documents/:id/acknowledge', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'onboarding') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { id } = req.params

    const docResult = await query(
      `SELECT eod.*, eo.user_id, eo.id as onboarding_id
       FROM employee_onboarding_documents eod
       JOIN employee_onboarding eo ON eod.onboarding_id = eo.id
       WHERE eod.id = $1`,
      [id]
    )
    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Документ не найден' })
    }
    const doc = docResult.rows[0]

    if (doc.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    if (doc.acknowledged_at) {
      return res.status(400).json({ error: 'Уже подтверждено' })
    }

    const client = await getClient()
    try {
      await client.query('BEGIN')

      await client.query(
        'UPDATE employee_onboarding_documents SET acknowledged_at = NOW() WHERE id = $1',
        [id]
      )

      const allDocs = await client.query(
        'SELECT acknowledged_at FROM employee_onboarding_documents WHERE onboarding_id = $1',
        [doc.onboarding_id]
      )
      const allAcknowledged = allDocs.rows.every(d => d.acknowledged_at !== null)

      if (allAcknowledged) {
        await client.query(`UPDATE users SET role = 'employee' WHERE id = $1`, [doc.user_id])
        await client.query(
          'UPDATE employee_onboarding SET completed_at = NOW() WHERE id = $1',
          [doc.onboarding_id]
        )

        const userResult = await client.query(
          'SELECT first_name, last_name FROM users WHERE id = $1',
          [doc.user_id]
        )
        const { first_name, last_name } = userResult.rows[0]

        const hrUsers = await client.query(
          "SELECT id FROM users WHERE role IN ('hr', 'admin')"
        )
        for (const hrUser of hrUsers.rows) {
          await client.query(
            `INSERT INTO notifications (user_id, title, message, type, link)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              hrUser.id,
              'Онбординг завершён',
              `Сотрудник ${first_name} ${last_name} завершил онбординг`,
              'success',
              `/hr/onboarding/${doc.onboarding_id}`,
            ]
          )
        }
      }

      await client.query('COMMIT')
      res.json({ acknowledged: true })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('POST /onboarding/me/documents/:id/acknowledge error:', error)
    res.status(500).json({ error: 'Ошибка подтверждения документа' })
  }
})

// ─── HR ENDPOINTS ──────────────────────────────────────────────────────────────

router.get('/', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const result = await query(
      `SELECT
        eo.id,
        eo.user_id,
        eo.started_at,
        eo.completed_at,
        u.first_name,
        u.last_name,
        u.position,
        d.name as department,
        (SELECT COUNT(*) FROM employee_onboarding_documents WHERE onboarding_id = eo.id) as total_docs,
        (SELECT COUNT(*) FROM employee_onboarding_documents WHERE onboarding_id = eo.id AND acknowledged_at IS NOT NULL) as acknowledged_docs
       FROM employee_onboarding eo
       JOIN users u ON eo.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       ORDER BY eo.started_at DESC`
    )
    res.json(result.rows)
  } catch (error) {
    console.error('GET /onboarding error:', error)
    res.status(500).json({ error: 'Ошибка загрузки онбордингов' })
  }
})

router.post('/', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const { first_name, last_name, email, password, department_id, position, template_ids } = req.body

    if (!first_name || !last_name || !email || !password || !position) {
      return res.status(400).json({ error: 'Заполните все обязательные поля' })
    }
    if (!template_ids || template_ids.length === 0) {
      return res.status(400).json({ error: 'Выберите хотя бы один документ' })
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [email])
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email уже зарегистрирован' })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const client = await getClient()
    try {
      await client.query('BEGIN')

      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, position, department_id, hire_date, role)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, 'onboarding')
         RETURNING id`,
        [email, passwordHash, first_name, last_name, position, department_id || null]
      )
      const userId = userResult.rows[0].id

      await client.query(
        'INSERT INTO vacation_balances (user_id, total_days) VALUES ($1, 28)',
        [userId]
      )

      const onboardingResult = await client.query(
        `INSERT INTO employee_onboarding (user_id, started_by) VALUES ($1, $2) RETURNING id`,
        [userId, req.user.id]
      )
      const onboardingId = onboardingResult.rows[0].id

      for (const templateId of template_ids) {
        await client.query(
          `INSERT INTO employee_onboarding_documents (onboarding_id, template_id) VALUES ($1, $2)`,
          [onboardingId, templateId]
        )
      }

      await client.query('COMMIT')
      res.status(201).json({ id: onboardingId, userId })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('POST /onboarding error:', error)
    if (error.message?.includes('Email уже зарегистрирован')) {
      return res.status(400).json({ error: error.message })
    }
    res.status(500).json({ error: 'Ошибка создания онбординга' })
  }
})

router.get('/:id', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const { id } = req.params
    const result = await query(
      `SELECT
        eo.id, eo.user_id, eo.started_at, eo.completed_at,
        u.first_name, u.last_name, u.email, u.position,
        d.name as department
       FROM employee_onboarding eo
       JOIN users u ON eo.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE eo.id = $1`,
      [id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Онбординг не найден' })
    }

    const docs = await query(
      `SELECT eod.id, eod.template_id, eod.acknowledged_at,
              ot.title, ot.content_text, ot.file_key
       FROM employee_onboarding_documents eod
       JOIN onboarding_templates ot ON eod.template_id = ot.id
       WHERE eod.onboarding_id = $1
       ORDER BY eod.id`,
      [id]
    )

    const ob = result.rows[0]
    res.json({
      ...ob,
      documents: docs.rows.map(d => ({
        id: d.id,
        templateId: d.template_id,
        title: d.title,
        contentText: d.content_text,
        fileKey: d.file_key,
        fileUrl: d.file_key ? getS3FileUrl(d.file_key) : null,
        acknowledgedAt: d.acknowledged_at,
      })),
    })
  } catch (error) {
    console.error('GET /onboarding/:id error:', error)
    res.status(500).json({ error: 'Ошибка загрузки онбординга' })
  }
})

router.delete('/:id', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const { id } = req.params
    const result = await query(
      'SELECT user_id FROM employee_onboarding WHERE id = $1',
      [id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Онбординг не найден' })
    }
    const userId = result.rows[0].user_id

    const client = await getClient()
    try {
      await client.query('BEGIN')
      await client.query(`UPDATE users SET role = 'employee' WHERE id = $1`, [userId])
      await client.query('DELETE FROM employee_onboarding WHERE id = $1', [id])
      await client.query('COMMIT')
      res.json({ success: true })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('DELETE /onboarding/:id error:', error)
    res.status(500).json({ error: 'Ошибка отмены онбординга' })
  }
})

export default router
```

- [ ] **Step 2: Verify file is saved correctly**

```bash
node --input-type=module <<< "import r from './backend/src/routes/onboarding.js'; console.log('ok')"
```

Expected: `ok` (or a bcrypt/pg import error is fine — just confirms syntax is valid)

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/onboarding.js
git commit -m "feat: add onboarding backend routes"
```

---

## Task 3: Register Backend Routes

**Files:**
- Modify: `backend/src/server.js`

- [ ] **Step 1: Add import and registration**

In `backend/src/server.js`:

After the existing imports (e.g., `import surveysRoutes from './routes/surveys.js'`), add:

```javascript
import onboardingRoutes from './routes/onboarding.js'
```

After `app.use('/api/surveys', surveysRoutes)`, add:

```javascript
app.use('/api/onboarding', onboardingRoutes)
```

- [ ] **Step 2: Start server to verify**

```bash
cd backend && npm run dev
```

Expected: `Server running on port 5000` — no import errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/server.js
git commit -m "feat: register /api/onboarding routes"
```

---

## Task 4: Frontend — Types and Access Control

**Files:**
- Modify: `types/index.ts`
- Modify: `App.tsx`
- Modify: `components/layout/Sidebar.tsx`

### Part A: Update UserRole type

- [ ] **Step 1: Edit `types/index.ts`**

Change line 1:
```typescript
export type UserRole = 'employee' | 'manager' | 'hr' | 'admin'
```
to:
```typescript
export type UserRole = 'employee' | 'manager' | 'hr' | 'admin' | 'onboarding'
```

### Part B: Update App.tsx

- [ ] **Step 2: Add imports to `App.tsx`**

Add two new page imports (after `import { SurveyPage } from '@/pages/SurveyPage'`):

```typescript
import { Onboarding } from '@/pages/Onboarding'
import { HROnboarding } from '@/pages/HROnboarding'
```

- [ ] **Step 3: Add route guards to `App.tsx`**

After the existing `HRRoute` component (around line 57), add:

```tsx
function OnboardingRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const loading = useAuthStore((state) => state.loading)
  if (loading) return null
  if (user?.role !== 'onboarding') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function BlockOnboardingRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const loading = useAuthStore((state) => state.loading)
  if (loading) return null
  if (user?.role === 'onboarding') return <Navigate to="/onboarding" replace />
  return <>{children}</>
}
```

- [ ] **Step 4: Update root redirect in `App.tsx`**

Change the index route element (around line 83–87):
```tsx
<Navigate
  to={user?.role === 'manager' ? '/leader' : '/dashboard'}
  replace
/>
```
to:
```tsx
<Navigate
  to={
    user?.role === 'manager' ? '/leader' :
    user?.role === 'onboarding' ? '/onboarding' :
    '/dashboard'
  }
  replace
/>
```

- [ ] **Step 5: Add new routes and wrap existing routes in `App.tsx`**

Add `onboarding` route (before the closing `</Route>`):
```tsx
<Route path="onboarding" element={<OnboardingRoute><Onboarding /></OnboardingRoute>} />
<Route path="hr/onboarding" element={<HRRoute><HROnboarding /></HRRoute>} />
<Route path="hr/onboarding/:id" element={<HRRoute><HROnboarding /></HRRoute>} />
```

Wrap routes that onboarding users must NOT access with `BlockOnboardingRoute`. Replace the `dashboard` route:
```tsx
<Route path="dashboard" element={<BlockOnboardingRoute><Dashboard /></BlockOnboardingRoute>} />
```

Also wrap `leader`, `manager`, `vacation`, `requests`, `documents`, `document-templates`, `notifications`, `projects` and `hr/*` routes. Pattern for each:
```tsx
<Route path="ROUTE" element={<BlockOnboardingRoute><Component /></BlockOnboardingRoute>} />
```

The `employees` and `departments` routes are allowed for onboarding users — do NOT wrap them.

### Part C: Update Sidebar.tsx

- [ ] **Step 6: Add `getOnboardingNavigation` to `Sidebar.tsx`**

Add this function (before `getEmployeeNavigation`):

```typescript
const getOnboardingNavigation = (): NavItem[] => [
  { name: 'Онбординг', href: '/onboarding', icon: ClipboardList },
  { name: 'Сотрудники', href: '/employees', icon: Users },
  { name: 'Отделы', href: '/departments', icon: Building2 },
]
```

Also add `BookOpen` to the lucide-react imports (for the onboarding icon) — or reuse `ClipboardList` which is already imported.

- [ ] **Step 7: Update role dispatch in `Sidebar.tsx`**

Change lines 106–109:
```typescript
const navigation =
  user?.role === 'manager' ? getManagerNavigation(user?.id) :
  ['hr', 'admin'].includes(user?.role ?? '') ? getHRNavigation(user?.id) :
  getEmployeeNavigation(user?.id)
```
to:
```typescript
const navigation =
  user?.role === 'onboarding' ? getOnboardingNavigation() :
  user?.role === 'manager' ? getManagerNavigation(user?.id) :
  ['hr', 'admin'].includes(user?.role ?? '') ? getHRNavigation(user?.id) :
  getEmployeeNavigation(user?.id)
```

- [ ] **Step 8: Add HR Onboarding to HR navigation in `Sidebar.tsx`**

In `getHRNavigation`, add the onboarding link. After the `Дашборд` entry:
```typescript
{ name: 'Онбординг', href: '/hr/onboarding', icon: ClipboardList },
```

- [ ] **Step 9: Lint and typecheck**

```bash
npm run lint && npm run typecheck
```

Expected: no errors (pages don't exist yet — you may need to create stub exports first — see Task 5/6).

- [ ] **Step 10: Commit**

```bash
git add types/index.ts App.tsx components/layout/Sidebar.tsx
git commit -m "feat: add onboarding access control and navigation"
```

---

## Task 5: Frontend — Employee Onboarding Page

**Files:**
- Create: `pages/Onboarding.tsx`

**Behavior:**
- On mount: `GET /api/onboarding/me` → if 404, call `checkAuth()` then navigate to `/dashboard`
- Progress block: welcome, progress bar (X/N acknowledged), percentage
- Document list: one card per doc, "Открыть" button
- Document modal: shows text content or file download link, "Ознакомлен" button
- Confirmation modal: "Вы подтверждаете ознакомление с документом?"
- After confirm: `POST /api/onboarding/me/documents/:id/acknowledge` → call `checkAuth()` → if role is now `employee`, navigate to `/dashboard`

- [ ] **Step 1: Create `pages/Onboarding.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { API_BASE_URL } from '@/lib/api'
import { getAuthHeaders } from '@/lib/authHeaders'
import { getErrorMessage, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { CheckCircle2, Circle, FileText, Download, Loader2, BookOpen } from 'lucide-react'

interface OnboardingDocument {
  id: number
  templateId: number
  title: string
  contentText: string | null
  fileKey: string | null
  fileUrl: string | null
  acknowledgedAt: string | null
}

interface OnboardingData {
  id: number
  userId: number
  startedAt: string
  firstName: string
  lastName: string
  position: string
  documents: OnboardingDocument[]
}

export function Onboarding() {
  const navigate = useNavigate()
  const { checkAuth } = useAuthStore()
  const [onboarding, setOnboarding] = useState<OnboardingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDoc, setSelectedDoc] = useState<OnboardingDocument | null>(null)
  const [confirmDocId, setConfirmDocId] = useState<number | null>(null)
  const [acknowledging, setAcknowledging] = useState(false)
  const [ackError, setAckError] = useState<string | null>(null)

  const fetchOnboarding = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/onboarding/me`, { headers: getAuthHeaders() })
      if (res.status === 404) {
        await checkAuth()
        navigate('/dashboard', { replace: true })
        return
      }
      if (!res.ok) throw new Error('Ошибка загрузки')
      const data = await res.json()
      setOnboarding(data)
    } catch {
      navigate('/dashboard', { replace: true })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchOnboarding() }, [])

  const handleAcknowledge = async () => {
    if (!confirmDocId) return
    setAcknowledging(true)
    setAckError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/onboarding/me/documents/${confirmDocId}/acknowledge`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка')
      }
      await checkAuth()
      const updatedUser = useAuthStore.getState().user
      if (updatedUser?.role === 'employee') {
        navigate('/dashboard', { replace: true })
        return
      }
      setSelectedDoc(null)
      setConfirmDocId(null)
      await fetchOnboarding()
    } catch (err: unknown) {
      setAckError(getErrorMessage(err))
    } finally {
      setAcknowledging(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!onboarding) return null

  const total = onboarding.documents.length
  const acknowledged = onboarding.documents.filter(d => d.acknowledgedAt).length
  const percent = total > 0 ? Math.round((acknowledged / total) * 100) : 0

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Онбординг</h1>
        <p className="text-muted-foreground">Добро пожаловать, {onboarding.firstName} {onboarding.lastName}!</p>
      </div>

      {/* Progress block */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Прогресс</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span>Ознакомлено документов: <strong>{acknowledged} из {total}</strong></span>
            <span className="font-semibold text-primary">{percent}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Document list */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Документы</h2>
        {onboarding.documents.map((doc) => (
          <Card key={doc.id} className="border border-border/50">
            <CardContent className="flex items-center gap-4 py-4">
              <div className="shrink-0">
                {doc.acknowledgedAt
                  ? <CheckCircle2 className="h-6 w-6 text-green-500" />
                  : <Circle className="h-6 w-6 text-muted-foreground" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{doc.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  {doc.contentText && <Badge variant="secondary" className="text-xs">Текст</Badge>}
                  {doc.fileKey && <Badge variant="secondary" className="text-xs"><FileText className="h-3 w-3 mr-1" />Файл</Badge>}
                  {doc.acknowledgedAt && (
                    <span className="text-xs text-muted-foreground">Ознакомлен {formatDate(doc.acknowledgedAt)}</span>
                  )}
                </div>
              </div>
              {!doc.acknowledgedAt && (
                <Button size="sm" variant="outline" onClick={() => setSelectedDoc(doc)}>
                  <BookOpen className="h-4 w-4 mr-2" />
                  Открыть
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Document modal */}
      {selectedDoc && !confirmDocId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-border/50">
              <h3 className="text-lg font-semibold">{selectedDoc.title}</h3>
              <button onClick={() => setSelectedDoc(null)} className="text-muted-foreground hover:text-foreground transition-colors">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {selectedDoc.contentText && (
                <div className="text-sm whitespace-pre-wrap leading-relaxed">{selectedDoc.contentText}</div>
              )}
              {selectedDoc.fileUrl && (
                <a
                  href={selectedDoc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-4 text-primary hover:underline"
                >
                  <Download className="h-4 w-4" />
                  Скачать файл
                </a>
              )}
            </div>
            <div className="p-6 border-t border-border/50 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setSelectedDoc(null)}>Закрыть</Button>
              <Button onClick={() => setConfirmDocId(selectedDoc.id)}>Ознакомлен</Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {confirmDocId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold">Подтверждение</h3>
            <p className="text-muted-foreground">Вы подтверждаете ознакомление с документом?</p>
            {ackError && <p className="text-sm text-destructive">{ackError}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => { setConfirmDocId(null); setAckError(null) }} disabled={acknowledging}>
                Отмена
              </Button>
              <Button onClick={handleAcknowledge} disabled={acknowledging}>
                {acknowledging ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Подтвердить
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Lint and typecheck**

```bash
npm run lint && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add pages/Onboarding.tsx
git commit -m "feat: add employee onboarding page"
```

---

## Task 6: Frontend — HR Onboarding Management Page

**Files:**
- Create: `pages/HROnboarding.tsx`

**Structure:** Two tabs — "Сотрудники" (list of onboarding records + detail modal + add modal + cancel) and "Шаблоны" (template CRUD).

If the page is opened at `/hr/onboarding/:id`, it auto-opens the detail modal for that ID.

- [ ] **Step 1: Create `pages/HROnboarding.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { API_BASE_URL } from '@/lib/api'
import { getAuthHeaders } from '@/lib/authHeaders'
import { getErrorMessage, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Badge } from '@/components/ui/Badge'
import {
  Plus, Trash2, Edit2, CheckCircle2, Circle, FileText, Loader2,
  Users, BookOpen, Building2, X, Download,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OnboardingRecord {
  id: number
  userId: number
  firstName: string
  lastName: string
  position: string
  department: string | null
  startedAt: string
  completedAt: string | null
  totalDocs: number
  acknowledgedDocs: number
}

interface OnboardingDetail extends OnboardingRecord {
  email: string
  documents: {
    id: number
    title: string
    contentText: string | null
    fileUrl: string | null
    acknowledgedAt: string | null
  }[]
}

interface OnboardingTemplate {
  id: number
  title: string
  contentText: string | null
  fileKey: string | null
  departmentId: number | null
  departmentName: string | null
  position: string | null
  createdAt: string
}

interface Department {
  id: number
  name: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HROnboarding() {
  const { id: urlId } = useParams<{ id?: string }>()
  const [tab, setTab] = useState<'employees' | 'templates'>('employees')

  // Employees tab state
  const [records, setRecords] = useState<OnboardingRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(true)
  const [detail, setDetail] = useState<OnboardingDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<OnboardingRecord | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)

  // Templates tab state
  const [templates, setTemplates] = useState<OnboardingTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editTemplate, setEditTemplate] = useState<OnboardingTemplate | null>(null)
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<OnboardingTemplate | null>(null)

  // Shared
  const [departments, setDepartments] = useState<Department[]>([])
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    fetchRecords()
    fetchDepartments()
  }, [])

  useEffect(() => {
    if (urlId) openDetail(parseInt(urlId))
  }, [urlId])

  const fetchRecords = async () => {
    setRecordsLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/onboarding`, { headers: getAuthHeaders() })
      const data = await res.json()
      setRecords(data.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        firstName: r.first_name,
        lastName: r.last_name,
        position: r.position,
        department: r.department,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        totalDocs: parseInt(r.total_docs),
        acknowledgedDocs: parseInt(r.acknowledged_docs),
      })))
    } catch {
      setRecords([])
    } finally {
      setRecordsLoading(false)
    }
  }

  const fetchTemplates = async () => {
    setTemplatesLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/onboarding/templates`, { headers: getAuthHeaders() })
      const data = await res.json()
      setTemplates(data.map((t: any) => ({
        id: t.id,
        title: t.title,
        contentText: t.content_text,
        fileKey: t.file_key,
        departmentId: t.department_id,
        departmentName: t.department_name,
        position: t.position,
        createdAt: t.created_at,
      })))
    } catch {
      setTemplates([])
    } finally {
      setTemplatesLoading(false)
    }
  }

  const fetchDepartments = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/departments`, { headers: getAuthHeaders() })
      const data = await res.json()
      setDepartments(data)
    } catch {
      setDepartments([])
    }
  }

  const openDetail = async (id: number) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/onboarding/${id}`, { headers: getAuthHeaders() })
      const data = await res.json()
      setDetail({
        id: data.id,
        userId: data.user_id,
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
        position: data.position,
        department: data.department,
        startedAt: data.started_at,
        completedAt: data.completed_at,
        totalDocs: data.documents.length,
        acknowledgedDocs: data.documents.filter((d: any) => d.acknowledgedAt).length,
        documents: data.documents,
      })
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleCancelOnboarding = async () => {
    if (!cancelTarget) return
    setCancelLoading(true)
    setActionError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/onboarding/${cancelTarget.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setDetail(null)
      setCancelTarget(null)
      await fetchRecords()
    } catch (err: unknown) {
      setActionError(getErrorMessage(err))
    } finally {
      setCancelLoading(false)
    }
  }

  const handleTabChange = (newTab: 'employees' | 'templates') => {
    setTab(newTab)
    if (newTab === 'templates' && templates.length === 0) {
      fetchTemplates()
    }
  }

  const handleDeleteTemplate = async () => {
    if (!deleteTemplateTarget) return
    setActionError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/onboarding/templates/${deleteTemplateTarget.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setDeleteTemplateTarget(null)
      await fetchTemplates()
    } catch (err: unknown) {
      setActionError(getErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Онбординг</h1>
          <p className="text-muted-foreground">Управление онбордингом сотрудников</p>
        </div>
        {tab === 'employees' && (
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Добавить сотрудника
          </Button>
        )}
        {tab === 'templates' && (
          <Button onClick={() => { setEditTemplate(null); setShowTemplateModal(true) }}>
            <Plus className="h-4 w-4 mr-2" />
            Создать шаблон
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/50">
        {([['employees', 'Сотрудники', Users], ['templates', 'Шаблоны', BookOpen]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Employees tab */}
      {tab === 'employees' && (
        <div>
          {recordsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Нет записей об онбординге</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground">
                    <th className="text-left py-3 px-4 font-medium">Сотрудник</th>
                    <th className="text-left py-3 px-4 font-medium">Должность</th>
                    <th className="text-left py-3 px-4 font-medium">Отдел</th>
                    <th className="text-left py-3 px-4 font-medium">Начало</th>
                    <th className="text-left py-3 px-4 font-medium">Прогресс</th>
                    <th className="text-left py-3 px-4 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => openDetail(r.id)}
                      className="border-b border-border/30 hover:bg-muted/30 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-medium">{r.lastName} {r.firstName}</td>
                      <td className="py-3 px-4 text-muted-foreground">{r.position}</td>
                      <td className="py-3 px-4 text-muted-foreground">{r.department || '—'}</td>
                      <td className="py-3 px-4 text-muted-foreground">{formatDate(r.startedAt)}</td>
                      <td className="py-3 px-4">
                        <span className="font-medium">{r.acknowledgedDocs}/{r.totalDocs}</span>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={r.completedAt ? 'success' : 'secondary'}>
                          {r.completedAt ? 'Завершён' : 'В процессе'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Templates tab */}
      {tab === 'templates' && (
        <div>
          {templatesLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Нет шаблонов документов</div>
          ) : (
            <div className="space-y-3">
              {templates.map((t) => (
                <Card key={t.id} className="border border-border/50">
                  <CardContent className="flex items-center gap-4 py-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{t.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {t.contentText && <Badge variant="secondary" className="text-xs">Текст</Badge>}
                        {t.fileKey && <Badge variant="secondary" className="text-xs"><FileText className="h-3 w-3 mr-1" />Файл</Badge>}
                        {t.departmentName && <Badge variant="outline" className="text-xs"><Building2 className="h-3 w-3 mr-1" />{t.departmentName}</Badge>}
                        {t.position && <Badge variant="outline" className="text-xs">{t.position}</Badge>}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => { setEditTemplate(t); setShowTemplateModal(true) }}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeleteTemplateTarget(t)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detail modal */}
      {(detail || detailLoading) && (
        <OnboardingDetailModal
          detail={detail}
          loading={detailLoading}
          onClose={() => setDetail(null)}
          onCancel={(record) => setCancelTarget(record)}
        />
      )}

      {/* Cancel confirm */}
      {cancelTarget && (
        <ConfirmModal
          title="Отменить онбординг"
          message={`Отменить онбординг для ${cancelTarget.lastName} ${cancelTarget.firstName}? Роль сотрудника будет изменена на «Сотрудник».`}
          confirmLabel="Отменить онбординг"
          confirmVariant="destructive"
          loading={cancelLoading}
          error={actionError}
          onConfirm={handleCancelOnboarding}
          onClose={() => { setCancelTarget(null); setActionError(null) }}
        />
      )}

      {/* Add employee modal */}
      {showAddModal && (
        <AddOnboardingModal
          departments={departments}
          templates={templates}
          onTemplatesNeeded={fetchTemplates}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); fetchRecords() }}
        />
      )}

      {/* Template edit/create modal */}
      {showTemplateModal && (
        <TemplateModal
          template={editTemplate}
          departments={departments}
          onClose={() => { setShowTemplateModal(false); setEditTemplate(null) }}
          onSuccess={() => { setShowTemplateModal(false); setEditTemplate(null); fetchTemplates() }}
        />
      )}

      {/* Delete template confirm */}
      {deleteTemplateTarget && (
        <ConfirmModal
          title="Удалить шаблон"
          message={`Удалить шаблон «${deleteTemplateTarget.title}»?`}
          confirmLabel="Удалить"
          confirmVariant="destructive"
          error={actionError}
          onConfirm={handleDeleteTemplate}
          onClose={() => { setDeleteTemplateTarget(null); setActionError(null) }}
        />
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function OnboardingDetailModal({ detail, loading, onClose, onCancel }: {
  detail: OnboardingDetail | null
  loading: boolean
  onClose: () => void
  onCancel: (r: OnboardingDetail) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <h3 className="text-lg font-semibold">
            {detail ? `${detail.lastName} ${detail.firstName}` : 'Загрузка...'}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
          {detail && !loading && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Должность: </span>{detail.position}</div>
                <div><span className="text-muted-foreground">Отдел: </span>{detail.department || '—'}</div>
                <div><span className="text-muted-foreground">Email: </span>{detail.email}</div>
                <div><span className="text-muted-foreground">Начало: </span>{formatDate(detail.startedAt)}</div>
                <div><span className="text-muted-foreground">Прогресс: </span>{detail.acknowledgedDocs}/{detail.totalDocs}</div>
                <div><span className="text-muted-foreground">Статус: </span>
                  <Badge variant={detail.completedAt ? 'success' : 'secondary'}>
                    {detail.completedAt ? 'Завершён' : 'В процессе'}
                  </Badge>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Документы</h4>
                {detail.documents.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50">
                    {doc.acknowledgedAt
                      ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      : <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.title}</p>
                      {doc.acknowledgedAt && (
                        <p className="text-xs text-muted-foreground">Ознакомлен {formatDate(doc.acknowledgedAt)}</p>
                      )}
                    </div>
                    {doc.fileUrl && (
                      <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        <Download className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {detail && !detail.completedAt && (
          <div className="p-6 border-t border-border/50 flex justify-end">
            <Button variant="destructive" size="sm" onClick={() => onCancel(detail)}>
              Отменить онбординг
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function AddOnboardingModal({ departments, templates, onTemplatesNeeded, onClose, onSuccess }: {
  departments: Department[]
  templates: OnboardingTemplate[]
  onTemplatesNeeded: () => void
  onClose: () => void
  onSuccess: () => void
}) {
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', password: '',
    department_id: '', position: '',
  })
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (templates.length === 0) onTemplatesNeeded()
  }, [])

  useEffect(() => {
    const deptId = form.department_id ? parseInt(form.department_id) : null
    const pos = form.position.toLowerCase().trim()
    const matched = templates
      .filter(t => {
        const deptMatch = !t.departmentId || t.departmentId === deptId
        const posMatch = !t.position || (pos && t.position.toLowerCase().includes(pos))
        return deptMatch && posMatch
      })
      .map(t => t.id)
    setSelectedTemplateIds(matched)
  }, [form.department_id, form.position, templates])

  const toggleTemplate = (id: number) => {
    setSelectedTemplateIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleSubmit = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/onboarding`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          department_id: form.department_id || null,
          template_ids: selectedTemplateIds,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onSuccess()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const field = (label: string, key: keyof typeof form, type = 'text') => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type={type}
        value={form[key]}
        onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <h3 className="text-lg font-semibold">Добавить сотрудника на онбординг</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {field('Фамилия', 'last_name')}
            {field('Имя', 'first_name')}
            {field('Email', 'email', 'email')}
            {field('Пароль', 'password', 'password')}
            <div className="space-y-1">
              <Label>Должность</Label>
              <Input
                value={form.position}
                onChange={e => setForm(prev => ({ ...prev, position: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Отдел</Label>
              <select
                value={form.department_id}
                onChange={e => setForm(prev => ({ ...prev, department_id: e.target.value }))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Не выбран</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Документы для ознакомления</Label>
            <p className="text-xs text-muted-foreground">Подходящие шаблоны выбраны автоматически. Вы можете добавить или убрать.</p>
            {templates.length === 0 && (
              <p className="text-sm text-muted-foreground">Нет доступных шаблонов. Сначала создайте шаблоны на вкладке «Шаблоны».</p>
            )}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {templates.map(t => (
                <label key={t.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 cursor-pointer hover:bg-muted/30">
                  <input
                    type="checkbox"
                    checked={selectedTemplateIds.includes(t.id)}
                    onChange={() => toggleTemplate(t.id)}
                    className="rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{t.title}</p>
                    <div className="flex gap-2 mt-0.5">
                      {t.departmentName && <span className="text-xs text-muted-foreground">{t.departmentName}</span>}
                      {t.position && <span className="text-xs text-muted-foreground">{t.position}</span>}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="p-6 border-t border-border/50 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Добавить
          </Button>
        </div>
      </div>
    </div>
  )
}

function TemplateModal({ template, departments, onClose, onSuccess }: {
  template: OnboardingTemplate | null
  departments: Department[]
  onClose: () => void
  onSuccess: () => void
}) {
  const isEdit = !!template
  const [title, setTitle] = useState(template?.title || '')
  const [contentText, setContentText] = useState(template?.contentText || '')
  const [departmentId, setDepartmentId] = useState(template?.departmentId?.toString() || '')
  const [position, setPosition] = useState(template?.position || '')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setError(null)
    if (!contentText.trim() && !file && !template?.fileKey) {
      setError('Необходимо указать текст или загрузить файл')
      return
    }
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('title', title)
      if (contentText) formData.append('content_text', contentText)
      if (departmentId) formData.append('department_id', departmentId)
      if (position) formData.append('position', position)
      if (file) formData.append('file', file)

      const headers = getAuthHeaders()
      const url = isEdit
        ? `${API_BASE_URL}/onboarding/templates/${template!.id}`
        : `${API_BASE_URL}/onboarding/templates`
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers,
        body: formData,
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onSuccess()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <h3 className="text-lg font-semibold">{isEdit ? 'Редактировать шаблон' : 'Создать шаблон'}</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="space-y-1">
            <Label>Название *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Текст документа</Label>
            <textarea
              value={contentText}
              onChange={e => setContentText(e.target.value)}
              rows={6}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              placeholder="Введите текст документа..."
            />
          </div>
          <div className="space-y-1">
            <Label>Файл (PDF, DOCX, до 20 МБ)</Label>
            {template?.fileKey && !file && (
              <p className="text-xs text-muted-foreground">Текущий файл сохранён. Загрузите новый, чтобы заменить.</p>
            )}
            <Input type="file" accept=".pdf,.doc,.docx" onChange={e => setFile(e.target.files?.[0] || null)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Отдел (опционально)</Label>
              <select
                value={departmentId}
                onChange={e => setDepartmentId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Все отделы</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Должность (опционально)</Label>
              <Input value={position} onChange={e => setPosition(e.target.value)} placeholder="Например: Разработчик" />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="p-6 border-t border-border/50 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isEdit ? 'Сохранить' : 'Создать'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({ title, message, confirmLabel, confirmVariant = 'default', loading, error, onConfirm, onClose }: {
  title: string
  message: string
  confirmLabel: string
  confirmVariant?: 'default' | 'destructive'
  loading?: boolean
  error?: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-muted-foreground">{message}</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>Отмена</Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Lint and typecheck**

```bash
npm run lint && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add pages/HROnboarding.tsx
git commit -m "feat: add HR onboarding management page"
```

---

## Task 7: Final Integration Check

- [ ] **Step 1: Start the full stack**

```bash
# Terminal 1
npm run dev
```

Expected: frontend at `localhost:5173`, backend at `localhost:5000` — no errors.

- [ ] **Step 2: Manual smoke test — Templates**

Login as HR user (e.g., `ivanov@example.com` / `password123`), navigate to `/hr/onboarding`:
- Go to "Шаблоны" tab → click "Создать шаблон"
- Enter title + text content → submit → template appears in list
- Edit template → verify changes saved
- Create another template with file upload → verify file saved

- [ ] **Step 3: Manual smoke test — Employee onboarding flow**

1. As HR: go to "Сотрудники" tab → click "Добавить сотрудника"
2. Fill in name, email (e.g., `new.employee@test.com`), password, position
3. Select templates → submit → new row appears in table
4. Click the row → detail modal shows documents

5. Open new browser tab → login as the new employee
6. Should be redirected to `/onboarding`
7. Verify welcome message, progress bar shows 0%
8. Open a document → read → click "Ознакомлен" → confirm
9. Verify progress updates
10. Acknowledge all documents → verify redirect to `/dashboard` with `employee` role

- [ ] **Step 4: Manual smoke test — Cancel onboarding**

1. As HR: open detail modal for an active onboarding
2. Click "Отменить онбординг" → confirm
3. Record disappears from list
4. The employee can no longer log in as `onboarding` (their role is now `employee`)

- [ ] **Step 5: Lint and typecheck one final time**

```bash
npm run lint && npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: onboarding system — full implementation"
```
