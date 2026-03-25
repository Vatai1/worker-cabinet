# HR Hierarchy DB Storage — Design Spec

**Date:** 2026-03-25
**Status:** Approved

## Overview

Move HR hierarchy storage from `localStorage` to PostgreSQL so all HR users share one canonical state. All authenticated users on the HR panel can read; only `hr` and `admin` roles can save.

## Database

Add to `backend/src/db/migrate.js`:

```sql
CREATE TABLE IF NOT EXISTS hr_hierarchy (
  id INTEGER PRIMARY KEY DEFAULT 1,
  data JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}',
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT single_row CHECK (id = 1)
);
```

`CONSTRAINT single_row CHECK (id = 1)` enforces a singleton row. The `data` column stores the full React Flow `toObject()` payload: `{ nodes, edges, viewport }` — including viewport so zoom/pan position is restored on load.

## Backend API

New file: `backend/src/routes/hierarchy.js`. Register in `backend/src/server.js`:

```js
import hierarchyRoutes from './routes/hierarchy.js'
app.use('/api/hierarchy', hierarchyRoutes)
```

### `GET /api/hierarchy`

- Middleware: `authenticateToken`
- If no row exists yet, returns `{ data: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, updated_at: null, updated_by: null }` — no 404.
- On success returns:

```json
{ "data": { "nodes": [...], "edges": [...], "viewport": {...} }, "updated_at": "...", "updated_by": 5 }
```

### `PUT /api/hierarchy`

- Middleware: `authenticateToken`, `authorizeRoles('hr', 'admin')`
- Body: `{ nodes, edges, viewport }` — taken directly from `rfInstance.toObject()`
- If `nodes` or `edges` is missing from body: `400 { "error": "Поля nodes и edges обязательны" }`
- Upsert:

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

### Imports

Add `getAuthHeadersWithContentType` to the existing import from `@/lib/authHeaders`:
```ts
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/lib/authHeaders'
```

### State

Add a separate `hierarchyLoading` boolean state for the hierarchy fetch — do not reuse the existing `loading` state (which tracks the departments fetch and drives the left panel "Загрузка..." label).

Add a `saving` boolean state for the PUT in-flight indicator.

### Load on mount

Replace `localStorage.getItem(STORAGE_KEY)` with `GET /api/hierarchy` in a `useEffect`. On success, call `setNodes(data.nodes)`, `setEdges(...)`, and `rfInstanceRef.current?.setViewport(data.viewport ?? { x: 0, y: 0, zoom: 1 })` (use the ref, not state, to avoid stale closure; fall back to default viewport if the field is absent). On error, show `'Не удалось загрузить иерархию'` in the existing error banner.

### Save button

Replace `localStorage.setItem(...)` with `PUT /api/hierarchy`. Use `rfInstanceRef.current.toObject()` (ref, not state) to get the current canvas state. Set `saving = true` before the request, `false` after. On success show a brief "Сохранено" label next to the button (disappears after 2 seconds). On error show `'Не удалось сохранить иерархию'` in the existing error banner.

### Clear button

Removed entirely.

### localStorage

Remove all references to `STORAGE_KEY` and `localStorage`. No migration needed — the canvas starts empty until an HR user saves for the first time.

## Access Control

The `HRRoute` guard already restricts the page to `hr`/`admin`, so no non-HR user can reach the hierarchy page. No additional frontend role check is needed.

| Endpoint | Auth | Roles |
|----------|------|-------|
| `GET /api/hierarchy` | authenticateToken | any authenticated user |
| `PUT /api/hierarchy` | authenticateToken + authorizeRoles | hr, admin |

## Error Handling

| Case | Response |
|------|----------|
| `PUT` with missing `nodes` or `edges` | `400 { "error": "Поля nodes и edges обязательны" }` |
| `GET` DB failure | `500 { "error": "Не удалось загрузить иерархию" }` |
| `PUT` DB failure | `500 { "error": "Не удалось сохранить иерархию" }` |
