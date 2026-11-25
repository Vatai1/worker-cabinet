export type FieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox'

export interface SectionField {
  key: string
  label: string
  type: FieldType
  required: boolean
  options: string[] | null
  unit: string | null
}

export interface InventorySection {
  id: number
  code: string
  name: string
  description: string | null
  icon: string | null
  sort_order: number
  field_schema: SectionField[]
  items_count: number
}

export interface InventoryItem {
  id: number
  name: string
  inventory_number: string
  section_id: number | null
  section_name: string | null
  section_schema?: SectionField[] | null
  serial_number: string | null
  status: 'in_stock' | 'assigned' | 'repair' | 'written_off'
  condition: 'new' | 'good' | 'worn' | 'broken'
  location: string | null
  purchase_date: string | null
  cost: number | null
  notes: string | null
  field_values: Record<string, unknown> | null
  assigned_to: number | null
  assigned_name: string | null
  created_at: string
}

export interface InventoryMovement {
  id: number
  item_id: number
  user_id: number | null
  user_name: string | null
  action: 'create' | 'assign' | 'return' | 'status'
  from_status: string | null
  to_status: string | null
  comment: string | null
  performed_by: number | null
  performer_name: string | null
  created_at: string
}

export interface InventoryStats {
  by_status: { status: string; count: number }[]
  by_section: { section: string; count: number }[]
  total: number
  total_cost: number
}

export const INVENTORY_STATUS_LABELS: Record<string, string> = {
  in_stock: 'На складе',
  assigned: 'Выдано',
  repair: 'В ремонте',
  written_off: 'Списано'
}

export const INVENTORY_STATUS_VARIANTS: Record<string, 'success' | 'default' | 'warning' | 'destructive'> = {
  in_stock: 'success',
  assigned: 'default',
  repair: 'warning',
  written_off: 'destructive'
}

export const INVENTORY_CONDITION_LABELS: Record<string, string> = {
  new: 'Новое',
  good: 'Исправное',
  worn: 'Изношенное',
  broken: 'Сломано'
}

export const INVENTORY_MOVEMENT_LABELS: Record<string, string> = {
  create: 'Создание',
  assign: 'Выдача',
  return: 'Возврат',
  status: 'Смена статуса'
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Текст',
  number: 'Число',
  date: 'Дата',
  select: 'Список',
  checkbox: 'Да/Нет'
}

export function formatFieldValue(field: SectionField, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (field.type === 'checkbox') return value ? 'Да' : 'Нет'
  if (field.type === 'number') return `${value}${field.unit ? ' ' + field.unit : ''}`
  return String(value)
}
