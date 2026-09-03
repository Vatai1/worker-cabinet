import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
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
import { Building2, Network, X, Loader2, User, Save, Frame, AlignLeft, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { getErrorMessage, cn } from '@/shared/lib/utils'
import { nodeTypes as hierarchyNodeTypes, GroupNode, TextNode, TextInputModal, EDGE_STYLE } from '@/modules/hierarchy/pages/HRHierarchy'

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
  const d = data as { name: string; memberCount?: number; headName?: string | null }
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
      <Handle type="source" position={Position.Top} className={HANDLE_CLASS} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Bottom} className={HANDLE_CLASS} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Left} className={HANDLE_CLASS} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} className={HANDLE_CLASS} style={HANDLE_STYLE} />
    </div>
  )
}

const orgNodeTypes = { organization: OrganizationNode, group: GroupNode, text: TextNode }

function orgDataOf(o: OrgItem) {
  return {
    name: o.name,
    memberCount: o.member_count,
    headName: o.head_id ? [o.head_last_name, o.head_first_name].filter(Boolean).join(' ') || null : null,
  }
}

function buildOrgGraph(orgs: OrgItem[]) {
  const byId = new Map(orgs.map((o) => [o.id, o]))
  const levelOf = new Map<number, number>()
  for (const o of orgs) {
    const visited = new Set<number>()
    let cur: OrgItem | undefined = o
    let level = 0
    while (cur?.parent_id && !visited.has(cur.id)) {
      visited.add(cur.id)
      cur = byId.get(cur.parent_id)
      level += 1
    }
    levelOf.set(o.id, level)
  }

  const counterByLevel = new Map<number, number>()
  const nodes: Node[] = orgs.map((o) => {
    const level = levelOf.get(o.id) || 0
    const idx = counterByLevel.get(level) || 0
    counterByLevel.set(level, idx + 1)
    return {
      id: `org-${o.id}`,
      type: 'organization',
      position: { x: idx * GAP_X, y: level * GAP_Y },
      data: orgDataOf(o),
    }
  })

  const edges: Edge[] = orgs
    .filter((o) => o.parent_id && byId.has(o.parent_id))
    .map((o) => ({
      id: `e-org-${o.parent_id}-${o.id}`,
      source: `org-${o.parent_id}`,
      target: `org-${o.id}`,
      style: EDGE_STYLE,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280' },
    }))

  return { nodes, edges }
}

function mergeSavedLayout(orgs: OrgItem[], saved: { nodes?: Node[]; edges?: Edge[]; viewport?: { x: number; y: number; zoom: number } } | null) {
  const graph = buildOrgGraph(orgs)
  if (!saved?.nodes?.length) {
    return { nodes: graph.nodes, edges: graph.edges, viewport: null }
  }
  const autoById = new Map(graph.nodes.map((n) => [n.id, n]))
  const nodes: Node[] = []
  const seenOrgIds = new Set<string>()
  for (const sn of saved.nodes) {
    if (sn.type === 'organization') {
      const fresh = autoById.get(sn.id)
      if (!fresh) continue
      seenOrgIds.add(sn.id)
      nodes.push({ ...sn, selected: false, data: fresh.data })
    } else {
      nodes.push({ ...sn, selected: false })
    }
  }
  const newOrgs = graph.nodes.filter((n) => !seenOrgIds.has(n.id))
  if (newOrgs.length > 0) {
    const maxY = nodes.reduce((m, n) => Math.max(m, n.position?.y ?? 0), 0)
    newOrgs.forEach((n, i) => {
      nodes.push({ ...n, position: { x: i * GAP_X, y: maxY + GAP_Y } })
    })
  }
  const ids = new Set(nodes.map((n) => n.id))
  const edges = graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target))
  return { nodes, edges, viewport: saved.viewport ?? null }
}

