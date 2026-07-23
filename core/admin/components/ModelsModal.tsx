import { useState, useEffect, useCallback } from 'react'
import { X, Download, Loader2, Package, HardDrive, Check } from 'lucide-react'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'

const API_URL = import.meta.env.VITE_API_URL || '/api'

interface OllamaModel {
  name: string
  size: number
  modified_at: string
  details?: { parameter_size: string; quantization_level: string; family: string }
}

interface ModelsModalState {
  open: boolean
  currentModel: string
  onSelect: ((model: string) => void) | null
}

let modalSetState: ((s: ModelsModalState) => void) | null = null

export function openModelsModal(currentModel: string, onSelect: (model: string) => void) {
  modalSetState?.({ open: true, currentModel, onSelect })
}

export function ModelsModal() {
  const [state, setState] = useState<ModelsModalState>({ open: false, currentModel: '', onSelect: null })
  const [models, setModels] = useState<OllamaModel[]>([])
  const [loading, setLoading] = useState(false)
  const [pulling, setPulling] = useState<string | null>(null)
  const [pullInput, setPullInput] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    modalSetState = setState
    return () => { modalSetState = null }
  }, [])

  const fetchModels = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API_URL}/admin/assistant/models`, {
        headers: getAuthHeaders(),
      })
      const data = await res.json()
      setModels(data.models || [])
    } catch { setError('Не удалось загрузить модели') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (state.open) fetchModels()
  }, [state.open, fetchModels])

  const handleClose = useCallback(() => {
    setState({ open: false, currentModel: '', onSelect: null })
  }, [])

  useEffect(() => {
    if (!state.open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [state.open, handleClose])

  const pullModel = async (model: string) => {
    setPulling(model); setError('')
    try {
      const res = await fetch(`${API_URL}/admin/assistant/models/pull`, {
        method: 'POST',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ model }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Ошибка загрузки'); return }
      await fetchModels()
    } catch { setError('Ошибка загрузки') }
    finally { setPulling(null); setPullInput('') }
  }

  const selectModel = (name: string) => {
    state.onSelect?.(name)
    handleClose()
  }

  const formatSize = (bytes: number) => {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
    return `${bytes} B`
  }

  if (!state.open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-card rounded-xl border border-border shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col animate-scale-in">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Модели Ollama</h3>
          </div>
          <button onClick={handleClose} className="rounded-lg p-1.5 hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {error && (
            <div className="flex items-center gap-2 p-2 rounded-lg text-sm bg-destructive/10 text-destructive">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : models.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Нет загруженных моделей
            </div>
          ) : (
            models.map((m) => {
              const isActive = m.name === state.currentModel
              return (
                <div
                  key={m.name}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    isActive ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                  }`}
                  onClick={() => selectModel(m.name)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{m.name}</p>
                      {isActive && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      {m.details?.parameter_size && <span>{m.details.parameter_size}</span>}
                      {m.details?.quantization_level && <span>{m.details.quantization_level}</span>}
                      <span className="flex items-center gap-0.5"><HardDrive className="h-3 w-3" />{formatSize(m.size)}</span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="p-4 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">Скачать модель:</p>
          <div className="flex gap-2">
            <input
              value={pullInput}
              onChange={(e) => setPullInput(e.target.value)}
              placeholder="mistral-nemo:12b"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              onKeyDown={(e) => e.key === 'Enter' && pullInput.trim() && pullModel(pullInput.trim())}
            />
            <button
              onClick={() => pullInput.trim() && pullModel(pullInput.trim())}
              disabled={!!pulling || !pullInput.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {pulling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {pulling ? 'Загрузка...' : 'Скачать'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
