import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ConnectionMode,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Building2, Network, X, Loader2, User, Save, Frame, AlignLeft, Pencil, Trash2, BookOpen, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/Button'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { getErrorMessage, cn } from '@/shared/lib/utils'
import { useUIStore } from '@/shared/store/uiStore'
import { nodeTypes as hierarchyNodeTypes, GroupNode, TextNode, TextInputModal, InstructionModal, HRHierarchy, ChildOrgNode, buildOrgOverlay, animateOrgReveal, ConfirmLeaveModal } from '@/modules/hierarchy/pages/HRHierarchy'

interface OrgItem {
  id: number
  name: string
  slug: string
  is_active: boolean
  member_count?: number
  head_id?: number | null
  head_first_name?: string | null
  head_last_name?: string | null
  parent_id?: number | null
  parent_name?: string | null
}

const GAP_X = 360
const GAP_Y = 240

const HANDLE_STYLE = { width: 10, height: 10, background: '#6b7280', border: '2px solid white' }
const HANDLE_CLASS = '!opacity-0 pointer-events-none'

function OrganizationNode({ data }: NodeProps) {
  const d = data as { name: string; memberCount?: number; headName?: string | null; childOrgs?: { id: number; name: string; childCount?: number }[] }
  return (
    <div className="group min-w-[240px] rounded-xl overflow-hidden shadow-lg border-2 border-indigo-500/60 bg-card hover:shadow-xl hover:border-primary transition-all duration-200 select-none cursor-pointer">
      <div className="px-4 py-3 bg-gradient-to-br from-indigo-500 to-blue-600">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-white/80 flex-shrink-0" />
          <span className="text-white font-semibold text-sm truncate">{d.name}</span>
        </div>
      </div>
      <div className="bg-card px-4 py-2 text-xs text-muted-foreground border-t border-border/50 space-y-1">
        {d.memberCount !== undefined && (
          <div>{d.memberCount} сотр.</div>
        )}
        {d.headName && (
          <div className="flex items-center gap-1.5">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{d.headName}</span>
          </div>
        )}
      </div>
      {(d.childOrgs?.length ?? 0) > 0 && (
        <div className="bg-card px-3 py-2 border-t border-border/50 space-y-1">
          {d.childOrgs!.map(c => (
            <div
              key={c.id}
              className="flex items-center gap-1.5 rounded-md bg-indigo-500/10 hover:bg-indigo-500/20 px-2 py-1.5 cursor-pointer text-xs nodrag"
              title="Нажмите, чтобы открыть иерархию организации"
              onClick={e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('wc-open-org', { detail: c.id })) }}
            >
              <Building2 className="h-3 w-3 text-indigo-500 shrink-0" />
              <span className="truncate text-foreground">{c.name}</span>
              {!!c.childCount && <span className="ml-auto text-muted-foreground shrink-0">+{c.childCount}</span>}
            </div>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Top} className={HANDLE_CLASS} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Bottom} className={HANDLE_CLASS} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Left} className={HANDLE_CLASS} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} className={HANDLE_CLASS} style={HANDLE_STYLE} />
    </div>
  )
}

const orgNodeTypes = { organization: OrganizationNode, group: GroupNode, text: TextNode }

function directChildrenMap(orgs: OrgItem[]) {
  const map = new Map<number, OrgItem[]>()
  for (const o of orgs) {
    if (o.parent_id == null) continue
    if (!map.has(o.parent_id)) map.set(o.parent_id, [])
    map.get(o.parent_id)!.push(o)
  }
  return map
}

function countDescendants(orgId: number, childrenMap: Map<number, OrgItem[]>): number {
  const kids = childrenMap.get(orgId) ?? []
  return kids.reduce((sum, k) => sum + 1 + countDescendants(k.id, childrenMap), 0)
}

