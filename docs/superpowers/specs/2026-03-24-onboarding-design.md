# Onboarding System — Design Spec

**Date:** 2026-03-24
**Status:** Approved

## Overview

A system for onboarding new employees. HR creates a new user account and starts onboarding in a single flow, assigning documents based on department and position. The new employee reads and acknowledges each document. When all documents are acknowledged, their role automatically changes to `employee`.

## Requirements

1. HR creates a new user with role `onboarding` as part of starting onboarding (name, email, password, department, position, documents — all in one modal)
2. New employee has a restricted `onboarding` role — can only access `/onboarding`, `/employees`, `/departments`
3. Employee reads each document (file or text) and confirms acknowledgement via a confirmation modal
4. When all documents are acknowledged — role changes automatically to `employee`, HR receives a notification
5. HR can cancel onboarding — user role becomes `employee`, onboarding record is deleted
6. HR can track progress: who read what and when
7. HR manages a library of document templates, each optionally linked to a department and/or position

## Database

### Migration

Add the new enum value in `backend/src/db/migrate.js`:
```sql
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'onboarding';
```

### New Tables

**`onboarding_templates`** — HR-managed document templates:
```sql
CREATE TABLE onboarding_templates (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content_text TEXT,
  file_key VARCHAR(500),
  CONSTRAINT content_or_file CHECK (content_text IS NOT NULL OR file_key IS NOT NULL),
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  position VARCHAR(255),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**`employee_onboarding`** — one record per onboarding instance:
```sql
CREATE TABLE employee_onboarding (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  started_by INTEGER REFERENCES users(id),
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

**`employee_onboarding_documents`** — documents assigned to a specific onboarding:
```sql
CREATE TABLE employee_onboarding_documents (
  id SERIAL PRIMARY KEY,
  onboarding_id INTEGER REFERENCES employee_onboarding(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES onboarding_templates(id) ON DELETE RESTRICT,
  acknowledged_at TIMESTAMP,
  UNIQUE (onboarding_id, template_id)
);
```

`ON DELETE RESTRICT` on `template_id` prevents deletion of templates that are used in any onboarding — active or completed. Completed onboarding history is preserved intentionally. The template delete endpoint must return a clear error if the template is in use.

### Role Change

Add `onboarding` via `ALTER TYPE` migration. When all `employee_onboarding_documents` for an onboarding record have `acknowledged_at` set, the backend uses a transaction (`getClient()`) to atomically: set `users.role = 'employee'`, fill `employee_onboarding.completed_at`, and insert notifications for all HR/admin users.

## Access Control

The `onboarding` role has restricted access:
- Allowed: `/onboarding`, `/employees`, `/departments`
- All other routes redirect to `/onboarding`
- After completion: role becomes `employee`, frontend redirects to `/dashboard`

### `App.tsx` changes

1. Update the root index redirect to send `onboarding` users to `/onboarding` (currently only `manager` → `/leader`, others → `/dashboard`)
2. Add a route guard that redirects `onboarding` users away from any route outside the allowed list — wraps the protected route tree alongside the existing `ProtectedRoute`

### `Sidebar.tsx` changes

1. Add `getOnboardingNavigation()` returning: Онбординг (`/onboarding`), Сотрудники (`/employees`), Отделы (`/departments`)
2. Update role-dispatch chain to check for `onboarding` before the existing fallback:
   ```ts
   user?.role === 'onboarding' ? getOnboardingNavigation() :
   user?.role === 'manager' ? getManagerNavigation(user?.id) :
   ...
   ```

## Frontend

### Employee View (`/onboarding`)

Single page with two blocks:

**Progress block:**
- Welcome message with employee name
- Progress bar: X of N documents acknowledged
- Percentage complete

**Document list:**
- Card per document: title, type icon (text/file), status (unread / acknowledged + date)
- "Открыть" button → modal with text content or file download button
- Inside modal: "Ознакомлен" button → confirmation dialog ("Вы подтверждаете ознакомление?") → on confirm: `POST .../acknowledge` → then `GET /api/auth/me` to re-fetch user role → if role is now `employee`, redirect to `/dashboard`

### HR Panel (`/hr/onboarding`)

Two tabs:

**Tab "Сотрудники":**
- Table: name, position, department, start date, progress (X/N docs), status (В процессе / Завершён)
- "Добавить сотрудника" button → modal with user creation fields (first name, last name, email, password) + department, position, template selection (system pre-fills matching templates, HR can add/remove documents manually) → single `POST /api/onboarding` creates user and starts onboarding
- Row click → detail view: per-document status with acknowledgement timestamps
- "Отменить онбординг" button → confirmation → `DELETE /api/onboarding/:id` → user role becomes `employee`, record deleted

**Tab "Шаблоны":**
- List of templates with department/position filters
- Create template: title, text content or file upload (at least one required), optional department and/or position binding
- Edit / delete template (delete blocked if template is used in any onboarding)

## Backend API

### Route registration order

Routes in `backend/src/routes/onboarding.js` must be registered in this order to prevent Express matching literal paths as `/:id`:

```
GET    /templates
POST   /templates
PUT    /templates/:id
DELETE /templates/:id
GET    /me                          ← must precede /:id
POST   /me/documents/:id/acknowledge
GET    /                            (HR)
POST   /                            (HR)
GET    /:id                         (HR) ← must come last
DELETE /:id                         (HR)
```

### Employee endpoints (requires `onboarding` role)

- `GET /api/onboarding/me` — returns onboarding record with full document list and acknowledgement status; returns 404 if no active onboarding exists for the current user (frontend on `/onboarding` calls this on mount — if 404, redirects to `/dashboard` and re-fetches user role via `GET /api/auth/me`)
- `POST /api/onboarding/me/documents/:id/acknowledge` — uses `getClient()` transaction to atomically: set `acknowledged_at`, check if all acknowledged → if yes: set `users.role = 'employee'`, set `completed_at`, insert notifications; returns `{ acknowledged: true }`

After this call, the frontend calls `GET /api/auth/me` to re-fetch the user — if role is `employee`, it redirects to `/dashboard`.

### HR endpoints (requires `hr` or `admin` role)

- `GET /api/onboarding` — list all onboarding records with progress
- `POST /api/onboarding` — creates user account with role `onboarding` and starts onboarding in one transaction: `{ first_name, last_name, email, password, department_id, position, template_ids[] }`; password must be hashed with bcrypt before storing (same as in `auth.js` register route)
- `GET /api/onboarding/:id` — detail view with per-document acknowledgement timestamps
- `DELETE /api/onboarding/:id` — cancel onboarding: uses `getClient()` transaction to atomically set `users.role = 'employee'` and delete onboarding record (cascade deletes documents)

### Template endpoints (requires `hr` or `admin` role)

- `GET /api/onboarding/templates` — list templates, supports `?department_id=` and `?position=` filters
- `POST /api/onboarding/templates` — create template (multipart/form-data, reuses existing `uploadTemplate` multer instance from `backend/src/middleware/upload.js`; import it aliased as `uploadTemplateMiddleware` to avoid collision with `templateService.uploadTemplate`)
- `PUT /api/onboarding/templates/:id` — update template; if a new file is uploaded and the template previously had a file, the old file is deleted from MinIO via `deleteFromS3(oldKey)`
- `DELETE /api/onboarding/templates/:id` — returns 400 "Шаблон используется в онбординге" if any `employee_onboarding_documents` row references this template; otherwise deletes

## Notifications

On onboarding completion, the backend inserts a `notifications` record for every user with role `hr` or `admin`:
- `title`: `"Онбординг завершён"`
- `message`: `"Сотрудник [Имя Фамилия] завершил онбординг"`
- `type`: `'success'`
- `link`: `"/hr/onboarding/{onboarding_id}"`

## File Storage

Template files are uploaded to MinIO using the existing `uploadToS3` / `getS3FileUrl` helpers from `backend/src/config/s3.js`. Key format: `onboarding-templates/{templateId}/{timestamp}.{ext}`. Reuses existing `uploadTemplate` multer instance (accepts PDF, DOCX, max 20 MB) — no new multer instance needed.

## Data Flow

```
HR adds employee to onboarding
  → POST /api/onboarding
  → user created with role 'onboarding'
  → employee_onboarding row created
  → employee_onboarding_documents rows created (one per template)

Employee logs in → redirected to /onboarding
  → GET /api/onboarding/me
  → sees document list with statuses

Employee acknowledges document
  → POST /api/onboarding/me/documents/:id/acknowledge
  → BEGIN transaction
  → acknowledged_at set
  → check: all acknowledged?
    YES → user.role = 'employee', completed_at set, notifications inserted
    NO  → nothing else
  → COMMIT
  → frontend calls GET /api/auth/me
    → role = 'employee' → redirect to /dashboard

HR cancels onboarding
  → DELETE /api/onboarding/:id
  → user.role = 'employee'
  → onboarding record deleted (cascade deletes documents)
```

## Error Handling

- Acknowledging a document that doesn't belong to the current user → 403
- Acknowledging an already-acknowledged document → 400 "Уже подтверждено"
- Creating a template with neither text nor file → 400 "Необходимо указать текст или загрузить файл"
- Deleting a template that is in use → 400 "Шаблон используется в онбординге"
- File too large / wrong type → 400 (client-side and server-side)

## Out of Scope

- HR editing documents of an in-progress onboarding (adding/removing documents mid-process)
- Employee re-acknowledging a document
- Multiple simultaneous onboarding instances per employee
- Onboarding deadline / expiry
