import { useState, useEffect, useCallback, useRef } from 'react'
import { Building2, Wrench, Palmtree, Briefcase, FileText, Plus, Pencil, Trash2, X, Search, Users, FolderOpen, Sparkles, FileUp, Eye } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { Badge } from '@/shared/components/ui/Badge'
import { ConfirmModal } from '@/shared/components/ConfirmModal'
import { AddDictItemModal } from '@/core/admin/components/modals/AddDictItemModal'
import { OnlyOfficePreviewModal } from '@/shared/components/OnlyOfficePreviewModal'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { PLACEHOLDERS_BY_PURPOSE, getAllGroups } from '@/shared/lib/docPlaceholders'
import { getErrorMessage } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { useModulesStore } from '@/shared/store/modulesStore'

const TABS = [
  { value: 'departments', label: 'Отделы', icon: Building2, gradient: 'from-blue-500 to-indigo-600', singular: 'отдел' },
  { value: 'skills', label: 'Навыки', icon: Wrench, gradient: 'from-emerald-500 to-teal-600', singular: 'навык' },
  { value: 'vacation-types', label: 'Типы отпусков', icon: Palmtree, gradient: 'from-amber-500 to-orange-600', singular: 'тип отпуска' },
  { value: 'positions', label: 'Должности', icon: Briefcase, gradient: 'from-violet-500 to-purple-600', singular: 'должность' },
  { value: 'doc-templates', label: 'Шаблоны документов', icon: FileText, gradient: 'from-pink-500 to-rose-600', singular: 'шаблон' },
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
  const isModuleEnabled = useModulesStore((s) => s.isModuleEnabled)
  const filteredTabs = TABS.filter(t => t.value !== 'skills' || isModuleEnabled('skills'))
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
  const [hoveredId, setHoveredId] = useState<number | null>(null)

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
    if (!filteredTabs.some(t => t.value === tab)) {
      setTab(filteredTabs[0]?.value || 'departments')
    }
  }, [filteredTabs, tab])

  useEffect(() => {
    setEditItem(null)
    setSearch('')
    fetchItems()
  }, [fetchItems])

  useEffect(() => {
    if (!search.trim()) return
    let cancelled = false
    setAllDataLoading(true)
    Promise.all(
      filteredTabs.map(async (t) => {
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
    const grouped: { type: string; tabInfo: typeof TABS[number]; items: DictItem[] }[] = []
    for (const t of filteredTabs) {
      const typeItems = (allData[t.value] || []).filter(
        (item) => item.name.toLowerCase().includes(q) || (item.code && item.code.toLowerCase().includes(q))
      )
      if (typeItems.length > 0) {
        grouped.push({ type: t.value, tabInfo: t, items: typeItems })
      }
    }
    return grouped
  })()

  const totalSearchResults = searchResults.reduce((sum, g) => sum + g.items.length, 0)

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

  const activeTab = TABS.find((t) => t.value === tab)!

  const goToItem = (type: string) => {
    setSearch('')
    setTab(type)
  }

  const renderCard = (item: DictItem, currentTab: string) => {
    const tabConfig = TABS.find(t => t.value === currentTab)!
    const Icon = tabConfig.icon
    const initial = item.name.charAt(0).toUpperCase()

    const infoLines: React.ReactNode[] = []
    if (currentTab === 'departments') {
      if (item.manager_name) infoLines.push(<span key="mgr" className="text-xs text-muted-foreground">{item.manager_name}</span>)
      else infoLines.push(<span key="mgr" className="text-xs text-muted-foreground/50">Руководитель не назначен</span>)
      infoLines.push(
        <span key="cnt" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />{item.employee_count ?? 0}
        </span>
      )
    }
    if (currentTab === 'skills') {
      infoLines.push(
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />{item.user_count ?? 0} сотрудников
        </span>
      )
    }
    if (currentTab === 'vacation-types') {
      if (item.code) infoLines.push(<code key="code" className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{item.code}</code>)
      infoLines.push(<span key="cnt" className="text-xs text-muted-foreground">{item.request_count ?? 0} заявок</span>)
    }
    if (currentTab === 'positions') {
      infoLines.push(
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />{item.employee_count ?? 0} сотрудников
        </span>
      )
    }
    if (currentTab === 'doc-templates') {
      if (item.purpose) infoLines.push(<code key="purp" className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{item.purpose}</code>)
      else infoLines.push(<span key="purp" className="text-xs text-muted-foreground/50">Без назначения</span>)
      if (item.file_key) infoLines.push(
        <span key="file" className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <FileUp className="h-3 w-3" />Файл
        </span>
      )
    }

    return (
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {currentTab === 'doc-templates' ? (
          <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br ${tabConfig.gradient} flex items-center justify-center text-white`}>
            <Icon className="h-4 w-4" />
          </div>
        ) : (
          <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br ${tabConfig.gradient} flex items-center justify-center text-white font-bold text-sm`}>
            {initial}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{item.name}</p>
          {infoLines.length > 0 && (
            <div className="flex items-center gap-3 mt-0.5">{infoLines}</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="relative overflow-hidden rounded-2xl gradient-primary p-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />
        <div className="absolute top-1/2 right-1/4 w-24 h-24 bg-white/5 rounded-full" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="h-6 w-6 text-white/80" />
            <h1 className="text-2xl font-bold text-white">Справочники</h1>
          </div>
          <p className="text-sm text-white/60 mb-6">Управление справочниками системы</p>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <input
              ref={searchRef}
              className="w-full rounded-xl bg-white/10 border border-white/10 pl-10 pr-9 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
              placeholder="Поиск по всем справочникам..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => { setSearch(''); searchRef.current?.focus() }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {isSearchActive ? (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {allDataLoading ? 'Поиск...' : `Найдено ${totalSearchResults} ${totalSearchResults === 1 ? 'запись' : totalSearchResults < 5 ? 'записи' : 'записей'} по запросу «${search}»`}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setSearch('')}>Сбросить</Button>
          </div>

          {searchResults.length === 0 && !allDataLoading && (
            <div className="rounded-2xl border border-border/40 bg-card p-16 text-center">
              <Search className="h-12 w-12 mx-auto text-muted-foreground/30" />
              <p className="mt-4 text-muted-foreground">Ничего не найдено по запросу «{search}»</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Попробуйте другой запрос</p>
            </div>
          )}

          {searchResults.map((group) => {
            const GIcon = group.tabInfo.icon
            return (
              <div key={group.type} className="rounded-2xl border border-border/40 bg-card overflow-hidden">
                <button
                  onClick={() => goToItem(group.type)}
                  className="w-full flex items-center justify-between px-5 py-3.5 border-b border-border/30 bg-muted/20 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br ${group.tabInfo.gradient} text-white`}>
                      <GIcon className="h-4 w-4" />
                    </div>
                    <span className="font-semibold">{group.tabInfo.label}</span>
                    <Badge variant="secondary">{group.items.length}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">Перейти →</span>
                </button>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-0 md:gap-0">
                  {group.items.map((item) => (
                    <button
                      key={item.id ?? item.name}
                      onClick={() => goToItem(group.type)}
                      className="flex items-center gap-4 px-5 py-3 hover:bg-muted/30 transition-colors text-left border-b border-border/10 last:border-b-0 md:border-r md:border-r-border/10 md:last:border-r-0"
                    >
                      {renderCard(item, group.type)}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {filteredTabs.map((t) => {
              const TIcon = t.icon
              const isActive = tab === t.value
              return (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={`
                    flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium transition-all whitespace-nowrap
                    ${isActive
                      ? `bg-gradient-to-r ${t.gradient} text-white shadow-sm`
                      : 'bg-card border border-border/40 text-muted-foreground hover:text-foreground hover:border-border'
                    }
                  `}
                >
                  <TIcon className="h-4 w-4" />
                  {t.label}
                  {isActive && items.length > 0 && (
                    <span className={`ml-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold ${isActive ? 'bg-white/20' : 'bg-muted'}`}>
                      {items.length}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl bg-gradient-to-br ${activeTab.gradient} text-white`}>
                <activeTab.icon className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{activeTab.label}</h2>
                <p className="text-xs text-muted-foreground">
                  {loading ? 'Загрузка...' : `${filtered.length} ${filtered.length === 1 ? 'запись' : filtered.length < 5 ? 'записи' : 'записей'}`}
                </p>
              </div>
            </div>
            {canAdd && (
              <Button onClick={() => setIsAddModalOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Добавить {activeTab.singular}
              </Button>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-border/40 bg-card p-5 space-y-3">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-muted animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                      <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-border/40 bg-card p-16 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted mb-4">
                <FolderOpen className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <p className="text-lg font-medium text-muted-foreground">Список пуст</p>
              <p className="text-sm text-muted-foreground/60 mt-1">
                {canAdd ? `Нажмите «Добавить ${activeTab.singular}» чтобы создать` : 'Нет данных'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((item) => (
                <div
                  key={item.id ?? item.name}
                  className="group relative rounded-2xl border border-border/40 bg-card p-4 hover:border-border hover:shadow-sm transition-all"
                  onMouseEnter={() => item.id && setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {renderCard(item, tab)}

                  {(canEdit || canDelete) && hoveredId === item.id && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 animate-fade-in">
                      {tab === 'doc-templates' && item.file_key && (
                        <button
                          onClick={() => setOnlyOfficeItem(item)}
                          className="p-1.5 rounded-lg bg-card border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors shadow-sm"
                          title="Открыть в OnlyOffice"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => setEditItem(item)}
                          className="p-1.5 rounded-lg bg-card border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors shadow-sm"
                          title="Редактировать"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => setDeleteTarget(item)}
                          className="p-1.5 rounded-lg bg-card border border-border/60 text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors shadow-sm"
                          title="Удалить"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

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
          callbackUrl={`${import.meta.env.VITE_PUBLIC_API_URL || 'http://host.docker.internal:5000/api'}/dictionaries/doc-templates/${onlyOfficeItem.id}/callback`}
          onSave={async (downloadUrl, fileType) => {
            const res = await fetch(`${API_BASE_URL}/dictionaries/doc-templates/${onlyOfficeItem.id}/save-from-url`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
              body: JSON.stringify({ url: downloadUrl, fileType }),
            })
            if (!res.ok) throw new Error('Ошибка сохранения')
          }}
          placeholders={onlyOfficeItem.purpose ? (PLACEHOLDERS_BY_PURPOSE[onlyOfficeItem.purpose] ?? getAllGroups()) : getAllGroups()}
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
