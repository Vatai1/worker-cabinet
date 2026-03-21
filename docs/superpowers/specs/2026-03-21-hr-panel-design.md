# HR Panel Design Spec
**Date:** 2026-03-21
**Status:** Approved

## Overview

Two new pages accessible only to users with role `hr` or `admin`:
1. `/hr/surveys` — survey management with a full survey constructor
2. `/hr/document-templates` — document template management with OnlyOffice editing

Plus one new page accessible to all authenticated users:
- `/surveys/:id` — public survey response page (access-controlled per survey)

---

## Access Control

### Frontend

New `HRRoute` component in `App.tsx` (alongside existing `ProtectedRoute`):

```typescript
function HRRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  const loading = useAuthStore(s => s.loading)
  if (loading) return null
  if (!['hr', 'admin'].includes(user?.role ?? ''))
    return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
```

HR-only routes in `App.tsx` (inside the existing `Layout` route, wrapped in `<HRRoute>`):
```tsx
<Route path="hr/surveys" element={<HRRoute><HRSurveys /></HRRoute>} />
<Route path="hr/document-templates" element={<HRRoute><HRDocumentTemplates /></HRRoute>} />
```

`/surveys/:id` is a regular `ProtectedRoute` (all authenticated users).

**Sidebar (`components/layout/Sidebar.tsx`):**

Add `getHRNavigation()` function alongside existing `getEmployeeNavigation` and `getManagerNavigation`:
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

Update navigation selector on line 83:
```typescript
const navigation =
  user?.role === 'manager' ? getManagerNavigation(user?.id) :
  ['hr', 'admin'].includes(user?.role ?? '') ? getHRNavigation(user?.id) :
  getEmployeeNavigation(user?.id)
```

### Backend

All mutating survey/template endpoints protected with `authorizeRoles('hr', 'admin')`.
Survey view endpoint (`GET /api/surveys/:id/view`) checks target audience membership before returning data.

---

## Page 1: `/hr/surveys`

### File: `pages/HRSurveys.tsx`

**Layout:**
- Stats row: active count, total count, average response rate
- Toolbar: search input + «Создать» button
- Tabs: Активные / Черновики / Закрытые
- List of survey cards

**Survey card shows:**
- Title, question count, target audience, deadline
- Response progress bar (answered / total targeted)
- Buttons: Аналитика | Редактировать | Закрыть (or Опубликовать for drafts) | Поделиться (copies `/surveys/:id` link to clipboard)

### Survey Constructor Modal: `components/modals/SurveyBuilderModal.tsx`

**Left panel — question blocks:**
- Each question is a draggable block
- Drag handle (three-line grip) on the left — HTML5 DnD API (no extra dependencies)
- ↑ ↓ arrow buttons for keyboard reordering
- ✕ delete button
- Question type badge (click to change type)
- Question text input
- Type-specific fields:
  - **Radio** — list of option inputs + «+ Вариант» button
  - **Checkbox** — same as radio, multi-select
  - **Text** — no extra fields (free text answer)
  - **Scale** — range selector (1–5 or 1–10)
- Required checkbox per question
- «Добавить вопрос» panel at the bottom with 4 type buttons: Radio | Checkbox | Текст | Шкала

**Right panel — settings:**
- Title (required)
- Description (textarea)
- Target audience: dropdown (Все сотрудники / Конкретный отдел / Конкретные сотрудники)
  - If department: department selector
  - If employees: multi-select employee picker
- Deadline: date input (optional)
- Anonymous toggle
- Buttons: «Сохранить черновик» | «Опубликовать»

### Analytics Modal: `components/modals/SurveyAnalyticsModal.tsx`

- Response rate: X из Y ответили (percentage)
- Per question breakdown:
  - **Radio/Checkbox** — horizontal bar per option with percentage
  - **Scale** — average value + distribution bars per score
  - **Text** — scrollable list of text responses
- If no responses yet: show «Пока нет ответов» per question, response rate = 0%
- Data fetched from `GET /api/surveys/:id/analytics`

