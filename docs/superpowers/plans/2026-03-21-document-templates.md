# Document Templates Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real backend for document templates (replacing mock data) and an HR-only management page with upload, metadata editing, deletion, and OnlyOffice editing.

**Architecture:** New `document_templates` table in PostgreSQL + S3/MinIO storage. Backend `templates.js` routes + `templateService.js`. Frontend HR page `HRDocumentTemplates.tsx` with three modals. Existing `DocumentTemplates.tsx` (employee-facing) switches from mock to real API. OnlyOffice editing reuses the existing modal with a new `editable` prop.

**Tech Stack:** Node.js/Express, PostgreSQL, AWS S3 SDK (MinIO), React 18 + TypeScript, Zustand (auth only), Tailwind CSS, existing `OnlyOfficePreviewModal`

**Spec:** `docs/superpowers/specs/2026-03-21-hr-panel-design.md` — Pages 2 & "Page 2" section

---

## File Map

**Create:**
- `backend/src/services/templateService.js` — S3 ops + OnlyOffice callback
- `backend/src/routes/templates.js` — Express routes
- `backend/src/tests/templates.test.js` — backend tests
- `services/templateApi.ts` — frontend API client
- `components/modals/UploadTemplateModal.tsx`
- `components/modals/EditTemplateMetaModal.tsx`
- `pages/HRDocumentTemplates.tsx`

**Modify:**
- `backend/src/db/migrate.js` — add `document_templates` table
- `backend/src/middleware/upload.js` — add 20MB template upload instance
- `backend/src/server.js` — register `/api/templates`
- `components/modals/OnlyOfficePreviewModal.tsx` — add `editable?: boolean` prop
- `pages/DocumentTemplates.tsx` — replace mock with real API
- `App.tsx` — add `HRRoute` component + `/hr/document-templates` route
- `components/layout/Sidebar.tsx` — add `getHRNavigation()` + update selector
- `types/index.ts` — add `DocumentTemplate` interface

---

## Task 1: Database Migration

**Files:** Modify `backend/src/db/migrate.js`

- [ ] **Add `document_templates` table** to the end of `runMigrations()`, before the final `console.log('✅ Tables created')`:

```javascript
await db.query(`
  CREATE TABLE IF NOT EXISTS document_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL CHECK (category IN ('hr', 'legal', 'finance', 'general')),
    file_key TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INT NOT NULL,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    download_count INT DEFAULT 0
  )
`).catch(e => console.log('  - document_templates:', e.message))
console.log('  ✓ document_templates')
```

- [ ] **Run migration:**
```bash
cd backend && npm run migrate
```
Expected output includes: `✓ document_templates`

- [ ] **Commit:**
```bash
git add backend/src/db/migrate.js
git commit -m "feat: add document_templates table migration"
```

---

## Task 2: Upload Middleware — 20MB Limit

**Files:** Modify `backend/src/middleware/upload.js`

- [ ] **Add a second multer instance** for templates at the end of the file (keep existing `upload` unchanged):

```javascript
export const uploadTemplate = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Допустимы только .pdf и .docx файлы'))
    }
  },
})
```

- [ ] **Commit:**
```bash
git add backend/src/middleware/upload.js
git commit -m "feat: add 20MB template upload middleware"
```

---

## Task 3: templateService.js

**Files:** Create `backend/src/services/templateService.js`

- [ ] **Write the service:**

```javascript
import { query } from '../config/database.js'
import { uploadToS3, deleteFromS3, getS3FileUrl } from '../config/s3.js'
import https from 'https'
import http from 'http'

export async function uploadTemplate(file, { name, description, category }, userId) {
  const safeName = file.originalname.replace(/\s+/g, '_')
  const fileKey = `templates/${Date.now()}-${safeName}`
  await uploadToS3(file, fileKey)
  const result = await query(
    `INSERT INTO document_templates (name, description, category, file_key, mime_type, size, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [name, description || null, category, fileKey, file.mimetype, file.size, userId]
  )
  return result.rows[0]
}

export async function deleteTemplate(id) {
  const tmpl = await query('SELECT file_key FROM document_templates WHERE id = $1', [id])
  if (!tmpl.rows.length) throw new Error('Шаблон не найден')
  await deleteFromS3(tmpl.rows[0].file_key)
  await query('DELETE FROM document_templates WHERE id = $1', [id])
}

