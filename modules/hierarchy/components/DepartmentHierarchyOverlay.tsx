import { useState, useCallback, useEffect, useRef } from 'react'
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
  ConnectionMode,
  type Connection,
  type Node,
  type Edge,
  type ReactFlowInstance,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react'
import { ChevronLeft, Save, Building2, User, AlignLeft } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { getErrorMessage } from '@/shared/lib/utils'
import { useUIStore } from '@/shared/store/uiStore'
import {
  nodeTypes,
  edgeTypes,
  SelectDepartmentModal,
  SelectEmployeeModal,
  TextInputModal,
  SaveSnapshotContext,
  EDGE_STYLE,
  EDGE_MARKER,
  NODE_COLORS,
} from '@/modules/hierarchy/pages/HRHierarchy'
import type { Department, DeptEmployee } from '@/modules/hierarchy/pages/HRHierarchy'

type PendingDrop = { type: 'department' | 'employee' | 'text'; position: { x: number; y: number } }
type ContextMenu = { nodeId: string; nodeType: 'department' | 'employee' | 'text'; x: number; y: number }
type EdgeContextMenu = { edgeId: string; x: number; y: number }

interface Props {
  departmentId: number
  departmentName: string
  departments: Department[]
  onClose: () => void
}

export function DepartmentHierarchyOverlay({ departmentId, departmentName, departments, onClose }: Props) {
  const { darkMode } = useUIStore()
  const [hierarchyLoading, setHierarchyLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedLabel, setSavedLabel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [edgeContextMenu, setEdgeContextMenu] = useState<EdgeContextMenu | null>(null)
  const [editingNode, setEditingNode] = useState<{ id: string; type: 'department' | 'employee' | 'text' } | null>(null)

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

  const handleInit = useCallback((inst: ReactFlowInstance) => {
    rfInstanceRef.current = inst
    if (pendingViewportRef.current) {
      inst.setViewport(pendingViewportRef.current)
      pendingViewportRef.current = null
    }
  }, [])

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    if (!isRestoringRef.current && changes.some(c => c.type === 'remove')) saveSnapshot()
    onNodesChange(changes)
  }, [onNodesChange, saveSnapshot])

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    if (!isRestoringRef.current && changes.some(c => c.type === 'remove')) saveSnapshot()
    onEdgesChange(changes)
  }, [onEdgesChange, saveSnapshot])

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

  const onReconnectStart = useCallback(() => { edgeReconnectRef.current = false }, [])
  const onReconnectEnd = useCallback(() => { edgeReconnectRef.current = true }, [])

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

  const onNodeContextMenu: NodeMouseHandler = useCallback((e, node) => {
    e.preventDefault()
    setEdgeContextMenu(null)
    setContextMenu({
      nodeId: node.id,
      nodeType: node.type as 'department' | 'employee' | 'text',
      x: e.clientX,
      y: e.clientY,
    })
  }, [])

  const onEdgeContextMenu: EdgeMouseHandler = useCallback((e, edge) => {
    e.preventDefault()
    setContextMenu(null)
    setEdgeContextMenu({ edgeId: edge.id, x: e.clientX, y: e.clientY })
  }, [])

  useEffect(() => {
    if (!contextMenu && !edgeContextMenu) return
    const close = () => { setContextMenu(null); setEdgeContextMenu(null) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [contextMenu, edgeContextMenu])

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

  const handleEditDepartment = (dept: Department, description: string) => {
    if (!editingNode) return
    saveSnapshot()
    setNodes(nds => nds.map(n => n.id === editingNode.id ? {
      ...n,
      data: { id: dept.id, name: dept.name, employeeCount: dept.employee_count, managerName: dept.manager_name, description },
    } : n))
    setEditingNode(null)
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

  const handleEditEmployee = (emp: DeptEmployee, description: string) => {
    if (!editingNode) return
    saveSnapshot()
    setNodes(nds => nds.map(n => n.id === editingNode.id ? {
      ...n,
      data: { id: emp.id, firstName: emp.first_name, lastName: emp.last_name, position: emp.position, department: emp.departmentName, description },
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

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-card">
      {/* Header */}
      <div className="px-6 py-3 border-b border-border flex items-center gap-3 flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
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

      {/* Body */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Left panel */}
        <div className="w-52 flex-shrink-0 border-r border-border p-4 space-y-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Элементы
          </p>

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
                <Building2 className="h-16 w-16 mx-auto mb-3" />
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
            Поменять направление связи
          </button>
          <div className="h-px bg-border mx-2" />
          <button
            onClick={() => deleteEdge(edgeContextMenu.edgeId)}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            Удалить связь
          </button>
        </div>
      )}

      {/* Node context menu */}
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
            Изменить
          </button>
          <div className="h-px bg-border mx-2" />
          <button
            onClick={() => deleteNode(contextMenu.nodeId)}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            Удалить
          </button>
        </div>
      )}
    </div>
  )
}
