# Department Hierarchy — Design Spec

**Date:** 2026-03-26
**Status:** Approved

## Overview

Add a "Просмотреть отдел" context menu item to department nodes in the HR Hierarchy canvas. Clicking it opens a full-body overlay showing a per-department editable org chart — same blocks, same editing tools, stored separately per department in PostgreSQL.

## Database

Add to `backend/src/db/migrate.js` before the final `console.log('✅ Migrations completed successfully')`:

```js
await db.query(`
  CREATE TABLE IF NOT EXISTS department_hierarchy (
    department_id INTEGER PRIMARY KEY REFERENCES departments(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}',
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  )
`).catch(e => console.log('  - department_hierarchy:', e.message))
console.log('  ✓ department_hierarchy')
```

`department_id` is the primary key — one row per department. `ON DELETE CASCADE` removes the hierarchy when the department is deleted.

## Backend API

Add two endpoints to `backend/src/routes/hierarchy.js` **before** `export default router`. Register them before any future `/:id` routes to prevent Express matching the literal string `"department"` as an id parameter.

### `GET /api/hierarchy/department/:id`

- Middleware: `authenticateToken`
- Query: `SELECT data, updated_at, updated_by FROM department_hierarchy WHERE department_id = $1`
- If no row: return `{ data: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, updated_at: null, updated_by: null }`
- On success: return `{ data, updated_at, updated_by }`
- On DB error: `500 { "error": "Не удалось загрузить иерархию отдела" }`

### `PUT /api/hierarchy/department/:id`

- Middleware: `authenticateToken`, `authorizeRoles('hr', 'admin')`
- Body: `{ nodes, edges, viewport }`
- Validate: missing `nodes` or `edges` → `400 { "error": "Поля nodes и edges обязательны" }`
- Build data payload applying viewport fallback: `{ nodes, edges, viewport: viewport ?? { x: 0, y: 0, zoom: 1 } }`
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

### Context menu change (`pages/HRHierarchy.tsx`)

**New state:**
```ts
const [activeDepartment, setActiveDepartment] = useState<{ id: number; name: string } | null>(null)
```

**New lucide import:** add `ExternalLink` to the existing lucide-react import line.

**Context menu JSX:** inside the `{contextMenu && (...)}` block, add before the "Изменить" button:
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

**Overlay render:** add `relative` class to the body wrapper div (`<div className="flex flex-1 overflow-hidden">`), then render the overlay as its last child:
```tsx
{activeDepartment && (
  <DepartmentHierarchyOverlay
    departmentId={activeDepartment.id}
    departmentName={activeDepartment.name}
    departments={departments}
    onClose={() => setActiveDepartment(null)}
  />
)}
```

`absolute inset-0` on the overlay is scoped to this `relative` body div, covering both the left panel and the canvas — but not the main "Иерархия" page header above.

### `DepartmentHierarchyOverlay` (`components/hierarchy/DepartmentHierarchyOverlay.tsx`)

**Props:**
```ts
interface Props {
  departmentId: number
  departmentName: string
  departments: Department[]   // passed from parent — avoids duplicate API call
  onClose: () => void
}
```

**Imports needed from lucide-react:** `ChevronLeft`, `Save`, `Building2`, `User`, `AlignLeft`, `Search`, `X`, `Pencil`, `ArrowLeftRight`, `Trash2`

The component is self-contained with its own state:
- `nodes`, `edges` via `useNodesState` / `useEdgesState`
- `rfInstanceRef`, `pendingViewportRef` (for deferred viewport restore in `handleInit`)
- `historyRef`, `isRestoringRef` (undo stack)
- `saving`, `savedLabel`, `error`, `hierarchyLoading`
- `pendingDrop`, `editingNode`, `contextMenu`, `edgeContextMenu`

**Reused shared pieces** (import directly, do not redefine):
- Node components: `DepartmentNode`, `EmployeeNode`, `TextNode`, `nodeTypes`
- Edge: `EditableEdge`, `edgeTypes`, `EditableEdge`-related constants
- Modals: `SelectDepartmentModal`, `SelectEmployeeModal`, `TextInputModal`
- Context: `SaveSnapshotContext`
- Types: `Department`, `DeptEmployee`, `Waypoint`

