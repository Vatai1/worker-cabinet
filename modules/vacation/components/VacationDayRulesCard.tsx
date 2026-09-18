import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { CalendarRange, Briefcase, User, Plus, Trash2, Pencil, Check, X, Search, Loader2, HelpCircle } from 'lucide-react'
import { Card } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { MultiSelectDropdown } from '@/shared/components/ui/MultiSelectDropdown'
import { useModalOpen } from '@/shared/hooks/useModalOpen'
import { apiGet, apiPut, apiDelete } from '@/shared/lib/apiClient'
import { getErrorMessage, personName, cn } from '@/shared/lib/utils'

interface PositionRule {
  id: number
  position: string
  days: number
  groupId: string | null
}

interface UserRule {
  id: number
  userId: string
  userName: string
  position: string | null
  days: number
  groupId: string | null
}

interface DayRulesResponse {
  defaultDays: number
  positionRules: PositionRule[]
  userRules: UserRule[]
}

interface PositionRuleGroup {
  key: string
  groupId: string | null
  id: number
  positions: string[]
  days: number
}

interface UserRuleGroup {
  key: string
  groupId: string | null
  id: number
  users: { userId: string; userName: string; position: string | null }[]
  days: number
}

interface PickerUser {
  id: number
  first_name: string
  last_name: string
  middle_name?: string | null
  position: string | null
}

function DaysEditor({ value, onSave, onCancel }: { value: number; onSave: (days: number) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(String(value))
  return (
    <div className="flex items-center gap-1.5">
      <Input
        autoFocus
        type="number"
        min={0}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSave(Number(draft))}
        className="h-8 w-20 text-sm"
      />
      <Button size="sm" variant="outline" onClick={() => onSave(Number(draft))}><Check className="h-3.5 w-3.5" /></Button>
      <Button size="sm" variant="ghost" onClick={onCancel}><X className="h-3.5 w-3.5" /></Button>
    </div>
  )
}

