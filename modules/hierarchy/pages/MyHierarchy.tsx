import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  ConnectionMode,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ChevronDown, ExternalLink, Network, Pencil, User, X } from 'lucide-react'
import { apiGet } from '@/shared/lib/apiClient'
import { DepartmentSchemeModal } from '@/modules/hierarchy/components/DepartmentSchemeModal'
import { HierarchyTagsToggle } from '@/modules/hierarchy/components/HierarchyTagsToggle'
import { useUIStore } from '@/shared/store/uiStore'
import { useOrgStore } from '@/shared/store/orgStore'
import { useModulesStore } from '@/shared/store/modulesStore'
import { useCan } from '@/shared/lib/permissions'
import { Button } from '@/shared/components/ui/Button'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'
import { getErrorMessage } from '@/shared/lib/utils'
import { nodeTypes, edgeTypes, HRHierarchy } from '@/modules/hierarchy/pages/HRHierarchy'

export function MyHierarchy() {
  const navigate = useNavigate()
  const darkMode = useUIStore((s) => s.darkMode)
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const currentOrgId = useOrgStore((s) => s.currentOrgId)
  const hierarchyEnabled = useModulesStore((s) => s.isModuleEnabled)('hierarchy')
  const mayManageHierarchy = useCan('hierarchy:manage')
  const canEdit = hierarchyEnabled && currentOrgId != null && mayManageHierarchy
  const [myDepartments, setMyDepartments] = useState<Array<{ id: number; name: string }>>([])
  const [deptMenuOpen, setDeptMenuOpen] = useState(false)
  const [schemeDept, setSchemeDept] = useState<{ id: number; name: string; fromCanvas?: boolean } | null>(null)

  useEffect(() => {
    if (!hierarchyEnabled || canEdit) return
    apiGet<Array<{ id: number; name: string }>>('/hierarchy/my-departments')
      .then(setMyDepartments)
      .catch(() => setMyDepartments([]))
  }, [hierarchyEnabled, canEdit])

  const openScheme = (dept: { id: number; name: string }) => {
    setDeptMenuOpen(false)
    setSchemeDept(dept)
  }

  const close = useCallback(() => navigate('/dashboard'), [navigate])

  const [nodeMenu, setNodeMenu] = useState<{ x: number; y: number; kind: 'department' | 'employee'; id: number; name: string } | null>(null)

  const onNodeContextMenu = useCallback<NodeMouseHandler>((e, node) => {
    if (node.type !== 'department' && node.type !== 'employee') return
    const d = node.data as { id?: number; name?: string } | undefined
    if (d?.id == null) return
    e.preventDefault()
    setDeptMenuOpen(false)
    setNodeMenu({
      x: Math.min(e.clientX, window.innerWidth - 260),
      y: Math.min(e.clientY, window.innerHeight - 120),
      kind: node.type,
      id: Number(d.id),
      name: d.name ?? 'Отдел',
    })
  }, [])

  useEffect(() => {
    if (!nodeMenu) return
    const close = () => setNodeMenu(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        setNodeMenu(null)
      }
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('wheel', close, { passive: true })
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('wheel', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [nodeMenu])

  const onNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    if (node.type !== 'department') return
    const d = node.data as { id?: number; name?: string } | undefined
    if (d?.id == null) return
    setDeptMenuOpen(false)
    setSchemeDept({ id: Number(d.id), name: d.name ?? 'Отдел', fromCanvas: true })
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`${API_BASE_URL}/hierarchy`, { headers: getAuthHeaders() })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Не удалось загрузить иерархию')
        }
        return res.json()
      })
      .then((payload) => {
        if (cancelled) return
        const data = payload?.data ?? { nodes: [], edges: [] }
        setNodes(Array.isArray(data.nodes) ? data.nodes : [])
        setEdges(
          (Array.isArray(data.edges) ? data.edges : []).map((e: Edge) => ({ ...e, type: 'editable' })),
        )
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  useEffect(() => {
    if (editing || schemeDept) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, editing, schemeDept])

  if (editing && currentOrgId != null) {
    return (
      <HRHierarchy
        fullscreen
        orgId={currentOrgId}
        onClose={() => {
          setEditing(false)
          setReloadKey((k) => k + 1)
        }}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      {schemeDept && (
        <DepartmentSchemeModal departmentId={schemeDept.id} departmentName={schemeDept.name} showPageLink={schemeDept.fromCanvas} onClose={() => setSchemeDept(null)} />
      )}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2 min-w-0">
          <Network className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-[15px] font-semibold">Иерархия организации</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <HierarchyTagsToggle />
          {myDepartments.length > 0 && (
            <div className="relative">
              <Button
                size="sm"
                variant="outline"
                onClick={() => (myDepartments.length === 1 ? openScheme(myDepartments[0]) : setDeptMenuOpen((v) => !v))}
              >
                <Pencil className="mr-1.5 h-4 w-4" />
                {myDepartments.length === 1 ? `Схема: ${myDepartments[0].name}` : 'Схемы моих отделов'}
                {myDepartments.length > 1 && <ChevronDown className="ml-1 h-3.5 w-3.5" />}
              </Button>
              {deptMenuOpen && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-10 max-h-[60vh] min-w-[220px] overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-xl">
                  {myDepartments.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => openScheme(d)}
                      className="block w-full rounded-lg px-2.5 py-2 text-left text-[13.5px] hover:bg-muted"
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {canEdit && (
            <Button size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-1.5 h-4 w-4" />
              Редактировать
            </Button>
          )}
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative flex-1" style={{ minHeight: 0 }}>
        {error && (
          <div className="absolute inset-x-0 top-0 z-10 m-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full max-w-sm space-y-2 px-6">
              <div className="h-6 w-full rounded bg-muted animate-pulse" />
              <div className="h-6 w-2/3 rounded bg-muted animate-pulse" />
              <div className="h-6 w-1/2 rounded bg-muted animate-pulse" />
            </div>
          </div>
        ) : !error && nodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-muted-foreground/50">
              <Network className="h-14 w-14 mx-auto mb-3" />
              <p className="text-sm">Схема ещё не построена</p>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesReconnectable={false}
            elementsSelectable={false}
            deleteKeyCode={null}
            connectionMode={ConnectionMode.Loose}
            colorMode={darkMode ? 'dark' : 'light'}
            proOptions={{ hideAttribution: true }}
            onNodeClick={onNodeClick}
            onNodeContextMenu={onNodeContextMenu}
            onPaneContextMenu={(e) => { e.preventDefault(); setNodeMenu(null) }}
            fitView
            fitViewOptions={{ maxZoom: 1 }}
          >
            <style>{'.react-flow__node-department { cursor: pointer; }'}</style>
            <Controls showInteractive={false} />
            <MiniMap nodeStrokeWidth={3} zoomable pannable />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--border))" />
          </ReactFlow>
        )}
      </div>

      {nodeMenu && (
        <div
          role="menu"
          style={{ left: nodeMenu.x, top: nodeMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          className="fixed z-[65] min-w-[240px] rounded-xl border border-border bg-card p-1.5 shadow-xl animate-scale-in"
        >
          {nodeMenu.kind === 'department' ? (
            <>
              <p className="truncate px-2.5 pb-1 pt-0.5 text-[11px] font-medium text-muted-foreground">{nodeMenu.name}</p>
              <button
                role="menuitem"
                onClick={() => { setSchemeDept({ id: nodeMenu.id, name: nodeMenu.name, fromCanvas: true }); setNodeMenu(null) }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] hover:bg-muted"
              >
                <Network className="h-3.5 w-3.5 text-muted-foreground" /> Открыть структуру подразделения
              </button>
              <button
                role="menuitem"
                onClick={() => navigate(`/departments/${nodeMenu.id}`)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] hover:bg-muted"
              >
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /> Страница отдела
              </button>
            </>
          ) : (
            <button
              role="menuitem"
              onClick={() => navigate(`/employees/${nodeMenu.id}`)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] hover:bg-muted"
            >
              <User className="h-3.5 w-3.5 text-muted-foreground" /> Открыть профиль
            </button>
          )}
        </div>
      )}
    </div>
  )
}
