---
name: create-module
description: >
  Create a new module for the Worker Cabinet HR system. Use when the user asks to add a new
  feature module (e.g. "training", "goals", "assets"). Covers all layers: database migration,
  backend routes with Swagger docs, frontend page, routing, sidebar navigation, module toggle,
  and admin/HR panel integration. Follow the checklist step by step.
---

# Create a Worker Cabinet Module

Use this skill when the task is to add a new feature module to the Worker Cabinet HR system.
A module is a self-contained feature that can be toggled on/off by admins via the admin panel.

## Module Architecture Overview

A module touches **10 files** across 3 layers + 2 docs + manifest. Every module must be registered in all of them:

```
DB layer:       backend/src/db/migrate.js          — seed record in defaultModules
Backend layer:  backend/src/routes/<module>.js      — Express routes with Swagger JSDoc
                backend/src/server.js               — route registration + import
                backend/src/config/swagger.js       — tag definition
Frontend layer: modules/<code>/                     — module directory
                modules/<code>/pages/               — React page components
                modules/<code>/MODULE.md            — module manifest
                App.tsx                            — route with ModuleGuard
                components/layout/Sidebar.tsx       — nav item with module: 'code'
                pages/AdminPanel.tsx                — MODULE_COLORS entry
Docs:           AGENTS.md                          — route groups count + Swagger tags list
                README.md                          — route listing + test coverage table
```

Optional: `pages/HRPanel.tsx` and/or `pages/AdminPanel.tsx` tab if the module lives inside a panel.

## Pre-flight: Gather Module Specs

Before writing any code, confirm these with the user (or infer from context):

