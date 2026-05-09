import { useState, useCallback, useEffect, useRef, createContext, useContext } from 'react'
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
  getSmoothStepPath,
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
} from '@xyflow/react'
import { Building2, User, Trash2, Save, Network, Search, X, Pencil, ArrowLeftRight, AlignLeft, ExternalLink } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { DepartmentHierarchyOverlay } from '@/modules/hierarchy/components/DepartmentHierarchyOverlay'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { getErrorMessage } from '@/shared/lib/utils'
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

interface Department {
  id: number
  name: string
  manager_name: string | null
  employee_count: number
  employees?: DeptEmployee[]
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
      {d.managerName && (
        <div className="bg-card px-4 py-2 text-xs text-muted-foreground border-t border-border/50">
          {d.managerName}
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

type Waypoint = { x: number; y: number }

function extractSmoothStepCorners(path: string, sx: number, sy: number, tx: number, ty: number): Waypoint[] {
  const pts: Waypoint[] = []
  const re = /L\s+([-\d.]+)[,\s]+([-\d.]+)/g
  let m
  while ((m = re.exec(path)) !== null) {
    const x = parseFloat(m[1])
    const y = parseFloat(m[2])
    if (!(Math.abs(x - sx) < 1 && Math.abs(y - sy) < 1) &&
        !(Math.abs(x - tx) < 1 && Math.abs(y - ty) < 1)) {
      pts.push({ x, y })
    }
  }
  return pts
}

function EditableEdge({ id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, markerEnd, markerStart, style, data, selected }: EdgeProps) {
  const { setEdges, screenToFlowPosition } = useReactFlow()
  const saveSnapshot = useContext(SaveSnapshotContext)
  const waypoints: Waypoint[] = (data as { waypoints?: Waypoint[] })?.waypoints ?? []
  const hasWaypoints = waypoints.length > 0

  const [smoothPath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  const allPoints = [{ x: sourceX, y: sourceY }, ...waypoints, { x: targetX, y: targetY }]
  const polyPath = allPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ')

  const pathD = hasWaypoints ? polyPath : smoothPath

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
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up) }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  const removeWaypoint = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation()
    e.preventDefault()
    saveSnapshot()
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
    setEdges(eds => eds.map(ed => {
      if (ed.id !== id) return ed
      const wps = [...((ed.data as { waypoints?: Waypoint[] })?.waypoints ?? [])]
      if (wps.length === 0) {
        const corners = extractSmoothStepCorners(smoothPath, sourceX, sourceY, targetX, targetY)
        if (corners.length > 0) {
          return { ...ed, data: { ...ed.data, waypoints: corners } }
        }
      }
      wps.splice(segIdx, 0, { x, y })
      return { ...ed, data: { ...ed.data, waypoints: wps } }
    }))
  }

  return (
    <>
      <path d={pathD} fill="none" stroke="transparent" strokeWidth={20} />
      <BaseEdge path={pathD} markerEnd={markerEnd} markerStart={markerStart} style={style} />
      {selected && (
        <EdgeLabelRenderer>
          {hasWaypoints && waypoints.map((wp, i) => (
            <div
              key={`wp-${i}`}
              style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${wp.x}px, ${wp.y}px)`, pointerEvents: 'all' }}
              className="nodrag nopan"
              onMouseDown={e => dragWaypoint(e, i)}
              onDoubleClick={e => removeWaypoint(e, i)}
              title="Тащите • двойной клик — удалить"
            >
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'white', border: '2px solid #6b7280', cursor: 'move' }} />
            </div>
          ))}
          {hasWaypoints
            ? allPoints.slice(0, -1).map((p, i) => {
                const mx = (p.x + allPoints[i + 1].x) / 2
                const my = (p.y + allPoints[i + 1].y) / 2
                return (
                  <div
                    key={`mid-${i}`}
                    style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${mx}px, ${my}px)`, pointerEvents: 'all' }}
                    className="nodrag nopan"
                    onClick={e => addWaypoint(e, i, mx, my)}
                    title="Клик — добавить точку опоры"
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'white', border: '2px dashed #9ca3af', cursor: 'pointer', opacity: 0.7 }} />
                  </div>
                )
              })
            : (
              <div
                style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all' }}
                className="nodrag nopan"
                onClick={e => addWaypoint(e, 0, labelX, labelY)}
                title="Клик — добавить точку опоры"
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'white', border: '2px dashed #9ca3af', cursor: 'pointer', opacity: 0.7 }} />
              </div>
            )
          }
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const nodeTypes: NodeTypes = {
  department: DepartmentNode,
  employee: EmployeeNode,
  text: TextNode,
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
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in">
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
                <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
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
  onSelect,
  onClose,
  initialDescription = '',
  initialId,
}: {
  departments: Department[]
  onSelect: (emp: DeptEmployee, description: string) => void
  onClose: () => void
  initialDescription?: string
  initialId?: number
}) {
  const [search, setSearch] = useState('')
  const [deptId, setDeptId] = useState<number | null>(null)
  const [description, setDescription] = useState(initialDescription)

  const employees: DeptEmployee[] = departments.flatMap(d =>
    (d.employees ?? []).map(e => ({ ...e, departmentName: d.name, departmentId: d.id }))
  )
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
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in">
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
                <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center flex-shrink-0">
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
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in">
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

// ─── Main Page ────────────────────────────────────────────────────────────────

type PendingDrop = { type: 'department' | 'employee' | 'text'; position: { x: number; y: number } }
type ContextMenu = { nodeId: string; nodeType: 'department' | 'employee' | 'text'; x: number; y: number }
type EdgeContextMenu = { edgeId: string; x: number; y: number }

export function HRHierarchy() {
  const { darkMode } = useUIStore()
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [hierarchyLoading, setHierarchyLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedLabel, setSavedLabel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [edgeContextMenu, setEdgeContextMenu] = useState<EdgeContextMenu | null>(null)
  const [editingNode, setEditingNode] = useState<{ id: string; type: 'department' | 'employee' | 'text' } | null>(null)
  const [activeDepartment, setActiveDepartment] = useState<{ id: number; name: string } | null>(null)

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null)
  const pendingViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null)

  const historyRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([])
  const isRestoringRef = useRef(false)

  const saveSnapshot = useCallback(() => {
    if (isRestoringRef.current) return
    const inst = rfInstanceRef.current
    if (!inst) return
    historyRef.current = [...historyRef.current.slice(-49), { nodes: inst.getNodes(), edges: inst.getEdges() }]
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

  useEffect(() => {
    const loadHierarchy = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/hierarchy`, { headers: getAuthHeaders() })
        if (!res.ok) throw new Error('Не удалось загрузить иерархию')
        const { data } = await res.json()
        if (data.nodes) setNodes(data.nodes)
        if (data.edges) setEdges((data.edges as Edge[]).map((ed: Edge) => ({ ...ed, type: 'editable' })))
        if (data.viewport) {
          if (rfInstanceRef.current) {
            rfInstanceRef.current.setViewport(data.viewport)
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
  }, [setNodes, setEdges])

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/departments`, { headers: getAuthHeaders() })
        if (!res.ok) throw new Error('Не удалось загрузить отделы')
        const data: Department[] = await res.json()
        setDepartments(data)
      } catch (err) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const onConnect = useCallback((params: Connection) => {
    saveSnapshot()
    setEdges(eds => addEdge({ ...params, type: 'editable', style: EDGE_STYLE, markerEnd: EDGE_MARKER } as Edge, eds))
  }, [setEdges, saveSnapshot])

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
    const type = e.dataTransfer.getData('reactflow-type') as 'department' | 'employee'
    if (!type) return
    const inst = rfInstanceRef.current
    if (!inst) return
    const position = inst.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    setPendingDrop({ type, position })
  }, [])

  const handleInit = useCallback((inst: ReactFlowInstance) => {
    rfInstanceRef.current = inst
    if (pendingViewportRef.current) {
      inst.setViewport(pendingViewportRef.current)
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

  const onNodeContextMenu: NodeMouseHandler = useCallback((e, node) => {
    e.preventDefault()
    setEdgeContextMenu(null)
    setContextMenu({
      nodeId: node.id,
      nodeType: node.type as 'department' | 'employee',
      x: e.clientX,
      y: e.clientY,
    })
  }, [])

  const onEdgeContextMenu: EdgeMouseHandler = useCallback((e, edge) => {
    e.preventDefault()
    setContextMenu(null)
    setEdgeContextMenu({ edgeId: edge.id, x: e.clientX, y: e.clientY })
  }, [])

  const reverseEdge = useCallback((edgeId: string) => {
    saveSnapshot()
    setEdges(eds => eds.map(e => {
      if (e.id !== edgeId) return e
      const hasStart = !!e.markerStart
      return {
        ...e,
        markerEnd: hasStart ? EDGE_MARKER : undefined,
        markerStart: hasStart ? undefined : EDGE_MARKER,
      }
    }))
    setEdgeContextMenu(null)
  }, [setEdges, saveSnapshot])

  const deleteEdge = useCallback((edgeId: string) => {
    saveSnapshot()
    setEdges(eds => eds.filter(e => e.id !== edgeId))
    setEdgeContextMenu(null)
  }, [setEdges, saveSnapshot])

  const deleteNode = useCallback((nodeId: string) => {
    saveSnapshot()
    setNodes(nds => nds.filter(n => n.id !== nodeId))
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId))
    setContextMenu(null)
  }, [setNodes, setEdges, saveSnapshot])

  const setNodeColor = useCallback((nodeId: string, color: string) => {
    saveSnapshot()
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, color } } : n))
    setContextMenu(null)
  }, [setNodes, saveSnapshot])

  const startEdit = useCallback((nodeId: string, nodeType: 'department' | 'employee' | 'text') => {
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
    setNodes(nds => nds.map(n => n.id === editingNode.id ? { ...n, data: { text } } : n))
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
      const res = await fetch(`${API_BASE_URL}/hierarchy`, {
        method: 'PUT',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ nodes: n, edges: e, viewport }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Не удалось сохранить иерархию')
      }
      setSavedLabel(true)
      setTimeout(() => setSavedLabel(false), 2000)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="flex flex-col overflow-hidden rounded-2xl border border-border shadow-sm bg-card"
      style={{ height: 'calc(100vh - 140px)', minHeight: '500px' }}
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
          <Button size="sm" variant="outline" onClick={save} disabled={saving}>
            <Save className="h-4 w-4 mr-1.5" />
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="relative flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Left panel */}
        <div className="w-52 flex-shrink-0 border-r border-border p-4 space-y-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Элементы
          </p>

          {loading && <p className="text-sm text-muted-foreground">Загрузка...</p>}
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
        </div>

        {/* Canvas */}
        <SaveSnapshotContext.Provider value={saveSnapshot}>
        <div className="flex-1 relative" style={{ minHeight: 0 }}>
          {hierarchyLoading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="text-sm text-muted-foreground">Загрузка...</div>
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
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onNodeDragStart={onNodeDragStart}
            onInit={handleInit}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeContextMenu={onEdgeContextMenu}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onReconnect={onReconnect}
            onReconnectStart={onReconnectStart}
            onReconnectEnd={onReconnectEnd}
            connectionMode={ConnectionMode.Loose}
            colorMode={darkMode ? 'dark' : 'light'}
            deleteKeyCode="Delete"
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

      {/* Edge context menu */}
      {edgeContextMenu && (
        <div
          className="fixed z-50 min-w-[200px] overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-in"
          style={{ left: edgeContextMenu.x, top: edgeContextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => reverseEdge(edgeContextMenu.edgeId)}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
          >
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
            Поменять направление связи
          </button>
          <div className="h-px bg-border mx-2" />
          <button
            onClick={() => deleteEdge(edgeContextMenu.edgeId)}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Удалить связь
          </button>
        </div>
      )}

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
            onClick={() => deleteNode(contextMenu.nodeId)}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Удалить
          </button>
        </div>
      )}
    </div>
  )
}

export { DepartmentNode, EmployeeNode, TextNode, nodeTypes, EditableEdge, edgeTypes }
export { SelectDepartmentModal, SelectEmployeeModal, TextInputModal }
export type { Department, DeptEmployee }
export { SaveSnapshotContext, EDGE_STYLE, EDGE_MARKER, NODE_COLORS }