function orgDataOf(o: OrgItem, childrenMap: Map<number, OrgItem[]>) {
  const kids = childrenMap.get(o.id) ?? []
  return {
    name: o.name,
    memberCount: o.member_count,
    headName: o.head_id ? [o.head_last_name, o.head_first_name].filter(Boolean).join(' ') || null : null,
    childOrgs: kids.map(k => ({ id: k.id, name: k.name, childCount: countDescendants(k.id, childrenMap) })),
  }
}

function buildOrgGraph(orgs: OrgItem[]) {
  const byId = new Map(orgs.map((o) => [o.id, o]))
  const childrenMap = directChildrenMap(orgs)
  const topLevel = orgs.filter((o) => !o.parent_id || !byId.has(o.parent_id))

  const nodes: Node[] = topLevel.map((o, idx) => ({
    id: `org-${o.id}`,
    type: 'organization',
    position: { x: idx * GAP_X, y: 0 },
    data: orgDataOf(o, childrenMap),
  }))

  const edges: Edge[] = []
  return { nodes, edges }
}

function refreshOrgNodes(orgList: OrgItem[], prevNodes: Node[], prevViewport: { x: number; y: number; zoom: number } | null) {
  const byId = new Map(orgList.map((o) => [o.id, o]))
  const childrenMap = directChildrenMap(orgList)
  const topLevel = orgList.filter((o) => !o.parent_id || !byId.has(o.parent_id))
  const topIds = new Set(topLevel.map((o) => `org-${o.id}`))

  const nodes: Node[] = []
  for (const n of prevNodes) {
    if (n.type === 'organization' && !topIds.has(n.id)) continue
    if (n.type === 'organization') {
      const o = byId.get(Number(String(n.id).replace('org-', '')))
      if (!o) continue
      nodes.push({ ...n, selected: false, data: orgDataOf(o, childrenMap) })
    } else {
      nodes.push({ ...n, selected: false })
    }
  }
  const present = new Set(nodes.map((n) => n.id))
  const missing = topLevel.filter((o) => !present.has(`org-${o.id}`))
  if (missing.length > 0) {
    const maxY = nodes.reduce((m, n) => Math.max(m, n.position?.y ?? 0), 0)
    missing.forEach((o, i) => {
      nodes.push({
        id: `org-${o.id}`,
        type: 'organization',
        position: { x: i * GAP_X, y: maxY + GAP_Y },
        data: orgDataOf(o, childrenMap),
      })
    })
  }
  return { nodes, edges: [] as Edge[], viewport: prevViewport }
}

function mergeSavedLayout(orgs: OrgItem[], saved: { nodes?: Node[]; edges?: Edge[]; viewport?: { x: number; y: number; zoom: number } } | null) {
  const graph = buildOrgGraph(orgs)
  if (!saved?.nodes?.length) {
    return { nodes: graph.nodes, edges: graph.edges, viewport: null }
  }
  return refreshOrgNodes(orgs, saved.nodes, saved.viewport ?? null)
}

