# Onboarding System — Design Spec

**Date:** 2026-03-24
**Status:** Approved

## Overview

A system for onboarding new employees. HR manually starts onboarding for a user, assigning documents based on department and position. The new employee reads and acknowledges each document. When all documents are acknowledged, their role automatically changes to `employee`.

## Requirements

1. HR creates onboarding for a user, selecting department, position, and documents from pre-configured templates
2. New employee has a restricted `onboarding` role — can only access `/onboarding`, `/employees`, `/departments`
3. Employee reads each document (file or text) and confirms acknowledgement via a confirmation modal
4. When all documents are acknowledged — role changes automatically to `employee`, HR receives a notification
5. HR can track progress: who read what and when
6. HR manages a library of document templates, each optionally linked to a department and/or position

## Database

### New Tables

**`onboarding_templates`** — HR-managed document templates:
```sql
CREATE TABLE onboarding_templates (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content_text TEXT,
  file_key VARCHAR(500),
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
  template_id INTEGER REFERENCES onboarding_templates(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMP
);
```

### Role Change

Add `onboarding` to the `users.role` column constraint. When all `employee_onboarding_documents` for an onboarding record have `acknowledged_at` set, the backend automatically sets `users.role = 'employee'` and fills `employee_onboarding.completed_at`.

## Access Control

The `onboarding` role has restricted access:
- Allowed: `/onboarding`, `/employees`, `/departments`
- All other routes redirect to `/onboarding`
- After completion: redirect to `/dashboard` with role `employee`

`App.tsx` adds a dedicated `ProtectedRoute` for the `onboarding` role. `Sidebar.tsx` adds `getOnboardingNavigation()` returning only the three allowed items.

## Frontend

### Employee View (`/onboarding`)

Single page with two blocks:

**Progress block:**
- Welcome message with employee name
- Progress bar: X of N documents acknowledged
- Percentage complete

**Document list:**
- Card per document: title, type icon (text/file), status (unread / acknowledged + date)
- "Open" button → modal with text content or file download button
- Inside modal: "Ознакомлен" button → confirmation dialog ("Вы подтверждаете ознакомление?") → on confirm: status updates, card shows acknowledged
- When all acknowledged: completion banner appears, role change triggers, redirect to `/dashboard`

### HR Panel (`/hr/onboarding`)

Two tabs:

**Tab "Сотрудники":**
- Table: name, position, department, start date, progress (X/N docs), status (В процессе / Завершён)
- "Добавить сотрудника" button → modal: select user (with `onboarding` role), select department and position, system pre-fills matching templates, HR can add/remove documents manually
- Row click → detail view: per-document status with acknowledgement timestamps

**Tab "Шаблоны":**
- List of templates with department/position filters
- Create template: title, text content or file upload, optional department and/or position binding
- Edit / delete template

## Backend API

### Employee endpoints (requires `onboarding` role)

- `GET /api/onboarding/me` — returns onboarding record with full document list and acknowledgement status
- `POST /api/onboarding/me/documents/:id/acknowledge` — marks document as acknowledged; if all documents acknowledged, sets `users.role = 'employee'`, fills `completed_at`, sends notification to all HR users

### HR endpoints (requires `hr` or `admin` role)

- `GET /api/onboarding` — list all onboarding records with progress
- `POST /api/onboarding` — start onboarding: `{ user_id, department_id, position, template_ids[] }`
- `GET /api/onboarding/:id` — detail view with per-document acknowledgement timestamps

### Template endpoints (requires `hr` or `admin` role)

- `GET /api/onboarding/templates` — list templates, supports `?department_id=` and `?position=` filters
- `POST /api/onboarding/templates` — create template (multipart/form-data for file upload)
- `PUT /api/onboarding/templates/:id` — update template
- `DELETE /api/onboarding/templates/:id` — delete template

## Notifications

On onboarding completion, the backend inserts a `notifications` record for every user with role `hr` or `admin`:
> "Сотрудник [Имя Фамилия] завершил онбординг"

## File Storage

Template files are uploaded to MinIO using the existing `uploadToS3` / `getS3FileUrl` helpers from `backend/src/config/s3.js`. Key format: `onboarding-templates/{templateId}/{timestamp}.{ext}`. A new `uploadOnboardingDoc` multer instance is added to `backend/src/middleware/upload.js` (accepts PDF, DOCX, max 20 MB).

## Data Flow

```
HR creates onboarding
  → POST /api/onboarding
  → employee_onboarding row created
  → employee_onboarding_documents rows created (one per template)
  → user.role = 'onboarding' (set by HR when creating the user or separately)

Employee opens /onboarding
  → GET /api/onboarding/me
  → sees document list with statuses

Employee acknowledges document
  → POST /api/onboarding/me/documents/:id/acknowledge
  → acknowledged_at set
  → check: all acknowledged?
    YES → user.role = 'employee', completed_at set, notification sent to HR
    NO  → nothing else

Employee redirected to /dashboard after completion
```

## Error Handling

- Acknowledging a document that doesn't belong to the current user → 403
- Acknowledging an already-acknowledged document → 400 "Уже подтверждено"
- Starting onboarding for a user who already has an active onboarding → 400 "Уже на онбординге"
- File too large / wrong type → 400 client-side and server-side validation

## Out of Scope

- HR editing onboarding after it has started (adding/removing documents mid-process)
- Employee re-acknowledging a document
- Multiple simultaneous onboarding instances per employee
- Onboarding deadline / expiry
