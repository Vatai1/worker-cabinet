import { useEffect, useState } from 'react'
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
import { Network } from 'lucide-react'
import { useUIStore } from '@/shared/store/uiStore'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'
import { getErrorMessage } from '@/shared/lib/utils'
import { nodeTypes, edgeTypes } from '@/modules/hierarchy/pages/HRHierarchy'

export function MyHierarchy() {
  const darkMode = useUIStore((s) => s.darkMode)
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Иерархия организации</h1>
        <p className="text-sm text-muted-foreground">Структура подразделений вашей организации</p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div
        className="relative rounded-2xl border border-border bg-card overflow-hidden"
        style={{ height: 'calc(100vh - 140px)' }}
      >
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