**Analytics API response shape:**
```json
{
  "total_targeted": 25,
  "total_responded": 17,
  "questions": [
    {
      "id": 1,
      "text": "...",
      "type": "radio",
      "options": [
        { "label": "Команда", "count": 10, "percent": 58.8 }
      ]
    },
    {
      "id": 2,
      "type": "scale",
      "average": 4.2,
      "distribution": { "1": 0, "2": 1, "3": 2, "4": 6, "5": 8 }
    },
    {
      "id": 3,
      "type": "text",
      "answers": ["Хорошая атмосфера", "Нравится команда"]
    }
  ]
}
```

---

## Page 2: `/hr/document-templates`

### File: `pages/HRDocumentTemplates.tsx`

Replaces mock data in existing `DocumentTemplates.tsx` with real API.
Existing `DocumentTemplates.tsx` (employee-facing) also updated to use real API.

**Layout:**
- Toolbar: search input + «Загрузить шаблон» button
- Category filter pills: Все | HR | Юридические | Финансы | Общие
- Template list (rows)

**Template row shows:**
- File type icon (W for .docx, P for .pdf)
- Name, category, size, download count
- Buttons:
  - .docx → «Открыть в OnlyOffice» (generates temp edit token via existing mechanism)
  - .pdf → «Предпросмотр» (opens existing `OnlyOfficePreviewModal`)
  - ✏️ Edit metadata
  - 🗑 Delete (with confirm dialog)

### Upload Modal: `components/modals/UploadTemplateModal.tsx`
- File input (accepts .docx, .pdf), max size 20MB (validated client-side and server-side)
- Name, description, category fields
- Submit → `POST /api/templates` (multipart)

### Edit Metadata Modal: `components/modals/EditTemplateMetaModal.tsx`
- Name, description, category fields pre-filled from selected template
- Local state (useState) — no Zustand store needed for templates, state lives in `HRDocumentTemplates.tsx`
- Submit → `PUT /api/templates/:id`

### OnlyOffice Editing for .docx templates

Re-use `OnlyOfficePreviewModal` but pass `mode: 'edit'` via a new prop `editable?: boolean`.
When `editable=true`, the modal config changes to:
```typescript
permissions: { edit: true, download: true, print: true }
editorConfig: { mode: 'edit', callbackUrl: `${API_BASE_URL}/templates/${id}/onlyoffice/callback` }
```

OnlyOffice calls `POST /api/templates/:id/onlyoffice/callback` (JSON body with `status` and `url`) when user saves. Backend downloads the updated file from the OnlyOffice-provided URL and re-uploads to S3, overwriting the existing `file_key`.

Add backend route:
```
POST /api/templates/:id/onlyoffice/callback   (no auth — called by OnlyOffice server)
```
This endpoint: if `body.status === 2` (document saved) → download from `body.url` → upload to S3 → respond `{"error": 0}`.

---

## Page 3: `/surveys/:id` (all authenticated users)

### File: `pages/SurveyPage.tsx`

**Access logic (checked on backend, handled on frontend):**

| Condition | UI shown |
|-----------|----------|
| User not in target audience | «У вас нет доступа к данному опросу» |
| Survey is draft or closed | «Опрос недоступен» |
| User already responded | «Вы уже прошли этот опрос» |
| Active + user in target | Survey form |

**Survey form:**
- Title and description at top
- Questions rendered by type:
  - Radio → `<input type="radio">`
  - Checkbox → `<input type="checkbox">`
  - Text → `<textarea>`
  - Scale → clickable number buttons (1–N)
- Required question validation on submit: inline red border + label «Обязательный вопрос» per unanswered required question; page scrolls to first error
- Submit → `POST /api/surveys/:id/respond`
- Success state: «Спасибо, ваш ответ записан!»

**Anonymous surveys:** `anonymous=true` means `user_id` is stored as NULL in `survey_responses`. Access check still uses the authenticated user's identity (from JWT) to verify they are in the target audience. To prevent duplicate anonymous submissions, the frontend stores submitted survey IDs in `localStorage` and shows «Вы уже прошли этот опрос» if found. No server-side uniqueness check for anonymous responses.

