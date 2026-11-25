import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Layers, Plus, Trash2 } from 'lucide-react'
import { EntityModal } from '@/shared/components/ui/EntityModal'
import { Input } from '@/shared/components/ui/Input'
import { Label } from '@/shared/components/ui/Label'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { Switch } from '@/shared/components/ui/Switch'
import { apiPost, apiPut } from '@/shared/lib/apiClient'
import { getErrorMessage } from '@/shared/lib/utils'
import { FIELD_TYPE_LABELS, type FieldType, type InventorySection } from '../types'

interface Props {
  section: InventorySection | null
  onClose: () => void
  onSaved: () => void
}

interface DraftField {
  key: string
  label: string
  type: FieldType
  required: boolean
  options: string
  unit: string
}

const emptyField = (): DraftField => ({
  key: '',
  label: '',
  type: 'text',
  required: false,
  options: '',
  unit: ''
})

export function SectionModal({ section, onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sortOrder, setSortOrder] = useState('100')
  const [fields, setFields] = useState<DraftField[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (section) {
      setName(section.name)
      setDescription(section.description ?? '')
      setSortOrder(String(section.sort_order))
      setFields(section.field_schema.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.options?.join(', ') ?? '',
        unit: f.unit ?? ''
      })))
    }
  }, [section])

  const updateField = (index: number, patch: Partial<DraftField>) => {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  }

  const moveField = (index: number, delta: number) => {
    setFields((prev) => {
      const next = [...prev]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const canSave = name.trim().length > 0 && fields.every((f) => f.label.trim().length > 0) && !busy

  const handleSave = async () => {
    setBusy(true)
    setError(null)
    try {
      const payloadFields = fields.map((f) => ({
        key: f.key || undefined,
        label: f.label.trim(),
        type: f.type,
        required: f.required,
        options: f.type === 'select' && f.options.trim() ? f.options.split(',').map((o) => o.trim()).filter(Boolean) : undefined,
        unit: f.unit.trim() || undefined
      }))
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        sort_order: Number(sortOrder) || 100,
        fields: payloadFields
      }
      if (section) {
        await apiPut(`/inventory/sections/${section.id}`, body)
      } else {
        await apiPost('/inventory/sections', body)
      }
      onSaved()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <EntityModal
      icon={Layers}
      title={section ? 'Конструктор раздела' : 'Новый раздел'}
      subtitle={section ? section.code : 'Раздел и его настраиваемые поля'}
      busy={busy}
      canSave={canSave}
      onSave={handleSave}
      onClose={onClose}
    >
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

        <div className="space-y-1.5">
          <Label>Название раздела *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="АРМ, Мебель, Транспорт…" />
        </div>
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <div className="space-y-1.5">
            <Label>Описание</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Что входит в раздел" />
          </div>
          <div className="space-y-1.5">
            <Label>Сортировка</Label>
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Поля раздела</Label>
            <span className="text-xs text-muted-foreground">{fields.length} шт.</span>
          </div>

          {fields.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
              У раздела пока нет настраиваемых полей — добавьте характеристики (тип, ОС, материал…)
            </p>
          )}

          {fields.map((f, index) => (
            <div key={index} className="space-y-2 rounded-[10px] border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={f.label}
                  onChange={(e) => updateField(index, { label: e.target.value })}
                  placeholder="Название поля (например, Тип)"
                />
                <SelectDropdown
                  className="w-[120px] shrink-0"
                  value={f.type}
                  onChange={(v) => updateField(index, { type: v as FieldType })}
                  options={Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
                />
                <div className="flex shrink-0 gap-0.5">
                  <button type="button" onClick={() => moveField(index, -1)} disabled={index === 0} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="Выше">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => moveField(index, 1)} disabled={index === fields.length - 1} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="Ниже">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => setFields((prev) => prev.filter((_, i) => i !== index))} className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10" aria-label="Удалить поле">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {f.type === 'select' && (
                  <div className="min-w-[200px] flex-1 space-y-1">
                    <p className="text-xs text-muted-foreground">Варианты через запятую</p>
                    <Input value={f.options} onChange={(e) => updateField(index, { options: e.target.value })} placeholder="Системный блок, Ноутбук, Моноблок" />
                  </div>
                )}
                {(f.type === 'number' || f.type === 'text') && (
                  <div className="w-[140px] space-y-1">
                    <p className="text-xs text-muted-foreground">Единица (необяз.)</p>
                    <Input value={f.unit} onChange={(e) => updateField(index, { unit: e.target.value })} placeholder="ГГц, Вт…" />
                  </div>
                )}
                <label className="flex items-center gap-2 pt-4 text-[13px]">
                  <Switch checked={f.required} onCheckedChange={(v) => updateField(index, { required: v })} />
                  Обязательное
                </label>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setFields((prev) => [...prev, emptyField()])}
            className="flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-border p-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            Добавить поле
          </button>
        </div>
      </div>
    </EntityModal>
  )
}
