import { useState, useCallback, useEffect, useRef, useMemo, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import {
  ReactFlow,
  addEdge,
  reconnectEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  MarkerType,
  useReactFlow,
  getBezierPath,
  type Connection,
  type NodeTypes,
  type EdgeTypes,
  type NodeProps,
  type EdgeProps,
  type Node,
  type Edge,
  type ReactFlowInstance,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type NodeChange,
  type EdgeChange,
  ConnectionMode,
  NodeResizer,
} from '@xyflow/react'
import { Building2, User, Trash2, Save, Network, Search, X, Pencil, ArrowLeft, ArrowLeftRight, AlignLeft, ExternalLink, Frame, Eye, AlertTriangle, BookOpen } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/Button'
import { Switch } from '@/shared/components/ui/Switch'
import { DepartmentHierarchyOverlay } from '@/modules/hierarchy/components/DepartmentHierarchyOverlay'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { useDepartmentsStore } from '@/shared/store/departmentsStore'
import { useOrgStore } from '@/shared/store/orgStore'
import { getErrorMessage, cn } from '@/shared/lib/utils'
import { useUIStore } from '@/shared/store/uiStore'

const SaveSnapshotContext = createContext<() => void>(() => {})

interface DeptEmployee {
  id: number
  first_name: string
  last_name: string
  position: string
  departmentName?: string
  departmentId?: number
}

interface OrgMemberRow {
  id: number
  first_name: string
  last_name: string
  position: string | null
  department_id: number | null
  department_name: string | null
}

interface ChildOrgItem {
  id: number
  name: string
  parent_id?: number | null
  member_count?: number
  head_id?: number | null
  head_first_name?: string | null
  head_last_name?: string | null
}

function buildChildOrgNodes(baseNodes: Node[], childOrgs: ChildOrgItem[], savedPositions: Record<string, { x: number; y: number }> = {}): Node[] {
  if (childOrgs.length === 0) return []
  const xs = baseNodes.map(n => n.position?.x ?? 0)
  const ys = baseNodes.map(n => n.position?.y ?? 0)
  const centerX = xs.length > 0 ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0
  const maxY = ys.length > 0 ? Math.max(...ys) : 0
  return childOrgs.map((o, i) => ({
    id: `org-${o.id}`,
    type: 'organization',
    position: savedPositions[String(o.id)] ?? { x: centerX + (i - (childOrgs.length - 1) / 2) * 360, y: maxY + 380 },
    data: {
      name: o.name,
      memberCount: o.member_count,
      headName: o.head_id ? [o.head_last_name, o.head_first_name].filter(Boolean).join(' ') || null : null,
    },
    selectable: false,
    deletable: false,
  } as Node))
}

function buildRootOrgNode(baseNodes: Node[], org: ChildOrgItem, savedPos?: { x: number; y: number }): Node {
  const xs = baseNodes.map(n => n.position?.x ?? 0)
  const ys = baseNodes.map(n => n.position?.y ?? 0)
  const centerX = xs.length > 0 ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0
  const minY = ys.length > 0 ? Math.min(...ys) : 0
  return {
    id: `org-${org.id}`,
    type: 'organization',
    position: savedPos ?? { x: centerX, y: ys.length > 0 ? minY - 380 : 0 },
    data: {
      name: org.name,
      memberCount: org.member_count,
      headName: org.head_id ? [org.head_last_name, org.head_first_name].filter(Boolean).join(' ') || null : null,
    },
    selectable: false,
    deletable: false,
  } as Node
}

function animateOrgReveal(inst: ReactFlowInstance, target: { x: number; y: number; zoom: number }) {
  inst.setViewport({ x: target.x, y: target.y, zoom: Math.min(target.zoom * 1.9, 2.4) })
  setTimeout(() => inst.setViewport(target, { duration: 520 }), 40)
}

function buildOrgOverlay(
  baseNodes: Node[],
  self: ChildOrgItem | null,
  childOrgs: ChildOrgItem[],
  savedPositions: Record<string, { x: number; y: number }> = {},
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  if (self) nodes.push(buildRootOrgNode(baseNodes, self, savedPositions[String(self.id)]))
  const childCards = buildChildOrgNodes(baseNodes, childOrgs, savedPositions)
  nodes.push(...childCards)
  if (self) {
    for (const c of childCards) {
      edges.push({
        id: `e-orgedit-${self.id}-${String(c.id).replace('org-', '')}`,
        source: `org-${self.id}`,
        target: c.id,
        sourceHandle: 'bottom',
        targetHandle: 'top',
        style: { stroke: '#6b7280', strokeWidth: 2 },
        markerEnd: { type: 'arrowclosed', color: '#6b7280' },
      } as Edge)
    }
  }
  return { nodes, edges }
}

interface Department {
  id: number
  name: string
  manager_name: string | null
  employee_count: number
  employees?: DeptEmployee[]
}

function nodeName(n: Node): string {
  const d = n.data as { name?: string; firstName?: string; lastName?: string; text?: string } | undefined
  if (d?.name) return d.name
  if (d?.lastName || d?.firstName) return `${d.lastName || ''} ${d.firstName || ''}`.trim()
  if (d?.text) return d.text.slice(0, 30)
  return 'Блок'
}

const NODE_COLORS = [
  '#6b7280', // серый (по умолчанию)
  '#3b82f6', // синий
  '#22c55e', // зелёный
  '#eab308', // жёлтый
  '#f97316', // оранжевый
  '#ef4444', // красный
  '#ec4899', // розовый
  '#8b5cf6', // фиолетовый
]

// ─── Custom Nodes ─────────────────────────────────────────────────────────────

const HANDLE_STYLE = { width: 14, height: 14, background: '#6b7280', border: '2px solid white' }
const HANDLE_CLASS = '!opacity-0 group-hover:!opacity-100 !transition-opacity'

const HANDLES = (
  <>
    <Handle type="source" id="top" position={Position.Top} className={HANDLE_CLASS} style={HANDLE_STYLE} />
    <Handle type="source" id="bottom" position={Position.Bottom} className={HANDLE_CLASS} style={HANDLE_STYLE} />
    <Handle type="source" id="left" position={Position.Left} className={HANDLE_CLASS} style={HANDLE_STYLE} />
    <Handle type="source" id="right" position={Position.Right} className={HANDLE_CLASS} style={HANDLE_STYLE} />
  </>
)

function DepartmentNode({ data }: NodeProps) {
  const d = data as { name: string; employeeCount: number; managerName: string | null; description?: string; color?: string }
  return (
    <div className="group min-w-[200px] rounded-xl overflow-hidden shadow-lg border-2 hover:shadow-md transition-all duration-200 select-none" style={{ borderColor: d.color ?? '#6b7280' }}>
      <div className="px-4 py-3" style={{ backgroundColor: d.color ?? '#6b7280' }}>
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-white/80 flex-shrink-0" />
          <span className="text-white font-semibold text-sm">{d.name}</span>
        </div>
        {d.employeeCount > 0 && (
          <div className="text-white/70 text-xs mt-1">{d.employeeCount} сотр.</div>
        )}
      </div>
      {d.managerName ? (
        <div className="bg-card px-4 py-2 text-xs text-muted-foreground border-t border-border/50">
          Начальник: <span className="font-medium text-foreground/80">{d.managerName}</span>
        </div>
      ) : (
        <div className="bg-card px-4 py-2 text-xs text-muted-foreground/60 border-t border-border/50">
          Без начальника
        </div>
      )}
      {d.description && (
        <div className="bg-card px-4 py-2 text-xs text-foreground/70 border-t border-border/50 max-w-[240px] whitespace-pre-wrap">
          {d.description}
        </div>
      )}
      {HANDLES}
    </div>
  )
}

function EmployeeNode({ data }: NodeProps) {
  const d = data as { firstName: string; lastName: string; position: string; department?: string; description?: string; color?: string }
  const initials = `${d.firstName[0]}${d.lastName[0]}`
  return (
    <div className="group min-w-[180px] rounded-xl overflow-hidden shadow-md border-2 bg-card hover:shadow-md transition-all duration-200 select-none" style={{ borderColor: d.color ?? '#6b7280' }}>
      <div className="px-3 py-2.5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: d.color ?? '#6b7280' }}>
          <span className="text-white text-xs font-semibold">{initials}</span>
        </div>
        <div className="overflow-hidden min-w-0">
          <div className="text-sm font-medium truncate">{d.lastName} {d.firstName}</div>
          <div className="text-xs text-muted-foreground truncate">{d.position}</div>
          {d.department && (
            <div className="text-[10px] text-muted-foreground truncate">{d.department}</div>
          )}
        </div>
      </div>
      {d.description && (
        <div className="px-3 pb-2.5 text-xs text-foreground/70 border-t border-border/50 pt-2 max-w-[220px] whitespace-pre-wrap">
          {d.description}
        </div>
      )}
      {HANDLES}
    </div>
  )
}

function TextNode({ data }: NodeProps) {
  const d = data as { text: string; color?: string }
  return (
    <div className="group min-w-[180px] max-w-[280px] rounded-xl overflow-hidden shadow-md border-2 bg-card hover:shadow-md transition-all duration-200 select-none" style={{ borderColor: d.color ?? '#6b7280' }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50" style={{ backgroundColor: d.color ?? '#6b7280' }}>
        <AlignLeft className="h-3.5 w-3.5 text-white/80 flex-shrink-0" />
        <span className="text-xs font-medium text-white">Описание</span>
      </div>
      <div className="px-3 py-2.5 text-sm text-foreground whitespace-pre-wrap">
        {d.text}
      </div>
      {HANDLES}
    </div>
  )
}

function GroupNode({ data, selected }: NodeProps) {
  const d = data as { title?: string; color?: string }
  const color = d.color ?? '#6b7280'
  return (
    <div className="w-full h-full rounded-2xl border-2 border-dashed" style={{ borderColor: color, background: `${color}0F` }}>
      <NodeResizer color={color} isVisible={selected} minWidth={200} minHeight={140} lineClassName="!border-dashed" />
      <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider truncate" style={{ color }}>
        {d.title || 'Группа'}
      </div>
    </div>
  )
}

type Waypoint = { x: number; y: number }

type SplineSegment = { p1: Waypoint; c1: Waypoint; c2: Waypoint; p2: Waypoint }

function positionDir(pos: Position): Waypoint {
  if (pos === Position.Left) return { x: -1, y: 0 }
  if (pos === Position.Right) return { x: 1, y: 0 }
  if (pos === Position.Top) return { x: 0, y: -1 }
  return { x: 0, y: 1 }
}

function buildSplineSegments(points: Waypoint[], sourcePosition: Position, targetPosition: Position): SplineSegment[] {
  const segs: SplineSegment[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]
    const p2 = points[i + 1]
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1
    const prev = points[i - 1] ?? (() => {
      const d = positionDir(sourcePosition)
      return { x: p1.x - (d.x * segLen) / 2, y: p1.y - (d.y * segLen) / 2 }
    })()
    const next = points[i + 2] ?? (() => {
      const d = positionDir(targetPosition)
      return { x: p2.x + (d.x * segLen) / 2, y: p2.y + (d.y * segLen) / 2 }
    })()
    segs.push({
      p1,
      c1: { x: p1.x + (p2.x - prev.x) / 6, y: p1.y + (p2.y - prev.y) / 6 },
      c2: { x: p2.x - (next.x - p1.x) / 6, y: p2.y - (next.y - p1.y) / 6 },
      p2,
    })
  }
  return segs
}

function splinePath(segs: SplineSegment[]): string {
  return segs.reduce((d, s, i) => (i === 0
    ? `M ${s.p1.x},${s.p1.y} C ${s.c1.x},${s.c1.y} ${s.c2.x},${s.c2.y} ${s.p2.x},${s.p2.y}`
    : `${d} C ${s.c1.x},${s.c1.y} ${s.c2.x},${s.c2.y} ${s.p2.x},${s.p2.y}`), '')
}

function segmentMidpoint(s: SplineSegment): Waypoint {
  return {
    x: (s.p1.x + 3 * s.c1.x + 3 * s.c2.x + s.p2.x) / 8,
    y: (s.p1.y + 3 * s.c1.y + 3 * s.c2.y + s.p2.y) / 8,
  }
}

let suppressEdgeMenuUntil = 0
const suppressEdgeMenu = () => { suppressEdgeMenuUntil = Date.now() + 400 }

function EditableEdge({ id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, markerEnd, markerStart, style, data, selected }: EdgeProps) {
  const { setEdges, screenToFlowPosition } = useReactFlow()
  const saveSnapshot = useContext(SaveSnapshotContext)
  const waypoints: Waypoint[] = (data as { waypoints?: Waypoint[] })?.waypoints ?? []
  const hasWaypoints = waypoints.length > 0

  const [smoothPath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  const allPoints = [{ x: sourceX, y: sourceY }, ...waypoints, { x: targetX, y: targetY }]
  const segments = buildSplineSegments(allPoints, sourcePosition, targetPosition)
  const midSeg = segments[Math.floor((segments.length - 1) / 2)]
  const notePos = hasWaypoints && midSeg ? segmentMidpoint(midSeg) : { x: labelX, y: labelY }

  const pathD = hasWaypoints ? splinePath(segments) : smoothPath

  const dragWaypoint = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation()
    saveSnapshot()
    const move = (me: MouseEvent) => {
      const pos = screenToFlowPosition({ x: me.clientX, y: me.clientY })
      setEdges(eds => eds.map(ed => {
        if (ed.id !== id) return ed
        const wps = [...((ed.data as { waypoints?: Waypoint[] })?.waypoints ?? [])]
        wps[idx] = pos
        return { ...ed, data: { ...ed.data, waypoints: wps } }
      }))
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      suppressEdgeMenu()
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  const removeWaypoint = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation()
    e.preventDefault()
    saveSnapshot()
    suppressEdgeMenu()
    setEdges(eds => eds.map(ed => {
      if (ed.id !== id) return ed
      const wps = [...((ed.data as { waypoints?: Waypoint[] })?.waypoints ?? [])]
      wps.splice(idx, 1)
      return { ...ed, data: { ...ed.data, waypoints: wps } }
    }))
  }

  const addWaypoint = (e: React.MouseEvent, segIdx: number, x: number, y: number) => {
    e.stopPropagation()
    saveSnapshot()
    suppressEdgeMenu()
    setEdges(eds => eds.map(ed => {
      if (ed.id !== id) return ed
      const wps = [...((ed.data as { waypoints?: Waypoint[] })?.waypoints ?? [])]
      wps.splice(segIdx, 0, { x, y })
      return { ...ed, data: { ...ed.data, waypoints: wps } }
    }))
  }

  return (
    <>
      <path d={pathD} fill="none" stroke="transparent" strokeWidth={20} />
      <BaseEdge path={pathD} markerEnd={markerEnd} markerStart={markerStart} style={style} />
      {(data as { note?: string } | undefined)?.note && (
        <EdgeLabelRenderer>
          <div
            style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${notePos.x}px, ${notePos.y - 16}px)`, pointerEvents: 'none' }}
            className="nodrag nopan"
          >
            <div
              className="px-2 py-0.5 rounded-md bg-card border border-border text-[10px] text-muted-foreground max-w-[200px] truncate shadow-sm"
              title={(data as { note?: string }).note}
            >
              {(data as { note?: string }).note}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
      {selected && (
        <EdgeLabelRenderer>
          {hasWaypoints && waypoints.map((wp, i) => (
            <div
              key={`wp-${i}`}
              style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${wp.x}px, ${wp.y}px)`, pointerEvents: 'all', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'move' }}
              className="nodrag nopan"
              onMouseDown={e => dragWaypoint(e, i)}
              onDoubleClick={e => removeWaypoint(e, i)}
              title="Тащите • двойной клик — удалить"
            >
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'white', border: '2px solid #6b7280', pointerEvents: 'none' }} />
            </div>
          ))}
          {hasWaypoints
            ? segments.map((seg, i) => {
                const mid = segmentMidpoint(seg)
                return (
                  <div
                    key={`mid-${i}`}
                    style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)`, pointerEvents: 'all', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    className="nodrag nopan"
                    onClick={e => addWaypoint(e, i, mid.x, mid.y)}
                    title="Клик — добавить точку опоры"
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'white', border: '2px dashed #9ca3af', opacity: 0.7, pointerEvents: 'none' }} />
                  </div>
                )
              })
            : (
              <div
                style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                className="nodrag nopan"
                onClick={e => addWaypoint(e, 0, labelX, labelY)}
                title="Клик — добавить точку опоры"
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'white', border: '2px dashed #9ca3af', opacity: 0.7, pointerEvents: 'none' }} />
              </div>
            )
          }
        </EdgeLabelRenderer>
      )}
    </>
  )
}

function ChildOrgNode({ data }: NodeProps) {
  const d = data as { name: string; memberCount?: number; headName?: string | null }
  return (
    <div className="group min-w-[220px] rounded-xl overflow-hidden shadow-lg border-2 border-indigo-500/60 bg-card hover:shadow-xl hover:border-primary transition-all duration-200 select-none cursor-pointer">
      <div className="px-4 py-3 bg-gradient-to-br from-indigo-500 to-blue-600">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-white/80 flex-shrink-0" />
          <span className="text-white font-semibold text-sm truncate">{d.name}</span>
        </div>
      </div>
      <div className="bg-card px-4 py-2 text-xs text-muted-foreground border-t border-border/50 space-y-1">
        {d.memberCount !== undefined && <div>{d.memberCount} сотр.</div>}
        {d.headName ? (
          <div className="flex items-center gap-1.5">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{d.headName}</span>
          </div>
        ) : (
          <div className="text-amber-600 dark:text-amber-400">Руководитель не назначен</div>
        )}
      </div>
      <Handle type="source" id="top" position={Position.Top} className={HANDLE_CLASS} style={HANDLE_STYLE} />
      <Handle type="source" id="bottom" position={Position.Bottom} className={HANDLE_CLASS} style={HANDLE_STYLE} />
      <Handle type="source" id="left" position={Position.Left} className={HANDLE_CLASS} style={HANDLE_STYLE} />
      <Handle type="source" id="right" position={Position.Right} className={HANDLE_CLASS} style={HANDLE_STYLE} />
    </div>
  )
}

const nodeTypes: NodeTypes = {
  department: DepartmentNode,
  employee: EmployeeNode,
  text: TextNode,
  group: GroupNode,
  organization: ChildOrgNode,
}

const edgeTypes: EdgeTypes = {
  editable: EditableEdge,
}

const EDGE_STYLE = { stroke: '#6b7280', strokeWidth: 2 }
const EDGE_MARKER = { type: MarkerType.ArrowClosed, color: '#6b7280' }

// ─── Selection Modals ─────────────────────────────────────────────────────────

function SelectDepartmentModal({
  departments,
  onSelect,
  onClose,
  initialDescription = '',
  initialId,
}: {
  departments: Department[]
  onSelect: (dept: Department, description: string) => void
  onClose: () => void
  initialDescription?: string
  initialId?: number
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Department | null>(
    initialId ? (departments.find(d => d.id === initialId) ?? null) : null
  )
  const [description, setDescription] = useState(initialDescription)

  const filtered = departments.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Выберите отдел</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-4 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск отдела..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:border-primary transition-colors"
            />
          </div>
        </div>
        <div className="max-h-52 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">Не найдено</div>
          ) : (
            filtered.map(dept => (
              <button
                key={dept.id}
                onClick={() => setSelected(dept)}
                className={`w-full flex items-center gap-3 px-6 py-3 transition-colors text-left ${
                  selected?.id === dept.id ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-muted/60'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-4 w-4 text-white" />
                </div>
                <div>
                  <div className="text-sm font-medium">{dept.name}</div>
                  <div className="text-xs text-muted-foreground">{dept.employee_count} сотр.</div>
                </div>
              </button>
            ))
          )}
        </div>
        <div className="px-4 py-3 border-t border-border">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Краткое описание (необязательно)..."
            rows={2}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:border-primary transition-colors resize-none"
          />
        </div>
        <div className="px-6 py-3 border-t border-border flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
          <Button className="flex-1" disabled={!selected} onClick={() => selected && onSelect(selected, description)}>
            Добавить
          </Button>
        </div>
      </div>
    </div>
  )
}

