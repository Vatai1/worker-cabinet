import { useState, useEffect, useCallback } from 'react'
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
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Building2, Network, X, Loader2, User } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { getErrorMessage, cn } from '@/shared/lib/utils'
import { nodeTypes as hierarchyNodeTypes, EDGE_STYLE } from '@/modules/hierarchy/pages/HRHierarchy'

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

const orgNodeTypes = { organization: OrganizationNode }

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
      data: {
        name: o.name,
        memberCount: o.member_count,
        headName: o.head_id ? [o.head_last_name, o.head_first_name].filter(Boolean).join(' ') || null : null,
      },
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

  useEffect(() => {
    if (!fullscreen || !onClose) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !selectedOrg) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen, onClose, selectedOrg])

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/organizations`, { headers: getAuthHeaders() })
        if (!res.ok) throw new Error('Не удалось загрузить организации')
        const data = await res.json()
        setOrgs(Array.isArray(data) ? data : [])
      } catch (err) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    const graph = buildOrgGraph(orgs)
    setNodes(graph.nodes)
    setEdges(graph.edges)
  }, [orgs, setNodes, setEdges])

  const onNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    const orgId = Number(String(node.id).replace('org-', ''))
    const org = orgs.find((o) => o.id === orgId)
    if (org) setSelectedOrg(org)
  }, [orgs])

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
            Все учреждения системы. Нажмите на учреждение, чтобы посмотреть его иерархию.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Учреждений: {orgs.length}</span>
          {fullscreen && onClose && (
            <Button size="sm" variant="outline" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
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
            nodeTypes={orgNodeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={onNodeClick}
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
      {selectedOrg && (
        <OrgHierarchyViewer org={selectedOrg} onClose={() => setSelectedOrg(null)} />
      )}
    </div>
  )

  return fullscreen ? createPortal(content, document.body) : content
}
