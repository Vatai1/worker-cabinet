import { useEffect, useState } from 'react'
import { Boxes } from 'lucide-react'
import { EntityModal } from '@/shared/components/ui/EntityModal'
import { Input } from '@/shared/components/ui/Input'
import { Label } from '@/shared/components/ui/Label'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { Switch } from '@/shared/components/ui/Switch'
import { apiPost, apiPut } from '@/shared/lib/apiClient'
import { getErrorMessage } from '@/shared/lib/utils'
import {
  INVENTORY_CONDITION_LABELS,
  type InventoryItem,
  type InventorySection,
  type SectionField
} from '../types'

interface Props {
  item: InventoryItem | null
  sections: InventorySection[]
  onClose: () => void
  onSaved: () => void
}

export function ItemModal({ item, sections, onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [inventoryNumber, setInventoryNumber] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [condition, setCondition] = useState('good')
  const [location, setLocation] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [cost, setCost] = useState('')
  const [notes, setNotes] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (item) {
      setName(item.name)
      setInventoryNumber(item.inventory_number)
      setSectionId(item.section_id ? String(item.section_id) : '')
      setSerialNumber(item.serial_number ?? '')
      setCondition(item.condition)
      setLocation(item.location ?? '')
      setPurchaseDate(item.purchase_date ?? '')
      setCost(item.cost != null ? String(item.cost) : '')
      setNotes(item.notes ?? '')
      setFieldValues(item.field_values ?? {})
    }
  }, [item])

  const selectedSection = sections.find((s) => String(s.id) === sectionId) ?? null
  const sectionFields: SectionField[] = selectedSection?.field_schema ?? []

  const setFieldValue = (key: string, value: unknown) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }))
  }

  const fieldMissing = (f: SectionField) =>
    f.required && (fieldValues[f.key] === undefined || fieldValues[f.key] === null || fieldValues[f.key] === '')

  const canSave = name.trim().length > 0
    && inventoryNumber.trim().length > 0
    && !sectionFields.some(fieldMissing)
    && !busy

  const handleSave = async () => {
    setBusy(true)
    setError(null)
    try {
      const body = {
        name: name.trim(),
        inventory_number: inventoryNumber.trim(),
        section_id: sectionId ? Number(sectionId) : null,
        serial_number: serialNumber.trim() || null,
        condition,
        location: location.trim() || null,
        purchase_date: purchaseDate || null,
        cost: cost.trim() === '' ? null : Number(cost),
        notes: notes.trim() || null,
        field_values: fieldValues
      }
      if (item) {
        await apiPut(`/inventory/items/${item.id}`, body)
      } else {
        await apiPost('/inventory/items', body)
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
      icon={Boxes}
      title={item ? 'Редактирование позиции' : 'Новая позиция'}
      subtitle={item ? item.inventory_number : 'Оборудование, мебель и другие ценности'}
      busy={busy}
      canSave={canSave}
      onSave={handleSave}
      onClose={onClose}
    >
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <div className="space-y-1.5">
          <Label>Наименование *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ноутбук Lenovo ThinkPad" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Инвентарный номер *</Label>
            <Input value={inventoryNumber} onChange={(e) => setInventoryNumber(e.target.value)} placeholder="INV-000123" />
          </div>
          <div className="space-y-1.5">
            <Label>Серийный номер</Label>
            <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="SN-ABC123" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Раздел</Label>
            <SelectDropdown
              value={sectionId}
              onChange={setSectionId}
              options={[{ value: '', label: 'Без раздела' }, ...sections.map((s) => ({ value: String(s.id), label: s.name }))]}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Состояние</Label>
            <SelectDropdown
              value={condition}
              onChange={setCondition}
              options={Object.entries(INVENTORY_CONDITION_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </div>
        </div>

        {sectionFields.length > 0 && (
          <div className="space-y-3 rounded-[10px] border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Характеристики: {selectedSection?.name}
            </p>
            {sectionFields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label>
                  {f.label}{f.required ? ' *' : ''}
                  {f.unit && <span className="ml-1 text-xs text-muted-foreground">({f.unit})</span>}
                </Label>
                {f.type === 'select' ? (
                  <SelectDropdown
                    value={String(fieldValues[f.key] ?? '')}
                    onChange={(v) => setFieldValue(f.key, v)}
                    options={[{ value: '', label: '—' }, ...(f.options ?? []).map((o) => ({ value: o, label: o }))]}
                  />
                ) : f.type === 'checkbox' ? (
                  <label className="flex items-center gap-2 pt-1 text-[13px]">
                    <Switch
                      checked={Boolean(fieldValues[f.key])}
                      onCheckedChange={(v) => setFieldValue(f.key, v)}
                    />
                    {fieldValues[f.key] ? 'Да' : 'Нет'}
                  </label>
                ) : (
                  <Input
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                    value={String(fieldValues[f.key] ?? '')}
                    onChange={(e) => setFieldValue(f.key, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Кабинет / помещение</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Каб. 305" />
          </div>
          <div className="space-y-1.5">
            <Label>Дата покупки</Label>
            <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Стоимость, руб.</Label>
          <Input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="45000" />
        </div>
        <div className="space-y-1.5">
          <Label>Примечание</Label>
          <textarea
            className="min-h-[70px] w-full rounded-[10px] border border-border bg-card px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
    </EntityModal>
  )
}