function OrgHierarchyViewer({ org, canEditOrg, autoEdit = false, onClose }: { org: OrgItem; canEditOrg?: (orgId: number) => boolean; autoEdit?: boolean; onClose: () => void }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges] = useEdgesState<Edge>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentOrg, setCurrentOrg] = useState<OrgItem>(org)
  const [editing, setEditing] = useState(() => (autoEdit && canEditOrg ? canEditOrg(org.id) : false))
  const [navStack, setNavStack] = useState<OrgItem[]>([])
  const darkMode = useUIStore((s) => s.darkMode)
  const orgListRef = useRef<OrgItem[]>([])
  const viewerRfRef = useRef<ReactFlowInstance | null>(null)
  const pendingViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null)
  const currentOrgRef = useRef(currentOrg)
  useEffect(() => { currentOrgRef.current = currentOrg }, [currentOrg])

  useEffect(() => { setCurrentOrg(org); setEditing(autoEdit && canEditOrg ? canEditOrg(org.id) : false); setNavStack([]) }, [org, canEditOrg, autoEdit])

  const navigateTo = useCallback((target: OrgItem, keepEditing: boolean) => {
    setNavStack(s => [...s, currentOrgRef.current])
    setCurrentOrg(target)
    setEditing(keepEditing)
  }, [])

  const goBack = useCallback(() => {
    setNavStack(s => {
      if (s.length === 0) return s
      const prev = s[s.length - 1]
      setCurrentOrg(prev)
      setEditing(canEditOrg ? canEditOrg(prev.id) : false)
      return s.slice(0, -1)
    })
  }, [canEditOrg])

  useEffect(() => {
    fetch(`${API_BASE_URL}/organizations/tree`, { headers: getAuthHeaders() })
      .then(r => (r.ok ? r.json() : []))
      .then((all: OrgItem[]) => { if (Array.isArray(all)) orgListRef.current = all })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (editing) return
    const org = currentOrgRef.current
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [hierRes, orgsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/hierarchy`, {
            headers: { ...getAuthHeaders(), 'X-Organization-Id': String(org.id) },
          }),
          fetch(`${API_BASE_URL}/organizations/tree`, { headers: getAuthHeaders() }),
        ])
        if (!hierRes.ok) throw new Error('Не удалось загрузить иерархию')
        const { data } = await hierRes.json()
        const contentNodes: Node[] = (data.nodes || []).map((n: Node) => (n.type === 'group' ? { ...n, zIndex: 0 } : { ...n, zIndex: n.zIndex ?? 1 }))
        let childOrgs: OrgItem[] = []
        if (orgsRes.ok) {
          const allOrgs: OrgItem[] = await orgsRes.json()
          orgListRef.current = Array.isArray(allOrgs) ? allOrgs : []
          childOrgs = orgListRef.current.filter(o => o.parent_id === org.id)
        }
        const overlay = buildOrgOverlay(
          contentNodes,
          org,
          childOrgs,
          (data.orgPositions ?? {}) as Record<string, { x: number; y: number }>,
        )
        setNodes([...overlay.nodes, ...contentNodes])
        setEdges([...(data.edges || []).map((e: Edge) => ({ ...e, type: undefined })), ...overlay.edges])
        if (data.viewport) {
          if (viewerRfRef.current) animateOrgReveal(viewerRfRef.current, data.viewport)
          else pendingViewportRef.current = data.viewport
        } else if (viewerRfRef.current) {
          viewerRfRef.current.fitView({ duration: 550, padding: 0.15 })
        }
      } catch (err) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentOrg.id, editing, setNodes, setEdges])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editing) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, editing])

  const viewerNodeTypes = { ...hierarchyNodeTypes, organization: ChildOrgNode }

  const handleViewerInit = useCallback((inst: ReactFlowInstance) => {
    viewerRfRef.current = inst
    if (pendingViewportRef.current) {
      const target = pendingViewportRef.current
      pendingViewportRef.current = null
      animateOrgReveal(inst, target)
    } else {
      inst.fitView({ duration: 550, padding: 0.15 })
    }
  }, [])

  const onViewerNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    if (node.type !== 'organization') return
    const orgId = Number(String(node.id).replace('org-', ''))
    if (orgId === currentOrg.id) return
    const target = orgListRef.current.find(o => o.id === orgId)
    if (target) navigateTo(target, canEditOrg ? canEditOrg(target.id) : false)
  }, [currentOrg.id, canEditOrg, navigateTo])

  if (editing) {
    return (
      <HRHierarchy
        fullscreen
        orgId={currentOrg.id}
        onClose={() => setEditing(false)}
        onBack={navStack.length > 0 ? goBack : undefined}
        onOpenOrg={orgId => {
          const target = orgListRef.current.find(o => o.id === orgId)
          if (!target) return
          if (canEditOrg && canEditOrg(target.id)) {
            navigateTo(target, true)
            return
          }
          navigateTo(target, false)
        }}
        onViewOrg={orgId => {
          if (orgId === currentOrg.id) {
            setEditing(false)
            return
          }
          const target = orgListRef.current.find(o => o.id === orgId)
          if (target) navigateTo(target, false)
        }}
      />
    )
  }

  const content = (
    <div className="fixed inset-0 z-50 flex flex-col bg-card animate-in fade-in duration-200">
      <div className="px-6 py-4 border-b border-border flex-shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            {currentOrg.name}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Клик по вложенной организации открывает её иерархию.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {navStack.length > 0 && (
            <Button size="sm" variant="outline" onClick={goBack}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              {navStack[navStack.length - 1].name}
            </Button>
          )}
          {(canEditOrg ? canEditOrg(currentOrg.id) : false) && (
            <Button size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4 mr-1.5" />
              Редактировать
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-destructive">{error}</div>
        )}
        {!loading && !error && (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={viewerNodeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={onViewerNodeClick}
            onInit={handleViewerInit}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesReconnectable={false}
            deleteKeyCode={null}
            connectionMode={ConnectionMode.Loose}
            colorMode={darkMode ? 'dark' : 'light'}
            minZoom={0.1}
            proOptions={{ hideAttribution: true }}
          >
            <Controls showInteractive={false} />
            <MiniMap nodeStrokeWidth={3} zoomable pannable />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--border))" />
          </ReactFlow>
        )}
      </div>
    </div>
  )

  return createPortal(content, document.body)
}

interface Props {
  fullscreen?: boolean
  onClose?: () => void
  editScopeOrgId?: number
  initialOrgId?: number
}

export function GlobalHierarchy({ fullscreen = false, onClose, editScopeOrgId, initialOrgId }: Props) {
  const restricted = editScopeOrgId !== undefined
  const canEditOrg = useCallback((orgId: number) => editScopeOrgId === undefined || orgId === editScopeOrgId, [editScopeOrgId])
  const [orgs, setOrgs] = useState<OrgItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedOrg, setSelectedOrg] = useState<OrgItem | null>(null)
  const [viewerAutoEdit, setViewerAutoEdit] = useState(false)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges] = useEdgesState<Edge>([])
  const [pendingDrop, setPendingDrop] = useState<{ type: 'group' | 'text'; position: { x: number; y: number } } | null>(null)
  const [editingNode, setEditingNode] = useState<{ id: string; type: 'group' | 'text' } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedLabel, setSavedLabel] = useState(false)
  const [showInstruction, setShowInstruction] = useState(false)
  const [pendingNest, setPendingNest] = useState<{ orgId: number; orgName: string; targetId: number; targetName: string; prevPosition: { x: number; y: number } } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const darkMode = useUIStore((s) => s.darkMode)
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null)
  const pendingViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null)
  const dragStartPosRef = useRef<Map<string, { x: number; y: number }>>(new Map())

  const onNodeDragStart = useCallback((_: unknown, node: Node) => {
    dragStartPosRef.current.set(node.id, { x: node.position.x, y: node.position.y })
  }, [])

  const requestClose = useCallback(() => {
    if (dirty) {
      setConfirmLeave(true)
      return
    }
    onClose?.()
  }, [dirty, onClose])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [contextMenu])

  useEffect(() => {
    if (!fullscreen || !onClose) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !selectedOrg && !pendingDrop && !editingNode && !showInstruction && !pendingNest && !confirmLeave) requestClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen, onClose, selectedOrg, pendingDrop, editingNode, showInstruction, pendingNest, confirmLeave, requestClose])

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  useEffect(() => {
    const load = async () => {
      try {
        const [orgRes, layoutRes] = await Promise.all([
          fetch(`${API_BASE_URL}/organizations/tree`, { headers: getAuthHeaders() }),
          fetch(`${API_BASE_URL}/hierarchy/global`, { headers: getAuthHeaders() }),
        ])
        if (!orgRes.ok) throw new Error('Не удалось загрузить организации')
        const data = await orgRes.json()
        const orgList: OrgItem[] = Array.isArray(data) ? data : []
        setOrgs(orgList)
        if (initialOrgId != null) {
          const own = orgList.find(o => o.id === initialOrgId)
          if (own) { setViewerAutoEdit(false); setSelectedOrg(own) }
        }
        let saved: { nodes?: Node[]; edges?: Edge[]; viewport?: { x: number; y: number; zoom: number } } | null = null
        if (layoutRes.ok) {
          const j = await layoutRes.json()
          saved = j?.data ?? null
        }
        const merged = mergeSavedLayout(orgList, saved)
        setNodes(merged.nodes)
        setEdges(merged.edges)
        setDirty(false)
        if (merged.viewport) {
          if (rfInstanceRef.current) {
            rfInstanceRef.current.setViewport(merged.viewport)
          } else {
            pendingViewportRef.current = merged.viewport
          }
        }
      } catch (err) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [setNodes, setEdges, initialOrgId])

  const handleInit = useCallback((inst: ReactFlowInstance) => {
    rfInstanceRef.current = inst
    if (pendingViewportRef.current) {
      inst.setViewport(pendingViewportRef.current)
      pendingViewportRef.current = null
    }
  }, [])

  const displayNodes = useMemo(
    () => nodes.map(n => (n.type === 'group' ? { ...n, zIndex: 0 } : { ...n, zIndex: n.zIndex ?? 1 })) as Node[],
    [nodes],
  )

  const onNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    if (node.type !== 'organization') return
    const orgId = Number(String(node.id).replace('org-', ''))
    const org = orgs.find((o) => o.id === orgId)
    if (org) { setViewerAutoEdit(false); setSelectedOrg(org) }
  }, [orgs])

  const onNodeContextMenu = useCallback<NodeMouseHandler>((e, node) => {
    if (node.type !== 'group' && node.type !== 'text') return
    e.preventDefault()
    setContextMenu({ nodeId: node.id, x: e.clientX, y: e.clientY })
  }, [])

  const onNodeDragStop = useCallback((_: unknown, draggedNode: Node) => {
    setDirty(true)
    if (draggedNode.type !== 'organization') return
    const inst = rfInstanceRef.current
    if (!inst) return
    const draggedId = Number(String(draggedNode.id).replace('org-', ''))
    const draggedOrg = orgs.find(o => o.id === draggedId)
    if (!draggedOrg) return
    const dragged = inst.getNode(draggedNode.id)
    const dw = dragged?.measured?.width ?? 240
    const dh = dragged?.measured?.height ?? 100
    const cx = draggedNode.position.x + dw / 2
    const cy = draggedNode.position.y + dh / 2
    const target = inst.getNodes().find(n => {
      if (n.type !== 'organization' || n.id === draggedNode.id) return false
      const w = n.measured?.width ?? 240
      const h = n.measured?.height ?? 100
      return cx >= n.position.x && cx <= n.position.x + w && cy >= n.position.y && cy <= n.position.y + h
    })
    if (!target) return
    const targetId = Number(String(target.id).replace('org-', ''))
    const targetOrg = orgs.find(o => o.id === targetId)
    if (!targetOrg) return
    const parentOf = new Map(orgs.map(o => [o.id, o.parent_id ?? null]))
    let cur: number | null = targetId
    const seen = new Set<number>()
    while (cur !== null && !seen.has(cur)) {
      seen.add(cur)
      if (cur === draggedId) {
        toast('Нельзя перенести организацию в её дочернюю')
        return
      }
      cur = parentOf.get(cur) ?? null
    }
    const prevPosition = dragStartPosRef.current.get(draggedNode.id) ?? { x: draggedNode.position.x, y: draggedNode.position.y }
    setPendingNest({
      orgId: draggedId,
      orgName: draggedOrg.name,
      targetId,
      targetName: targetOrg.name,
      prevPosition,
    })
  }, [orgs])

  const cancelNest = useCallback(() => {
    if (!pendingNest) return
    setNodes(nds => nds.map(n => n.id === `org-${pendingNest.orgId}` ? { ...n, position: pendingNest.prevPosition } : n))
    setPendingNest(null)
  }, [pendingNest, setNodes])

  const confirmNest = useCallback(() => {
    if (!pendingNest) return
    const { orgId, targetId, prevPosition } = pendingNest
    setPendingNest(null)
    const restorePosition = () => {
      setNodes(nds => nds.map(n => n.id === `org-${orgId}` ? { ...n, position: prevPosition } : n))
    }
    fetch(`${API_BASE_URL}/organizations/${orgId}`, {
      method: 'PUT',
      headers: getAuthHeadersWithContentType(),
      body: JSON.stringify({ parent_id: targetId }),
    }).then(async res => {
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error || 'Не удалось перенести организацию')
        restorePosition()
        return
      }
      const updatedOrgs = orgs.map(o => o.id === orgId ? { ...o, parent_id: targetId } : o)
      setOrgs(updatedOrgs)
      setNodes(prev => refreshOrgNodes(updatedOrgs, prev, null).nodes)
      setEdges([])
      setDirty(true)
      toast('Организация перенесена внутрь родительской')
    }).catch(() => {
      toast.error('Не удалось перенести организацию')
      restorePosition()
    })
  }, [pendingNest, orgs, setNodes, setEdges])

  useEffect(() => {
    const openOrg = (e: Event) => {
      const orgId = (e as CustomEvent<number>).detail
      const org = orgs.find(o => o.id === orgId)
      if (org) { setViewerAutoEdit(false); setSelectedOrg(org) }
    }
    window.addEventListener('wc-open-org', openOrg as EventListener)
    return () => window.removeEventListener('wc-open-org', openOrg as EventListener)
  }, [orgs])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('reactflow-type') as 'group' | 'text'
    if (type !== 'group' && type !== 'text') return
    const inst = rfInstanceRef.current
    if (!inst) return
    const position = inst.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    setPendingDrop({ type, position })
  }, [])

  const handleCreateFromDrop = (title: string) => {
    if (!pendingDrop) return
    setNodes(nds => [...nds, pendingDrop.type === 'group'
      ? {
          id: `group-${Date.now()}`,
          type: 'group',
          position: { x: pendingDrop.position.x - 200, y: pendingDrop.position.y - 14 },
          style: { width: 400, height: 260 },
          data: { title },
        } as Node
      : {
          id: `text-${Date.now()}`,
          type: 'text',
          position: pendingDrop.position,
          data: { text: title },
        } as Node])
    setDirty(true)
    setPendingDrop(null)
  }

  const handleEditNode = (title: string) => {
    if (!editingNode) return
    setNodes(nds => nds.map(n => n.id === editingNode.id
      ? { ...n, data: editingNode.type === 'group' ? { ...n.data, title } : { ...n.data, text: title } }
      : n))
    setDirty(true)
    setEditingNode(null)
  }

  const deleteNode = (nodeId: string) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId))
    setDirty(true)
    setContextMenu(null)
  }

  const save = async () => {
    const inst = rfInstanceRef.current
    if (!inst) return
    setSaving(true)
    try {
      const { nodes: n, edges: e, viewport } = inst.toObject()
      const nodesClean = n.map(x => ({ ...x, selected: false }))
      const res = await fetch(`${API_BASE_URL}/hierarchy/global`, {
        method: 'PUT',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ nodes: nodesClean, edges: e, viewport }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Не удалось сохранить глобальную иерархию')
      }
      setSavedLabel(true)
      setDirty(false)
      setTimeout(() => setSavedLabel(false), 2000)
    } catch (err) {
      toast.error('Не удалось сохранить глобальную иерархию: ' + getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const content = (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border border-border shadow-sm bg-card',
        fullscreen && 'fixed inset-0 z-50 rounded-none border-0',
      )}
      style={fullscreen ? undefined : { height: 'calc(100vh - 220px)', minHeight: '500px' }}
    >
      <div className="px-6 py-4 border-b border-border flex-shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            Глобальная иерархия
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {restricted
              ? 'Все учреждения системы. Клик по организации открывает её иерархию; ваша организация — сразу в редактировании.'
              : 'Все учреждения системы. Клик по учреждению открывает редактор его иерархии. Перетащите организации в группы для наглядности.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Учреждений: {orgs.length}</span>
          {savedLabel && <span className="text-xs text-green-600 dark:text-green-400">Сохранено</span>}
          {!restricted && (
            <Button size="sm" variant="outline" onClick={save} disabled={saving}>
              <Save className="h-4 w-4 mr-1.5" />
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
          )}
          {fullscreen && onClose && (
            <Button size="sm" variant="outline" onClick={requestClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="relative flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {!restricted && (
        <div className="w-52 flex-shrink-0 border-r border-border p-4 space-y-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Элементы
          </p>
          <div
            draggable
            onDragStart={e => { e.dataTransfer.setData('reactflow-type', 'group'); e.dataTransfer.effectAllowed = 'move' }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-border bg-muted/30 cursor-grab active:cursor-grabbing hover:bg-muted/60 hover:border-border transition-all select-none"
          >
            <div className="w-9 h-9 rounded-lg bg-muted border-2 border-dashed border-border flex items-center justify-center flex-shrink-0">
              <Frame className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-sm font-semibold">Группа организаций</div>
              <div className="text-[10px] text-muted-foreground">Рамка для учреждений</div>
            </div>
          </div>
          <div
            draggable
            onDragStart={e => { e.dataTransfer.setData('reactflow-type', 'text'); e.dataTransfer.effectAllowed = 'move' }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-border bg-muted/30 cursor-grab active:cursor-grabbing hover:bg-muted/60 hover:border-border transition-all select-none"
          >
            <div className="w-9 h-9 rounded-lg bg-muted border-2 border-border flex items-center justify-center flex-shrink-0">
              <AlignLeft className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-sm font-semibold">Описание</div>
              <div className="text-[10px] text-muted-foreground">Текстовый блок</div>
            </div>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={() => setShowInstruction(true)}>
            <BookOpen className="h-4 w-4 mr-1.5" />
            Инструкция
          </Button>
        </div>
        )}
        <div className="flex-1 relative" style={{ minHeight: 0 }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-destructive z-10">{error}</div>
          )}
          {!loading && !error && (
            <ReactFlow
              nodes={displayNodes}
              edges={edges}
              nodeTypes={orgNodeTypes}
              onNodesChange={onNodesChange}
              onNodeClick={onNodeClick}
              onNodeContextMenu={restricted ? undefined : onNodeContextMenu}
              onNodeDragStart={restricted ? undefined : onNodeDragStart}
              onNodeDragStop={restricted ? undefined : onNodeDragStop}
              onDrop={restricted ? undefined : onDrop}
              onDragOver={restricted ? undefined : onDragOver}
              onInit={handleInit}
              nodesDraggable={!restricted}
              nodesConnectable={false}
              edgesReconnectable={false}
              deleteKeyCode={null}
              connectionMode={ConnectionMode.Loose}
              colorMode={darkMode ? 'dark' : 'light'}
              fitView
              fitViewOptions={{ maxZoom: 1 }}
              minZoom={0.1}
              proOptions={{ hideAttribution: true }}
            >
              <Controls showInteractive={false} />
              <MiniMap nodeStrokeWidth={3} zoomable pannable />
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--border))" />
            </ReactFlow>
          )}
        </div>
        {contextMenu && (() => {
          const node = nodes.find(n => n.id === contextMenu.nodeId)
          if (!node) return null
          return (
            <div
              className="fixed z-50 min-w-[180px] overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-in"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => { setEditingNode({ id: node.id, type: node.type as 'group' | 'text' }); setContextMenu(null) }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
              >
                <Pencil className="h-4 w-4 text-muted-foreground" />
                Изменить
              </button>
              <div className="h-px bg-border mx-2" />
              <button
                onClick={() => deleteNode(contextMenu.nodeId)}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Удалить
              </button>
            </div>
          )
        })()}
        {pendingNest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden animate-scale-in">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Network className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">Перенести организацию?</h2>
                </div>
                <button onClick={cancelNest} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <div className="px-6 py-4">
                <p className="text-sm text-muted-foreground">
                  Организация <span className="font-medium text-foreground">«{pendingNest.orgName}»</span> будет перенесена внутрь{' '}
                  <span className="font-medium text-foreground">«{pendingNest.targetName}»</span> и станет её дочерней.
                </p>
              </div>
              <div className="px-6 py-3 border-t border-border flex gap-2">
                <Button variant="outline" className="flex-1" onClick={cancelNest}>Отмена</Button>
                <Button className="flex-1" onClick={confirmNest}>Перенести</Button>
              </div>
            </div>
          </div>
        )}
        {showInstruction && (
          <InstructionModal
            title="Инструкция по глобальной иерархии"
            onClose={() => setShowInstruction(false)}
            items={[
              { title: 'Просмотр учреждения', text: 'Клик по организации открывает её иерархию: сама организация — корневой узел сверху, ниже — схема её отделов и дочерние организации, соединённые стрелками с корнем. Клик по дочерней организации переходит внутрь неё, кнопка в шапке возвращает назад.' },
              { title: 'Вложенность организаций', text: 'Перетащите организацию поверх другой — откроется подтверждение. После переноса организация проваливается внутрь родительской и отображается строкой в её карточке; клик по строке открывает иерархию вложенной организации. Перенос в свою дочернюю невозможен.' },
              { title: 'Группы организаций', text: 'Пунктирная рамка из панели слева объединяет организации визуально. Растяните её за углы при выделении, перетащите организации внутрь.' },
              { title: 'Описание', text: 'Текстовый блок для заметок на схеме. Редактирование и удаление — через ПКМ.' },
              { title: 'Связи', text: 'Стрелки между организациями строятся автоматически по вложенности и не редактируются вручную.' },
              { title: 'Сохранение', text: 'Кнопка «Сохранить» фиксирует расположение организаций, группы и описания. Вложенность применяется сразу.' },
            ]}
          />
        )}
        {pendingDrop && (
          <TextInputModal
            onConfirm={handleCreateFromDrop}
            onClose={() => setPendingDrop(null)}
            initialText={pendingDrop.type === 'group' ? 'Группа организаций' : ''}
          />
        )}
        {editingNode && (() => {
          const n = nodes.find(x => x.id === editingNode.id)
          if (!n) return null
          const d = n.data as { title?: string; text?: string }
          return (
            <TextInputModal
              onConfirm={handleEditNode}
              onClose={() => setEditingNode(null)}
              initialText={editingNode.type === 'group' ? d.title ?? '' : d.text ?? ''}
            />
          )
        })()}
      </div>
      {confirmLeave && (
        <ConfirmLeaveModal
          onConfirm={() => { setConfirmLeave(false); onClose?.() }}
          onClose={() => setConfirmLeave(false)}
        />
      )}
      {selectedOrg && (
        <OrgHierarchyViewer org={selectedOrg} canEditOrg={canEditOrg} autoEdit={viewerAutoEdit} onClose={() => setSelectedOrg(null)} />
      )}
    </div>
  )

  return fullscreen ? createPortal(content, document.body) : content
}
