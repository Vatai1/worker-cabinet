import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Boxes, History, Laptop, Layers, PackagePlus, Pencil, RotateCcw, Trash2, TrendingUp, Wrench } from 'lucide-react'
import { Badge } from '@/shared/components/ui/Badge'
import { Button } from '@/shared/components/ui/Button'
import { Card } from '@/shared/components/ui/Card'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { TableCard, TableSearch, TD, TH, TR } from '@/shared/components/ui/DataTable'
import { hasAnyRole } from '@/shared/lib/permissions'
import { apiDelete, apiGet, apiPost } from '@/shared/lib/apiClient'
import { refreshInventorySections } from '@/shared/store/inventorySectionsStore'
import { cn, formatCurrency, getErrorMessage } from '@/shared/lib/utils'
import { AssignModal } from '../components/AssignModal'
import { HistoryModal } from '../components/HistoryModal'
import { ItemModal } from '../components/ItemModal'
import { SectionModal } from '../components/SectionModal'
import {
  INVENTORY_CONDITION_LABELS,
  INVENTORY_STATUS_LABELS,
  INVENTORY_STATUS_VARIANTS,
  formatFieldValue,
  type InventoryItem,
  type InventorySection,
  type InventoryStats,
  type SectionField
} from '../types'

type TabId = 'catalog' | 'my' | 'sections'

const VALID_TABS: TabId[] = ['catalog', 'my', 'sections']

