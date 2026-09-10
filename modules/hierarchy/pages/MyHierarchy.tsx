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
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Network, X } from 'lucide-react'
import { useUIStore } from '@/shared/store/uiStore'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'
import { getErrorMessage } from '@/shared/lib/utils'
import { nodeTypes, edgeTypes } from '@/modules/hierarchy/pages/HRHierarchy'

export function MyHierarchy() {
  const navigate = useNavigate()
  const darkMode = useUIStore((s) => s.darkMode)
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const close = useCallback(() => navigate('/dashboard'), [navigate])

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
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2 min-w-0">
          <Network className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-[15px] font-semibold">Иерархия организации</span>
        </div>
        <button
          type="button"
          onClick={close}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>
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
            fitView
            fitViewOptions={{ maxZoom: 1 }}
          >
            <Controls showInteractive={false} />
            <MiniMap nodeStrokeWidth={3} zoomable pannable />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--border))" />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}
