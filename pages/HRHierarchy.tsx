import { useState, useCallback, useEffect, useRef } from 'react'
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  MarkerType,
  type Connection,
  type NodeTypes,
  type NodeProps,
  type Node,
  type Edge,
  type ReactFlowInstance,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  ConnectionMode,
} from '@xyflow/react'
import { Building2, User, Trash2, Save, Network, Search, X, Pencil, ArrowLeftRight, AlignLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { API_BASE_URL } from '@/lib/api'
import { getAuthHeaders } from '@/lib/authHeaders'
import { getErrorMessage } from '@/lib/utils'
import { useUIStore } from '@/store/uiStore'

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

const HANDLES = (
  <>
    <Handle type="target" position={Position.Top} className="!opacity-0 group-hover:!opacity-100 !transition-opacity" style={{ width: 14, height: 14, background: '#6b7280', border: '2px solid white' }} />
    <Handle type="source" position={Position.Bottom} className="!opacity-0 group-hover:!opacity-100 !transition-opacity" style={{ width: 14, height: 14, background: '#6b7280', border: '2px solid white' }} />
    <Handle type="source" position={Position.Left} id="left" className="!opacity-0 group-hover:!opacity-100 !transition-opacity" style={{ width: 14, height: 14, background: '#6b7280', border: '2px solid white' }} />
    <Handle type="source" position={Position.Right} id="right" className="!opacity-0 group-hover:!opacity-100 !transition-opacity" style={{ width: 14, height: 14, background: '#6b7280', border: '2px solid white' }} />
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

const nodeTypes: NodeTypes = {
  department: DepartmentNode,
  employee: EmployeeNode,
  text: TextNode,
}

const STORAGE_KEY = 'hr-hierarchy-v1'
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
  const [error, setError] = useState<string | null>(null)
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [edgeContextMenu, setEdgeContextMenu] = useState<EdgeContextMenu | null>(null)
  const [editingNode, setEditingNode] = useState<{ id: string; type: 'department' | 'employee' | 'text' } | null>(null)

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const { nodes: n, edges: e } = JSON.parse(saved)
        if (n) setNodes(n)
        if (e) setEdges(e)
      } catch { /* ignore */ }
    }
  }, [setNodes, setEdges])

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/departments`, { headers: getAuthHeaders() })
        if (!res.ok) throw new Error('Не удалось загрузить отделы')
        const list: Department[] = await res.json()
        const withEmps = await Promise.all(
          list.map(async d => {
            const r = await fetch(`${API_BASE_URL}/departments/${d.id}`, { headers: getAuthHeaders() })
            if (!r.ok) return d
            const data = await r.json()
            return { ...d, employees: data.employees ?? [] }
          })
        )
        setDepartments(withEmps)
      } catch (err) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges(eds => addEdge({ ...params, type: 'smoothstep', style: EDGE_STYLE, markerEnd: EDGE_MARKER } as Edge, eds)),
    [setEdges]
  )

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
    setRfInstance(inst)
    rfInstanceRef.current = inst
  }, [])

  const handleSelectDepartment = (dept: Department, description: string) => {
    if (!pendingDrop) return
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
  }, [setEdges])

  const deleteEdge = useCallback((edgeId: string) => {
    setEdges(eds => eds.filter(e => e.id !== edgeId))
    setEdgeContextMenu(null)
  }, [setEdges])

  const deleteNode = useCallback((nodeId: string) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId))
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId))
    setContextMenu(null)
  }, [setNodes, setEdges])

  const setNodeColor = useCallback((nodeId: string, color: string) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, color } } : n))
    setContextMenu(null)
  }, [setNodes])

  const startEdit = useCallback((nodeId: string, nodeType: 'department' | 'employee' | 'text') => {
    setEditingNode({ id: nodeId, type: nodeType })
    setContextMenu(null)
  }, [])

  const handleEditDepartment = (dept: Department, description: string) => {
    if (!editingNode) return
    setNodes(nds => nds.map(n => n.id === editingNode.id ? {
      ...n,
      data: { id: dept.id, name: dept.name, employeeCount: dept.employee_count, managerName: dept.manager_name, description },
    } : n))
    setEditingNode(null)
  }

  const handleSelectText = (text: string) => {
    if (!pendingDrop) return
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
    setNodes(nds => nds.map(n => n.id === editingNode.id ? { ...n, data: { text } } : n))
    setEditingNode(null)
  }

  const handleEditEmployee = (emp: DeptEmployee, description: string) => {
    if (!editingNode) return
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

  const save = () => rfInstance && localStorage.setItem(STORAGE_KEY, JSON.stringify(rfInstance.toObject()))
  const clear = () => { setNodes([]); setEdges([]); localStorage.removeItem(STORAGE_KEY) }

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
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={save}>
            <Save className="h-4 w-4 mr-1.5" />
            Сохранить
          </Button>
          <Button size="sm" variant="outline" onClick={clear} title="Очистить холст">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
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
        <div className="flex-1 relative" style={{ minHeight: 0 }}>
          {nodes.length === 0 && (
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
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={handleInit}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeContextMenu={onEdgeContextMenu}
            nodeTypes={nodeTypes}
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