export function Inventory() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlTab = searchParams.get('tab') as TabId | null
  const urlSection = searchParams.get('section')
  const [tab, setTab] = useState<TabId>(
    urlTab && VALID_TABS.includes(urlTab) ? urlTab : 'catalog'
  )
  const [items, setItems] = useState<InventoryItem[]>([])
  const [sections, setSections] = useState<InventorySection[]>([])
  const [stats, setStats] = useState<InventoryStats | null>(null)
  const [search, setSearch] = useState('')
  const [sectionFilter, setSectionFilter] = useState(urlSection ?? '')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [itemModal, setItemModal] = useState<{ item: InventoryItem | null } | null>(null)
  const [assignModal, setAssignModal] = useState<InventoryItem | null>(null)
  const [historyModal, setHistoryModal] = useState<InventoryItem | null>(null)
  const [sectionModal, setSectionModal] = useState<{ section: InventorySection | null } | null>(null)
  const [actionBusyId, setActionBusyId] = useState<number | null>(null)

  const canManage = hasAnyRole('hr', 'admin')
  const canDelete = hasAnyRole('admin')
  const canViewStats = hasAnyRole('hr', 'admin', 'manager')

  const syncUrl = useCallback((next: { tab?: TabId; section?: string }) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      if (next.tab !== undefined) {
        params.delete('section')
        if (next.tab === 'catalog') params.delete('tab')
        else params.set('tab', next.tab)
      }
      if (next.section !== undefined) {
        params.delete('tab')
        if (next.section) params.set('section', next.section)
        else params.delete('section')
      }
      return params
    }, { replace: true })
  }, [setSearchParams])

  useEffect(() => {
    const requested = urlTab && VALID_TABS.includes(urlTab) ? urlTab : 'catalog'
    const nextTab = requested === 'sections' && !canManage ? 'catalog' : requested
    setTab((prev) => (prev === nextTab ? prev : nextTab))
    setSectionFilter((prev) => {
      const next = urlSection ?? ''
      return prev === next ? prev : next
    })
  }, [urlTab, urlSection, canManage])

  const changeTab = (next: TabId) => {
    setStatusFilter('')
    setSectionFilter('')
    syncUrl({ tab: next })
  }

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (tab === 'my') params.set('mine', '1')
      if (search.trim()) params.set('search', search.trim())
      if (sectionFilter && tab !== 'my') params.set('section_id', sectionFilter)
      if (statusFilter && tab !== 'my') params.set('status', statusFilter)
      const qs = params.toString()
      setItems(await apiGet<InventoryItem[]>(`/inventory/items${qs ? `?${qs}` : ''}`))
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [tab, search, sectionFilter, statusFilter])

  const fetchSections = useCallback(async () => {
    try {
      setSections(await apiGet<InventorySection[]>('/inventory/sections'))
    } catch {
      /* разделы не критичны для отображения списка */
    }
  }, [])

  const fetchStats = useCallback(async () => {
    if (!canViewStats) return
    try {
      setStats(await apiGet<InventoryStats>('/inventory/stats'))
    } catch {
      /* статистика не критична */
    }
  }, [canViewStats])

  useEffect(() => {
    const t = setTimeout(fetchItems, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [fetchItems, search])

  useEffect(() => {
    fetchSections()
    fetchStats()
  }, [fetchSections, fetchStats])

  const refreshAll = () => {
    fetchItems()
    fetchSections()
    fetchStats()
    refreshInventorySections()
  }

  const handleAction = async (item: InventoryItem, action: 'return' | 'repair' | 'in_stock' | 'written_off') => {
    setActionBusyId(item.id)
    setError(null)
    try {
      if (action === 'return') {
        await apiPost(`/inventory/items/${item.id}/return`, {})
      } else {
        await apiPost(`/inventory/items/${item.id}/status`, { status: action })
      }
      refreshAll()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setActionBusyId(null)
    }
  }

  const handleDeleteItem = async (item: InventoryItem) => {
    if (!window.confirm(`Удалить позицию «${item.name}» (${item.inventory_number})? История движений будет удалена.`)) return
    setActionBusyId(item.id)
    setError(null)
    try {
      await apiDelete(`/inventory/items/${item.id}`)
      refreshAll()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setActionBusyId(null)
    }
  }

  const handleDeleteSection = async (section: InventorySection) => {
    if (!window.confirm(`Удалить раздел «${section.name}»?`)) return
    try {
      await apiDelete(`/inventory/sections/${section.id}`)
      refreshAll()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    }
  }

  const statusCount = (status: string) => stats?.by_status.find((s) => s.status === status)?.count ?? 0

  const tabs: { id: TabId; label: string }[] = [
    { id: 'catalog', label: 'Каталог' },
    { id: 'my', label: 'Моё имущество' },
    ...(canManage ? [{ id: 'sections' as TabId, label: 'Разделы' }] : [])
  ]

  const filterSection = sections.find((s) => String(s.id) === sectionFilter) ?? null
  const catalogFields: SectionField[] = filterSection?.field_schema ?? []
  const visibleCatalogFields = catalogFields.slice(0, 4)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-[42px] w-[42px] items-center justify-center rounded-[12px] bg-primary/10 text-primary">
            <Boxes className="h-[22px] w-[22px]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Инвентаризация</h1>
            <p className="text-sm text-muted-foreground">Оборудование, мебель и материальные ценности</p>
          </div>
        </div>
        {canManage && (
          <Button onClick={() => setItemModal({ item: null })}>
            <PackagePlus className="mr-1.5 h-4 w-4" />
            Добавить позицию
          </Button>
        )}
      </div>

      {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {canViewStats && stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card><div className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-primary/10 text-primary"><Boxes className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Всего позиций</p><p className="text-xl font-semibold">{stats.total}</p></div>
          </div></Card>
          <Card><div className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><Laptop className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Выдано</p><p className="text-xl font-semibold">{statusCount('assigned')}</p></div>
          </div></Card>
          <Card><div className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400"><Wrench className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">В ремонте / списано</p><p className="text-xl font-semibold">{statusCount('repair') + statusCount('written_off')}</p></div>
          </div></Card>
          <Card><div className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400"><TrendingUp className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Стоимость на балансе</p><p className="text-xl font-semibold">{formatCurrency(stats.total_cost)}</p></div>
          </div></Card>
        </div>
      )}

      <div className="flex gap-1 rounded-[10px] border border-border bg-card p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => changeTab(t.id)}
            className={cn(
              'flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sections' ? (
        <TableCard icon={Layers} title="Разделы инвентаризации" subtitle="Конструктор: разделы с настраиваемыми полями характеристик">
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setSectionModal({ section: null })}>
              <Layers className="mr-1.5 h-4 w-4" />
              Новый раздел
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead><tr className="border-b border-border">
                <th className={TH}>Раздел</th>
                <th className={TH}>Описание</th>
                <th className={TH}>Поля</th>
                <th className={TH}>Позиций</th>
                <th className={TH + ' text-right'}>Действия</th>
              </tr></thead>
              <tbody>
                {sections.map((s) => (
                  <tr key={s.id} className={TR}>
                    <td className={TD + ' font-medium'}>{s.name}</td>
                    <td className={TD + ' max-w-[280px] truncate text-muted-foreground'}>{s.description ?? '—'}</td>
                    <td className={TD}>
                      {s.field_schema.length === 0 ? (
                        <span className="text-muted-foreground">нет</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {s.field_schema.map((f) => (
                            <Badge key={f.key} variant="secondary">{f.label}{f.required ? ' *' : ''}</Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className={TD}>{s.items_count}</td>
                    <td className={TD + ' text-right'}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setSectionModal({ section: s })} aria-label="Конструктор раздела">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => handleDeleteSection(s)} aria-label="Удалить">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableCard>
      ) : (
        <TableCard
          icon={tab === 'my' ? History : Boxes}
          title={tab === 'my' ? 'Выданное мне имущество' : 'Каталог имущества'}
          subtitle={tab === 'my'
            ? 'Позиции, закреплённые за вами'
            : filterSection
              ? `Раздел «${filterSection.name}» — с характеристиками`
              : 'Все позиции с фильтрами по разделу и статусу'}
        >
          <div className="flex flex-wrap items-center gap-2">
            <TableSearch value={search} onChange={setSearch} placeholder="Название, инвентарный или серийный номер, кабинет…" />
            {tab !== 'my' && (
              <>
                <SelectDropdown
                  className="w-[180px]"
                  value={sectionFilter}
                  onChange={(v) => { setSectionFilter(v); syncUrl({ section: v }) }}
                  options={[{ value: '', label: 'Все разделы' }, ...sections.map((s) => ({ value: String(s.id), label: s.name }))]}
                />
                <SelectDropdown
                  className="w-[150px]"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[{ value: '', label: 'Все статусы' }, ...Object.entries(INVENTORY_STATUS_LABELS).map(([value, label]) => ({ value, label }))]}
                />
              </>
            )}
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Загрузка…</p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {tab === 'my' ? 'Вам ничего не выдано' : 'Позиции не найдены'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead><tr className="border-b border-border">
                  <th className={TH}>Инв. номер</th>
                  <th className={TH}>Наименование</th>
                  <th className={TH}>Раздел</th>
                  {visibleCatalogFields.map((f) => (
                    <th key={f.key} className={TH}>{f.label}</th>
                  ))}
                  <th className={TH}>Статус</th>
                  <th className={TH}>Состояние</th>
                  <th className={TH}>Кабинет</th>
                  <th className={TH}>Получатель</th>
                  <th className={TH}>Стоимость</th>
                  <th className={TH + ' text-right'}>Действия</th>
                </tr></thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className={TR}>
                      <td className={TD + ' whitespace-nowrap font-mono text-xs'}>{item.inventory_number}</td>
                      <td className={TD}>
                        <div className="font-medium">{item.name}</div>
                        {item.serial_number && <div className="text-xs text-muted-foreground">S/N: {item.serial_number}</div>}
                      </td>
                      <td className={TD}>{item.section_name ?? <span className="text-muted-foreground">—</span>}</td>
                      {visibleCatalogFields.map((f) => (
                        <td key={f.key} className={TD + ' text-muted-foreground'}>
                          {formatFieldValue(f, item.field_values?.[f.key])}
                        </td>
                      ))}
                      <td className={TD}><Badge variant={INVENTORY_STATUS_VARIANTS[item.status]}>{INVENTORY_STATUS_LABELS[item.status]}</Badge></td>
                      <td className={TD + ' text-muted-foreground'}>{INVENTORY_CONDITION_LABELS[item.condition]}</td>
                      <td className={TD + ' text-muted-foreground'}>{item.location ?? '—'}</td>
                      <td className={TD}>{item.assigned_name ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className={TD + ' whitespace-nowrap'}>{item.cost != null ? formatCurrency(item.cost) : '—'}</td>
                      <td className={TD + ' text-right'}>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setHistoryModal(item)} aria-label="История">
                            <History className="h-4 w-4" />
                          </Button>
                          {canManage && (
                            <>
                              {item.status === 'in_stock' && (
                                <Button variant="ghost" size="icon" onClick={() => setAssignModal(item)} disabled={actionBusyId === item.id} aria-label="Выдать">
                                  <PackagePlus className="h-4 w-4" />
                                </Button>
                              )}
                              {item.status === 'assigned' && (
                                <Button variant="ghost" size="icon" onClick={() => handleAction(item, 'return')} disabled={actionBusyId === item.id} aria-label="Принять">
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              )}
                              {item.status === 'repair' && (
                                <Button variant="ghost" size="icon" onClick={() => handleAction(item, 'in_stock')} disabled={actionBusyId === item.id} aria-label="На склад">
                                  <Boxes className="h-4 w-4" />
                                </Button>
                              )}
                              {(item.status === 'in_stock' || item.status === 'repair') && (
                                <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => handleAction(item, 'written_off')} disabled={actionBusyId === item.id} aria-label="Списать">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                              {item.status === 'written_off' && canDelete && (
                                <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => handleDeleteItem(item)} disabled={actionBusyId === item.id} aria-label="Удалить из каталога">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" onClick={() => setItemModal({ item })} aria-label="Редактировать">
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TableCard>
      )}

      {itemModal && (
        <ItemModal
          item={itemModal.item}
          sections={sections}
          onClose={() => setItemModal(null)}
          onSaved={() => { setItemModal(null); refreshAll() }}
        />
      )}
      {assignModal && (
        <AssignModal
          item={assignModal}
          onClose={() => setAssignModal(null)}
          onAssigned={() => { setAssignModal(null); refreshAll() }}
        />
      )}
      {historyModal && <HistoryModal item={historyModal} onClose={() => setHistoryModal(null)} />}
      {sectionModal && (
        <SectionModal
          section={sectionModal.section}
          onClose={() => setSectionModal(null)}
          onSaved={() => { setSectionModal(null); refreshAll() }}
        />
      )}
    </div>
  )
}
