---
name: read-manifest
description: >
  Read MODULE.md manifests to understand module context before making changes.
  Use when starting work on any module — read its manifest first to understand
  structure, API, roles, and dependencies. Also use to discover which module
  owns a specific feature or API endpoint.
---

# Read Module Manifest

Use this skill to understand a module's context before making changes. Every module
in the project has a `MODULE.md` manifest file.

## Module Locations

### Feature modules (`modules/`)
```
modules/vacation/MODULE.md
modules/surveys/MODULE.md
modules/projects/MODULE.md
modules/documents/MODULE.md
modules/timesheet/MODULE.md
modules/onboarding/MODULE.md
modules/calendar/MODULE.md
modules/hierarchy/MODULE.md
modules/notifications/MODULE.md
modules/departments/MODULE.md
modules/skills/MODULE.md
modules/requests/MODULE.md
```

### Core modules (`core/`)
```
core/admin/MODULE.md
core/auth/MODULE.md
core/employees/MODULE.md
core/settings/MODULE.md
```

## When to Use

1. **Before modifying a module** — read its MODULE.md to understand the full context
2. **When asked about a feature** — find the relevant module manifest
3. **When creating a new module** — reference existing manifests for patterns
4. **When debugging** — check API endpoints and dependencies in the manifest
5. **When planning cross-module changes** — read manifests of all affected modules

## Manifest Structure

Each MODULE.md contains these sections:

| Section | Content |
|---------|---------|
| Основная информация | code, category, route, icon, sort_order, description |
| Файловая структура | All files in the module directory |
| API эндпоинты | Backend routes with methods, paths, roles, descriptions |
| Роли и доступ | Role-based access matrix |
| Зависимости | Frontend imports and backend dependencies |
| Особенности (optional) | Module-specific notes and gotchas |

## Categories

| Key | Name | Modules |
|-----|------|---------|
| `hr` | HR и Люди | vacation, surveys, onboarding, skills |
| `work` | Проекты и Работа | projects, timesheet, requests |
| `docs` | Документы и Коммуникации | documents, notifications |
| `admin` | Аналитика и Управление | admin, employees, hierarchy, departments, calendar |
| `general` | Общие | auth, settings |

## Quick Reference

To find which module handles a feature:
- **Vacation/leave** → `modules/vacation/`
- **Surveys** → `modules/surveys/`
- **Projects/Roadmap** → `modules/projects/`
- **Document upload** → `modules/documents/` (personal) or `modules/projects/` (project docs)
- **Timesheet T-13** → `modules/timesheet/`
- **New employee onboarding** → `modules/onboarding/`
- **Calendar/Outlook** → `modules/calendar/`
- **Org chart** → `modules/hierarchy/`
- **In-app notifications** → `modules/notifications/`
- **Departments** → `modules/departments/`
- **Skills/competencies** → `modules/skills/`
- **Request dashboards** → `modules/requests/`
- **Admin panel** → `core/admin/`
- **Login/auth** → `core/auth/`
- **Employee profiles** → `core/employees/`
- **User settings** → `core/settings/`

## Module-to-Route Mapping

| Module Code | DB Route File | API Prefix |
|-------------|---------------|------------|
| vacation | `backend/src/routes/vacation.js` | `/api/vacation` |
| surveys | `backend/src/routes/surveys.js` | `/api/surveys` |
| projects | `backend/src/routes/projects.js` | `/api/projects` |
| documents | `backend/src/routes/documents.js`, `userDocuments.js` | `/api/documents`, `/api/user-documents` |
| timesheet | `backend/src/routes/timesheet.js` | `/api/timesheet` |
| onboarding | `backend/src/routes/onboarding.js` | `/api/onboarding` |
| calendar | `backend/src/routes/calendar.js` | `/api/calendar` |
| hierarchy | `backend/src/routes/hierarchy.js` | `/api/hierarchy` |
| notifications | `backend/src/routes/notifications.js` | `/api/notifications` |
| departments | `backend/src/routes/departments.js` | `/api/departments` |
| skills | `backend/src/routes/users.js`, `dictionaries.js` | `/api/users/skills`, `/api/dictionaries/skills` |
| requests | (uses vacation, projects, timesheet) | — |
| admin | `backend/src/routes/admin.js` | `/api/admin` |
| auth | `backend/src/routes/auth.js` | `/api/auth` |
| employees | `backend/src/routes/users.js` | `/api/users` |
| settings | `backend/src/routes/admin.js`, `users.js` | `/api/admin/settings`, `/api/users` |