| Field | Example | Rules |
|-------|---------|-------|
| `code` | `training` | lowercase, snake_case, unique, used as the module identifier everywhere |
| `name` | `Обучение` | Russian, human-readable |
| `description` | `Курсы, сертификации, план развития` | Short Russian description |
| `icon` | `GraduationCap` | Lucide icon name (https://lucide.dev/icons) |
| `route` | `/training` | Frontend URL path |
| `sort_order` | `130` | Number for ordering in admin modules list |
| `category` | `work` | Category key: `hr`, `work`, `docs`, `admin`, `general` |
| `roles` | `employee, manager, hr` | Who sees it in sidebar |
| `panels` | `hr, admin` | Which panels should have a tab for it (optional) |
| `tag` | `Training` | Swagger tag name |

## Step-by-step Checklist

### Step 1: Database Migration

**File:** `backend/src/db/migrate.js`

Find the `defaultModules` array (search for `code: 'analytics'` to find the end) and append:

```javascript
{ code: '<CODE>', name: '<NAME>', description: '<DESCRIPTION>', icon: '<ICON>', route: '<ROUTE>', sort: <SORT_ORDER>, category: '<CATEGORY>' },
```

Run migration:
```bash
cd backend && npm run migrate
```

---

### Step 2: Backend Route File

**File:** `backend/src/routes/<code>.js` (create new file)

Use this template:

```javascript
import { Router } from 'express'
import { query, getClient } from '../config/database.js'
import { asyncHandler, ValidationError, NotFoundError, ForbiddenError } from '../middleware/errors.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'

const router = Router()

/**
 * @swagger
 * /<code>:
 *   get:
 *     tags: [<TAG>]
 *     summary: Получить список
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Список записей
 */
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM <table> ORDER BY created_at DESC')
  res.json(result.rows)
}))

/**
 * @swagger
 * /<code>:
 *   post:
 *     tags: [<TAG>]
 *     summary: Создать запись
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *     responses:
 *       201:
 *         description: Запись создана
 *       400:
 *         description: Ошибка валидации
 */
router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  const { name } = req.body
  if (!name?.trim()) throw new ValidationError('Название обязательно')

  const result = await query(
    'INSERT INTO <table> (name) VALUES ($1) RETURNING *',
    [name.trim()]
  )
  res.status(201).json(result.rows[0])
}))

/**
 * @swagger
 * /<code>/{id}:
 *   get:
 *     tags: [<TAG>]
 *     summary: Получить запись по ID
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Запись
 *       404:
 *         description: Не найдено
 */
router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM <table> WHERE id = $1', [req.params.id])
  if (result.rows.length === 0) throw new NotFoundError('Запись не найдена')
  res.json(result.rows[0])
}))

/**
 * @swagger
 * /<code>/{id}:
 *   put:
 *     tags: [<TAG>]
 *     summary: Обновить запись
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *     responses:
 *       200:
 *         description: Запись обновлена
 *       404:
 *         description: Не найдено
 */
router.put('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const { name } = req.body
  const result = await query(
    'UPDATE <table> SET name = $1 WHERE id = $2 RETURNING *',
    [name, req.params.id]
  )
  if (result.rows.length === 0) throw new NotFoundError('Запись не найдена')
  res.json(result.rows[0])
}))

/**
 * @swagger
 * /<code>/{id}:
 *   delete:
 *     tags: [<TAG>]
 *     summary: Удалить запись
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Запись удалена
 *       404:
 *         description: Не найдено
 */
router.delete('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const result = await query('DELETE FROM <table> WHERE id = $1 RETURNING id', [req.params.id])
  if (result.rows.length === 0) throw new NotFoundError('Запись не найдена')
  res.json({ success: true })
}))

export default router
```

**Swagger annotation rules:**
- Every route handler MUST have a `@swagger` JSDoc block before it
- YAML descriptions with colons must be quoted: `description: 'Доступ: admin, hr'`
- Use tags matching the tag defined in Step 4
- Include all response codes: 200, 201, 400, 401, 403, 404 as appropriate
- `security: [{ bearerAuth: [] }]` on all endpoints

**If the module needs new DB tables**, add them in `backend/src/db/migrate.js` before the modules section. Follow existing patterns:
- `CREATE TABLE IF NOT EXISTS`
- `$1, $2...` parameterized queries
- `RETURNING *` for INSERT/UPDATE
- Create indexes with `CREATE INDEX IF NOT EXISTS`
- Add updated_at trigger where needed

---

### Step 3: Register Route in Server

**File:** `backend/src/server.js`

Add import (after existing imports, alphabetical order):
```javascript
import <code>Routes from './routes/<code>.js'
```

Add route registration (after existing `app.use` lines):
```javascript
app.use('/api/<code>', <code>Routes)
```

---

### Step 4: Swagger Tag

**File:** `backend/src/config/swagger.js`

Add tag to the `tags` array:
```javascript
{ name: '<TAG>', description: '<RUSSIAN DESCRIPTION>' },
```

---

### Step 5: Frontend Page

**File:** `pages/<ModuleName>.tsx` (create new file)

```typescript
import { useState, useEffect } from 'react'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/lib/authHeaders'
import { getErrorMessage } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Loader2 } from 'lucide-react'

export function <ModuleName>() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchItems()
  }, [])

  const fetchItems = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/<code>`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Ошибка загрузки')
      setItems(await res.json())
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold"><NAME></h1>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground text-center py-8">
            Здесь будет содержимое модуля «<NAME>»
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
```

---

### Step 6: Route in App.tsx

**File:** `App.tsx`

1. Add import at top:
```typescript
import { <ModuleName> } from '@/pages/<ModuleName>'
```

2. Add route inside the `<Route path="/">` block (after existing routes):
```tsx
<Route path="<route>" element={<ModuleGuard module="<code>"><<AuthRoute>><<ModuleName> /></<AuthRoute>></ModuleGuard>} />
```

Where `<AuthRoute>` is one of:
- `ProtectedRoute` — any authenticated user
- `BlockOnboardingRoute` — all except onboarding role
- `AdminRoute` — admin only
- `HRRoute` — HR and admin
- `ManagerRoute` — manager and above

For sub-routes:
```tsx
<Route path="<route>/:id" element={<ModuleGuard module="<code>"><<AuthRoute>><<ModuleDetail> /></<AuthRoute>></ModuleGuard>} />
```

---

### Step 7: Sidebar Navigation

**File:** `components/layout/Sidebar.tsx`

Add a NavItem with `module` property to the appropriate navigation functions:

**For all employees** — `getEmployeeNavigation()`:
```typescript
{ name: '<NAME>', href: '<ROUTE>', icon: <Icon>, module: '<CODE>' },
```

**For managers** — `getManagerNavigation()`:
```typescript
{ name: '<NAME>', href: '<ROUTE>', icon: <Icon>, module: '<CODE>' },
```

**For HR** — `getHRNavigation()`:
```typescript
{ name: '<NAME>', href: '<ROUTE>', icon: <Icon>, module: '<CODE>' },
```

**For admins** — `getAdminNavigation()`:
```typescript
{ name: '<NAME>', href: '<ROUTE>', icon: <Icon>, module: '<CODE>' },
```

Import the icon from `lucide-react` at the top of the file.

**Important:** The sidebar already filters items by module — just add the `module` property. Items with `module` are hidden when the module is disabled.

---

### Step 8: Admin Panel — Module Color

**File:** `pages/AdminPanel.tsx`

Add to `MODULE_COLORS` map:
```typescript
<CODE>: { active: 'from-<COLOR1>-500 to-<COLOR2>-600', inactive: 'bg-<COLOR1>-100 dark:bg-<COLOR1>-900/30', icon: 'text-<COLOR1>-600 dark:text-<COLOR1>-400' },
```

Suggested color palette (pick one not already used):
- `rose` / `pink` / `fuchsia`
- `lime` / `green` / `emerald` (taken)
- `sky` / `blue` / `indigo` (taken)
- `yellow` / `amber` (taken)
- `red` (taken) / `orange` (taken)
- `teal` / `cyan` (taken)
- `violet` / `purple` (taken)

---

### Step 8.5: Module Manifest

**File:** `modules/<code>/MODULE.md`

Create a MODULE.md manifest following the template below. This file provides AI agents with context about the module.

```markdown
# Модуль: <NAME>

## Основная информация

- **Код**: `<code>`
- **Категория**: `<CATEGORY>`
- **Маршрут**: `<ROUTE>`
- **Иконка**: `<ICON>`
- **Сортировка**: `<SORT_ORDER>`
- **Описание**: `<DESCRIPTION>`

## Файловая структура

\`\`\`
modules/<code>/
└── pages/
    └── <ModuleName>.tsx
\`\`\`

## API эндпоинты

**Файл**: `backend/src/routes/<code>.js`

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/<code>/` | <roles> | Описание |
| POST | `/api/<code>/` | <roles> | Создать |
| GET | `/api/<code>/:id` | <roles> | Получить по ID |
| PUT | `/api/<code>/:id` | <roles> | Обновить |
| DELETE | `/api/<code>/:id` | <roles> | Удалить |

## Роли и доступ

| Роль | Доступ |
|------|--------|
| employee | Описание доступа |
| manager | Описание доступа |
| hr | Описание доступа |
| admin | Описание доступа |
| onboarding | Описание доступа |

## Зависимости

**Frontend**:
- `@/shared/lib/*`
- `@/shared/components/ui/*`

**Backend**:
- (специфичные зависимости)
```

Fill in all sections with actual data. Reference existing MODULE.md files in `modules/` and `core/` for examples.

---

### Optional: Panel Tabs

If the module should appear as a tab inside HR Panel or Admin Panel:

**HRPanel.tsx:**
1. Add `module` property to `TabItem` is already supported
2. Add entry to `TAB_GROUPS` in the appropriate group:
```typescript
{ id: '<code>', name: '<NAME>', icon: <Icon>, description: '<DESCRIPTION>', color: 'from-<C1>-500 to-<C2>-600', module: '<CODE>' },
```
3. Add to render map:
```typescript
['<code>', <Component>],
```
4. Update `TabId` type union to include `'<code>'`

**AdminPanel.tsx:**
Same pattern — add to `TAB_GROUPS`, render map, and `TabId` type.

---

### Step 9: Update AGENTS.md

**File:** `AGENTS.md`

1. Update route groups count — find the line with `**N route groups**` and increment the number:
```
**15 route groups** → **16 route groups**
```

2. Update Swagger tags list — find the Tags line and append the new tag:
```
- Tags: Auth, Users, Vacation, ..., Calendar, <TAG>
```

---

### Step 10: Update README.md

**File:** `README.md`

1. Update route listing in project structure — find the `routes/` comment block and add `<code>`:
```
│       ├── routes/           # auth, vacation, users, departments, projects,
│       │                     # surveys, onboarding, documents, notifications,
│       │                     # hierarchy, dictionaries, timesheet, calendar, <code>
```

2. Update route groups count — find `все N групп маршрутов` and increment:
```
Тесты покрывают все 16 групп маршрутов → все 17 групп маршрутов
```

3. If tests are added, update the test commands and coverage table — add:
```bash
  src/tests/<code>.test.js \
```
And add a row to the coverage table:
```
| `<code>.test.js` | N | `/<code>/*` (...) |
```

---

## Verification Checklist

After completing all steps, run:

```bash
cd backend && npm run migrate                  # Apply DB changes
cd backend && node --test src/tests/<test>.js  # Run tests if any
npm run lint && npm run typecheck              # Frontend checks
npm run dev                                    # Start and verify
```

Then verify:
- [ ] Module appears in Admin Panel → Modules with toggle
- [ ] Sidebar shows/hides nav item when toggled
- [ ] MODULE.md manifest created in module directory
- [ ] Direct URL access redirects to `/dashboard` when module is off
- [ ] Swagger docs at `/api-docs` show new endpoints
- [ ] AGENTS.md route groups count and tags list updated
- [ ] README.md routes listing and test coverage updated
- [ ] No console errors

---

## Module Removal Checklist

To remove a module, reverse all steps:

1. Remove from `defaultModules` in `migrate.js` (note: existing DB row stays until manually deleted)
2. Delete `backend/src/routes/<code>.js`
3. Remove import + `app.use` from `server.js`
4. Remove tag from `swagger.js`
5. Delete `modules/<code>/` directory (including MODULE.md)
6. Remove route from `App.tsx`
7. Remove nav items from `Sidebar.tsx`
8. Remove from `MODULE_COLORS` in `AdminPanel.tsx`
9. Remove from `TAB_GROUPS` in `HRPanel.tsx` / `AdminPanel.tsx` if present
10. Delete DB table if needed: `DROP TABLE IF EXISTS <table>`
11. Update `AGENTS.md` — decrement route groups count, remove tag from Tags list
12. Update `README.md` — remove from routes listing, test commands, coverage table; update route groups count

---

## Example: Creating a "Training" Module

Here's a complete walkthrough for a hypothetical `training` module:

### Specs
- code: `training`, name: `Обучение`, icon: `GraduationCap`, route: `/training`
- sort: 130, category: `work`, tag: `Training`, roles: all, panels: HR

### Step 1: migrate.js
```javascript
{ code: 'training', name: 'Обучение', description: 'Курсы, сертификации, план развития', icon: 'GraduationCap', route: '/training', sort: 130, category: 'work' },
```

### Step 2: backend/src/routes/training.js
Full CRUD with Swagger annotations, tag: `[Training]`

### Step 3: server.js
```javascript
import trainingRoutes from './routes/training.js'
app.use('/api/training', trainingRoutes)
```

### Step 4: swagger.js
```javascript
{ name: 'Training', description: 'Обучение и развитие сотрудников' },
```

### Step 5: pages/Training.tsx
```typescript
export function Training() { ... }
```

### Step 6: App.tsx
```tsx
import { Training } from '@/pages/Training'
<Route path="training" element={<ModuleGuard module="training"><BlockOnboardingRoute><Training /></BlockOnboardingRoute></ModuleGuard>} />
```

### Step 7: Sidebar.tsx
```typescript
import { GraduationCap } from 'lucide-react'
{ name: 'Обучение', href: '/training', icon: GraduationCap, module: 'training' },
```
Added to: `getEmployeeNavigation`, `getManagerNavigation`, `getHRNavigation`, `getAdminNavigation`

### Step 8: AdminPanel.tsx
```typescript
training: { active: 'from-lime-500 to-green-600', inactive: 'bg-lime-100 dark:bg-lime-900/30', icon: 'text-lime-600 dark:text-lime-400' },
```

### HRPanel.tsx tab
```typescript
{ id: 'training', name: 'Обучение', icon: GraduationCap, description: 'Курсы и развитие', color: 'from-lime-500 to-green-600', module: 'training' },
```

### Run verification
```bash
cd backend && npm run migrate
npm run lint && npm run typecheck
npm run dev
```
