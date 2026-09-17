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
import { Building2, User, Trash2, Save, Network, Search, X, Pencil, ArrowLeft, ArrowLeftRight, AlignLeft, ExternalLink, Frame, Eye, AlertTriangle, BookOpen, Plus, ChevronDown, Briefcase, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/Button'
import { Switch } from '@/shared/components/ui/Switch'
import { DepartmentHierarchyOverlay } from '@/modules/hierarchy/components/DepartmentHierarchyOverlay'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { useDepartmentsStore } from '@/shared/store/departmentsStore'
import { useOrgStore } from '@/shared/store/orgStore'
import { getErrorMessage, cn, personName } from '@/shared/lib/utils'
import { useUIStore } from '@/shared/store/uiStore'

const SaveSnapshotContext = createContext<() => void>(() => {})

interface DeptEmployee {
  id: number
  first_name: string
  last_name: string
  middle_name?: string | null
  position: string
  departmentName?: string
  departmentId?: number
  managerId?: number | null
}

interface OrgMemberRow {
  id: number
  first_name: string
  last_name: string
  middle_name?: string | null
  position: string | null
  department_id: number | null
  department_name: string | null
  manager_id: number | null
}

interface ChildOrgItem {
  id: number
  name: string
  parent_id?: number | null
  member_count?: number
  head_id?: number | null
  head_first_name?: string | null
  head_last_name?: string | null
  head_middle_name?: string | null
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
      headName: o.head_id ? personName(o.head_last_name, o.head_first_name, o.head_middle_name) || null : null,
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
      headName: org.head_id ? personName(org.head_last_name, org.head_first_name, org.head_middle_name) || null : null,
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
  const d = n.data as { name?: string; firstName?: string; lastName?: string; middleName?: string; title?: string; text?: string } | undefined
  if (d?.name) return d.name
  if (d?.lastName || d?.firstName) return personName(d.lastName, d.firstName, d.middleName)
  if (d?.title) return d.title
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

function DepartmentNode({ data, selected }: NodeProps) {
  const d = data as { name: string; employeeCount: number; managerName: string | null; description?: string; color?: string }
  return (
    <div className="group w-full min-h-full min-w-[200px] min-h-[92px] rounded-xl overflow-hidden shadow-lg border-2 hover:shadow-md transition-all duration-200 select-none flex flex-col" style={{ borderColor: d.color ?? '#6b7280' }}>
      <NodeResizer isVisible={selected} minWidth={200} minHeight={92} lineClassName="pointer-events-auto" handleClassName="pointer-events-auto" />
      <div className="px-4 py-3 shrink-0" style={{ backgroundColor: d.color ?? '#6b7280' }}>
        <div className="flex items-start gap-2">
          <Building2 className="h-4 w-4 text-white/80 flex-shrink-0 mt-0.5" />
          <span className="text-white font-semibold text-sm break-words min-w-0 flex-1">{d.name}</span>
        </div>
        {d.employeeCount > 0 && (
          <div className="text-white/70 text-xs mt-1">{d.employeeCount} сотр.</div>
        )}
      </div>
      {d.managerName ? (
        <div className="bg-card px-4 py-2 text-xs text-muted-foreground border-t border-border/50 break-words">
          Начальник: <span className="font-medium text-foreground/80">{d.managerName}</span>
        </div>
      ) : (
        <div className="bg-card px-4 py-2 text-xs text-muted-foreground/60 border-t border-border/50">
          Без начальника
        </div>
      )}
      {d.description && (
        <div className="bg-card px-4 py-2 text-xs text-foreground/70 border-t border-border/50 whitespace-pre-wrap break-words">
          {d.description}
        </div>
      )}
      {HANDLES}
    </div>
  )
}

function EmployeeNode({ data, selected }: NodeProps) {
  const d = data as { firstName: string; lastName: string; middleName?: string; position: string; department?: string; description?: string; color?: string }
  const initials = `${d.firstName[0]}${d.lastName[0]}`
  return (
    <div className="group w-full min-h-full min-w-[180px] min-h-[68px] rounded-xl overflow-hidden shadow-md border-2 bg-card hover:shadow-md transition-all duration-200 select-none" style={{ borderColor: d.color ?? '#6b7280' }}>
      <NodeResizer isVisible={selected} minWidth={180} minHeight={68} lineClassName="pointer-events-auto" handleClassName="pointer-events-auto" />
      <div className="px-3 py-2.5 flex items-start gap-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: d.color ?? '#6b7280' }}>
          <span className="text-white text-xs font-semibold">{initials}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium break-words">{personName(d.lastName, d.firstName, d.middleName)}</div>
          <div className="text-xs text-muted-foreground break-words">{d.position}</div>
          {d.department && (
            <div className="text-[10px] text-muted-foreground break-words">{d.department}</div>
          )}
        </div>
      </div>
      {d.description && (
        <div className="px-3 pb-2.5 text-xs text-foreground/70 border-t border-border/50 pt-2 whitespace-pre-wrap break-words">
          {d.description}
        </div>
      )}
      {HANDLES}
    </div>
  )
}

function PositionNode({ data, selected }: NodeProps) {
  const d = data as { title: string; department?: string; description?: string; color?: string }
  return (
    <div className="group w-full min-h-full min-w-[180px] min-h-[68px] rounded-xl overflow-hidden shadow-md border-2 border-dashed bg-card hover:shadow-md transition-all duration-200 select-none" style={{ borderColor: d.color ?? '#6b7280' }}>
      <NodeResizer isVisible={selected} minWidth={180} minHeight={68} lineClassName="pointer-events-auto" handleClassName="pointer-events-auto" />
      <div className="px-3 py-2.5 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border-2 border-dashed" style={{ borderColor: d.color ?? '#6b7280' }}>
          <Briefcase className="h-4 w-4" style={{ color: d.color ?? '#6b7280' }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium break-words">{d.title}</div>
          <div className="text-xs text-muted-foreground break-words">Вакансия{d.department ? ` · ${d.department}` : ''}</div>
        </div>
      </div>
      {d.description && (
        <div className="px-3 pb-2.5 text-xs text-foreground/70 border-t border-border/50 pt-2 whitespace-pre-wrap break-words">
          {d.description}
        </div>
      )}
      {HANDLES}
    </div>
  )
}

function TextNode({ data, selected }: NodeProps) {
  const d = data as { text: string; color?: string }
  return (
    <div className="group w-full min-h-full min-w-[180px] min-h-[70px] rounded-xl overflow-hidden shadow-md border-2 bg-card hover:shadow-md transition-all duration-200 select-none" style={{ borderColor: d.color ?? '#6b7280' }}>
      <NodeResizer isVisible={selected} minWidth={180} minHeight={70} lineClassName="pointer-events-auto" handleClassName="pointer-events-auto" />
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50" style={{ backgroundColor: d.color ?? '#6b7280' }}>
        <AlignLeft className="h-3.5 w-3.5 text-white/80 flex-shrink-0" />
        <span className="text-xs font-medium text-white">Описание</span>
      </div>
      <div className="px-3 py-2.5 text-sm text-foreground whitespace-pre-wrap break-words">
        {d.text}
      </div>
      {HANDLES}
    </div>
  )
}

function GroupNode({ data, selected }: NodeProps) {
  const d = data as { title?: string; description?: string; color?: string }
  const color = d.color ?? '#6b7280'
  return (
    <div className={cn('w-full h-full rounded-2xl border-2 border-dashed flex flex-col', selected ? 'pointer-events-auto cursor-grab' : 'pointer-events-none')} style={{ borderColor: color, background: `${color}0F` }}>
      <NodeResizer color={color} isVisible={selected} minWidth={200} minHeight={140} lineClassName="!border-dashed pointer-events-auto" handleClassName="pointer-events-auto" />
      <div
        className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider truncate pointer-events-auto cursor-grab select-none shrink-0"
        style={{ color }}
        title="Перетащите группу за эту полосу; клик выделяет группу — после этого её можно тянуть за любую точку"
      >
        {d.title || 'Группа'}
      </div>
      {d.description && (
        <div className="mt-auto px-3 py-2 text-xs text-foreground/70 border-t whitespace-pre-wrap pointer-events-auto" style={{ borderColor: `${color}40` }}>
          {d.description}
        </div>
      )}
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
  const [hovered, setHovered] = useState(false)

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
      if (ed.id !== id) return { ...ed, selected: false }
      const wps = [...((ed.data as { waypoints?: Waypoint[] })?.waypoints ?? [])]
      wps.splice(segIdx, 0, { x, y })
      return { ...ed, selected: true, data: { ...ed.data, waypoints: wps } }
    }))
  }

  return (
    <>
      <BaseEdge path={pathD} markerEnd={markerEnd} markerStart={markerStart} style={style} />
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={e => {
          const rt = e.relatedTarget as HTMLElement | null
          if (rt && typeof rt.closest === 'function' && rt.closest('[data-edge-handles]')?.getAttribute('data-edge-handles') === id) return
          setHovered(false)
        }}
      />
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
      {(selected || hovered) && (
        <EdgeLabelRenderer>
          <div data-edge-handles={id} onMouseLeave={() => setHovered(false)}>
            {selected && hasWaypoints && waypoints.map((wp, i) => (
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
          </div>
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
  position: PositionNode,
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
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-scale-in flex max-h-[85vh] flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Выберите отдел</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-4 py-3 border-b border-border shrink-0">
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
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain">
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
        <div className="px-4 py-3 border-t border-border shrink-0">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Краткое описание (необязательно)..."
            rows={2}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:border-primary transition-colors resize-none"
          />
        </div>
        <div className="px-6 py-3 border-t border-border flex gap-2 shrink-0">
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
      `${personName(e.last_name, e.first_name, e.middle_name)} ${e.position}`.toLowerCase().includes(search.toLowerCase())
    return matchDept && matchSearch
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-scale-in flex max-h-[85vh] flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Выберите работника</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-4 py-3 border-b border-border space-y-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск работника..."
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
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain">
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
                  <div className="text-sm font-medium truncate">{personName(emp.last_name, emp.first_name, emp.middle_name)}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {emp.position}{emp.departmentName ? ` · ${emp.departmentName}` : ''}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
        <div className="px-4 py-3 border-t border-border shrink-0">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Краткое описание (необязательно)..."
            rows={2}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:border-primary transition-colors resize-none"
          />
        </div>
        <div className="px-6 py-3 border-t border-border flex gap-2 shrink-0">
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
  showDescription = false,
  initialDescription = '',
}: {
  onConfirm: (text: string, description?: string) => void
  onClose: () => void
  initialText?: string
  showDescription?: boolean
  initialDescription?: string
}) {
  const [text, setText] = useState(initialText)
  const [description, setDescription] = useState(initialDescription)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-scale-in flex max-h-[85vh] flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <AlignLeft className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">{showDescription ? 'Группа' : 'Текстовый блок'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-4 py-4 flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain space-y-3">
          <textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={showDescription ? 'Название группы...' : 'Введите текст...'}
            rows={showDescription ? 2 : 4}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:border-primary transition-colors resize-none"
          />
          {showDescription && (
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Описание (необязательно)..."
              rows={3}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:border-primary transition-colors resize-none"
            />
          )}
        </div>
        <div className="px-6 py-3 border-t border-border flex gap-2 shrink-0">
          <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
          <Button className="flex-1" disabled={!text.trim()} onClick={() => onConfirm(text, description)}>
            {initialText ? 'Сохранить' : 'Добавить'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function PositionInputModal({
  departments,
  onConfirm,
  onClose,
  initialTitle = '',
  initialDepartmentId = null,
  initialDescription = '',
}: {
  departments: Department[]
  onConfirm: (title: string, departmentId: number | null, description: string) => void
  onClose: () => void
  initialTitle?: string
  initialDepartmentId?: number | null
  initialDescription?: string
}) {
  const [title, setTitle] = useState(initialTitle)
  const [departmentId, setDepartmentId] = useState<number | null>(initialDepartmentId)
  const [description, setDescription] = useState(initialDescription)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-scale-in flex max-h-[85vh] flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Должность</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-4 py-4 flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain space-y-3">
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Название должности..."
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:border-primary transition-colors"
          />
          <select
            value={departmentId ?? ''}
            onChange={e => setDepartmentId(e.target.value === '' ? null : Number(e.target.value))}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:border-primary transition-colors"
          >
            <option value="">Без отдела</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Краткое описание (необязательно)..."
            rows={2}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:border-primary transition-colors resize-none"
          />
        </div>
        <div className="px-6 py-3 border-t border-border flex gap-2 shrink-0">
          <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
          <Button className="flex-1" disabled={!title.trim()} onClick={() => onConfirm(title.trim(), departmentId, description)}>
            {initialTitle ? 'Сохранить' : 'Добавить'}
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
  sourceType: 'department' | 'employee' | 'text' | 'position'
  targetType: 'department' | 'employee' | 'text' | 'position'
  relation: EdgeRelation
  parentIsSource: boolean
  strokeWidth: number
  strokeColor: string
  lineStyle: 'solid' | 'dashed'
  note: string
  vacationVisibility?: Partial<VacationVisibility>
}

function VacationVisibilityRow({
  label, hint, checked, onCheckedChange, cascade, onCascadeChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
  cascade: boolean
  onCascadeChange: (v: boolean) => void
}) {
  return (
    <div className="rounded-lg border border-border px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{label}</p>
          {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        </div>
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={cascade}
          onChange={e => onCascadeChange(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-border accent-primary"
        />
        Каскадом — распространить на все уровни ниже
      </label>
    </div>
  )
}

function EdgeSettingsModal({
  draft,
  onConfirm,
  onDelete,
  onClose,
}: {
  draft: EdgeDraft
  onConfirm: (relation: EdgeRelation, parentIsSource: boolean, note: string, strokeWidth: number, strokeColor: string, lineStyle: 'solid' | 'dashed', vacationVisibility: VacationVisibility | undefined) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [relation, setRelation] = useState<EdgeRelation>(draft.relation)
  const [parentIsSource, setParentIsSource] = useState(draft.parentIsSource)
  const [strokeWidth, setStrokeWidth] = useState(draft.strokeWidth)
  const [strokeColor, setStrokeColor] = useState(draft.strokeColor)
  const [lineStyle, setLineStyle] = useState<'solid' | 'dashed'>(draft.lineStyle)
  const [note, setNote] = useState(draft.note)
  const [childSeesParent, setChildSeesParent] = useState(draft.vacationVisibility?.childSeesParent ?? true)
  const [parentSeesChild, setParentSeesChild] = useState(draft.vacationVisibility?.parentSeesChild ?? true)
  const [parentApproves, setParentApproves] = useState(draft.vacationVisibility?.parentApproves ?? true)
  const [cascadeChildSeesParent, setCascadeChildSeesParent] = useState(draft.vacationVisibility?.cascadeChildSeesParent ?? false)
  const [cascadeParentSeesChild, setCascadeParentSeesChild] = useState(draft.vacationVisibility?.cascadeParentSeesChild ?? false)
  const [cascadeParentApproves, setCascadeParentApproves] = useState(draft.vacationVisibility?.cascadeParentApproves ?? false)
  const parentAvailable = draft.sourceType !== 'text' && draft.targetType !== 'text' &&
    (draft.sourceType === 'department' || draft.targetType === 'department' ||
      (draft.sourceType === 'employee' && draft.targetType === 'employee') ||
      draft.sourceType === 'position' || draft.targetType === 'position')
  const effectiveRelation: EdgeRelation = parentAvailable ? relation : 'plain'
  const isEmpToEmp = draft.sourceType === 'employee' && draft.targetType === 'employee'
  const vacationApplicable = effectiveRelation === 'parent' && draft.sourceType !== 'text' && draft.targetType !== 'text'
  const buildVacationVisibility = (): VacationVisibility | undefined =>
    effectiveRelation === 'parent'
      ? {
          childSeesParent, parentSeesChild, parentApproves: isEmpToEmp ? true : parentApproves,
          cascadeChildSeesParent, cascadeParentSeesChild,
          cascadeParentApproves: isEmpToEmp ? false : cascadeParentApproves,
        }
      : undefined

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-scale-in flex max-h-[85vh] flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">{draft.mode === 'create' ? 'Новая связь' : 'Связь'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto scrollbar-thin overscroll-contain">
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
          {relation === 'parent' && (
            (draft.sourceType === 'department' && draft.targetType === 'department') ||
            (draft.sourceType === 'employee' && draft.targetType === 'employee') ||
            draft.sourceType === 'position' || draft.targetType === 'position'
          ) && (
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
          {vacationApplicable && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Видимость отпусков</p>
              <VacationVisibilityRow
                label="Отпуск родителя виден подчинённым"
                checked={childSeesParent} onCheckedChange={setChildSeesParent}
                cascade={cascadeChildSeesParent} onCascadeChange={setCascadeChildSeesParent}
              />
              <VacationVisibilityRow
                label="Родитель видит отпуска подчинённых"
                checked={parentSeesChild} onCheckedChange={setParentSeesChild}
                cascade={cascadeParentSeesChild} onCascadeChange={setCascadeParentSeesChild}
              />
              {!isEmpToEmp && (
                <VacationVisibilityRow
                  label="Родитель согласовывает отпуска подчинённых"
                  hint={!parentApproves ? 'Согласование уйдёт на уровень выше' : undefined}
                  checked={parentApproves} onCheckedChange={setParentApproves}
                  cascade={cascadeParentApproves} onCascadeChange={setCascadeParentApproves}
                />
              )}
            </div>
          )}
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
        <div className="px-6 py-3 border-t border-border flex gap-2 shrink-0">
          {draft.mode === 'edit' && onDelete && (
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
          <Button className="flex-1" onClick={() => onConfirm(effectiveRelation, parentIsSource, note, strokeWidth, strokeColor, lineStyle, buildVacationVisibility())}>
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type VacationVisibility = {
  childSeesParent: boolean
  parentSeesChild: boolean
  parentApproves?: boolean
  cascadeChildSeesParent?: boolean
  cascadeParentSeesChild?: boolean
  cascadeParentApproves?: boolean
}

function validateGraphEdges(nodes: Node[], edges: Edge[]): string | null {
  const deptIdByNode = new Map<string, number>()
  const nameByDept = new Map<number, string>()
  const userIdByNode = new Map<string, number>()
  const nameByUser = new Map<number, string>()
  for (const n of nodes) {
    const d = (n.data ?? {}) as Record<string, unknown>
    if (n.type === 'department' && d.id != null) {
      const id = Number(d.id)
      deptIdByNode.set(n.id, id)
      nameByDept.set(id, String(d.name || `Отдел #${id}`))
    } else if (n.type === 'employee' && d.id != null) {
      const id = Number(d.id)
      userIdByNode.set(n.id, id)
      nameByUser.set(id, personName(String(d.lastName || ''), String(d.firstName || ''), d.middleName ? String(d.middleName) : undefined) || `Пользователь #${id}`)
    }
  }

  // «Должность» прозрачна для родительских связей: X → Должность → Y
  // трактуется как X → Y. Поднимаемся от источника связи вверх, пропуская
  // узлы-должности, до первого реального (отдел/работник) узла.
  const nodeTypeById = new Map<string, string | undefined>()
  const nodeById = new Map<string, Node>()
  for (const n of nodes) { nodeTypeById.set(n.id, n.type); nodeById.set(n.id, n) }
  const parentEdgesByTarget = new Map<string, string[]>()
  for (const e of edges) {
    if ((e.data as { relation?: string } | undefined)?.relation === 'plain') continue
    if (!parentEdgesByTarget.has(e.target)) parentEdgesByTarget.set(e.target, [])
    parentEdgesByTarget.get(e.target)!.push(e.source)
  }
  for (const [targetId, sources] of parentEdgesByTarget) {
    if (sources.length > 1 && nodeTypeById.get(targetId) === 'position') {
      const posLabel = (nodeById.get(targetId)?.data as { title?: string } | undefined)?.title || 'Должность'
      return `У блока «${posLabel}» может быть только один родитель`
    }
  }
  const parentOfNode = new Map<string, string>()
  for (const [targetId, sources] of parentEdgesByTarget) parentOfNode.set(targetId, sources[0])
  const resolveThroughPositions = (nodeId: string): string | null => {
    if (nodeTypeById.get(nodeId) !== 'position') return nodeId
    let cur: string | null | undefined = parentOfNode.get(nodeId)
    const seen = new Set([nodeId])
    while (cur != null) {
      if (seen.has(cur)) return null
      seen.add(cur)
      if (nodeTypeById.get(cur) !== 'position') return cur
      cur = parentOfNode.get(cur)
    }
    return null
  }

  const deptParents = new Map<number, Set<number>>()
  const deptCurator = new Map<number, number>()
  const empParent = new Map<number, number>()

  for (const e of edges) {
    if ((e.data as { relation?: string } | undefined)?.relation === 'plain') continue
    if (nodeTypeById.get(e.target) === 'position') continue
    const resolvedSource = resolveThroughPositions(e.source)
    const sD = resolvedSource != null ? deptIdByNode.get(resolvedSource) : undefined
    const tD = deptIdByNode.get(e.target)
    const sU = resolvedSource != null ? userIdByNode.get(resolvedSource) : undefined
    const tU = userIdByNode.get(e.target)
    if (sD != null && tD != null) {
      if (!deptParents.has(tD)) deptParents.set(tD, new Set())
      deptParents.get(tD)!.add(sD)
    } else if (sU != null && tD != null) {
      const ex = deptCurator.get(tD)
      if (ex != null && ex !== sU) return `У отдела может быть только один родитель: ${nameByDept.get(tD)}`
      deptCurator.set(tD, sU)
    } else if (sU != null && tU != null && sU !== tU) {
      const ex = empParent.get(tU)
      if (ex != null && ex !== sU) return `У работника может быть только один родитель: ${nameByUser.get(tU)}`
      empParent.set(tU, sU)
    }
  }

  for (const [childDept, parents] of deptParents) {
    if (parents.size > 1 || deptCurator.has(childDept)) {
      return `У отдела может быть только один родитель: ${nameByDept.get(childDept)}`
    }
  }

  for (const childUser of empParent.keys()) {
    const seen = new Set<number>()
    let cur: number | null | undefined = childUser
    while (cur != null && !seen.has(cur)) { seen.add(cur); cur = empParent.get(cur) ?? null }
    if (cur != null) return 'Цикл в иерархии работников'
  }

  for (const childDept of deptParents.keys()) {
    const seen = new Set<number>()
    let cur: number | null | undefined = childDept
    while (cur != null && !seen.has(cur)) {
      seen.add(cur)
      const p = deptParents.get(cur)
      cur = p && p.size > 0 ? [...p][0] : null
    }
    if (cur != null) return 'Цикл в иерархии отделов'
  }

  return null
}

function ParentEdgeSettingsModal({ edge, sourceType, targetType, onConfirm, onClose }: {
  edge: Edge
  sourceType?: string
  targetType?: string
  onConfirm: (childSeesParent: boolean, parentSeesChild: boolean, parentApproves: boolean, cascade?: { childSeesParent: boolean; parentSeesChild: boolean; parentApproves: boolean }) => void
  onClose: () => void
}) {
  const vis = (edge.data as { vacationVisibility?: Partial<VacationVisibility> } | undefined)?.vacationVisibility
  const isEmpToEmp = sourceType === 'employee' && targetType === 'employee'
  const [childSeesParent, setChildSeesParent] = useState(vis?.childSeesParent ?? true)
  const [parentSeesChild, setParentSeesChild] = useState(vis?.parentSeesChild ?? true)
  const [parentApproves, setParentApproves] = useState(vis?.parentApproves ?? true)
  const [cascadeChildSeesParent, setCascadeChildSeesParent] = useState(vis?.cascadeChildSeesParent ?? false)
  const [cascadeParentSeesChild, setCascadeParentSeesChild] = useState(vis?.cascadeParentSeesChild ?? false)
  const [cascadeParentApproves, setCascadeParentApproves] = useState(vis?.cascadeParentApproves ?? false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-scale-in flex max-h-[85vh] flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Родительская связь</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-3 overflow-y-auto scrollbar-thin overscroll-contain">
          <VacationVisibilityRow
            label="Отпуск родителя виден подчинённым"
            checked={childSeesParent} onCheckedChange={setChildSeesParent}
            cascade={cascadeChildSeesParent} onCascadeChange={setCascadeChildSeesParent}
          />
          <VacationVisibilityRow
            label="Родитель видит отпуска подчинённых"
            checked={parentSeesChild} onCheckedChange={setParentSeesChild}
            cascade={cascadeParentSeesChild} onCascadeChange={setCascadeParentSeesChild}
          />
          {!isEmpToEmp && (
            <VacationVisibilityRow
              label="Родитель согласовывает отпуска подчинённых"
              hint={!parentApproves ? 'Согласование уйдёт на уровень выше' : undefined}
              checked={parentApproves} onCheckedChange={setParentApproves}
              cascade={cascadeParentApproves} onCascadeChange={setCascadeParentApproves}
            />
          )}
        </div>
        <div className="px-6 py-3 border-t border-border flex gap-2 shrink-0">
          <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
          <Button className="flex-1" onClick={() => onConfirm(childSeesParent, parentSeesChild, isEmpToEmp ? true : parentApproves, {
            childSeesParent: cascadeChildSeesParent,
            parentSeesChild: cascadeParentSeesChild,
            parentApproves: isEmpToEmp ? false : cascadeParentApproves,
          })}>
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  )
}

type PendingDrop = { type: 'department' | 'employee' | 'text' | 'group' | 'position'; position: { x: number; y: number } }

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
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden animate-scale-in flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-3 overflow-y-auto scrollbar-thin overscroll-contain min-h-0 flex-1">
          {items.map(item => (
            <div key={item.title} className="rounded-lg border border-border px-4 py-3">
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.text}</p>
            </div>
          ))}
        </div>
        <div className="px-6 py-3 border-t border-border shrink-0">
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
type ContextMenu = { nodeId: string; nodeType: 'department' | 'employee' | 'text' | 'group' | 'organization' | 'position'; x: number; y: number }
type EdgeContextMenu = { edgeId: string; x: number; y: number }

interface Props {
  fullscreen?: boolean
  onClose?: () => void
  orgId?: number
  onOpenOrg?: (orgId: number) => void
  onViewOrg?: (orgId: number) => void
  onBack?: () => void
}

export function HRHierarchy({ fullscreen = false, onClose, orgId, onOpenOrg, onViewOrg, onBack }: Props) {
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
  const [editingNode, setEditingNode] = useState<{ id: string; type: 'department' | 'employee' | 'text' | 'group' | 'position' } | null>(null)
  const [activeDepartment, setActiveDepartment] = useState<{ id: number; name: string } | null>(null)
  const [edgeDraft, setEdgeDraft] = useState<EdgeDraft | null>(null)
  const [parentEdgeId, setParentEdgeId] = useState<string | null>(null)
  const [confirmDeleteEdgeId, setConfirmDeleteEdgeId] = useState<string | null>(null)
  const [confirmDeleteNode, setConfirmDeleteNode] = useState<string | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [pendingSaveNames, setPendingSaveNames] = useState<string[] | null>(null)
  const versionRef = useRef<number>(0)
  const [showInstruction, setShowInstruction] = useState(false)
  const [offCanvasOpen, setOffCanvasOpen] = useState(false)

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
    if (historyRef.current.length === 0) setDirty(false)
  }, [setNodes, setEdges])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.code === 'KeyZ')) {
        const t = e.target as HTMLElement | null
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
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
        const payload = await res.json()
        const { data } = payload
        versionRef.current = typeof payload.version === 'number' ? payload.version : 0
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
            middle_name: u.middle_name,
            position: u.position ?? '',
            departmentName: u.department_name ?? undefined,
            departmentId: u.department_id ?? undefined,
            managerId: u.manager_id ?? null,
          })))
        }
      } catch {
        setOrgMembers([])
      }
    }
    load()
  }, [orgId, orgHeaders])

  useEffect(() => {
    if (departments.length === 0) return
    const byId = new Map(departments.map(d => [d.id, d]))
    setNodes(nds => nds.map(n => {
      if (n.type !== 'department') return n
      const d = n.data as { id?: number; name?: string; managerName?: string | null; employeeCount?: number }
      if (d?.id == null) return n
      const fresh = byId.get(d.id)
      if (!fresh) return n
      if (d.name === fresh.name && d.managerName === fresh.manager_name && d.employeeCount === fresh.employee_count) return n
      return { ...n, data: { ...n.data, name: fresh.name, managerName: fresh.manager_name, employeeCount: fresh.employee_count } }
    }))
  }, [departments, setNodes])

  useEffect(() => {
    if (orgMembers.length === 0) return
    const byId = new Map(orgMembers.map(m => [m.id, m]))
    setNodes(nds => nds.map(n => {
      if (n.type !== 'employee') return n
      const d = n.data as { id?: number; firstName?: string; lastName?: string; middleName?: string | null; position?: string; department?: string }
      if (d?.id == null) return n
      const fresh = byId.get(d.id)
      if (!fresh) return n
      if (d.firstName === fresh.first_name && d.lastName === fresh.last_name && d.middleName === fresh.middle_name &&
        d.position === fresh.position && d.department === fresh.departmentName) return n
      return {
        ...n,
        data: { ...n.data, firstName: fresh.first_name, lastName: fresh.last_name, middleName: fresh.middle_name, position: fresh.position, department: fresh.departmentName },
      }
    }))
  }, [orgMembers, setNodes])

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
        toast('У работника может быть только один родитель')
        return
      }
      let cur: number | null = sUser
      const seen = new Set<number>()
      while (cur != null && !seen.has(cur)) {
        seen.add(cur)
        if (cur === tUser) {
          toast('Цикл в иерархии работников')
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
      sourceType: (s.type as 'department' | 'employee' | 'text' | 'position') || 'text',
      targetType: (t.type as 'department' | 'employee' | 'text' | 'position') || 'text',
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
    const data = edge.data as { relation?: EdgeRelation; note?: string; lineStyle?: 'solid' | 'dashed'; vacationVisibility?: Partial<VacationVisibility> } | undefined
    setEdgeDraft({
      mode: 'edit',
      edgeId: edge.id,
      vacationVisibility: data?.vacationVisibility,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
      sourceName: nodeName(s),
      targetName: nodeName(t),
      sourceType: (s.type as 'department' | 'employee' | 'text' | 'position') || 'text',
      targetType: (t.type as 'department' | 'employee' | 'text' | 'position') || 'text',
      relation: data?.relation === 'plain' ? 'plain' : 'parent',
      parentIsSource: !edge.markerStart,
      strokeWidth: (edge.style as { strokeWidth?: number } | undefined)?.strokeWidth ?? 2,
      strokeColor: (edge.style as { stroke?: string } | undefined)?.stroke ?? '#6b7280',
      lineStyle: data?.lineStyle ?? ((edge.style as { strokeDasharray?: string } | undefined)?.strokeDasharray ? 'dashed' : 'solid'),
      note: data?.note || '',
    })
  }, [])

  const confirmEdgeDraft = useCallback((relation: EdgeRelation, parentIsSource: boolean, note: string, strokeWidth: number, strokeColor: string, lineStyle: 'solid' | 'dashed', vacationVisibility: VacationVisibility | undefined) => {
    const d = edgeDraft
    if (!d) return
    saveSnapshot()
    const visData = relation === 'parent' && vacationVisibility ? { vacationVisibility } : {}
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
          data: { relation, note, lineStyle, ...visData },
        } as Edge, eds)
      }
      return eds.map(e => {
        if (e.id !== d.edgeId) return e
        const base = { ...(e.data as Record<string, unknown>) }
        delete base.vacationVisibility
        return {
          ...e,
          source,
          target,
          sourceHandle: sourceHandle ?? undefined,
          targetHandle: targetHandle ?? undefined,
          style,
          markerEnd: marker,
          markerStart: undefined,
          data: { ...base, relation, note, lineStyle, ...visData },
        } as Edge
      })
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

  const offCanvasDepts = useMemo(() => {
    const onCanvas = new Set(
      nodes.filter(n => n.type === 'department').map(n => Number((n.data as { id?: number } | undefined)?.id))
    )
    return departments.filter(d => !onCanvas.has(d.id))
  }, [departments, nodes])

  const addDepartmentsToCanvas = useCallback((depts: Department[]) => {
    if (depts.length === 0) return
    saveSnapshot()
    const base = nodes.filter(n => n.type !== 'organization')
    const maxX = base.length ? Math.max(...base.map(n => n.position?.x ?? 0)) : 0
    const minY = base.length ? Math.min(...base.map(n => n.position?.y ?? 0)) : 0
    const stamp = Date.now()
    setNodes(nds => [
      ...nds,
      ...depts.map((dept, i) => ({
        id: `department-${dept.id}-${stamp}-${i}`,
        type: 'department',
        position: { x: maxX + 340 * (i + 1), y: minY },
        data: { id: dept.id, name: dept.name, employeeCount: dept.employee_count, managerName: dept.manager_name, description: '' },
      } as Node)),
    ])
  }, [nodes, setNodes, saveSnapshot])

  const handleSelectEmployee = (emp: DeptEmployee, description: string) => {
    if (!pendingDrop) return
    saveSnapshot()
    setNodes(nds => [...nds, {
      id: `employee-${emp.id}-${Date.now()}`,
      type: 'employee',
      position: pendingDrop.position,
      data: { id: emp.id, firstName: emp.first_name, lastName: emp.last_name, middleName: emp.middle_name, position: emp.position, department: emp.departmentName, description },
    } as Node])
    setPendingDrop(null)
  }

  const handleSelectPosition = (title: string, departmentId: number | null, description: string) => {
    if (!pendingDrop) return
    saveSnapshot()
    const dept = departmentId != null ? departments.find(d => d.id === departmentId) : undefined
    setNodes(nds => [...nds, {
      id: `position-${Date.now()}`,
      type: 'position',
      position: pendingDrop.position,
      data: { title, departmentId: departmentId ?? undefined, department: dept?.name, description },
    } as Node])
    setPendingDrop(null)
  }

  const [convertingPositionId, setConvertingPositionId] = useState<string | null>(null)

  const handleConvertToEmployee = (emp: DeptEmployee) => {
    if (!convertingPositionId) return
    saveSnapshot()
    setNodes(nds => nds.map(n => {
      if (n.id !== convertingPositionId) return n
      const prevDescription = (n.data as { description?: string } | undefined)?.description ?? ''
      return {
        ...n,
        type: 'employee',
        data: { id: emp.id, firstName: emp.first_name, lastName: emp.last_name, middleName: emp.middle_name, position: emp.position, department: emp.departmentName, description: prevDescription },
      }
    }))
    setConvertingPositionId(null)
  }

  const convertEmployeeToPosition = useCallback((nodeId: string) => {
    saveSnapshot()
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n
      const d = n.data as { position?: string; department?: string; description?: string }
      return { ...n, type: 'position', data: { title: d.position || 'Должность', department: d.department, description: d.description ?? '' } }
    }))
    setContextMenu(null)
  }, [setNodes, saveSnapshot])

  const diveToNode = useCallback((node: Node, after: () => void) => {
    const inst = rfInstanceRef.current
    if (!inst) {
      after()
      return
    }
    const w = node.measured?.width ?? 240
    const h = node.measured?.height ?? 130
    const z = Math.min(Math.max(inst.getViewport().zoom * 1.6, 1.3), 2)
    inst.setViewport(
      { x: window.innerWidth / 2 - (node.position.x + w / 2) * z, y: window.innerHeight / 2 - (node.position.y + h / 2) * z, zoom: z },
      { duration: 340 },
    )
    setTimeout(after, 350)
  }, [])

  const onNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    if (node.type !== 'organization') return
    if (!onOpenOrg) return
    const targetOrgId = Number(String(node.id).replace('org-', ''))
    if (!targetOrgId) return
    if (dirty) {
      runAfterLeaveGuarded(() => onOpenOrg(targetOrgId))
      return
    }
    diveToNode(node, () => onOpenOrg(targetOrgId))
  }, [onOpenOrg, dirty, runAfterLeaveGuarded, diveToNode])

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

  const saveParentEdgeSettings = useCallback((
    childSeesParent: boolean, parentSeesChild: boolean, parentApproves: boolean,
    cascade?: { childSeesParent: boolean; parentSeesChild: boolean; parentApproves: boolean },
  ) => {
    if (!parentEdgeId) return
    saveSnapshot()
    setEdges(eds => eds.map(e => e.id === parentEdgeId
      ? { ...e, data: { ...(e.data as Record<string, unknown>), vacationVisibility: {
          childSeesParent, parentSeesChild, parentApproves,
          cascadeChildSeesParent: cascade?.childSeesParent ?? false,
          cascadeParentSeesChild: cascade?.parentSeesChild ?? false,
          cascadeParentApproves: cascade?.parentApproves ?? false,
        } } }
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

  const startEdit = useCallback((nodeId: string, nodeType: 'department' | 'employee' | 'text' | 'group' | 'position') => {
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

  const handleSelectGroup = (title: string, description?: string) => {
    if (!pendingDrop) return
    saveSnapshot()
    setNodes(nds => [...nds, {
      id: `group-${Date.now()}`,
      type: 'group',
      position: { x: pendingDrop.position.x - 200, y: pendingDrop.position.y - 14 },
      style: { width: 400, height: 260 },
      data: { title, description },
    } as Node])
    setPendingDrop(null)
  }

  const handleEditGroup = (title: string, description?: string) => {
    if (!editingNode) return
    saveSnapshot()
    setNodes(nds => nds.map(n => n.id === editingNode.id ? { ...n, data: { ...n.data, title, description } } : n))
    setEditingNode(null)
  }

  const handleEditEmployee = (emp: DeptEmployee, description: string) => {
    if (!editingNode) return
    saveSnapshot()
    setNodes(nds => nds.map(n => n.id === editingNode.id ? {
      ...n,
      data: { id: emp.id, firstName: emp.first_name, lastName: emp.last_name, middleName: emp.middle_name, position: emp.position, department: emp.departmentName, description },
    } : n))
    setEditingNode(null)
  }

  const handleEditPosition = (title: string, departmentId: number | null, description: string) => {
    if (!editingNode) return
    saveSnapshot()
    const dept = departmentId != null ? departments.find(d => d.id === departmentId) : undefined
    setNodes(nds => nds.map(n => n.id === editingNode.id ? {
      ...n,
      data: { title, departmentId: departmentId ?? undefined, department: dept?.name, description },
    } : n))
    setEditingNode(null)
  }

  useEffect(() => {
    if (!contextMenu && !edgeContextMenu) return
    const close = () => { setContextMenu(null); setEdgeContextMenu(null) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [contextMenu, edgeContextMenu])

  const performSave = async () => {
    const inst = rfInstanceRef.current
    if (!inst) return
    setSaving(true)
    try {
      const { nodes: n, edges: e, viewport } = inst.toObject()
      const nodesClean = n.filter(x => x.type !== 'organization').map(x => ({ ...x, selected: false }))
      const edgesClean = e.filter(x => !String(x.source).startsWith('org-') && !String(x.target).startsWith('org-')).map(x => ({ ...x, selected: false }))
      const orgPositions: Record<string, { x: number; y: number }> = {}
      for (const x of n) {
        if (x.type === 'organization') {
          orgPositions[String(x.id).replace('org-', '')] = { x: Math.round(x.position?.x ?? 0), y: Math.round(x.position?.y ?? 0) }
        }
      }
      const res = await fetch(`${API_BASE_URL}/hierarchy`, {
        method: 'PUT',
        headers: { ...getAuthHeadersWithContentType(), ...orgHeaders() },
        body: JSON.stringify({ nodes: nodesClean, edges: edgesClean, viewport, orgPositions, baseVersion: versionRef.current }),
      })
      if (res.status === 409) {
        toast.error('Схема была изменена другим пользователем. Обновите страницу')
        return
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Не удалось сохранить иерархию')
      }
      const d = await res.json().catch(() => ({}))
      if (typeof d.version === 'number') versionRef.current = d.version
      setSavedLabel(true)
      setDirty(false)
      setTimeout(() => setSavedLabel(false), 2000)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const save = async () => {
    const inst = rfInstanceRef.current
    if (!inst) return
    const { nodes: n, edges: e } = inst.toObject()
    const nodesClean = n.filter(x => x.type !== 'organization')
    const edgesClean = e.filter(x => !String(x.source).startsWith('org-') && !String(x.target).startsWith('org-'))

    const validationError = validateGraphEdges(nodesClean, edgesClean)
    if (validationError) {
      toast.error('Схема не сохранена: ' + validationError)
      return
    }

    const empNodeIds = new Set(nodesClean.filter(x => x.type === 'employee').map(x => Number((x.data as { id?: number })?.id)))
    const hasIncomingParent = new Set<number>()
    for (const ed of edgesClean) {
      if ((ed.data as { relation?: string } | undefined)?.relation === 'plain') continue
      const src = nodesClean.find(x => x.id === ed.source)
      const tgt = nodesClean.find(x => x.id === ed.target)
      if (src?.type === 'employee' && tgt?.type === 'employee') {
        const tId = Number((tgt.data as { id?: number })?.id)
        if (!Number.isNaN(tId)) hasIncomingParent.add(tId)
      }
    }
    const managerById = new Map(orgMembers.map(m => [m.id, m.managerId ?? null]))
    const nameById = new Map(orgMembers.map(m => [m.id, personName(m.last_name, m.first_name, m.middle_name)]))
    const cleared: string[] = []
    for (const uid of empNodeIds) {
      if (Number.isNaN(uid) || hasIncomingParent.has(uid)) continue
      if (managerById.get(uid)) cleared.push(nameById.get(uid) || `#${uid}`)
    }

    if (cleared.length > 0) {
      setPendingSaveNames(cleared)
      return
    }

    performSave()
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
    () => nodes.map(n => (n.type === 'group' ? { ...n, zIndex: 0, className: 'hierarchy-group-node' } : { ...n, zIndex: n.zIndex ?? 1 })) as Node[],
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
            Перетащите блоки на холст, затем выберите отдел или работника. Соединяйте точками на краях.
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
              <div className="text-sm font-semibold">Работник</div>
              <div className="text-[10px] text-muted-foreground">Перетащите на холст</div>
            </div>
          </div>

          <div
            draggable
            onDragStart={e => { e.dataTransfer.setData('reactflow-type', 'position'); e.dataTransfer.effectAllowed = 'move' }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-border bg-muted/30 cursor-grab active:cursor-grabbing hover:bg-muted/60 hover:border-border transition-all select-none"
          >
            <div className="w-9 h-9 rounded-lg bg-muted border-2 border-dashed border-border flex items-center justify-center flex-shrink-0">
              <Briefcase className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-sm font-semibold">Должность</div>
              <div className="text-[10px] text-muted-foreground">Вакансия, перетащите на холст</div>
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

          {offCanvasDepts.length > 0 && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setOffCanvasOpen(o => !o)}
                className="flex w-full items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground"
              >
                <ChevronDown className={cn('h-3 w-3 transition-transform', !offCanvasOpen && '-rotate-90')} />
                Не на схеме ({offCanvasDepts.length})
              </button>
              {offCanvasOpen && (
                <div className="mt-1.5 space-y-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-full text-[11px]"
                    onClick={() => addDepartmentsToCanvas(offCanvasDepts)}
                  >
                    Добавить все
                  </Button>
                  <div className="max-h-[200px] space-y-1 overflow-y-auto">
                    {offCanvasDepts.slice(0, 10).map(d => (
                      <div key={d.id} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5">
                        <span className="flex-1 truncate text-xs">{d.name}</span>
                        <button
                          type="button"
                          title="Добавить на канвас"
                          onClick={() => addDepartmentsToCanvas([d])}
                          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {offCanvasDepts.length > 10 && (
                    <p className="pl-1 text-[10px] text-muted-foreground">…и ещё {offCanvasDepts.length - 10}</p>
                  )}
                </div>
              )}
            </div>
          )}

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
            proOptions={{ hideAttribution: true }}
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
            { title: 'Добавление элементов', text: 'Перетащите блок из панели слева на холст. Для отдела или работника откроется окно выбора. Описание и группа добавляются сразу.' },
            { title: 'Связи', text: 'Потяните от точки на краю блока к другому блоку. Клик по связи открывает все настройки, включая видимость и согласование отпусков.' },
            { title: 'Родительские связи', text: 'Отдел ↔ отдел задаёт структуру подразделений, работник ↔ отдел назначает куратора, работник ↔ работник — личного руководителя. С текстовыми блоками родительская связь недоступна.' },
            { title: 'Видимость отпусков', text: 'В настройках родительской связи: «Родитель видит отпуска подчинённых», «Отпуск родителя виден подчинённым» и «Родитель согласовывает отпуска подчинённых». Флаги применяются после сохранения. Дублирующий вход — ПКМ по связи.' },
            { title: 'Точки опоры', text: 'Наведите на связь — появятся точки добавления опоры. Клик по линии — настройки. Выделите связь: точки можно тянуть, двойной клик — удалить' },
            { title: 'Группы и описание', text: 'Пунктирные рамки объединяют элементы визуально, текстовые блоки служат для заметок. Группу тащат за полосу заголовка; клик по полосе выделяет группу — дальше её можно перемещать за любую точку и менять размер. Редактирование и удаление — через ПКМ.' },
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
      {pendingDrop?.type === 'position' && (
        <PositionInputModal
          departments={departments}
          onConfirm={handleSelectPosition}
          onClose={() => setPendingDrop(null)}
        />
      )}
      {convertingPositionId && (
        <SelectEmployeeModal
          departments={departments}
          members={orgMembers}
          onSelect={handleConvertToEmployee}
          onClose={() => setConvertingPositionId(null)}
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
          showDescription
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

      {pendingSaveNames && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-scale-in">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-semibold">Очистка руководителя</h2>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-muted-foreground">
                Будет очищен руководитель у {pendingSaveNames.length}&nbsp;работник(ов): {pendingSaveNames.join(', ')}. Продолжить?
              </p>
            </div>
            <div className="px-6 py-3 border-t border-border flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPendingSaveNames(null)}>Отмена</Button>
              <Button className="flex-1" onClick={() => { setPendingSaveNames(null); performSave() }}>Продолжить</Button>
            </div>
          </div>
        </div>
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
      {editingNode?.type === 'position' && (() => {
        const n = nodes.find(n => n.id === editingNode.id)
        const d = n?.data as { title?: string; departmentId?: number; description?: string } | undefined
        return (
          <PositionInputModal
            departments={departments}
            onConfirm={handleEditPosition}
            onClose={() => setEditingNode(null)}
            initialTitle={d?.title ?? ''}
            initialDepartmentId={d?.departmentId ?? null}
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
        const d = n?.data as { title?: string; description?: string } | undefined
        return (
          <TextInputModal
            onConfirm={handleEditGroup}
            onClose={() => setEditingNode(null)}
            initialText={d?.title ?? ''}
            showDescription
            initialDescription={d?.description ?? ''}
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
            sourceType={nodes.find(n => n.id === e.source)?.type}
            targetType={nodes.find(n => n.id === e.target)?.type}
            onConfirm={saveParentEdgeSettings}
            onClose={() => setParentEdgeId(null)}
          />
        )
      })()}

      {/* Context menu */}
      {contextMenu && contextMenu.nodeType === 'organization' && (
        <div
          className="fixed z-50 min-w-[180px] overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          {(() => {
            const node = nodes.find(n => n.id === contextMenu.nodeId)
            const orgId = node ? Number(String(node.id).replace('org-', '')) : 0
            return (
              <button
                onClick={() => {
                  setContextMenu(null)
                  if (!node || !orgId || !onViewOrg) return
                  if (dirty) {
                    runAfterLeaveGuarded(() => onViewOrg(orgId))
                    return
                  }
                  diveToNode(node, () => onViewOrg(orgId))
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
              >
                <Eye className="h-4 w-4 text-muted-foreground" />
                Просмотреть
              </button>
            )
          })()}
        </div>
      )}
      {contextMenu && contextMenu.nodeType !== 'organization' && (
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
          {contextMenu.nodeType === 'position' && (
            <>
              <button
                onClick={() => { setConvertingPositionId(contextMenu.nodeId); setContextMenu(null) }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
              >
                <UserPlus className="h-4 w-4 text-muted-foreground" />
                Назначить работника
              </button>
              <div className="h-px bg-border mx-2" />
            </>
          )}
          {contextMenu.nodeType === 'employee' && (
            <>
              <button
                onClick={() => convertEmployeeToPosition(contextMenu.nodeId)}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
              >
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                Заменить на должность
              </button>
              <div className="h-px bg-border mx-2" />
            </>
          )}
          <button
            onClick={() => startEdit(contextMenu.nodeId, contextMenu.nodeType as 'department' | 'employee' | 'text' | 'group' | 'position')}
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
export { ConfirmLeaveModal, ConfirmDeleteNodeModal }
export { ChildOrgNode, buildOrgOverlay, animateOrgReveal }
export type { Department, DeptEmployee }
export { SaveSnapshotContext, EDGE_STYLE, EDGE_MARKER, NODE_COLORS }