function UserPickerModal({
  initialSelected,
  onConfirm,
  onClose,
}: {
  initialSelected: { id: number; name: string }[]
  onConfirm: (users: { id: number; name: string }[]) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<PickerUser[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Map<number, string>>(() => new Map(initialSelected.map((u) => [u.id, u.name])))

  useEffect(() => {
    apiGet<{ users?: PickerUser[] } | PickerUser[]>('/users?limit=1000')
      .then((data) => setUsers(Array.isArray(data) ? data : data.users || []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = users.filter((u) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return `${personName(u.last_name, u.first_name, u.middle_name)} ${u.position || ''}`.toLowerCase().includes(q)
  })

  const toggle = (u: PickerUser) => {
    const fullName = personName(u.last_name, u.first_name, u.middle_name)
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(u.id)) next.delete(u.id)
      else next.set(u.id, fullName)
      return next
    })
  }

  const selectAllFiltered = () => {
    setSelected((prev) => {
      const next = new Map(prev)
      filtered.forEach((u) => next.set(u.id, personName(u.last_name, u.first_name, u.middle_name)))
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col overflow-hidden border border-border" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground">Выбор работников</h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              placeholder="Поиск по имени, должности…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Выбрано: {selected.size}</span>
            <button type="button" onClick={selectAllFiltered} className="font-medium text-primary hover:underline">
              Выбрать всех в списке
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain p-2">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Никого не найдено</div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((u) => {
                const fullName = personName(u.last_name, u.first_name, u.middle_name)
                const checked = selected.has(u.id)
                return (
                  <label
                    key={u.id}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-colors text-left cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(u)}
                      className="h-3.5 w-3.5 shrink-0 rounded border-border accent-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                      {u.first_name?.[0]}{u.last_name?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{fullName}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.position || '—'}</p>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-border p-3 shrink-0">
          <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
          <Button
            className="flex-1"
            disabled={selected.size === 0}
            onClick={() => onConfirm(Array.from(selected, ([id, name]) => ({ id, name })))}
          >
            Выбрать{selected.size > 0 ? ` (${selected.size})` : ''}
          </Button>
        </div>
      </div>
    </div>
  )
}

function DayRulesInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useModalOpen(open)
  if (!open) return null

  const steps = [
    { title: 'Приоритет: сотрудник → должность → по умолчанию', text: 'если у работника есть личная настройка, используется она; иначе — настройка его должности; иначе — значение «по умолчанию»' },
    { title: 'Действует на текущий год сразу', text: 'при сохранении настройки баланс уже созданных на этот год работников пересчитывается автоматически, но не затрагивает тех, у кого есть более специфичная настройка' },
    { title: 'Новым работникам — сразу правильное число', text: 'при создании работника (онбординг, первый вход в раздел «Отпуск») баланс считается по этим же правилам' },
    { title: 'Удаление настройки не откатывает уже применённые дни', text: 'у тех, кому баланс уже пересчитан по этому правилу, дни останутся прежними — удаление влияет только на будущие пересчёты' },
  ]

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="fixed inset-0" onClick={onClose} />
      <Card className="relative flex w-full max-w-lg max-h-[85vh] flex-col overflow-hidden p-0 shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarRange className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold leading-tight">Как работают дни отпуска</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain p-5">
          <ol className="space-y-4">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  {i + 1}
                </span>
                <span>
                  <span className="font-medium">{step.title}</span>
                  <span className="text-muted-foreground"> — {step.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="border-t border-border p-4 shrink-0">
          <Button className="w-full" onClick={onClose}>Понятно</Button>
        </div>
      </Card>
    </div>,
    document.body
  )
}

export function VacationDayRulesCard() {
  const [data, setData] = useState<DayRulesResponse | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [positions, setPositions] = useState<string[]>([])

  const [editingDefault, setEditingDefault] = useState(false)
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null)

  const [newPositions, setNewPositions] = useState<string[]>([])
  const [newPositionDays, setNewPositionDays] = useState('28')
  const [savingPosition, setSavingPosition] = useState(false)

  const [showUserPicker, setShowUserPicker] = useState(false)
  const [pickedUsers, setPickedUsers] = useState<{ id: number; name: string }[]>([])
  const [newUserDays, setNewUserDays] = useState('28')
  const [savingUser, setSavingUser] = useState(false)

  const fetchData = () => {
    setLoading(true)
    apiGet<DayRulesResponse>('/vacation/day-rules')
      .then(setData)
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchData()
    apiGet<{ name: string }[]>('/dictionaries/positions').then((rows) => setPositions(rows.map((r) => r.name))).catch(() => setPositions([]))
  }, [])

  type RulePayload = { position?: string; userId?: number; positions?: string[]; userIds?: number[]; groupId?: string; days: number }

  const saveRuleRaw = async (payload: RulePayload) => {
    try {
      await apiPut('/vacation/day-rules', payload)
      return true
    } catch (err) {
      toast.error(getErrorMessage(err))
      return false
    }
  }

  const saveRule = async (payload: RulePayload) => {
    const ok = await saveRuleRaw(payload)
    if (ok) fetchData()
    return ok
  }

  const deleteRule = async (id: number) => {
    try {
      await apiDelete(`/vacation/day-rules/${id}`)
      toast.success('Настройка удалена')
      fetchData()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const deleteGroup = async (groupId: string) => {
    try {
      await apiDelete(`/vacation/day-rules/group/${groupId}`)
      toast.success('Настройка удалена')
      fetchData()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const deleteRuleGroup = (g: { groupId: string | null; id: number }) =>
    g.groupId ? deleteGroup(g.groupId) : deleteRule(g.id)

  const handleAddPosition = async () => {
    const days = Number(newPositionDays)
    if (newPositions.length === 0 || Number.isNaN(days) || days < 0) return
    setSavingPosition(true)
    const ok = await saveRuleRaw({ positions: newPositions, days })
    setSavingPosition(false)
    if (ok) fetchData()
    setNewPositions([])
    setNewPositionDays('28')
  }

  const handleAddUser = async () => {
    const days = Number(newUserDays)
    if (pickedUsers.length === 0 || Number.isNaN(days) || days < 0) return
    setSavingUser(true)
    const ok = await saveRuleRaw({ userIds: pickedUsers.map((u) => u.id), days })
    setSavingUser(false)
    if (ok) fetchData()
    setPickedUsers([])
    setNewUserDays('28')
  }

  const availablePositions = positions.filter((p) => !data?.positionRules.some((r) => r.position === p))

  const positionGroups = useMemo<PositionRuleGroup[]>(() => {
    if (!data) return []
    const map = new Map<string, PositionRuleGroup>()
    for (const r of data.positionRules) {
      const key = r.groupId ?? `row-${r.id}`
      const g = map.get(key)
      if (g) g.positions.push(r.position)
      else map.set(key, { key, groupId: r.groupId, id: r.id, positions: [r.position], days: r.days })
    }
    return Array.from(map.values())
  }, [data])

  const userGroups = useMemo<UserRuleGroup[]>(() => {
    if (!data) return []
    const map = new Map<string, UserRuleGroup>()
    for (const r of data.userRules) {
      const key = r.groupId ?? `row-${r.id}`
      const g = map.get(key)
      if (g) g.users.push({ userId: r.userId, userName: r.userName, position: r.position })
      else map.set(key, { key, groupId: r.groupId, id: r.id, users: [{ userId: r.userId, userName: r.userName, position: r.position }], days: r.days })
    }
    return Array.from(map.values())
  }, [data])

  if (loading && !data) {
    return (
      <Card>
        <div className="p-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </Card>
    )
  }

  if (!data) return null

  return (
    <Card>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-primary/10 text-primary">
              <CalendarRange className="h-[18px] w-[18px]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Дни отпуска</h2>
              <p className="text-xs text-muted-foreground">Сколько дней отпуска доступно по умолчанию, по должностям и по работникам</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            Как это работает
          </button>
        </div>

        {/* default */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-4">
          <div>
            <p className="text-sm font-medium">По умолчанию</p>
            <p className="text-xs text-muted-foreground mt-0.5">Для всех, у кого нет отдельной настройки по должности или лично</p>
          </div>
          {editingDefault ? (
            <DaysEditor
              value={data.defaultDays}
              onSave={async (days) => { if (await saveRule({ days })) setEditingDefault(false) }}
              onCancel={() => setEditingDefault(false)}
            />
          ) : (
            <button onClick={() => setEditingDefault(true)} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-muted transition-colors group">
              <span className="text-lg font-bold text-primary">{data.defaultDays}</span>
              <span className="text-xs text-muted-foreground">дн.</span>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>

        {/* positions */}
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold mb-2.5">
            <Briefcase className="h-4 w-4 text-muted-foreground" /> По должностям
          </p>
          <div className="space-y-1.5">
            {positionGroups.map((g) => (
              <div key={g.key} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5">
                <span className="text-sm font-medium truncate" title={g.positions.join(', ')}>{g.positions.join(', ')}</span>
                {editingGroupKey === g.key ? (
                  <DaysEditor
                    value={g.days}
                    onSave={async (days) => {
                      const payload: RulePayload = g.groupId ? { groupId: g.groupId, days } : { position: g.positions[0], days }
                      if (await saveRule(payload)) setEditingGroupKey(null)
                    }}
                    onCancel={() => setEditingGroupKey(null)}
                  />
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-sm font-semibold text-primary">{g.days} дн.</span>
                    <button onClick={() => setEditingGroupKey(g.key)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => deleteRuleGroup(g)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-3.5 py-2.5">
              <MultiSelectDropdown
                options={availablePositions.map((p) => ({ value: p, label: p }))}
                selected={newPositions}
                onChange={setNewPositions}
                placeholder="Выберите должности"
                countLabel="Выбрано"
                searchable
                searchPlaceholder="Поиск по должности…"
                className="min-w-[200px] max-w-none flex-1"
              />
              <Input type="number" min={0} value={newPositionDays} onChange={(e) => setNewPositionDays(e.target.value)} className="h-9 w-20 text-sm" />
              <Button size="sm" onClick={handleAddPosition} disabled={newPositions.length === 0 || savingPosition}>
                {savingPosition ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Добавить{newPositions.length > 0 ? ` (${newPositions.length})` : ''}
              </Button>
            </div>
          </div>
        </div>

        {/* users */}
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold mb-2.5">
            <User className="h-4 w-4 text-muted-foreground" /> По работникам
          </p>
          <div className="space-y-1.5">
            {userGroups.map((g) => {
              const names = g.users.map((u) => u.userName).join(', ')
              const positionsLabel = [...new Set(g.users.map((u) => u.position).filter(Boolean))].join(', ')
              return (
                <div key={g.key} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" title={names}>{names}</p>
                    {positionsLabel && <p className="text-xs text-muted-foreground truncate">{positionsLabel}</p>}
                  </div>
                  {editingGroupKey === g.key ? (
                    <DaysEditor
                      value={g.days}
                      onSave={async (days) => {
                        const payload: RulePayload = g.groupId ? { groupId: g.groupId, days } : { userId: Number(g.users[0].userId), days }
                        if (await saveRule(payload)) setEditingGroupKey(null)
                      }}
                      onCancel={() => setEditingGroupKey(null)}
                    />
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-sm font-semibold text-primary">{g.days} дн.</span>
                      <button onClick={() => setEditingGroupKey(g.key)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteRuleGroup(g)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-3.5 py-2.5">
              <button
                type="button"
                onClick={() => setShowUserPicker(true)}
                className={cn(
                  'flex h-9 min-w-[200px] flex-1 items-center truncate rounded-[10px] border border-border bg-card px-3 text-left text-[13px] transition-colors hover:bg-muted/40',
                  pickedUsers.length > 0 ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {pickedUsers.length === 0
                  ? 'Выберите работников'
                  : pickedUsers.length === 1
                    ? pickedUsers[0].name
                    : `Выбрано работников: ${pickedUsers.length}`}
              </button>
              <Input type="number" min={0} value={newUserDays} onChange={(e) => setNewUserDays(e.target.value)} className="h-9 w-20 text-sm" />
              <Button size="sm" onClick={handleAddUser} disabled={pickedUsers.length === 0 || savingUser}>
                {savingUser ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Добавить{pickedUsers.length > 0 ? ` (${pickedUsers.length})` : ''}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {showUserPicker && (
        <UserPickerModal
          initialSelected={pickedUsers}
          onConfirm={(users) => { setPickedUsers(users); setShowUserPicker(false) }}
          onClose={() => setShowUserPicker(false)}
        />
      )}

      <DayRulesInfoModal open={showInfo} onClose={() => setShowInfo(false)} />
    </Card>
  )
}