Add the `export` keyword to the following declarations **in place** in `HRHierarchy.tsx` — do not move them to a separate file:
```ts
export { DepartmentNode, EmployeeNode, TextNode, nodeTypes, EditableEdge, edgeTypes }
export { SelectDepartmentModal, SelectEmployeeModal, TextInputModal }
export type { Department, DeptEmployee }
export { SaveSnapshotContext, EDGE_STYLE, EDGE_MARKER, NODE_COLORS }
```
The existing lazy import in `App.tsx` (`import('@/pages/HRHierarchy').then(m => ({ default: m.HRHierarchy }))`) is unaffected by adding more named exports.

**Undo (Ctrl+Z):** attach a `keydown` listener on `document` in a `useEffect`, same pattern as `HRHierarchy`. When the overlay is mounted, both the main hierarchy's handler and the overlay's handler fire on Ctrl+Z. This is harmless — each operates on its own isolated `historyRef`, so the main hierarchy's undo attempts to pop from its own history (unaffected by overlay edits). No special capture or stopPropagation needed.

**Load on mount:**
```ts
useEffect(() => {
  const load = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/hierarchy/department/${departmentId}`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Не удалось загрузить иерархию отдела')
      const { data } = await res.json()
      if (data.nodes) setNodes(data.nodes)
      if (data.edges) setEdges((data.edges as Edge[]).map((ed: Edge) => ({ ...ed, type: 'editable' })))
      if (data.viewport) {
        if (rfInstanceRef.current) rfInstanceRef.current.setViewport(data.viewport)
        else pendingViewportRef.current = data.viewport
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setHierarchyLoading(false)
    }
  }
  load()
}, [departmentId, setNodes, setEdges])
```

**Save:**
```ts
const save = async () => {
  const inst = rfInstanceRef.current
  if (!inst) return
  setSaving(true)
  try {
    const { nodes: n, edges: e, viewport } = inst.toObject()
    const res = await fetch(`${API_BASE_URL}/hierarchy/department/${departmentId}`, {
      method: 'PUT',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify({ nodes: n, edges: e, viewport }),
    })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(d.error || 'Не удалось сохранить иерархию отдела')
    }
    setSavedLabel(true)
    setTimeout(() => setSavedLabel(false), 2000)
  } catch (err) {
    setError(getErrorMessage(err))
  } finally {
    setSaving(false)
  }
}
```

**Layout:**
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
      {error && <span className="text-xs text-destructive">{error}</span>}
      {savedLabel && <span className="text-xs text-green-600 dark:text-green-400">Сохранено</span>}
      <Button size="sm" variant="outline" onClick={save} disabled={saving}>
        <Save className="h-4 w-4 mr-1.5" />
        {saving ? 'Сохранение...' : 'Сохранить'}
      </Button>
    </div>
  </div>
  {/* Body: left panel + canvas — same structure as HRHierarchy */}
  <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
    {/* left panel */}
    {/* canvas */}
  </div>
</div>
```

The left panel and canvas structure mirrors `HRHierarchy` exactly (same drag items, same ReactFlow props, same context menus, same modals).

## Access Control

`HRRoute` already restricts the page to `hr`/`admin`. No additional checks needed.

## Error Handling

| Case | Behavior |
|------|----------|
| `GET` DB error | `500 { "error": "Не удалось загрузить иерархию отдела" }` |
| `PUT` missing nodes/edges | `400 { "error": "Поля nodes и edges обязательны" }` |
| `PUT` DB error | `500 { "error": "Не удалось сохранить иерархию отдела" }` |
| Frontend load error | shown in overlay header (`error` state) |
| Frontend save error | shown in overlay header (`error` state) |

## Out of Scope

- Navigating between department hierarchies without going back to main view
- Auto-populating from existing department employees
- Department hierarchy visible to non-HR users
