import { useEffect, useMemo, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { EntityModal } from '@/shared/components/ui/EntityModal'
import { Label } from '@/shared/components/ui/Label'
import { apiGet, apiPost } from '@/shared/lib/apiClient'
import { getErrorMessage } from '@/shared/lib/utils'
import type { InventoryItem } from '../types'

interface Props {
  item: InventoryItem
  onClose: () => void
  onAssigned: () => void
}

interface EmployeeOption {
  id: number
  first_name: string
  last_name: string
  middle_name?: string | null
  position?: string | null
}

export function AssignModal({ item, onClose, onAssigned }: Props) {
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiGet<EmployeeOption[]>('/users')
      .then(setEmployees)
      .catch((err: unknown) => setError(getErrorMessage(err)))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return employees
    return employees.filter((e) =>
      `${e.last_name} ${e.first_name} ${e.middle_name ?? ''} ${e.position ?? ''}`.toLowerCase().includes(q)
    )
  }, [employees, search])

  const handleSave = async () => {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      await apiPost(`/inventory/items/${item.id}/assign`, { user_id: selected, comment: comment.trim() || null })
      onAssigned()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <EntityModal
      icon={UserPlus}
      title="Выдача позиции"
      subtitle={`${item.name} · ${item.inventory_number}`}
      busy={busy}
      canSave={selected !== null && !busy}
      saveLabel="Выдать"
      onSave={handleSave}
      onClose={onClose}
    >
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <div className="space-y-1.5">
          <Label>Поиск работника</Label>
          <input
            className="h-9 w-full rounded-[10px] border border-border bg-card px-3 text-[13px] text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Фамилия, имя, должность…"
          />
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto scrollbar-thin">
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Ничего не найдено</p>
          )}
          {filtered.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setSelected(e.id)}
              className={`w-full rounded-[10px] border px-3 py-2 text-left text-[13px] transition-colors ${
                selected === e.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
              }`}
            >
              <span className="font-medium">{e.last_name} {e.first_name} {e.middle_name ?? ''}</span>
              {e.position && <span className="ml-2 text-muted-foreground">{e.position}</span>}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label>Комментарий к выдаче</Label>
          <textarea
            className="min-h-[60px] w-full rounded-[10px] border border-border bg-card px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Например: под отчёт, до конца проекта"
          />
        </div>
      </div>
    </EntityModal>
  )
}
