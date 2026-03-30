import { useState, useEffect, useCallback } from 'react'
import { Building2, Wrench, Palmtree, Briefcase, Plus, Pencil, Trash2, X, Check, Search, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { ConfirmModal } from '@/components/modals/ConfirmModal'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/lib/authHeaders'
import { getErrorMessage } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/api'

const TABS = [
  { value: 'departments', label: 'Отделы', icon: Building2, color: 'text-blue-500' },
  { value: 'skills', label: 'Навыки', icon: Wrench, color: 'text-violet-500' },
  { value: 'vacation-types', label: 'Типы отпусков', icon: Palmtree, color: 'text-emerald-500' },
  { value: 'positions', label: 'Должности', icon: Briefcase, color: 'text-amber-500' },
]

interface DictItem {
  id?: number
  name: string
  code?: string
  employee_count?: number
  user_count?: number
  request_count?: number
  manager_name?: string
  vacation_requests_blocked?: boolean
}

export function HRDictionaries() {
  const [tab, setTab] = useState('departments')
  const [items, setItems] = useState<DictItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [newCode, setNewCode] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DictItem | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/dictionaries/${tab}`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error((await res.json()).error || 'Ошибка загрузки')
      setItems(await res.json())
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    setNewName('')
    setNewCode('')
    setAddError('')
    setEditingId(null)
    setSearch('')
    fetchItems()
  }, [fetchItems])

  const handleAdd = async () => {
    setAddError(null)
    try {
      const body: Record<string, string> = { name: newName }
      if (tab === 'vacation-types') {
        body.code = newCode
        if (!newCode.trim()) {
          setAddError('Код обязателен')
          return
        }
      }
      if (!newName.trim()) {
        setAddError('Название обязательно')
        return
      }

      const res = await fetch(`${API_BASE_URL}/dictionaries/${tab}`, {
        method: 'POST',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Ошибка')
      setNewName('')
      setNewCode('')
      fetchItems()
    } catch (err: unknown) {
      setAddError(getErrorMessage(err))
    }
  }

  const handleEdit = (item: DictItem) => {
    setEditingId(item.id!)
    setEditName(item.name)
    setEditCode(item.code || '')
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    try {
      const body: Record<string, string> = { name: editName }
      if (tab === 'vacation-types') body.code = editCode

      const res = await fetch(`${API_BASE_URL}/dictionaries/${tab}/${editingId}`, {
        method: 'PUT',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Ошибка')
      setEditingId(null)
      fetchItems()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    }
  }

  const handleDelete = async (item: DictItem) => {
    try {
      const res = await fetch(`${API_BASE_URL}/dictionaries/${tab}/${item.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Ошибка')
      setDeleteTarget(null)
      fetchItems()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
      setDeleteTarget(null)
    }
  }

  const filtered = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    (item.code && item.code.toLowerCase().includes(search.toLowerCase()))
  )

  const canAdd = tab !== 'positions'
  const canEdit = tab !== 'positions'
  const canDelete = tab !== 'positions'

  const getColumns = () => {
    switch (tab) {
      case 'departments':
        return [
          { key: 'name', label: 'Название' },
          { key: 'manager_name', label: 'Руководитель' },
          { key: 'employee_count', label: 'Сотрудников' },
        ]
      case 'skills':
        return [
          { key: 'name', label: 'Название' },
          { key: 'user_count', label: 'Сотрудников' },
        ]
      case 'vacation-types':
        return [
          { key: 'code', label: 'Код' },
          { key: 'name', label: 'Название' },
          { key: 'request_count', label: 'Заявок' },
        ]
      case 'positions':
        return [
          { key: 'name', label: 'Должность' },
          { key: 'employee_count', label: 'Сотрудников' },
        ]
      default:
        return []
    }
  }

  const columns = getColumns()

  const renderCellValue = (item: DictItem, key: string) => {
    switch (key) {
      case 'name':
        return item.name || '—'
      case 'code':
        return item.code ? (
          <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{item.code}</code>
        ) : '—'
      case 'manager_name':
        return item.manager_name ? (
          <span className="text-muted-foreground">{item.manager_name}</span>
        ) : <span className="text-muted-foreground/50">Не назначен</span>
      case 'employee_count':
        return (
          <Badge variant="secondary" className="font-mono tabular-nums">
            <Users className="h-3 w-3 mr-1" />
            {item.employee_count ?? 0}
          </Badge>
        )
      case 'user_count':
        return (
          <Badge variant="secondary" className="font-mono tabular-nums">
            <Users className="h-3 w-3 mr-1" />
            {item.user_count ?? 0}
          </Badge>
        )
      case 'request_count':
        return (
          <Badge variant="secondary" className="font-mono tabular-nums">
            {item.request_count ?? 0}
          </Badge>
        )
      default:
        return '—'
    }
  }

  const activeTab = TABS.find((t) => t.value === tab)!

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Справочники</h1>
          <p className="text-muted-foreground mt-1">
            Управление справочниками системы · {items.length} записей
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-1 rounded-xl bg-muted/50 p-1">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                tab === t.value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
              }`}
            >
              <Icon className={`h-4 w-4 ${tab === t.value ? t.color : ''}`} />
              {t.label}
            </button>
          )
        })}
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {canAdd && (
        <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-muted-foreground mr-1">
              <Plus className="h-4 w-4 inline mr-1" />
              Добавить:
            </span>
            {tab === 'vacation-types' && (
              <Input
                placeholder="Код (например, sick_leave)"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                className="w-48"
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
            )}
            <Input
              placeholder="Название"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-64"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <Button onClick={handleAdd} size="sm">
              Добавить
            </Button>
            {addError && (
              <span className="text-sm text-destructive">{addError}</span>
            )}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border/60 bg-card shadow-lg shadow-black/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="text-left py-3.5 px-5 font-semibold text-muted-foreground w-10">#</th>
                {columns.map((col) => (
                  <th key={col.key} className="text-left py-3.5 px-5 font-semibold text-muted-foreground">
                    {col.label}
                  </th>
                ))}
                {(canEdit || canDelete) && (
                  <th className="text-right py-3.5 px-5 font-semibold text-muted-foreground w-24">
                    Действия
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {loading ? (
                <tr>
                  <td colSpan={columns.length + 2} className="text-center py-16 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      Загрузка...
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 2} className="text-center py-16 text-muted-foreground">
                    <div className="flex flex-col items-center gap-3">
                      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-muted">
                        <activeTab.icon className={`h-6 w-6 ${activeTab.color}`} />
                      </div>
                      <p>{search ? 'Ничего не найдено' : 'Список пуст'}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((item, idx) => (
                  <tr
                    key={item.id ?? item.name}
                    className="group transition-colors hover:bg-muted/30"
                  >
                    <td className="py-3.5 px-5 text-muted-foreground/50 font-mono text-xs">
                      {idx + 1}
                    </td>
                    {editingId === item.id ? (
                      <>
                        <td className="py-2.5 px-5" colSpan={columns.length}>
                          <div className="flex items-center gap-2 flex-wrap">
                            {tab === 'vacation-types' && (
                              <Input
                                value={editCode}
                                onChange={(e) => setEditCode(e.target.value)}
                                className="w-40"
                                placeholder="Код"
                              />
                            )}
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-56"
                              placeholder="Название"
                              onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                              autoFocus
                            />
                            <Button onClick={handleSaveEdit} size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:text-emerald-700">
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button onClick={() => setEditingId(null)} size="icon" variant="ghost" className="h-8 w-8">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                        <td className="py-2.5 px-5" />
                      </>
                    ) : (
                      <>
                        {columns.map((col) => (
                          <td key={col.key} className="py-3.5 px-5">
                            {renderCellValue(item, col.key)}
                          </td>
                        ))}
                        <td className="py-3.5 px-5">
                          <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {canEdit && (
                              <Button
                                onClick={() => handleEdit(item)}
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                onClick={() => setDeleteTarget(item)}
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="border-t border-border/30 bg-muted/20 px-5 py-3">
            <p className="text-xs text-muted-foreground">
              Всего: {filtered.length} {filtered.length === 1 ? 'запись' : filtered.length < 5 ? 'записи' : 'записей'}
              {search && items.length !== filtered.length && ` (из ${items.length})`}
            </p>
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmModal
          isOpen={true}
          title="Удаление"
          message={`Удалить «${deleteTarget.name}»? Это действие нельзя отменить.`}
          confirmText="Удалить"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
