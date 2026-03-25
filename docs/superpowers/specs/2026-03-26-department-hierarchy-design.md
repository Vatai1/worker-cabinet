# Department Hierarchy — Design Spec

**Date:** 2026-03-26
**Status:** Approved

## Overview

Add a "Просмотреть отдел" context menu item to department nodes in the HR Hierarchy canvas. Clicking it opens a full-canvas overlay showing a per-department editable org chart — same blocks, same editing tools, stored separately per department in PostgreSQL.

## Database

Add to `backend/src/db/migrate.js`:

```sql
CREATE TABLE IF NOT EXISTS department_hierarchy (
  department_id INTEGER PRIMARY KEY REFERENCES departments(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}',
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
)
```

`department_id` is the primary key — one row per department, no duplicate hierarchies. `ON DELETE CASCADE` removes the hierarchy when the department is deleted.

## Backend API

Add two endpoints to the existing `backend/src/routes/hierarchy.js`. **Route order matters**: register `/department/:id` routes before any `/:id` catch-all to prevent Express from treating the literal string `"department"` as a numeric id.

### `GET /api/hierarchy/department/:id`

- Middleware: `authenticateToken`
- If no row exists for this department, return the empty default (no 404):
  ```json
  { "data": { "nodes": [], "edges": [], "viewport": { "x": 0, "y": 0, "zoom": 1 } }, "updated_at": null, "updated_by": null }
  ```
- On success return the stored row: `{ data, updated_at, updated_by }`
- On DB error: `500 { "error": "Не удалось загрузить иерархию отдела" }`

### `PUT /api/hierarchy/department/:id`

- Middleware: `authenticateToken`, `authorizeRoles('hr', 'admin')`
- Body: `{ nodes, edges, viewport }` from `rfInstance.toObject()`
- Validate: if `nodes` or `edges` missing → `400 { "error": "Поля nodes и edges обязательны" }`
- Upsert:
  ```sql
  INSERT INTO department_hierarchy (department_id, data, updated_at, updated_by)
  VALUES ($1, $2, NOW(), $3)
  ON CONFLICT (department_id) DO UPDATE
    SET data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by
  RETURNING updated_at
  ```
- Returns `{ updated_at }` on success
- On DB error: `500 { "error": "Не удалось сохранить иерархию отдела" }`

## Frontend

All changes in `pages/HRHierarchy.tsx` plus a new component `components/hierarchy/DepartmentHierarchyOverlay.tsx`.

### Context menu change (`pages/HRHierarchy.tsx`)

Add state:
```ts
const [activeDepartment, setActiveDepartment] = useState<{ id: number; name: string } | null>(null)
```

In the context menu JSX, before the "Изменить" button, add — only when `contextMenu.nodeType === 'department'`:
```tsx
{contextMenu.nodeType === 'department' && (
  <>
    <button
      onClick={() => {
        const node = nodes.find(n => n.id === contextMenu.nodeId)
        const d = node?.data as { id: number; name: string }
        setActiveDepartment({ id: d.id, name: d.name })
        setContextMenu(null)
      }}
      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
    >
      <ExternalLink className="h-4 w-4 text-muted-foreground" />
      Просмотреть отдел
    </button>
    <div className="h-px bg-border mx-2" />
  </>
)}
```

Import `ExternalLink` from `lucide-react`.

When `activeDepartment` is set, render the overlay inside the canvas area:
```tsx
{activeDepartment && (
  <DepartmentHierarchyOverlay
    departmentId={activeDepartment.id}
    departmentName={activeDepartment.name}
    onClose={() => setActiveDepartment(null)}
  />
)}
```

Place this inside the `<SaveSnapshotContext.Provider>` wrapper, as a sibling to the `<div className="flex-1 relative">` canvas div — but outside ReactFlow itself.

### `DepartmentHierarchyOverlay` component (`components/hierarchy/DepartmentHierarchyOverlay.tsx`)

Props:
```ts
interface Props {
  departmentId: number
  departmentName: string
  onClose: () => void
}
```