export function getTemplateUrl(fileKey) {
  return getS3FileUrl(fileKey)
}

export async function handleOnlyOfficeCallback(id, body) {
  if (body.status !== 2) return // not a "ready to save" event
  const tmpl = await query('SELECT file_key FROM document_templates WHERE id = $1', [id])
  if (!tmpl.rows.length) throw new Error('Шаблон не найден')
  const fileBuffer = await downloadUrl(body.url)
  const fakeFile = {
    buffer: fileBuffer,
    mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
  await uploadToS3(fakeFile, tmpl.rows[0].file_key)
}

function downloadUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    lib.get(url, (res) => {
      // Follow redirects (OnlyOffice callback URL may redirect to signed S3 URL)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(downloadUrl(res.headers.location))
        return
      }
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}
```

- [ ] **Commit:**
```bash
git add backend/src/services/templateService.js
git commit -m "feat: add templateService (S3 upload/delete, OnlyOffice callback)"
```

---

## Task 4: Backend Routes — templates.js

**Files:** Create `backend/src/routes/templates.js`

- [ ] **Write the route file:**

```javascript
import express from 'express'
import { query } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { uploadTemplate as uploadMiddleware } from '../middleware/upload.js'
import {
  uploadTemplate,
  deleteTemplate,
  getTemplateUrl,
  handleOnlyOfficeCallback,
} from '../services/templateService.js'

const router = express.Router()

// GET /api/templates — list all (any authenticated user)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, description, category, mime_type as "mimeType",
              size, download_count as "downloadCount", created_at as "createdAt",
              file_key as "fileKey"
       FROM document_templates
       ORDER BY created_at DESC`
    )
    const templates = result.rows.map((t) => ({
      ...t,
      url: getTemplateUrl(t.fileKey),
    }))
    res.json(templates)
  } catch (error) {
    console.error('GET /templates error:', error)
    res.status(500).json({ error: 'Ошибка загрузки шаблонов' })
  }
})

// POST /api/templates — upload (HR/admin only)
router.post(
  '/',
  authenticateToken,
  authorizeRoles('hr', 'admin'),
  uploadMiddleware.single('file'),
  async (req, res) => {
    try {
      const { name, description, category } = req.body
      if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' })
      if (!['hr', 'legal', 'finance', 'general'].includes(category)) {
        return res.status(400).json({ error: 'Недопустимая категория' })
      }
      if (!req.file) return res.status(400).json({ error: 'Файл обязателен' })

      const template = await uploadTemplate(req.file, { name, description, category }, req.user.id)
      res.status(201).json({ ...template, url: getTemplateUrl(template.file_key) })
    } catch (error) {
      console.error('POST /templates error:', error)
      res.status(500).json({ error: 'Ошибка загрузки шаблона' })
    }
  }
)

// PUT /api/templates/:id — update metadata (HR/admin only)
router.put('/:id', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, category } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' })
    if (!['hr', 'legal', 'finance', 'general'].includes(category)) {
      return res.status(400).json({ error: 'Недопустимая категория' })
    }
    const result = await query(
      `UPDATE document_templates SET name = $1, description = $2, category = $3
       WHERE id = $4 RETURNING *`,
      [name, description || null, category, id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Шаблон не найден' })
    res.json({ ...result.rows[0], url: getTemplateUrl(result.rows[0].file_key) })
  } catch (error) {
    console.error('PUT /templates/:id error:', error)
    res.status(500).json({ error: 'Ошибка обновления шаблона' })
  }
})

// DELETE /api/templates/:id (HR/admin only)
router.delete('/:id', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    await deleteTemplate(req.params.id)
    res.json({ success: true })
  } catch (error) {
    console.error('DELETE /templates/:id error:', error)
    res.status(500).json({ error: 'Ошибка удаления шаблона' })
  }
})

// GET /api/templates/:id/onlyoffice — get S3 URL for OnlyOffice edit (HR/admin only)
router.get('/:id/onlyoffice', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const result = await query(
      'SELECT id, file_key, name, mime_type FROM document_templates WHERE id = $1',
      [req.params.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Шаблон не найден' })
    const t = result.rows[0]
    res.json({
      url: getTemplateUrl(t.file_key),
      key: `template-${t.id}-${Date.now()}`,
      name: t.name,
      mimeType: t.mime_type,
    })
  } catch (error) {
    console.error('GET /templates/:id/onlyoffice error:', error)
    res.status(500).json({ error: 'Ошибка получения URL' })
  }
})

// POST /api/templates/:id/onlyoffice/callback — called by OnlyOffice server (no auth)
router.post('/:id/onlyoffice/callback', async (req, res) => {
  try {
    await handleOnlyOfficeCallback(req.params.id, req.body)
    res.json({ error: 0 })
  } catch (error) {
    console.error('OnlyOffice callback error:', error)
    res.json({ error: 1 })
  }
})

// POST /api/templates/:id/download — increment counter + return URL
router.post('/:id/download', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `UPDATE document_templates SET download_count = download_count + 1
       WHERE id = $1 RETURNING file_key`,
      [req.params.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Шаблон не найден' })
    res.json({ url: getTemplateUrl(result.rows[0].file_key) })
  } catch (error) {
    console.error('POST /templates/:id/download error:', error)
    res.status(500).json({ error: 'Ошибка' })
  }
})

export default router
```

- [ ] **Commit:**
```bash
git add backend/src/routes/templates.js
git commit -m "feat: add templates CRUD routes with OnlyOffice callback"
```

---

## Task 5: Register Route in server.js

**Files:** Modify `backend/src/server.js`

- [ ] **Add import** after the existing imports (e.g. after `departmentsRoutes`):

```javascript
import templatesRoutes from './routes/templates.js'
```

- [ ] **Register route** after `app.use('/api/departments', departmentsRoutes)`:

```javascript
app.use('/api/templates', templatesRoutes)
```

- [ ] **Restart backend and verify:**
```bash
cd backend && npm run dev
# In another terminal:
curl http://localhost:5000/api/health
```
Expected: `{"status":"ok",...}`

- [ ] **Commit:**
```bash
git add backend/src/server.js
git commit -m "feat: register /api/templates route"
```

---

## Task 6: Backend Tests

**Files:** Create `backend/src/tests/templates.test.js`

- [ ] **Write tests** (requires a running backend + DB with seeded data — run `npm run dev` first):

```javascript
import { describe, it, before } from 'node:test'
import assert from 'node:assert'

const BASE = 'http://localhost:5000/api'

async function login(email) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  })
  const data = await res.json()
  return data.token
}

describe('Templates API', () => {
  let hrToken
  let employeeToken

  before(async () => {
    // Seeded users: ivanov@example.com (employee), hr@example.com (hr)
    // If seed emails differ, update below accordingly
    employeeToken = await login('ivanov@example.com')
    hrToken = await login('hr@example.com')
  })

  it('GET /templates returns array for authenticated user', async () => {
    const res = await fetch(`${BASE}/templates`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
  })

  it('GET /templates returns 401 without token', async () => {
    const res = await fetch(`${BASE}/templates`)
    assert.strictEqual(res.status, 401)
  })

  it('POST /templates returns 403 for employee role', async () => {
    const formData = new FormData()
    formData.append('name', 'Test')
    formData.append('category', 'hr')
    const res = await fetch(`${BASE}/templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${employeeToken}` },
      body: formData,
    })
    assert.strictEqual(res.status, 403)
  })

  it('GET /templates returns 200 for HR user', async () => {
    const res = await fetch(`${BASE}/templates`, {
      headers: { Authorization: `Bearer ${hrToken}` },
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data))
  })

  it('PUT /templates/:id returns 403 for employee role', async () => {
    // Get any template ID first
    const listRes = await fetch(`${BASE}/templates`, {
      headers: { Authorization: `Bearer ${hrToken}` },
    })
    const templates = await listRes.json()
    if (!templates.length) return // no templates to test with
    const res = await fetch(`${BASE}/templates/${templates[0].id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${employeeToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hack', category: 'hr' }),
    })
    assert.strictEqual(res.status, 403)
  })
})
```

- [ ] **Run tests** (backend must be running):
```bash
cd backend && node --test src/tests/templates.test.js
```
Expected: all tests pass

- [ ] **Commit:**
```bash
git add backend/src/tests/templates.test.js
git commit -m "test: add templates API tests"
```

---

## Task 7: TypeScript Type — DocumentTemplate

**Files:** Modify `types/index.ts`

- [ ] **Add interface** after the `Document` interface:

```typescript
export interface DocumentTemplate {
  id: number
  name: string
  description?: string
  category: 'hr' | 'legal' | 'finance' | 'general'
  fileKey: string
  mimeType: string
  size: number
  downloadCount: number
  createdAt: string
  url: string
}
```

- [ ] **Commit:**
```bash
git add types/index.ts
git commit -m "feat: add DocumentTemplate type"
```

---

## Task 8: Frontend API Client — templateApi.ts

**Files:** Create `services/templateApi.ts`

- [ ] **Write the service:**

```typescript
import { API_BASE_URL } from '@/lib/api'
import { getAuthHeaders } from '@/lib/authHeaders'
import type { DocumentTemplate } from '@/types'

