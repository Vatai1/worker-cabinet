import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { Building2, Wrench, Palmtree, Briefcase, FileText, Plus, Pencil, Trash2, X, Search, Users, MoreHorizontal, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { ConfirmModal } from '@/components/modals/ConfirmModal'
import { AddDictItemModal } from '@/components/modals/AddDictItemModal'
import { OnlyOfficePreviewModal } from '@/components/modals/OnlyOfficePreviewModal'
import { getAuthHeaders } from '@/lib/authHeaders'
import { PLACEHOLDERS_BY_PURPOSE, getAllPlaceholders } from '@/lib/docPlaceholders'
import { getErrorMessage } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/api'

const TABS = [
  { value: 'departments', label: 'Отделы', icon: Building2, color: 'text-blue-500', bgColor: 'bg-blue-50 dark:bg-blue-950/30' },
  { value: 'skills', label: 'Навыки', icon: Wrench, color: 'text-violet-500', bgColor: 'bg-violet-50 dark:bg-violet-950/30' },
  { value: 'vacation-types', label: 'Типы отпусков', icon: Palmtree, color: 'text-emerald-500', bgColor: 'bg-emerald-50 dark:bg-emerald-950/30' },
  { value: 'positions', label: 'Должности', icon: Briefcase, color: 'text-amber-500', bgColor: 'bg-amber-50 dark:bg-amber-950/30' },
  { value: 'doc-templates', label: 'Шаблоны документов', icon: FileText, color: 'text-rose-500', bgColor: 'bg-rose-50 dark:bg-rose-950/30' },
]

interface DictItem {
  id?: number
  name: string
  code?: string
  employee_count?: number
  user_count?: number
  request_count?: number
  manager_id?: number | null
  manager_name?: string
  vacation_requests_blocked?: boolean
  description?: string
  purpose?: string
  download_count?: number
  file_key?: string | null
  mime_type?: string | null
  size?: number | null
  created_at?: string
  _type?: string
}

type AllData = Record<string, DictItem[]>

export function HRDictionaries() {
  const [tab, setTab] = useState('departments')
  const [items, setItems] = useState<DictItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [allData, setAllData] = useState<AllData>({})
  const [allDataLoading, setAllDataLoading] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<DictItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DictItem | null>(null)
  const [onlyOfficeItem, setOnlyOfficeItem] = useState<DictItem | null>(null)
  const [contextMenuId, setContextMenuId] = useState<number | null>(null)
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  const openContextMenu = (item: DictItem, x: number, y: number) => {
    setContextMenuId(item.id!)
    setContextMenuPos({ x, y })
  }

  const closeContextMenu = () => {
    setContextMenuId(null)
    setContextMenuPos(null)
  }

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
    setEditItem(null)
    setSearch('')
    setContextMenuId(null)
    fetchItems()
  }, [fetchItems])

  useEffect(() => {
    if (contextMenuId === null) return
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        closeContextMenu()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [contextMenuId])

  useLayoutEffect(() => {
    if (!contextMenuPos || !contextMenuRef.current) return
    const menu = contextMenuRef.current
    const { width, height } = menu.getBoundingClientRect()
    let { x, y } = contextMenuPos
    if (x + width > window.innerWidth) x = window.innerWidth - width - 8
    if (y + height > window.innerHeight) y = window.innerHeight - height - 8
    if (x !== contextMenuPos.x || y !== contextMenuPos.y) setContextMenuPos({ x, y })
  }, [contextMenuPos])

  useEffect(() => {
    if (!search.trim()) return
    let cancelled = false
    setAllDataLoading(true)
    Promise.all(
      TABS.map(async (t) => {
        try {
          const res = await fetch(`${API_BASE_URL}/dictionaries/${t.value}`, { headers: getAuthHeaders() })
          if (!res.ok) return { type: t.value, items: [] }
          return { type: t.value, items: await res.json() }
        } catch {
          return { type: t.value, items: [] }
        }
      })
    ).then((results) => {
      if (cancelled) return
      const data: AllData = {}
      for (const r of results) data[r.type] = r.items
      setAllData(data)
      setAllDataLoading(false)
    })
    return () => { cancelled = true }
  }, [search])

  const isSearchActive = search.trim().length > 0

  const searchResults = (() => {
    if (!isSearchActive) return []
    const q = search.toLowerCase()
    const grouped: { type: string; tab: typeof TABS[number]; items: DictItem[] }[] = []
    for (const t of TABS) {
      const typeItems = (allData[t.value] || []).filter(
        (item) => item.name.toLowerCase().includes(q) || (item.code && item.code.toLowerCase().includes(q))
      )
      if (typeItems.length > 0) {
        grouped.push({ type: t.value, tab: t, items: typeItems })
      }
    }
    return grouped
  })()

  const totalSearchResults = searchResults.reduce((sum, g) => sum + g.items.length, 0)

  const handleEdit = (item: DictItem) => {
    setEditItem(item)
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
    (item.code && item.code.toLowerCase().includes(search.toLowerCase())) ||
    (item.purpose && item.purpose.toLowerCase().includes(search.toLowerCase()))
  )

  const canAdd = tab !== 'positions'
  const canEdit = tab !== 'positions'
  const canDelete = tab !== 'positions'

  const getColumns = (t: string) => {
    switch (t) {
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
      case 'doc-templates':
        return [
          { key: 'name', label: 'Название' },
          { key: 'purpose', label: 'Назначение' },
        ]
      default:
        return []
    }
  }

  const columns = getColumns(tab)

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
      case 'purpose':
        return item.purpose ? (
          <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{item.purpose}</code>
        ) : <span className="text-muted-foreground/50">—</span>
      case 'download_count':
        return (
          <Badge variant="secondary" className="font-mono tabular-nums">
            {item.download_count ?? 0}
          </Badge>
        )
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

  const goToItem = (type: string) => {
    setSearch('')
    setTab(type)
  }

  const highlightMatch = (text: string, query: string) => {
    if (!query) return text
    const idx = text.toLowerCase().indexOf(query.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-200 dark:bg-yellow-800/60 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
        {text.slice(idx + query.length)}
      </>
    )
  }

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
            ref={searchRef}
            className="pl-9"
            placeholder="Поиск по всем справочникам..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => { setSearch(''); searchRef.current?.focus() }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-muted text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {isSearchActive ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {allDataLoading ? 'Поиск...' : `Найдено ${totalSearchResults} ${totalSearchResults === 1 ? 'запись' : totalSearchResults < 5 ? 'записи' : 'записей'} по запросу «${search}»`}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setSearch('')}>
              Сбросить поиск
            </Button>
          </div>

          {searchResults.length === 0 && !allDataLoading && (
            <div className="rounded-2xl border border-border/60 bg-card p-16 text-center">
              <Search className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="mt-3 text-muted-foreground">Ничего не найдено по запросу «{search}»</p>
            </div>
          )}

          {searchResults.map((group) => {
            const Icon = group.tab.icon
            const groupCols = getColumns(group.type)
            return (
              <div key={group.type} className="rounded-2xl border border-border/60 bg-card shadow-lg shadow-black/5 overflow-hidden">
                <button
                  onClick={() => goToItem(group.type)}
                  className="w-full flex items-center justify-between px-5 py-3.5 border-b border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${group.tab.bgColor}`}>
                      <Icon className={`h-4 w-4 ${group.tab.color}`} />
                    </div>
                    <span className="font-semibold">{group.tab.label}</span>
                    <Badge variant="secondary">{group.items.length}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">Перейти →</span>
                </button>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/30 bg-muted/10">
                      {groupCols.map((col) => (
                        <th key={col.key} className="text-left py-2.5 px-5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {group.items.map((item) => (
                      <tr key={item.id ?? item.name} className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => goToItem(group.type)}>
                        {groupCols.map((col) => (
                          <td key={col.key} className="py-2.5 px-5">
                            {col.key === 'name' ? highlightMatch(item.name, search) :
                             col.key === 'code' ? (item.code ? <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{highlightMatch(item.code, search) as any}</code> : '—') :
                             renderCellValue(item, col.key)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      ) : (
        <>
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
            <Button onClick={() => setIsAddModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Добавить {activeTab.label.toLowerCase().replace('отделы', 'отдел').replace('навыки', 'навык').replace('типы отпусков', 'тип отпуска').replace('шаблоны документов', 'шаблон документа')}
            </Button>
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
                      <th className="w-12" />
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
                          <p>Список пуст</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item, idx) => (
                      <tr
                        key={item.id ?? item.name}
                        className="group transition-colors hover:bg-muted/30"
                        onContextMenu={(e) => {
                          if (!(canEdit || canDelete)) return
                          e.preventDefault()
                          openContextMenu(item, e.clientX, e.clientY)
                        }}
                      >
                        <td className="py-3.5 px-5 text-muted-foreground/50 font-mono text-xs">
                          {idx + 1}
                        </td>
                          <>
                            {columns.map((col) => (
                              <td key={col.key} className="py-3.5 px-5">
                                {renderCellValue(item, col.key)}
                              </td>
                            ))}
                            <td className="py-3.5 px-5">
                              {(canEdit || canDelete) && (
                                <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                                      openContextMenu(item, rect.right, rect.bottom + 4)
                                    }}
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </td>
                          </>
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
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {contextMenuId !== null && contextMenuPos && (() => {
        const item = filtered.find((i) => i.id === contextMenuId)
        if (!item) return null
        return (
          <div
            ref={contextMenuRef}
            className="fixed z-50 min-w-[160px] rounded-lg border border-border/60 bg-card shadow-lg shadow-black/10 py-1"
            style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
          >
            {tab === 'doc-templates' && item.file_key && (
              <button
                onClick={() => { closeContextMenu(); setOnlyOfficeItem(item) }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                Открыть в OnlyOffice
              </button>
            )}
            {(tab === 'doc-templates' && item.file_key) && (canEdit || canDelete) && (
              <div className="my-1 border-t border-border/30" />
            )}
            {canEdit && (
              <button
                onClick={() => { closeContextMenu(); handleEdit(item) }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                Редактировать
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => { closeContextMenu(); setDeleteTarget(item) }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Удалить
              </button>
            )}
          </div>
        )
      })()}

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

      {onlyOfficeItem && (
        <OnlyOfficePreviewModal
          open={true}
          onClose={() => setOnlyOfficeItem(null)}
          document={{
            id: onlyOfficeItem.id!,
            name: onlyOfficeItem.name,
            mimeType: onlyOfficeItem.mime_type || 'application/octet-stream',
            size: onlyOfficeItem.size ?? undefined,
            url: async () => {
              const res = await fetch(`${API_BASE_URL}/dictionaries/doc-templates/${onlyOfficeItem.id}/preview-token`, { headers: getAuthHeaders() })
              if (!res.ok) throw new Error('Не удалось получить токен')
              const data = await res.json()
              return data.publicUrl
            },
          }}
          editable={true}
          placeholders={onlyOfficeItem.purpose ? (PLACEHOLDERS_BY_PURPOSE[onlyOfficeItem.purpose] ?? getAllPlaceholders()) : getAllPlaceholders()}
        />
      )}

      {(isAddModalOpen || editItem) && canAdd && (
        <AddDictItemModal
          open={true}
          onClose={() => { setIsAddModalOpen(false); setEditItem(null) }}
          onAdded={() => { setIsAddModalOpen(false); setEditItem(null); fetchItems() }}
          tab={tab as 'departments' | 'skills' | 'vacation-types' | 'doc-templates'}
          editItem={editItem}
        />
      )}
    </div>
  )
}
