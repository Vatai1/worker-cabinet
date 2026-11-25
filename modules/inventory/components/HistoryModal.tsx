import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { EntityModal } from '@/shared/components/ui/EntityModal'
import { apiGet } from '@/shared/lib/apiClient'
import { getErrorMessage, formatDateTime } from '@/shared/lib/utils'
import {
  INVENTORY_MOVEMENT_LABELS,
  INVENTORY_STATUS_LABELS,
  type InventoryItem,
  type InventoryMovement
} from '../types'

interface Props {
  item: InventoryItem
  onClose: () => void
}

export function HistoryModal({ item, onClose }: Props) {
  const [movements, setMovements] = useState<InventoryMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    apiGet<InventoryMovement[]>(`/inventory/items/${item.id}/movements`)
      .then(setMovements)
      .catch((err: unknown) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [item.id])

  return (
    <EntityModal
      icon={History}
      title="История движений"
      subtitle={`${item.name} · ${item.inventory_number}`}
      busy={false}
      canSave={false}
      saveLabel="Закрыть"
      onSave={onClose}
      onClose={onClose}
    >
      <div className="space-y-3">
        {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {loading && <p className="py-6 text-center text-sm text-muted-foreground">Загрузка…</p>}
        {!loading && movements.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">Движений пока нет</p>
        )}
        {movements.map((m) => (
          <div key={m.id} className="rounded-[10px] border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium">{INVENTORY_MOVEMENT_LABELS[m.action] ?? m.action}</span>
              <span className="text-xs text-muted-foreground">{formatDateTime(m.created_at)}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {m.action === 'assign' && m.user_name && <span>→ {m.user_name}</span>}
              {m.action === 'return' && m.user_name && <span>← {m.user_name}</span>}
              {m.from_status && m.to_status && (
                <span>
                  {INVENTORY_STATUS_LABELS[m.from_status] ?? m.from_status} → {INVENTORY_STATUS_LABELS[m.to_status] ?? m.to_status}
                </span>
              )}
              {m.performer_name && <span>· {m.performer_name}</span>}
            </div>
            {m.comment && <p className="mt-1.5 text-xs text-foreground/80">{m.comment}</p>}
          </div>
        ))}
      </div>
    </EntityModal>
  )
}