function OrgHierarchyViewer({ org, onClose }: { org: OrgItem; onClose: () => void }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges] = useEdgesState<Edge>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/hierarchy`, {
          headers: { ...getAuthHeaders(), 'X-Organization-Id': String(org.id) },
        })
        if (!res.ok) throw new Error('Не удалось загрузить иерархию')
        const { data } = await res.json()
        setNodes((data.nodes || []).map((n: Node) => (n.type === 'group' ? { ...n, zIndex: 0 } : { ...n, zIndex: n.zIndex ?? 1 })))
        setEdges((data.edges || []).map((e: Edge) => ({ ...e, type: undefined })))
      } catch (err) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [org.id, setNodes, setEdges])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const content = (
    <div className="fixed inset-0 z-50 flex flex-col bg-card">
      <div className="px-6 py-4 border-b border-border flex-shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            {org.name}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Просмотр иерархии учреждения (только чтение)
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
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
            nodeTypes={hierarchyNodeTypes}
            onNodesChange={onNodesChange}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesReconnectable={false}
            connectionMode={ConnectionMode.Loose}
            fitView
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
}

export function GlobalHierarchy({ fullscreen = false, onClose }: Props) {
  const [orgs, setOrgs] = useState<OrgItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedOrg, setSelectedOrg] = useState<OrgItem | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges] = useEdgesState<Edge>([])
  const [pendingDrop, setPendingDrop] = useState<{ type: 'group' | 'text'; position: { x: number; y: number } } | null>(null)
  const [editingNode, setEditingNode] = useState<{ id: string; type: 'group' | 'text' } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedLabel, setSavedLabel] = useState(false)
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null)
  const pendingViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null)

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [contextMenu])

  useEffect(() => {
    if (!fullscreen || !onClose) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !selectedOrg && !pendingDrop && !editingNode) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen, onClose, selectedOrg, pendingDrop, editingNode])

  useEffect(() => {
    const load = async () => {
      try {
        const [orgRes, layoutRes] = await Promise.all([
          fetch(`${API_BASE_URL}/organizations`, { headers: getAuthHeaders() }),
          fetch(`${API_BASE_URL}/hierarchy/global`, { headers: getAuthHeaders() }),
        ])
        if (!orgRes.ok) throw new Error('Не удалось загрузить организации')
        const data = await orgRes.json()
        const orgList: OrgItem[] = Array.isArray(data) ? data : []
        setOrgs(orgList)
        let saved: { nodes?: Node[]; edges?: Edge[]; viewport?: { x: number; y: number; zoom: number } } | null = null
        if (layoutRes.ok) {
          const j = await layoutRes.json()
          saved = j?.data ?? null
        }
        const merged = mergeSavedLayout(orgList, saved)
        setNodes(merged.nodes)
        setEdges(merged.edges)
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
  }, [setNodes, setEdges])

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
    if (org) setSelectedOrg(org)
  }, [orgs])

  const onNodeContextMenu = useCallback<NodeMouseHandler>((e, node) => {
    if (node.type !== 'group' && node.type !== 'text') return
    e.preventDefault()
    setContextMenu({ nodeId: node.id, x: e.clientX, y: e.clientY })
  }, [])

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
    setPendingDrop(null)
  }

  const handleEditNode = (title: string) => {
    if (!editingNode) return
    setNodes(nds => nds.map(n => n.id === editingNode.id
      ? { ...n, data: editingNode.type === 'group' ? { ...n.data, title } : { ...n.data, text: title } }
      : n))
    setEditingNode(null)
  }

  const deleteNode = (nodeId: string) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId))
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
        const d = await res.json()
        throw new Error(d.error || 'Не удалось сохранить глобальную иерархию')
      }
      setSavedLabel(true)
      setTimeout(() => setSavedLabel(false), 2000)
    } catch (err) {
      setError(getErrorMessage(err))
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
            Все учреждения системы. Перетащите организации в группы, нажмите на учреждение, чтобы посмотреть его иерархию.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Учреждений: {orgs.length}</span>
          {savedLabel && <span className="text-xs text-green-600 dark:text-green-400">Сохранено</span>}
          <Button size="sm" variant="outline" onClick={save} disabled={saving}>
            <Save className="h-4 w-4 mr-1.5" />
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
          {fullscreen && onClose && (
            <Button size="sm" variant="outline" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="relative flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
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
        </div>
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
              onNodeContextMenu={onNodeContextMenu}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onInit={handleInit}
              nodesConnectable={false}
              edgesReconnectable={false}
              deleteKeyCode={null}
              connectionMode={ConnectionMode.Loose}
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
      {selectedOrg && (
        <OrgHierarchyViewer org={selectedOrg} onClose={() => setSelectedOrg(null)} />
      )}
    </div>
  )

  return fullscreen ? createPortal(content, document.body) : content
}