Self-contained component with its own state: `nodes`, `edges` (via `useNodesState`/`useEdgesState`), `historyRef`, `isRestoringRef`, `rfInstanceRef`, `pendingViewportRef`, `departments` (for SelectDepartmentModal/SelectEmployeeModal), `saving`, `savedLabel`, `error`, `loading`, `pendingDrop`, `editingNode`, `contextMenu`, `edgeContextMenu`.

**Load on mount**: `GET /api/hierarchy/department/:departmentId`. Restore nodes, edges, viewport (same `pendingViewportRef` pattern as main hierarchy).

**Save**: `PUT /api/hierarchy/department/:departmentId` with `rfInstanceRef.current.toObject()`.

**Undo**: same `historyRef` + `useEffect` keyboard handler for Ctrl+Z / `e.code === 'KeyZ'`. The handler must use `e.stopPropagation()` is not needed, but attach to `document` scoped inside a `useEffect` that cleans up on unmount — this naturally overrides the main hierarchy's handler while the overlay is open (last registered handler runs last; since both call `e.preventDefault()`, both will fire; use a `ref` guard or check overlay is mounted).

Actually: attach the keyboard handler inside `DepartmentHierarchyOverlay` with `useEffect`, and detach on unmount. Since the main HRHierarchy also listens, both will fire. Prevent this by checking a ref: pass no special ref — instead, the overlay handler calls `e.stopPropagation()` (keyboard events don't bubble by default on `document`). Solution: use `{ capture: true }` in the overlay's listener so it fires first, then call `e.preventDefault()` to block browser default. The main hierarchy's handler will also fire but has no effect since history is separate.

Simpler solution: When the overlay is mounted, it captures Ctrl+Z. Both handlers fire but each operates on its own `historyRef` — no conflict. This is acceptable.

**Editable edges**: same `EditableEdge` component, same `SaveSnapshotContext.Provider`, same `edgeTypes`.

**Canvas**: same ReactFlow setup — `ConnectionMode.Loose`, `deleteKeyCode="Delete"`, `edgeTypes`, `nodeTypes`, `onReconnect`, left panel with draggable blocks, modals for department/employee/text selection.

**Layout**: absolute overlay covering the entire canvas+body area (not the page header):
```tsx
<div className="absolute inset-0 z-20 flex flex-col bg-card">
  {/* Header */}
  <div className="px-6 py-3 border-b border-border flex items-center gap-3 flex-shrink-0">
    <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
      <ChevronLeft className="h-4 w-4" />
      Назад
    </button>
    <div className="h-4 w-px bg-border" />
    <span className="text-sm font-semibold">{departmentName}</span>
    <div className="ml-auto flex items-center gap-2">
      {savedLabel && <span className="text-xs text-green-600 dark:text-green-400">Сохранено</span>}
      <Button size="sm" variant="outline" onClick={save} disabled={saving}>
        <Save className="h-4 w-4 mr-1.5" />
        {saving ? 'Сохранение...' : 'Сохранить'}
      </Button>
    </div>
  </div>
  {/* Body: left panel + canvas */}
</div>
```

The overlay is placed as a child of the `<div className="flex flex-col overflow-hidden ...">` root element of `HRHierarchy`, so `absolute inset-0` covers the full component area including the header of the main page.

Wait — it should cover only the body area (below the main "Иерархия" header), not the whole page. Place it inside the `<div className="flex flex-1 overflow-hidden">` body wrapper, so `absolute inset-0` is scoped to that div (which has `position: relative` or we add it).

Actually the body div is: `<div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>`. Add `relative` to this div and render the overlay inside it.

## Access Control

Same as main hierarchy — the `HRRoute` guard already restricts the page. No additional checks needed.

## Error Handling

| Case | Response |
|------|----------|
| `GET` DB error | `500 { "error": "Не удалось загрузить иерархию отдела" }` |
| `PUT` missing nodes/edges | `400 { "error": "Поля nodes и edges обязательны" }` |
| `PUT` DB error | `500 { "error": "Не удалось сохранить иерархию отдела" }` |
| Frontend load error | show error in overlay body |
| Frontend save error | show error in overlay header area |

## Out of Scope

- Navigating between department hierarchies without going back to main first
- Auto-populating department hierarchy from existing department employees
- Department hierarchy visible to non-HR users