function SelectEmployeeModal({
  departments,
  members = [],
  onSelect,
  onClose,
  initialDescription = '',
  initialId,
}: {
  departments: Department[]
  members?: DeptEmployee[]
  onSelect: (emp: DeptEmployee, description: string) => void
  onClose: () => void
  initialDescription?: string
  initialId?: number
}) {
  const [search, setSearch] = useState('')
  const [deptId, setDeptId] = useState<number | null>(null)
  const [description, setDescription] = useState(initialDescription)

  const employees: DeptEmployee[] = (() => {
    const byId = new Map<number, DeptEmployee>()
    for (const m of members) byId.set(m.id, m)
    for (const d of departments) {
      for (const e of d.employees ?? []) byId.set(e.id, { ...e, departmentName: d.name, departmentId: d.id })
    }
    return [...byId.values()]
  })()
  const [selected, setSelected] = useState<DeptEmployee | null>(
    initialId ? (employees.find(e => e.id === initialId) ?? null) : null
  )

  const filtered = employees.filter(e => {
    const matchDept = deptId == null || e.departmentId === deptId
    const matchSearch =
      `${e.last_name} ${e.first_name} ${e.position}`.toLowerCase().includes(search.toLowerCase())
    return matchDept && matchSearch
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Выберите сотрудника</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-4 py-3 border-b border-border space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск сотрудника..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:border-primary transition-colors"
            />
          </div>
          <select
            value={deptId ?? ''}
            onChange={e => setDeptId(e.target.value === '' ? null : Number(e.target.value))}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:border-primary transition-colors"
          >
            <option value="">Все отделы</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">Не найдено</div>
          ) : (
            filtered.map(emp => (
              <button
                key={emp.id}
                onClick={() => setSelected(emp)}
                className={`w-full flex items-center gap-3 px-6 py-3 transition-colors text-left ${
                  selected?.id === emp.id ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-muted/60'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-semibold">
                    {emp.first_name[0]}{emp.last_name[0]}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{emp.last_name} {emp.first_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {emp.position}{emp.departmentName ? ` · ${emp.departmentName}` : ''}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
        <div className="px-4 py-3 border-t border-border">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Краткое описание (необязательно)..."
            rows={2}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:border-primary transition-colors resize-none"
          />
        </div>
        <div className="px-6 py-3 border-t border-border flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
          <Button className="flex-1" disabled={!selected} onClick={() => selected && onSelect(selected, description)}>
            Добавить
          </Button>
        </div>
      </div>
    </div>
  )
}

function TextInputModal({
  onConfirm,
  onClose,
  initialText = '',
}: {
  onConfirm: (text: string) => void
  onClose: () => void
  initialText?: string
}) {
  const [text, setText] = useState(initialText)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <AlignLeft className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Текстовый блок</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-4 py-4">
          <textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Введите текст..."
            rows={4}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:border-primary transition-colors resize-none"
          />
        </div>
        <div className="px-6 py-3 border-t border-border flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
          <Button className="flex-1" disabled={!text.trim()} onClick={() => onConfirm(text)}>
            {initialText ? 'Сохранить' : 'Добавить'}
          </Button>
        </div>
      </div>
    </div>
  )
}

type EdgeRelation = 'plain' | 'parent'

type EdgeDraft = {
  mode: 'create' | 'edit'
  edgeId?: string
  source: string
  target: string
  sourceHandle: string | null
  targetHandle: string | null
  sourceName: string
  targetName: string
  sourceType: 'department' | 'employee' | 'text'
  targetType: 'department' | 'employee' | 'text'
  relation: EdgeRelation
  parentIsSource: boolean
  strokeWidth: number
  strokeColor: string
  lineStyle: 'solid' | 'dashed'
  note: string
}

function EdgeSettingsModal({
  draft,
  onConfirm,
  onDelete,
  onClose,
}: {
  draft: EdgeDraft
  onConfirm: (relation: EdgeRelation, parentIsSource: boolean, note: string, strokeWidth: number, strokeColor: string, lineStyle: 'solid' | 'dashed') => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [relation, setRelation] = useState<EdgeRelation>(draft.relation)
  const [parentIsSource, setParentIsSource] = useState(draft.parentIsSource)
  const [strokeWidth, setStrokeWidth] = useState(draft.strokeWidth)
  const [strokeColor, setStrokeColor] = useState(draft.strokeColor)
  const [lineStyle, setLineStyle] = useState<'solid' | 'dashed'>(draft.lineStyle)
  const [note, setNote] = useState(draft.note)
  const parentAvailable = draft.sourceType !== 'text' && draft.targetType !== 'text' &&
    (draft.sourceType === 'department' || draft.targetType === 'department' || (draft.sourceType === 'employee' && draft.targetType === 'employee'))
  const effectiveRelation: EdgeRelation = parentAvailable ? relation : 'plain'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">{draft.mode === 'create' ? 'Новая связь' : 'Связь'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
            <span className="font-medium text-foreground truncate">{draft.sourceName}</span>
            <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium text-foreground truncate">{draft.targetName}</span>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Тип связи</p>
            {([
              ['parent', 'Родительская (родитель → ребёнок)'],
              ['plain', 'Простая (без направления)'],
            ] as const).filter(([value]) => value !== 'parent' || parentAvailable).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setRelation(value)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm text-left transition-colors ${
                  relation === value
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border hover:bg-muted/50 text-muted-foreground'
                }`}
              >
                <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${relation === value ? 'border-primary' : 'border-muted-foreground/40'}`}>
                  {relation === value && <span className="w-2 h-2 rounded-full bg-primary" />}
                </span>
                {label}
              </button>
            ))}
          </div>
          {relation === 'parent' && ((draft.sourceType === 'department' && draft.targetType === 'department') || (draft.sourceType === 'employee' && draft.targetType === 'employee')) && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Кто родитель</p>
              {([
                [true, `${draft.sourceName} — родитель, ${draft.targetName} — ребёнок`],
                [false, `${draft.targetName} — родитель, ${draft.sourceName} — ребёнок`],
              ] as const).map(([value, label]) => (
                <button
                  key={String(value)}
                  onClick={() => setParentIsSource(value)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm text-left transition-colors ${
                    parentIsSource === value
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border hover:bg-muted/50 text-muted-foreground'
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${parentIsSource === value ? 'border-primary' : 'border-muted-foreground/40'}`}>
                    {parentIsSource === value && <span className="w-2 h-2 rounded-full bg-primary" />}
                  </span>
                  <span className="min-w-0 break-words text-left">{label}</span>
                </button>
              ))}
            </div>
          )}
          {relation === 'parent' && draft.sourceType !== draft.targetType &&
            (draft.sourceType === 'employee' || draft.targetType === 'employee') &&
            (draft.sourceType === 'department' || draft.targetType === 'department') && (
            <div className="text-sm text-muted-foreground bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5">
              {draft.sourceType === 'employee'
                ? `${draft.sourceName} — куратор (родитель), ${draft.targetName} — ребёнок`
                : `${draft.targetName} — куратор (родитель), ${draft.sourceName} — ребёнок`}
            </div>
          )}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Стиль линии</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['solid', 'Сплошная'],
                ['dashed', 'Пунктирная'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setLineStyle(value)}
                  className={`flex flex-col items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                    lineStyle === value
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border hover:bg-muted/50 text-muted-foreground'
                  }`}
                >
                  {label}
                  <svg className="w-full h-3" viewBox="0 0 100 6" preserveAspectRatio="none">
                    <line
                      x1="2" y1="3" x2="98" y2="3"
                      stroke={strokeColor} strokeWidth={Math.max(strokeWidth, 1.5)} strokeLinecap="round"
                      strokeDasharray={value === 'dashed' ? '6 4' : undefined}
                    />
                  </svg>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Цвет линии</p>
            <div className="flex gap-1.5 flex-wrap">
              {NODE_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setStrokeColor(color)}
                  className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color,
                    borderColor: strokeColor === color ? 'white' : color,
                    boxShadow: strokeColor === color ? `0 0 0 2px ${color}` : 'none',
                  }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Толщина линии</p>
              <span className="text-xs font-medium text-muted-foreground">{strokeWidth} px</span>
            </div>
            <input
              type="range"
              min={1}
              max={6}
              step={0.5}
              value={strokeWidth}
              onChange={e => setStrokeWidth(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <svg className="w-full h-5" viewBox="0 0 200 8" preserveAspectRatio="none">
              <line x1="0" y1="4" x2="200" y2="4" stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round" />
            </svg>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Примечание</p>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Примечание к связи (необязательно)..."
              rows={2}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:border-primary transition-colors resize-none"
            />
          </div>
        </div>
        <div className="px-6 py-3 border-t border-border flex gap-2">
          {draft.mode === 'edit' && onDelete && (
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
          <Button className="flex-1" onClick={() => onConfirm(effectiveRelation, parentIsSource, note, strokeWidth, strokeColor, lineStyle)}>
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type VacationVisibility = { childSeesParent: boolean; parentSeesChild: boolean }

function ParentEdgeSettingsModal({ edge, onConfirm, onClose }: {
  edge: Edge
  onConfirm: (childSeesParent: boolean, parentSeesChild: boolean) => void
  onClose: () => void
}) {
  const vis = (edge.data as { vacationVisibility?: Partial<VacationVisibility> } | undefined)?.vacationVisibility
  const [childSeesParent, setChildSeesParent] = useState(vis?.childSeesParent ?? true)
  const [parentSeesChild, setParentSeesChild] = useState(vis?.parentSeesChild ?? true)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Родительская связь</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
            <p className="text-sm font-medium">Отпуск родителя виден подчинённым</p>
            <Switch checked={childSeesParent} onCheckedChange={setChildSeesParent} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
            <p className="text-sm font-medium">Родитель видит отпуска подчинённых</p>
            <Switch checked={parentSeesChild} onCheckedChange={setParentSeesChild} />
          </div>
        </div>
        <div className="px-6 py-3 border-t border-border flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
          <Button className="flex-1" onClick={() => onConfirm(childSeesParent, parentSeesChild)}>
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  )
}

type PendingDrop = { type: 'department' | 'employee' | 'text' | 'group'; position: { x: number; y: number } }

function ConfirmDeleteNodeModal({ edgeCount, onConfirm, onClose }: { edgeCount: number; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            <h2 className="text-lg font-semibold">Удалить блок?</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-6 py-4">
          <p className="text-sm text-muted-foreground">
            У блока есть связи ({edgeCount}) — они будут удалены вместе с ним.
          </p>
        </div>
        <div className="px-6 py-3 border-t border-border flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
          <Button variant="destructive" className="flex-1" onClick={onConfirm}>Удалить</Button>
        </div>
      </div>
    </div>
  )
}

function ConfirmLeaveModal({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold">Несохранённые изменения</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-6 py-4">
          <p className="text-sm text-muted-foreground">
            Изменения иерархии не сохранены и будут потеряны.
          </p>
        </div>
        <div className="px-6 py-3 border-t border-border flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Остаться</Button>
          <Button variant="destructive" className="flex-1" onClick={onConfirm}>Выйти без сохранения</Button>
        </div>
      </div>
    </div>
  )
}

export function InstructionModal({ title, items, onClose }: { title: string; items: { title: string; text: string }[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden animate-scale-in flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-3 overflow-y-auto">
          {items.map(item => (
            <div key={item.title} className="rounded-lg border border-border px-4 py-3">
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.text}</p>
            </div>
          ))}
        </div>
        <div className="px-6 py-3 border-t border-border">
          <Button className="w-full" onClick={onClose}>Понятно</Button>
        </div>
      </div>
    </div>
  )
}

function ConfirmDeleteEdgeModal({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            <h2 className="text-lg font-semibold">Удалить связь?</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-6 py-4">
          <p className="text-sm text-muted-foreground">Связь будет удалена из иерархии.</p>
        </div>
        <div className="px-6 py-3 border-t border-border flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
          <Button variant="destructive" className="flex-1" onClick={onConfirm}>Удалить</Button>
        </div>
      </div>
    </div>
  )
}
type ContextMenu = { nodeId: string; nodeType: 'department' | 'employee' | 'text' | 'group'; x: number; y: number }
type EdgeContextMenu = { edgeId: string; x: number; y: number }

interface Props {
  fullscreen?: boolean
  onClose?: () => void
  orgId?: number
  onOpenOrg?: (orgId: number) => void
  onBack?: () => void
}

export function HRHierarchy({ fullscreen = false, onClose, orgId, onOpenOrg, onBack }: Props) {
  const { darkMode } = useUIStore()
  const [departments, setDepartments] = useState<Department[]>([])
  const [orgMembers, setOrgMembers] = useState<DeptEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [hierarchyLoading, setHierarchyLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedLabel, setSavedLabel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [edgeContextMenu, setEdgeContextMenu] = useState<EdgeContextMenu | null>(null)
  const [editingNode, setEditingNode] = useState<{ id: string; type: 'department' | 'employee' | 'text' | 'group' } | null>(null)
  const [activeDepartment, setActiveDepartment] = useState<{ id: number; name: string } | null>(null)
  const [edgeDraft, setEdgeDraft] = useState<EdgeDraft | null>(null)
  const [parentEdgeId, setParentEdgeId] = useState<string | null>(null)
  const [confirmDeleteEdgeId, setConfirmDeleteEdgeId] = useState<string | null>(null)
  const [confirmDeleteNode, setConfirmDeleteNode] = useState<string | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [showInstruction, setShowInstruction] = useState(false)

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null)
  const pendingViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null)
  const pendingAfterLeaveRef = useRef<(() => void) | null>(null)

  const historyRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([])
  const isRestoringRef = useRef(false)
  const [dirty, setDirty] = useState(false)

  const runAfterLeaveGuarded = useCallback((action: () => void) => {
    if (dirty) {
      pendingAfterLeaveRef.current = action
      setConfirmLeave(true)
      return
    }
    action()
  }, [dirty])

  const saveSnapshot = useCallback(() => {
    if (isRestoringRef.current) return
    const inst = rfInstanceRef.current
    if (!inst) return
    historyRef.current = [...historyRef.current.slice(-49), { nodes: inst.getNodes(), edges: inst.getEdges() }]
    setDirty(true)
  }, [])

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return
    const snapshot = historyRef.current.pop()!
    isRestoringRef.current = true
    setNodes(snapshot.nodes)
    setEdges(snapshot.edges)
    isRestoringRef.current = false
  }, [setNodes, setEdges])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.code === 'KeyZ')) {
        e.preventDefault()
        undo()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [undo])

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    if (!isRestoringRef.current && changes.some(c => c.type === 'remove')) saveSnapshot()
    onNodesChange(changes)
  }, [onNodesChange, saveSnapshot])

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    if (!isRestoringRef.current && changes.some(c => c.type === 'remove')) saveSnapshot()
    onEdgesChange(changes)
  }, [onEdgesChange, saveSnapshot])

  const orgHeaders = useCallback((): Record<string, string> => (orgId != null ? { 'X-Organization-Id': String(orgId) } : {}), [orgId])

  useEffect(() => {
    const loadHierarchy = async () => {
      try {
        const [res, orgsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/hierarchy`, { headers: { ...getAuthHeaders(), ...orgHeaders() } }),
          fetch(`${API_BASE_URL}/organizations/tree`, { headers: getAuthHeaders() }).catch(() => null),
        ])
        if (!res.ok) throw new Error('Не удалось загрузить иерархию')
        const { data } = await res.json()
        const baseNodes: Node[] = data.nodes ?? []
        const savedOrgPositions = (data.orgPositions ?? {}) as Record<string, { x: number; y: number }>
        const scopeOrgId = orgId ?? useOrgStore.getState().currentOrgId
        let overlay: { nodes: Node[]; edges: Edge[] } = { nodes: [], edges: [] }
        if (orgsRes?.ok && scopeOrgId != null) {
          const tree = await orgsRes.json() as ChildOrgItem[]
          overlay = buildOrgOverlay(baseNodes, tree.find(o => o.id === scopeOrgId) ?? null, tree.filter(o => o.parent_id === scopeOrgId), savedOrgPositions)
        }
        setNodes([...overlay.nodes, ...baseNodes])
        historyRef.current = []
        setDirty(false)
        setEdges([...((data.edges ?? []) as Edge[]).map((ed: Edge) => ({ ...ed, type: 'editable' })), ...overlay.edges])
        if (data.viewport) {
          if (rfInstanceRef.current) {
            animateOrgReveal(rfInstanceRef.current, data.viewport)
          } else {
            pendingViewportRef.current = data.viewport
          }
        }
      } catch (err) {
        setError(getErrorMessage(err))
      } finally {
        setHierarchyLoading(false)
      }
      }
      loadHierarchy()
      }, [setNodes, setEdges, orgHeaders, orgId])

  useEffect(() => {
    const load = async () => {
      try {
        if (orgId != null) {
          const res = await fetch(`${API_BASE_URL}/departments`, { headers: { ...getAuthHeaders(), 'X-Organization-Id': String(orgId) } })
          if (!res.ok) throw new Error('Не удалось загрузить отделы')
          setDepartments(await res.json())
        } else {
          await useDepartmentsStore.getState().fetchDepartments()
          const data = useDepartmentsStore.getState().departments as Department[]
          setDepartments(data)
        }
      } catch (err) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
      try {
        const res = await fetch(`${API_BASE_URL}/users/search`, { headers: { ...getAuthHeaders(), ...orgHeaders() } })
        if (res.ok) {
          const rows = await res.json() as OrgMemberRow[]
          setOrgMembers(rows.map(u => ({
            id: u.id,
            first_name: u.first_name,
            last_name: u.last_name,
            position: u.position ?? '',
            departmentName: u.department_name ?? undefined,
            departmentId: u.department_id ?? undefined,
          })))
        }
      } catch {
        setOrgMembers([])
      }
    }
    load()
  }, [orgId, orgHeaders])

  const onConnect = useCallback((params: Connection) => {
    const inst = rfInstanceRef.current
    if (!inst) return
    const nodeOf = (nodeId?: string | null) => inst.getNodes().find(x => x.id === nodeId)
    const s = nodeOf(params.source)
    const t = nodeOf(params.target)
    if (!s || !t) return
    const deptIdOf = (n: Node | undefined) => n?.type === 'department' && n.data?.id != null ? Number((n.data as { id?: number }).id) : null
    const userIdOf = (n: Node | undefined) => n?.type === 'employee' && n.data?.id != null ? Number((n.data as { id?: number }).id) : null
    const sDept = deptIdOf(s)
    const tDept = deptIdOf(t)
    if (sDept !== null && tDept !== null && sDept !== tDept) {
      const hasOtherParent = inst.getEdges().some(e => {
        if ((e.data as { relation?: string } | undefined)?.relation === 'plain') return false
        const ss = deptIdOf(nodeOf(e.source))
        const tt = deptIdOf(nodeOf(e.target))
        return tt === tDept && ss !== null && ss !== sDept
      })
      if (hasOtherParent) {
        toast('У отдела может быть только один родитель')
        return
      }
    }
    const sUser = userIdOf(s)
    const tUser = userIdOf(t)
    if (sUser !== null && tUser !== null && sUser !== tUser) {
      const userParentOf = new Map<number, number>()
      for (const e of inst.getEdges()) {
        if ((e.data as { relation?: string } | undefined)?.relation === 'plain') continue
        const ss = userIdOf(nodeOf(e.source))
        const tt = userIdOf(nodeOf(e.target))
        if (ss !== null && tt !== null && ss !== tt) userParentOf.set(tt, ss)
      }
      const existingParent = userParentOf.get(tUser)
      if (existingParent != null && existingParent !== sUser) {
        toast('У сотрудника может быть только один родитель')
        return
      }
      let cur: number | null = sUser
      const seen = new Set<number>()
      while (cur != null && !seen.has(cur)) {
        seen.add(cur)
        if (cur === tUser) {
          toast('Цикл в иерархии сотрудников')
          return
        }
        cur = userParentOf.get(cur) ?? null
      }
    }
    setEdgeDraft({
      mode: 'create',
      source: params.source!,
      target: params.target!,
      sourceHandle: params.sourceHandle ?? null,
      targetHandle: params.targetHandle ?? null,
      sourceName: nodeName(s),
      targetName: nodeName(t),
      sourceType: (s.type as 'department' | 'employee' | 'text') || 'text',
      targetType: (t.type as 'department' | 'employee' | 'text') || 'text',
      relation: 'parent',
      parentIsSource: true,
      strokeWidth: 2,
      strokeColor: '#6b7280',
      lineStyle: 'solid',
      note: '',
    })
  }, [])

  const onEdgeClick: EdgeMouseHandler = useCallback((event, edge) => {
    if (Date.now() < suppressEdgeMenuUntil) return
    const inst = rfInstanceRef.current
    if (!inst) return
    const wps = (edge.data as { waypoints?: Waypoint[] } | undefined)?.waypoints
    if (wps?.length && 'clientX' in event) {
      const nearWaypoint = wps.some(wp => {
        const sp = inst.flowToScreenPosition(wp)
        return Math.hypot(sp.x - event.clientX, sp.y - event.clientY) < 22
      })
      if (nearWaypoint) return
    }
    const nodeOf = (nodeId?: string | null) => inst.getNodes().find(x => x.id === nodeId)
    const s = nodeOf(edge.source)
    const t = nodeOf(edge.target)
    if (!s || !t) return
    const data = edge.data as { relation?: EdgeRelation; note?: string; lineStyle?: 'solid' | 'dashed' } | undefined
    setEdgeDraft({
      mode: 'edit',
      edgeId: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
      sourceName: nodeName(s),
      targetName: nodeName(t),
      sourceType: (s.type as 'department' | 'employee' | 'text') || 'text',
      targetType: (t.type as 'department' | 'employee' | 'text') || 'text',
      relation: data?.relation === 'plain' ? 'plain' : 'parent',
      parentIsSource: !edge.markerStart,
      strokeWidth: (edge.style as { strokeWidth?: number } | undefined)?.strokeWidth ?? 2,
      strokeColor: (edge.style as { stroke?: string } | undefined)?.stroke ?? '#6b7280',
      lineStyle: data?.lineStyle ?? ((edge.style as { strokeDasharray?: string } | undefined)?.strokeDasharray ? 'dashed' : 'solid'),
      note: data?.note || '',
    })
  }, [])

  const confirmEdgeDraft = useCallback((relation: EdgeRelation, parentIsSource: boolean, note: string, strokeWidth: number, strokeColor: string, lineStyle: 'solid' | 'dashed') => {
    const d = edgeDraft
    if (!d) return
    saveSnapshot()
    const personDept = relation === 'parent' && d.sourceType !== d.targetType &&
      (d.sourceType === 'employee' || d.targetType === 'employee') &&
      (d.sourceType === 'department' || d.targetType === 'department')
    const flip = personDept
      ? d.sourceType !== 'employee'
      : relation === 'parent' && !parentIsSource
    const source = flip ? d.target : d.source
    const target = flip ? d.source : d.target
    const sourceHandle = flip ? d.targetHandle : d.sourceHandle
    const targetHandle = flip ? d.sourceHandle : d.targetHandle
    const style = {
      ...EDGE_STYLE,
      stroke: strokeColor,
      strokeWidth,
      ...(lineStyle === 'dashed' ? { strokeDasharray: '6 4' } : {}),
    }
    const marker = relation === 'parent' ? { type: MarkerType.ArrowClosed, color: strokeColor } : undefined
    setEdges(eds => {
      if (d.mode === 'create') {
        return addEdge({
          id: `e-${source}-${target}-${Date.now()}`,
          source,
          target,
          sourceHandle: sourceHandle ?? undefined,
          targetHandle: targetHandle ?? undefined,
          type: 'editable',
          style,
          markerEnd: marker,
          data: { relation, note, lineStyle },
        } as Edge, eds)
      }
      return eds.map(e => e.id !== d.edgeId ? e : ({
        ...e,
        source,
        target,
        sourceHandle: sourceHandle ?? undefined,
        targetHandle: targetHandle ?? undefined,
        style,
        markerEnd: marker,
        markerStart: undefined,
        data: { ...(e.data as Record<string, unknown>), relation, note, lineStyle },
      } as Edge))
    })
    setEdgeDraft(null)
  }, [edgeDraft, saveSnapshot, setEdges])

  const onNodeDragStart = useCallback(() => { saveSnapshot() }, [saveSnapshot])

  const edgeReconnectRef = useRef(true)

  const onReconnect = useCallback((oldEdge: Edge, newConnection: Connection) => {
    edgeReconnectRef.current = true
    saveSnapshot()
    setEdges(eds => reconnectEdge(oldEdge, newConnection, eds))
  }, [setEdges, saveSnapshot])

  const onReconnectStart = useCallback(() => {
    edgeReconnectRef.current = false
  }, [])

  const onReconnectEnd = useCallback(() => {
    edgeReconnectRef.current = true
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('reactflow-type') as PendingDrop['type']
    if (!type) return
    const inst = rfInstanceRef.current
    if (!inst) return
    const position = inst.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    setPendingDrop({ type, position })
  }, [])

  const handleInit = useCallback((inst: ReactFlowInstance) => {
    rfInstanceRef.current = inst
    if (pendingViewportRef.current) {
      animateOrgReveal(inst, pendingViewportRef.current)
      pendingViewportRef.current = null
    }
  }, [])

  const handleSelectDepartment = (dept: Department, description: string) => {
    if (!pendingDrop) return
    saveSnapshot()
    setNodes(nds => [...nds, {
      id: `department-${dept.id}-${Date.now()}`,
      type: 'department',
      position: pendingDrop.position,
      data: { id: dept.id, name: dept.name, employeeCount: dept.employee_count, managerName: dept.manager_name, description },
    } as Node])
    setPendingDrop(null)
  }

  const handleSelectEmployee = (emp: DeptEmployee, description: string) => {
    if (!pendingDrop) return
    saveSnapshot()
    setNodes(nds => [...nds, {
      id: `employee-${emp.id}-${Date.now()}`,
      type: 'employee',
      position: pendingDrop.position,
      data: { id: emp.id, firstName: emp.first_name, lastName: emp.last_name, position: emp.position, department: emp.departmentName, description },
    } as Node])
    setPendingDrop(null)
  }

  const onNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    if (node.type !== 'organization') return
    if (!onOpenOrg) return
    const targetOrgId = Number(String(node.id).replace('org-', ''))
    if (!targetOrgId) return
    if (dirty) {
      runAfterLeaveGuarded(() => onOpenOrg(targetOrgId))
      return
    }
    const inst = rfInstanceRef.current
    if (!inst) {
      onOpenOrg(targetOrgId)
      return
    }
    const w = node.measured?.width ?? 240
    const h = node.measured?.height ?? 130
    const z = Math.min(Math.max(inst.getViewport().zoom * 1.6, 1.3), 2)
    inst.setViewport(
      { x: window.innerWidth / 2 - (node.position.x + w / 2) * z, y: window.innerHeight / 2 - (node.position.y + h / 2) * z, zoom: z },
      { duration: 340 },
    )
    setTimeout(() => onOpenOrg(targetOrgId), 350)
  }, [onOpenOrg, dirty, runAfterLeaveGuarded])

  const onNodeContextMenu: NodeMouseHandler = useCallback((e, node) => {
    e.preventDefault()
    setEdgeContextMenu(null)
    setContextMenu({
      nodeId: node.id,
      nodeType: (node.type ?? 'text') as ContextMenu['nodeType'],
      x: e.clientX,
      y: e.clientY,
    })
  }, [])

  const onEdgeContextMenu: EdgeMouseHandler = useCallback((e, edge) => {
    e.preventDefault()
    setContextMenu(null)
    setEdgeContextMenu({ edgeId: edge.id, x: e.clientX, y: e.clientY })
  }, [])

  const deleteEdge = useCallback((edgeId: string) => {
    saveSnapshot()
    setEdges(eds => eds.filter(e => e.id !== edgeId))
    setEdgeContextMenu(null)
  }, [setEdges, saveSnapshot])

  const saveParentEdgeSettings = useCallback((childSeesParent: boolean, parentSeesChild: boolean) => {
    if (!parentEdgeId) return
    saveSnapshot()
    setEdges(eds => eds.map(e => e.id === parentEdgeId
      ? { ...e, data: { ...(e.data as Record<string, unknown>), vacationVisibility: { childSeesParent, parentSeesChild } } }
      : e))
    setParentEdgeId(null)
  }, [parentEdgeId, saveSnapshot, setEdges])

  const deleteNode = useCallback((nodeId: string) => {
    saveSnapshot()
    setNodes(nds => nds.filter(n => n.id !== nodeId))
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId))
    setContextMenu(null)
  }, [setNodes, setEdges, saveSnapshot])

  const requestDeleteNode = useCallback((nodeId: string) => {
    setContextMenu(null)
    if (edges.some(e => e.source === nodeId || e.target === nodeId)) {
      setConfirmDeleteNode(nodeId)
    } else {
      deleteNode(nodeId)
    }
  }, [edges, deleteNode])

  const setNodeColor = useCallback((nodeId: string, color: string) => {
    saveSnapshot()
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, color } } : n))
    setContextMenu(null)
  }, [setNodes, saveSnapshot])

  const startEdit = useCallback((nodeId: string, nodeType: 'department' | 'employee' | 'text' | 'group') => {
    setEditingNode({ id: nodeId, type: nodeType })
    setContextMenu(null)
  }, [])

  const handleEditDepartment = (dept: Department, description: string) => {
    if (!editingNode) return
    saveSnapshot()
    setNodes(nds => nds.map(n => n.id === editingNode.id ? {
      ...n,
      data: { id: dept.id, name: dept.name, employeeCount: dept.employee_count, managerName: dept.manager_name, description },
    } : n))
    setEditingNode(null)
  }

  const handleSelectText = (text: string) => {
    if (!pendingDrop) return
    saveSnapshot()
    setNodes(nds => [...nds, {
      id: `text-${Date.now()}`,
      type: 'text',
      position: pendingDrop.position,
      data: { text },
    } as Node])
    setPendingDrop(null)
  }

  const handleEditText = (text: string) => {
    if (!editingNode) return
    saveSnapshot()
    setNodes(nds => nds.map(n => n.id === editingNode.id ? { ...n, data: { ...n.data, text } } : n))
    setEditingNode(null)
  }

  const handleSelectGroup = (title: string) => {
    if (!pendingDrop) return
    saveSnapshot()
    setNodes(nds => [...nds, {
      id: `group-${Date.now()}`,
      type: 'group',
      position: { x: pendingDrop.position.x - 200, y: pendingDrop.position.y - 14 },
      style: { width: 400, height: 260 },
      data: { title },
    } as Node])
    setPendingDrop(null)
  }

  const handleEditGroup = (title: string) => {
    if (!editingNode) return
    saveSnapshot()
    setNodes(nds => nds.map(n => n.id === editingNode.id ? { ...n, data: { ...n.data, title } } : n))
    setEditingNode(null)
  }

  const handleEditEmployee = (emp: DeptEmployee, description: string) => {
    if (!editingNode) return
    saveSnapshot()
    setNodes(nds => nds.map(n => n.id === editingNode.id ? {
      ...n,
      data: { id: emp.id, firstName: emp.first_name, lastName: emp.last_name, position: emp.position, department: emp.departmentName, description },
    } : n))
    setEditingNode(null)
  }

  useEffect(() => {
    if (!contextMenu && !edgeContextMenu) return
    const close = () => { setContextMenu(null); setEdgeContextMenu(null) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [contextMenu, edgeContextMenu])

  const save = async () => {
    const inst = rfInstanceRef.current
    if (!inst) return
    setSaving(true)
    try {
      const { nodes: n, edges: e, viewport } = inst.toObject()
      const nodesClean = n.filter(x => x.type !== 'organization').map(x => ({ ...x, selected: false }))
      const edgesClean = e.filter(x => !String(x.source).startsWith('org-') && !String(x.target).startsWith('org-'))
      const orgPositions: Record<string, { x: number; y: number }> = {}
      for (const x of n) {
        if (x.type === 'organization') {
          orgPositions[String(x.id).replace('org-', '')] = { x: Math.round(x.position?.x ?? 0), y: Math.round(x.position?.y ?? 0) }
        }
      }
      const res = await fetch(`${API_BASE_URL}/hierarchy`, {
        method: 'PUT',
        headers: { ...getAuthHeadersWithContentType(), ...orgHeaders() },
        body: JSON.stringify({ nodes: nodesClean, edges: edgesClean, viewport, orgPositions }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Не удалось сохранить иерархию')
      }
      setSavedLabel(true)
      setDirty(false)
      setTimeout(() => setSavedLabel(false), 2000)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const requestClose = useCallback(() => {
    if (dirty) {
      setConfirmLeave(true)
      return
    }
    onClose?.()
  }, [dirty, onClose])

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
    if (!fullscreen || !onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (pendingDrop || editingNode || activeDepartment || edgeDraft || parentEdgeId || confirmDeleteEdgeId || confirmDeleteNode || confirmLeave || showInstruction) return
      requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen, onClose, pendingDrop, editingNode, activeDepartment, edgeDraft, parentEdgeId, confirmDeleteEdgeId, confirmDeleteNode, confirmLeave, showInstruction, requestClose])

  const displayNodes = useMemo(
    () => nodes.map(n => (n.type === 'group' ? { ...n, zIndex: 0 } : { ...n, zIndex: n.zIndex ?? 1 })) as Node[],
    [nodes],
  )

  const content = (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border border-border shadow-sm bg-card',
        fullscreen && 'fixed inset-0 z-50 rounded-none border-0 animate-in fade-in duration-200',
      )}
      style={fullscreen ? undefined : { height: 'calc(100vh - 140px)', minHeight: '500px' }}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex-shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            Иерархия
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Перетащите блоки на холст, затем выберите отдел или сотрудника. Соединяйте точками на краях.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedLabel && <span className="text-xs text-green-600 dark:text-green-400">Сохранено</span>}
          {fullscreen && onBack && (
            <Button size="sm" variant="outline" onClick={() => runAfterLeaveGuarded(() => onBack())}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Назад
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={save} disabled={saving}>
            <Save className="h-4 w-4 mr-1.5" />
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
          {fullscreen && onClose && (
            <Button size="sm" variant="outline" onClick={requestClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="relative flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Left panel */}
        <div className="w-52 flex-shrink-0 border-r border-border p-4 space-y-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Элементы
          </p>

          {loading && <div className="space-y-2 p-4"><div className="h-8 w-full rounded bg-muted animate-pulse" /><div className="h-8 w-3/4 rounded bg-muted animate-pulse" /></div>}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div
            draggable
            onDragStart={e => { e.dataTransfer.setData('reactflow-type', 'department'); e.dataTransfer.effectAllowed = 'move' }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-border bg-muted/30 cursor-grab active:cursor-grabbing hover:bg-muted/60 hover:border-border transition-all select-none"
          >
            <div className="w-9 h-9 rounded-lg bg-muted border border-border flex items-center justify-center flex-shrink-0">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-sm font-semibold">Отдел</div>
              <div className="text-[10px] text-muted-foreground">Перетащите на холст</div>
            </div>
          </div>

          <div
            draggable
            onDragStart={e => { e.dataTransfer.setData('reactflow-type', 'employee'); e.dataTransfer.effectAllowed = 'move' }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-border bg-muted/30 cursor-grab active:cursor-grabbing hover:bg-muted/60 hover:border-border transition-all select-none"
          >
            <div className="w-9 h-9 rounded-full bg-muted border-2 border-border flex items-center justify-center flex-shrink-0">
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-sm font-semibold">Сотрудник</div>
              <div className="text-[10px] text-muted-foreground">Перетащите на холст</div>
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
              <div className="text-[10px] text-muted-foreground">Перетащите на холст</div>
            </div>
          </div>

          <div
            draggable
            onDragStart={e => { e.dataTransfer.setData('reactflow-type', 'group'); e.dataTransfer.effectAllowed = 'move' }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-border bg-muted/30 cursor-grab active:cursor-grabbing hover:bg-muted/60 hover:border-border transition-all select-none"
          >
            <div className="w-9 h-9 rounded-lg bg-muted border-2 border-dashed border-border flex items-center justify-center flex-shrink-0">
              <Frame className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-sm font-semibold">Группа</div>
              <div className="text-[10px] text-muted-foreground">Рамка для элементов</div>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground leading-relaxed pt-1">
            Рёбра между отделами задают подразделения (родителей)
          </p>
          <Button variant="outline" size="sm" className="w-full" onClick={() => setShowInstruction(true)}>
            <BookOpen className="h-4 w-4 mr-1.5" />
            Инструкция
          </Button>
        </div>

        {/* Canvas */}
        <SaveSnapshotContext.Provider value={saveSnapshot}>
        <div className="flex-1 relative" style={{ minHeight: 0 }}>
          {hierarchyLoading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="space-y-2"><div className="h-6 w-full rounded bg-muted animate-pulse" /><div className="h-6 w-2/3 rounded bg-muted animate-pulse" /></div>
            </div>
          )}
          {!hierarchyLoading && nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="text-center text-muted-foreground/40">
                <Network className="h-16 w-16 mx-auto mb-3" />
                <p className="text-sm">Перетащите блоки из панели слева</p>
                <p className="text-xs mt-1">Соединяйте точки на краях блоков</p>
              </div>
            </div>
          )}
          <ReactFlow
            nodes={displayNodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodeDragStart={onNodeDragStart}
            onInit={handleInit}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeContextMenu={onEdgeContextMenu}
            onEdgeClick={onEdgeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onReconnect={onReconnect}
            onReconnectStart={onReconnectStart}
            onReconnectEnd={onReconnectEnd}
            multiSelectionKeyCode={['Control', 'Meta']}
            selectionKeyCode={['Shift', 'Control']}
            connectionMode={ConnectionMode.Loose}
            colorMode={darkMode ? 'dark' : 'light'}
            deleteKeyCode={null}
            fitView
            fitViewOptions={{ maxZoom: 1 }}
          >
            <Controls />
            <MiniMap nodeStrokeWidth={3} zoomable pannable />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--border))" />
          </ReactFlow>
        </div>
        </SaveSnapshotContext.Provider>
        {activeDepartment && (
          <DepartmentHierarchyOverlay
            departmentId={activeDepartment.id}
            departmentName={activeDepartment.name}
            departments={departments}
            onClose={() => setActiveDepartment(null)}
          />
        )}
      </div>

      {/* Modals */}
      {showInstruction && (
        <InstructionModal
          title="Инструкция по иерархии"
          onClose={() => setShowInstruction(false)}
          items={[
            { title: 'Добавление элементов', text: 'Перетащите блок из панели слева на холст. Для отдела или сотрудника откроется окно выбора. Описание и группа добавляются сразу.' },
            { title: 'Связи', text: 'Потяните от точки на краю блока к другому блоку. Клик по связи открывает настройки: тип, кто родитель, толщину, цвет и примечание.' },
            { title: 'Родительские связи', text: 'Отдел ↔ отдел задаёт структуру подразделений, сотрудник ↔ отдел назначает куратора, сотрудник ↔ сотрудник — личного руководителя. С текстовыми блоками родительская связь недоступна.' },
            { title: 'Видимость отпусков', text: 'ПКМ по родительской связи → «Настройки родительской связи»: «Родитель видит отпуска подчинённых» и «Отпуск родителя виден подчинённым». Флаги применяются к отпускам после сохранения.' },
            { title: 'Точки опоры', text: 'Выделите связь: точки на линии можно тянуть, «+» добавляет точку, двойной клик по точке удаляет её. Линия рисуется кривой Безье.' },
            { title: 'Группы и описание', text: 'Пунктирные рамки объединяют элементы визуально, текстовые блоки служат для заметок. Редактирование и удаление — через ПКМ.' },
            { title: 'Сохранение и отмена', text: 'Кнопка «Сохранить» записывает схему. Ctrl+Z — отменить последнее действие. Удаление блоков и связей требует подтверждения, а выход с несохранёнными изменениями предупреждает.' },
          ]}
        />
      )}

      {pendingDrop?.type === 'department' && (
        <SelectDepartmentModal
          departments={departments}
          onSelect={handleSelectDepartment}
          onClose={() => setPendingDrop(null)}
        />
      )}
      {pendingDrop?.type === 'employee' && (
        <SelectEmployeeModal
          departments={departments}
          members={orgMembers}
          onSelect={handleSelectEmployee}
          onClose={() => setPendingDrop(null)}
        />
      )}
      {pendingDrop?.type === 'text' && (
        <TextInputModal
          onConfirm={handleSelectText}
          onClose={() => setPendingDrop(null)}
        />
      )}
      {pendingDrop?.type === 'group' && (
        <TextInputModal
          onConfirm={handleSelectGroup}
          onClose={() => setPendingDrop(null)}
          initialText="Группа"
        />
      )}

      {edgeDraft && (
        <EdgeSettingsModal
          draft={edgeDraft}
          onConfirm={confirmEdgeDraft}
          onDelete={() => { if (edgeDraft.edgeId) setConfirmDeleteEdgeId(edgeDraft.edgeId); setEdgeDraft(null) }}
          onClose={() => setEdgeDraft(null)}
        />
      )}

      {confirmDeleteEdgeId && (
        <ConfirmDeleteEdgeModal
          onConfirm={() => { deleteEdge(confirmDeleteEdgeId); setConfirmDeleteEdgeId(null) }}
          onClose={() => setConfirmDeleteEdgeId(null)}
        />
      )}

      {confirmDeleteNode && (() => {
        const count = edges.filter(e => e.source === confirmDeleteNode || e.target === confirmDeleteNode).length
        return (
          <ConfirmDeleteNodeModal
            edgeCount={count}
            onConfirm={() => { deleteNode(confirmDeleteNode); setConfirmDeleteNode(null) }}
            onClose={() => setConfirmDeleteNode(null)}
          />
        )
      })()}

      {confirmLeave && (
        <ConfirmLeaveModal
          onConfirm={() => {
            setConfirmLeave(false)
            const action = pendingAfterLeaveRef.current
            pendingAfterLeaveRef.current = null
            if (action) action()
            else onClose?.()
          }}
          onClose={() => { pendingAfterLeaveRef.current = null; setConfirmLeave(false) }}
        />
      )}

      {/* Edit modals */}
      {editingNode?.type === 'department' && (() => {
        const n = nodes.find(n => n.id === editingNode.id)
        const d = n?.data as { id?: number; description?: string } | undefined
        return (
          <SelectDepartmentModal
            departments={departments}
            onSelect={handleEditDepartment}
            onClose={() => setEditingNode(null)}
            initialId={d?.id}
            initialDescription={d?.description ?? ''}
          />
        )
      })()}
      {editingNode?.type === 'employee' && (() => {
        const n = nodes.find(n => n.id === editingNode.id)
        const d = n?.data as { id?: number; description?: string } | undefined
        return (
          <SelectEmployeeModal
            departments={departments}
            members={orgMembers}
            onSelect={handleEditEmployee}
            onClose={() => setEditingNode(null)}
            initialId={d?.id}
            initialDescription={d?.description ?? ''}
          />
        )
      })()}
      {editingNode?.type === 'text' && (() => {
        const n = nodes.find(n => n.id === editingNode.id)
        const d = n?.data as { text?: string } | undefined
        return (
          <TextInputModal
            onConfirm={handleEditText}
            onClose={() => setEditingNode(null)}
            initialText={d?.text ?? ''}
          />
        )
      })()}
      {editingNode?.type === 'group' && (() => {
        const n = nodes.find(n => n.id === editingNode.id)
        const d = n?.data as { title?: string } | undefined
        return (
          <TextInputModal
            onConfirm={handleEditGroup}
            onClose={() => setEditingNode(null)}
            initialText={d?.title ?? ''}
          />
        )
      })()}

      {/* Edge context menu */}
      {edgeContextMenu && (() => {
        const ec = edges.find(e => e.id === edgeContextMenu.edgeId)
        const isParent = (ec?.data as { relation?: string } | undefined)?.relation !== 'plain'
        return (
          <div
            className="fixed z-50 min-w-[200px] overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-in"
            style={{ left: edgeContextMenu.x, top: edgeContextMenu.y }}
            onClick={e => e.stopPropagation()}
          >
            {isParent && (
              <>
                <button
                  onClick={() => { setParentEdgeId(edgeContextMenu.edgeId); setEdgeContextMenu(null) }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                >
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  Настройки родительской связи
                </button>
                <div className="h-px bg-border mx-2" />
              </>
            )}
            <button
              onClick={() => { setConfirmDeleteEdgeId(edgeContextMenu.edgeId); setEdgeContextMenu(null) }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Удалить связь
            </button>
          </div>
        )
      })()}

      {parentEdgeId && (() => {
        const e = edges.find(x => x.id === parentEdgeId)
        if (!e) return null
        return (
          <ParentEdgeSettingsModal
            edge={e}
            onConfirm={saveParentEdgeSettings}
            onClose={() => setParentEdgeId(null)}
          />
        )
      })()}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[180px] overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-4 py-2.5 border-b border-border">
            <p className="text-[11px] font-semibold text-muted-foreground mb-2">Цвет блока</p>
            <div className="flex gap-1.5 flex-wrap">
              {NODE_COLORS.map(color => {
                const current = (nodes.find(n => n.id === contextMenu.nodeId)?.data as { color?: string })?.color ?? '#6b7280'
                return (
                  <button
                    key={color}
                    onClick={() => setNodeColor(contextMenu.nodeId, color)}
                    className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: color,
                      borderColor: current === color ? 'white' : color,
                      boxShadow: current === color ? `0 0 0 2px ${color}` : 'none',
                    }}
                  />
                )
              })}
            </div>
          </div>
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
          <button
            onClick={() => startEdit(contextMenu.nodeId, contextMenu.nodeType)}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
          >
            <Pencil className="h-4 w-4 text-muted-foreground" />
            Изменить
          </button>
          <div className="h-px bg-border mx-2" />
          <button
            onClick={() => requestDeleteNode(contextMenu.nodeId)}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Удалить
          </button>
        </div>
      )}
    </div>
  )

  return fullscreen ? createPortal(content, document.body) : content
}

export { DepartmentNode, EmployeeNode, TextNode, GroupNode, nodeTypes, EditableEdge, edgeTypes }
export { SelectDepartmentModal, SelectEmployeeModal, TextInputModal }
export { ChildOrgNode, buildOrgOverlay, animateOrgReveal }
export type { Department, DeptEmployee }
export { SaveSnapshotContext, EDGE_STYLE, EDGE_MARKER, NODE_COLORS }