export const templateApi = {
  async list(): Promise<DocumentTemplate[]> {
    const res = await fetch(`${API_BASE_URL}/templates`, {
      headers: getAuthHeaders(),
    })
    if (!res.ok) throw new Error('Ошибка загрузки шаблонов')
    return res.json()
  },

  async upload(formData: FormData): Promise<DocumentTemplate> {
    const res = await fetch(`${API_BASE_URL}/templates`, {
      method: 'POST',
      headers: getAuthHeaders(), // no Content-Type — browser sets multipart boundary
      body: formData,
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Ошибка загрузки')
    }
    return res.json()
  },

  async update(id: number, data: { name: string; description?: string; category: string }): Promise<DocumentTemplate> {
    const res = await fetch(`${API_BASE_URL}/templates/${id}`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(d.error || 'Ошибка обновления')
    }
    return res.json()
  },

  async remove(id: number): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/templates/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Ошибка удаления')
    }
  },

  async getOnlyOfficeInfo(id: number): Promise<{ url: string; key: string; name: string; mimeType: string }> {
    const res = await fetch(`${API_BASE_URL}/templates/${id}/onlyoffice`, {
      headers: getAuthHeaders(),
    })
    if (!res.ok) throw new Error('Ошибка получения URL')
    return res.json()
  },

  async incrementDownload(id: number): Promise<{ url: string }> {
    const res = await fetch(`${API_BASE_URL}/templates/${id}/download`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })
    if (!res.ok) throw new Error('Ошибка')
    return res.json()
  },
}
```

- [ ] **Commit:**
```bash
git add services/templateApi.ts
git commit -m "feat: add templateApi frontend service"
```

---

## Task 9: OnlyOfficePreviewModal — add editable prop

**Files:** Modify `components/modals/OnlyOfficePreviewModal.tsx`

- [ ] **Add `editable` to the props interface** (line ~7):

```typescript
interface OnlyOfficePreviewModalProps {
  open: boolean
  onClose: () => void
  editable?: boolean          // ← add this
  callbackUrl?: string        // ← add this
  document: {
    id: string
    name: string
    mimeType: string
    url: string | (() => Promise<string>)
    size?: number
  }
}
```

- [ ] **Destructure new props** in the function signature:

```typescript
export function OnlyOfficePreviewModal({ open, onClose, editable = false, callbackUrl = '', document: doc }: OnlyOfficePreviewModalProps) {
```

- [ ] **Update the config object** inside `initEditor` (~line 101). Replace the static `permissions` and `editorConfig` blocks:

```typescript
const config = {
  document: {
    fileType: fileType,
    key: key,
    title: doc.name,
    url: fileUrl,
    permissions: {
      edit: editable,
      download: true,
      print: true,
    },
  },
  editorConfig: {
    lang: 'ru',
    mode: editable ? 'edit' : 'view',
    callbackUrl: editable ? callbackUrl : '',
    user: {
      id: 'preview-user',
      name: 'Preview User',
    },
  },
  height: '100%',
  width: '100%',
  type: 'desktop',
}
```

- [ ] **Verify typecheck passes:**
```bash
npm run typecheck
```

- [ ] **Commit:**
```bash
git add components/modals/OnlyOfficePreviewModal.tsx
git commit -m "feat: add editable prop to OnlyOfficePreviewModal"
```

---

## Task 10: UploadTemplateModal

**Files:** Create `components/modals/UploadTemplateModal.tsx`

- [ ] **Write the modal:**

```typescript
import { useState, useRef } from 'react'
import { X, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { templateApi } from '@/services/templateApi'
import { getErrorMessage } from '@/lib/utils'

const CATEGORIES = [
  { value: 'hr', label: 'HR' },
  { value: 'legal', label: 'Юридические' },
  { value: 'finance', label: 'Финансы' },
  { value: 'general', label: 'Общие' },
]

interface Props {
  open: boolean
  onClose: () => void
  onUploaded: () => void
}

export function UploadTemplateModal({ open, onClose, onUploaded }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('hr')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (f && f.size > 20 * 1024 * 1024) {
      setError('Файл не должен превышать 20 МБ')
      return
    }
    setFile(f)
    setError(null)
    if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return setError('Выберите файл')
    if (!name.trim()) return setError('Введите название')
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', name.trim())
      formData.append('description', description.trim())
      formData.append('category', category)
      await templateApi.upload(formData)
      onUploaded()
      onClose()
      setName(''); setDescription(''); setFile(null)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Загрузить шаблон</h2>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div
            className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            {file ? (
              <p className="text-sm font-medium">{file.name}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Нажмите для выбора .docx или .pdf (макс. 20 МБ)</p>
            )}
            <input ref={fileRef} type="file" accept=".docx,.pdf" className="hidden" onChange={handleFileChange} />
          </div>

          <div>
            <Label>Название *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Трудовой договор" />
          </div>

          <div>
            <Label>Описание</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Необязательно" />
          </div>

          <div>
            <Label>Категория *</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? 'Загрузка...' : 'Загрузить'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Run typecheck:**
```bash
npm run typecheck
```

- [ ] **Commit:**
```bash
git add components/modals/UploadTemplateModal.tsx
git commit -m "feat: add UploadTemplateModal"
```

---

## Task 11: EditTemplateMetaModal

**Files:** Create `components/modals/EditTemplateMetaModal.tsx`

- [ ] **Write the modal:**

```typescript
import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { templateApi } from '@/services/templateApi'
import { getErrorMessage } from '@/lib/utils'
import type { DocumentTemplate } from '@/types'

const CATEGORIES = [
  { value: 'hr', label: 'HR' },
  { value: 'legal', label: 'Юридические' },
  { value: 'finance', label: 'Финансы' },
  { value: 'general', label: 'Общие' },
]

interface Props {
  open: boolean
  onClose: () => void
  template: DocumentTemplate | null
  onSaved: () => void
}

export function EditTemplateMetaModal({ open, onClose, template, onSaved }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('hr')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (template) {
      setName(template.name)
      setDescription(template.description ?? '')
      setCategory(template.category)
    }
  }, [template])

  if (!open || !template) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Введите название')
    setLoading(true)
    setError(null)
    try {
      await templateApi.update(template.id, { name: name.trim(), description: description.trim(), category })
      onSaved()
      onClose()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Редактировать шаблон</h2>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Название *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Описание</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label>Категория *</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Commit:**
```bash
git add components/modals/EditTemplateMetaModal.tsx
git commit -m "feat: add EditTemplateMetaModal"
```

---

## Task 12: HRDocumentTemplates Page

**Files:** Create `pages/HRDocumentTemplates.tsx`

- [ ] **Write the page:**

```typescript
import { useState, useEffect, useCallback } from 'react'
import { Upload, Pencil, Trash2, FileText, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { ConfirmModal } from '@/components/modals/ConfirmModal'
import { OnlyOfficePreviewModal } from '@/components/modals/OnlyOfficePreviewModal'
import { UploadTemplateModal } from '@/components/modals/UploadTemplateModal'
import { EditTemplateMetaModal } from '@/components/modals/EditTemplateMetaModal'
import { templateApi } from '@/services/templateApi'
import { getErrorMessage, formatDate } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/api'
import type { DocumentTemplate } from '@/types'

const CATEGORY_LABELS: Record<string, string> = {
  hr: 'HR', legal: 'Юридические', finance: 'Финансы', general: 'Общие',
}
const CATEGORIES = ['all', 'hr', 'legal', 'finance', 'general']

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

export function HRDocumentTemplates() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')

  const [showUpload, setShowUpload] = useState(false)
  const [editTarget, setEditTarget] = useState<DocumentTemplate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DocumentTemplate | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [onlyOfficeDoc, setOnlyOfficeDoc] = useState<{
    id: number; name: string; mimeType: string; url: string; size?: number
  } | null>(null)
  const [onlyOfficeEditable, setOnlyOfficeEditable] = useState(false)
  const [onlyOfficeCallback, setOnlyOfficeCallback] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await templateApi.list()
      setTemplates(data)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = templates.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = category === 'all' || t.category === category
    return matchesSearch && matchesCategory
  })

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      await templateApi.remove(deleteTarget.id)
      setTemplates((prev) => prev.filter((t) => t.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleOpenOnlyOffice = async (template: DocumentTemplate, editable: boolean) => {
    try {
      const info = await templateApi.getOnlyOfficeInfo(template.id)
      setOnlyOfficeDoc({ id: template.id, name: info.name, mimeType: info.mimeType, url: info.url, size: template.size })
      setOnlyOfficeEditable(editable)
      setOnlyOfficeCallback(editable ? `${API_BASE_URL}/templates/${template.id}/onlyoffice/callback` : '')
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    }
  }

  const isDocx = (t: DocumentTemplate) =>
    t.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    t.mimeType === 'application/msword'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Шаблоны документов</h1>
          <p className="text-muted-foreground text-sm mt-1">Управление шаблонами для сотрудников</p>
        </div>
        <Button onClick={() => setShowUpload(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Загрузить шаблон
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Поиск по названию..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                category === c
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {c === 'all' ? 'Все' : CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Загрузка...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p>Шаблоны не найдены</p>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Шаблоны ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {filtered.map((t) => (
                <div key={t.id} className="flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors">
                  <div className={`w-10 h-12 rounded flex items-center justify-center text-xs font-bold text-white ${
                    t.mimeType === 'application/pdf' ? 'bg-red-600' : 'bg-blue-600'
                  }`}>
                    {t.mimeType === 'application/pdf' ? 'PDF' : 'DOC'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{t.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {CATEGORY_LABELS[t.category]} · {formatFileSize(t.size)} · {t.downloadCount} скачиваний
                    </p>
                  </div>
                  <Badge variant="outline">{CATEGORY_LABELS[t.category]}</Badge>
                  <div className="flex items-center gap-2">
                    {isDocx(t) ? (
                      <Button size="sm" variant="outline" onClick={() => handleOpenOnlyOffice(t, true)}>
                        <ExternalLink className="h-3 w-3 mr-1" />
                        OnlyOffice
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => handleOpenOnlyOffice(t, false)}>
                        Просмотр
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEditTarget(t)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(t)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <UploadTemplateModal open={showUpload} onClose={() => setShowUpload(false)} onUploaded={load} />
      <EditTemplateMetaModal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        template={editTarget}
        onSaved={load}
      />
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleteLoading}
        title="Удалить шаблон"
        description={`Вы уверены, что хотите удалить "${deleteTarget?.name}"? Это действие нельзя отменить.`}
      />
      {onlyOfficeDoc && (
        <OnlyOfficePreviewModal
          open={!!onlyOfficeDoc}
          onClose={() => setOnlyOfficeDoc(null)}
          document={onlyOfficeDoc}
          editable={onlyOfficeEditable}
          callbackUrl={onlyOfficeCallback}
        />
      )}
    </div>
  )
}
```

- [ ] **Run typecheck:**
```bash
npm run typecheck
```

- [ ] **Commit:**
```bash
git add pages/HRDocumentTemplates.tsx
git commit -m "feat: add HRDocumentTemplates page"
```

---

## Task 13: Connect DocumentTemplates.tsx to Real API

**Files:** Modify `pages/DocumentTemplates.tsx`

- [ ] **Read `pages/DocumentTemplates.tsx`** — look for a `const MOCK_TEMPLATES` array or `useState` initialised with hard-coded template objects. Note the component's state variable name (likely `templates`) and any existing download handler.
- [ ] **Replace the mock data fetch** with a real API call. Remove the mock array and replace the component's data loading with:

```typescript
// Add import at top:
import { templateApi } from '@/services/templateApi'
import { getErrorMessage } from '@/lib/utils'
import type { DocumentTemplate } from '@/types'

// Replace mock state with:
const [templates, setTemplates] = useState<DocumentTemplate[]>([])
const [loading, setLoading] = useState(true)
const [error, setError] = useState<string | null>(null)

useEffect(() => {
  templateApi.list()
    .then(setTemplates)
    .catch((err: unknown) => setError(getErrorMessage(err)))
    .finally(() => setLoading(false))
}, [])
```

- [ ] **For download buttons**, replace mock counter increment with:
```typescript
const handleDownload = async (id: number) => {
  try {
    const { url } = await templateApi.incrementDownload(id)
    window.open(url, '_blank')
  } catch (err: unknown) {
    console.error(err)
  }
}
```

- [ ] **Run lint and typecheck:**
```bash
npm run lint && npm run typecheck
```

- [ ] **Commit:**
```bash
git add pages/DocumentTemplates.tsx
git commit -m "feat: connect DocumentTemplates to real API"
```

---

## Task 14: App.tsx — HRRoute + Routes

**Files:** Modify `App.tsx`

- [ ] **Add import** for the new page:
```typescript
import { HRDocumentTemplates } from '@/pages/HRDocumentTemplates'
```

- [ ] **Add `HRRoute` component** after the existing `ProtectedRoute` component (before the `App` function):

```typescript
function HRRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const loading = useAuthStore((state) => state.loading)
  if (loading) return null
  if (!['hr', 'admin'].includes(user?.role ?? ''))
    return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
```

- [ ] **Add route** inside the Layout route, after the existing routes:

```tsx
<Route path="hr/document-templates" element={<HRRoute><HRDocumentTemplates /></HRRoute>} />
```

> **Note for surveys plan:** `HRRoute` is defined once here. The surveys plan (Plan 2) must NOT re-define `HRRoute` — it should only add additional `<Route>` entries inside the existing `Layout` route.

- [ ] **Run typecheck:**
```bash
npm run typecheck
```

- [ ] **Commit:**
```bash
git add App.tsx
git commit -m "feat: add HRRoute and /hr/document-templates route"
```

---

## Task 15: Sidebar — HR Navigation

**Files:** Modify `components/layout/Sidebar.tsx`

- [ ] **Add `ClipboardList` to imports** from lucide-react (line ~7):
```typescript
import { ..., ClipboardList } from 'lucide-react'
```

- [ ] **Add `getHRNavigation` function** after `getManagerNavigation`:

```typescript
const getHRNavigation = (userId?: string): NavItem[] => [
  { name: 'Дашборд', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Опросы', href: '/hr/surveys', icon: ClipboardList },
  { name: 'Сотрудники', href: '/employees', icon: Users },
  { name: 'Отделы', href: '/departments', icon: Building2 },
  {
    name: 'Документы',
    icon: FolderOpen,
    children: [
      { name: 'Шаблоны', href: '/hr/document-templates' },
      { name: 'Ваши документы', href: '/documents' },
    ],
  },
  { name: 'Уведомления', href: '/notifications', icon: Bell },
]
```

> **Note:** `/hr/surveys` route does not exist yet at this stage — it will be added by Plan 2 (surveys). The nav item is correct now so HR users see the full navigation from the start.

- [ ] **Update the navigation selector** (line ~83). Replace current line:
```typescript
// Before:
const navigation = user?.role === 'manager' ? getManagerNavigation(user?.id) : getEmployeeNavigation(user?.id)

// After:
const navigation =
  user?.role === 'manager' ? getManagerNavigation(user?.id) :
  ['hr', 'admin'].includes(user?.role ?? '') ? getHRNavigation(user?.id) :
  getEmployeeNavigation(user?.id)
```

- [ ] **Run lint and typecheck:**
```bash
npm run lint && npm run typecheck
```

- [ ] **Commit:**
```bash
git add components/layout/Sidebar.tsx
git commit -m "feat: add HR navigation to sidebar"
```

---

## Task 16: Final Integration Check

- [ ] **Start dev server:**
```bash
npm run dev
```

- [ ] **Manual test checklist:**
  - Log in as `ivanov@example.com` (employee) → no HR nav items visible ✓
  - Navigate to `/hr/document-templates` → redirected to `/dashboard` ✓
  - Log in as an HR user → HR nav visible ✓
  - Navigate to `/hr/document-templates` → page loads ✓
  - Upload a .docx file → appears in list ✓
  - Edit metadata → name/category updates ✓
  - Delete template → removed from list ✓
  - Employee navigates to `/document-templates` → real data visible ✓

- [ ] **Run full lint + typecheck:**
```bash
npm run lint && npm run typecheck
```

- [ ] **Final commit:**
```bash
git add -A
git commit -m "feat: complete document templates management (HR panel, Plan 1)"
```