---

## Database Schema

```sql
CREATE TABLE surveys (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  created_by INT REFERENCES users(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('all', 'department', 'employees')),
  target_ids JSONB DEFAULT '[]',
  deadline DATE,
  anonymous BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE survey_questions (
  id SERIAL PRIMARY KEY,
  survey_id INT REFERENCES surveys(id) ON DELETE CASCADE,
  order_index INT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('radio', 'checkbox', 'text', 'scale')),
  text TEXT NOT NULL,
  options JSONB DEFAULT '[]',
  scale_min INT DEFAULT 1,
  scale_max INT DEFAULT 5 CHECK (scale_max > scale_min),
  required BOOLEAN DEFAULT false
);

CREATE TABLE survey_responses (
  id SERIAL PRIMARY KEY,
  survey_id INT REFERENCES surveys(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id),   -- NULL if anonymous
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (survey_id, user_id)         -- prevent duplicate responses (non-anonymous)
);

CREATE TABLE survey_answers (
  id SERIAL PRIMARY KEY,
  response_id INT REFERENCES survey_responses(id) ON DELETE CASCADE,
  question_id INT REFERENCES survey_questions(id) ON DELETE CASCADE,
  value TEXT,        -- for text and scale answers
  values JSONB       -- for checkbox answers (array of selected options)
);

CREATE TABLE document_templates (
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
);
```

---

## API Endpoints

### Surveys

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/surveys` | hr/admin | List all surveys |
| POST | `/api/surveys` | hr/admin | Create survey (draft) |
| GET | `/api/surveys/:id` | hr/admin | Get survey with questions |
| PUT | `/api/surveys/:id` | hr/admin | Update survey |
| DELETE | `/api/surveys/:id` | hr/admin | Delete survey |
| POST | `/api/surveys/:id/publish` | hr/admin | Set status → active |
| POST | `/api/surveys/:id/close` | hr/admin | Set status → closed |
| GET | `/api/surveys/:id/view` | any authenticated | Get survey for response (checks access) |
| POST | `/api/surveys/:id/respond` | any authenticated | Submit response |
| GET | `/api/surveys/:id/analytics` | hr/admin | Get aggregated analytics |

### Document Templates

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/templates` | any authenticated | List templates |
| POST | `/api/templates` | hr/admin | Upload template (multipart) |
| PUT | `/api/templates/:id` | hr/admin | Update metadata |
| DELETE | `/api/templates/:id` | hr/admin | Delete template + S3 file |
| GET | `/api/templates/:id/onlyoffice` | hr/admin | Get OnlyOffice edit URL |
| POST | `/api/templates/:id/download` | any authenticated | Increment download count + return file URL |

---

## New Files Summary

```
pages/
  HRSurveys.tsx
  HRDocumentTemplates.tsx
  SurveyPage.tsx

components/modals/
  SurveyBuilderModal.tsx
  SurveyAnalyticsModal.tsx
  UploadTemplateModal.tsx
  EditTemplateMetaModal.tsx

store/
  surveyStore.ts

services/
  surveyApi.ts

types/
  survey.ts

backend/src/routes/
  surveys.js
  templates.js

backend/src/services/
  surveyService.js      (analytics aggregation logic)
  templateService.js    (S3 upload/delete, OnlyOffice token)
```

**Modified files:**
- `App.tsx` — add HRRoute component + routes for hr/surveys, hr/document-templates, surveys/:id
- `components/layout/Sidebar.tsx` — add getHRNavigation(), update navigation selector line 83
- `components/modals/OnlyOfficePreviewModal.tsx` — add optional `editable?: boolean` prop
- `backend/src/server.js` — register surveysRoutes and templatesRoutes
- `backend/src/db/migrate.js` — add 4 new tables (surveys, survey_questions, survey_responses, survey_answers, document_templates)
- `pages/DocumentTemplates.tsx` — replace mock data with real API call to GET /api/templates
