# HR Hierarchy DB Storage — Design Spec

**Date:** 2026-03-25
**Status:** Approved

## Overview

Move HR hierarchy storage from `localStorage` to PostgreSQL so all HR users share one canonical state. All authenticated users can read; only `hr` and `admin` roles can save.

## Database

Add to `backend/src/db/migrate.js`:

```sql
CREATE TABLE IF NOT EXISTS hr_hierarchy (
  id INTEGER PRIMARY KEY DEFAULT 1,
  data JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT single_row CHECK (id = 1)
);
```

The `CONSTRAINT single_row CHECK (id = 1)` enforces a singleton row. The `data` column stores the full React Flow `toObject()` payload (`{ nodes, edges }`).

## Backend API

New file: `backend/src/routes/hierarchy.js`. Registered in `server.js` as `/api/hierarchy`.

### `GET /api/hierarchy`

- Middleware: `authenticateToken`
- Returns the current hierarchy state.
- If no row exists yet, returns `{ data: { nodes: [], edges: [] }, updated_at: null, updated_by: null }` — no error.

```json
{ "data": { "nodes": [...], "edges": [...] }, "updated_at": "...", "updated_by": 5 }
```

### `PUT /api/hierarchy`

- Middleware: `authenticateToken`, `authorizeRoles('hr', 'admin')`
- Body: `{ nodes: [...], edges: [...] }`
- Upserts the single row:

```sql
INSERT INTO hr_hierarchy (id, data, updated_at, updated_by)
VALUES (1, $1, NOW(), $2)
ON CONFLICT (id) DO UPDATE
  SET data = EXCLUDED.data,
      updated_at = EXCLUDED.updated_at,
      updated_by = EXCLUDED.updated_by
RETURNING updated_at
```

- Returns `{ updated_at }` on success.

## Frontend

Changes only in `pages/HRHierarchy.tsx`.

### Load on mount

Replace `localStorage.getItem(STORAGE_KEY)` with `GET /api/hierarchy`. Show a loading state while fetching. On error, show the existing error banner.

### Save button

Replace `localStorage.setItem(...)` with `PUT /api/hierarchy` sending `rfInstance.toObject()`. The button shows a saving indicator while the request is in flight. On success, show a brief "Сохранено" confirmation. Only HR/admin users see the Save button (read-only view for others).

### Clear button

Removed entirely.

### localStorage

Remove all references to `STORAGE_KEY` and `localStorage`. No fallback or migration needed — the canvas starts empty for everyone until an HR user saves for the first time.

## Access Control

| Action | Roles |
|--------|-------|
| View hierarchy page | hr, admin (via existing `HRRoute` guard) |
| Load data (`GET`) | hr, admin |
| Save data (`PUT`) | hr, admin |

The `HRRoute` guard already restricts the page to hr/admin, so no non-HR user can reach it.

## Error Handling

- `GET` failure: show error message, canvas stays empty.
- `PUT` failure: show error message on the save button, canvas state is not lost.
- Body missing `nodes` or `edges`: return 400.
