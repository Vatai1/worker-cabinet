import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, Plus, Search, ShieldAlert, Tag, Trash2, Users, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/Button'
import { Card } from '@/shared/components/ui/Card'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { confirmDialog } from '@/shared/components/ConfirmDialog'
import { useModulesStore } from '@/shared/store/modulesStore'
import { apiGet } from '@/shared/lib/apiClient'
import { cn, formatDate, getErrorMessage } from '@/shared/lib/utils'
import { vacationApi } from '@/modules/vacation/services/vacationApi'
import { RestrictionMemberPicker } from '@/modules/vacation/components/RestrictionMemberPicker'
import type { RestrictionScopeEmployee, VacationRestriction } from '@/shared/types'

interface Department {
  id: number
  name: string
}

interface TagOption {
  id: number
  name: string
}

interface CreateFormState {
  employeeIds: string[]
  maxConcurrent: number
  description: string
}

const EMPTY_FORM: CreateFormState = {
  employeeIds: [],
  maxConcurrent: 1,
  description: '',
}

const pluralWorkers = (n: number) => {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} работник`
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return `${n} работника`
  return `${n} работников`
}

const ruleKind = (rule: VacationRestriction): { label: string; className: string } => {
  const hasTags = (rule.tagIds?.length ?? 0) > 0
  const hasEmployees = rule.employeeIds.length > 0
  if (hasTags && hasEmployees) return { label: 'Комбинированное', className: 'bg-violet-500/15 text-violet-700 dark:text-violet-400' }
  if (hasTags) return { label: 'По тегам', className: 'bg-primary/10 text-primary' }
  return { label: 'По сотрудникам', className: 'bg-sky-500/15 text-sky-700 dark:text-sky-400' }
}

export function HRVacationRestrictions() {
  const isModuleEnabled = useModulesStore((s) => s.isModuleEnabled)
  const skillsEnabled = isModuleEnabled('skills')

  const [rules, setRules] = useState<VacationRestriction[]>([])
  const [loading, setLoading] = useState(true)
  const [departments, setDepartments] = useState<Department[]>([])
  const [tags, setTags] = useState<TagOption[]>([])
  const [employees, setEmployees] = useState<RestrictionScopeEmployee[]>([])
  const [employeesLoading, setEmployeesLoading] = useState(false)
  const [employeesLoaded, setEmployeesLoaded] = useState(false)

  const [departmentId, setDepartmentId] = useState('')
  const [tagId, setTagId] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingRestriction, setEditingRestriction] = useState<VacationRestriction | null>(null)
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    apiGet<Department[]>('/dictionaries/departments').then(setDepartments).catch(() => setDepartments([]))
  }, [])

  useEffect(() => {
    if (!skillsEnabled) {
      setTags([])
      return
    }
    apiGet<TagOption[]>('/users/skills/all').then(setTags).catch(() => setTags([]))
  }, [skillsEnabled])

  useEffect(() => {
    if (!showCreateModal || employeesLoaded) return
    setEmployeesLoading(true)
    vacationApi.getRestrictionScopeEmployees()
      .then((data) => {
        setEmployees(data)
        setEmployeesLoaded(true)
      })
      .catch((err: unknown) => {
        setEmployees([])
        toast.error(getErrorMessage(err))
      })
      .finally(() => setEmployeesLoading(false))
  }, [showCreateModal, employeesLoaded])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    vacationApi.getRestrictions({
      departmentId: departmentId || undefined,
      tagId: tagId || undefined,
      search: debouncedSearch || undefined,
    })
      .then((data) => { if (!cancelled) setRules(data) })
      .catch((err: unknown) => {
        if (!cancelled) {
          setRules([])
          toast.error(getErrorMessage(err))
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [departmentId, tagId, debouncedSearch])

  const hasFilters = departmentId !== '' || tagId !== '' || search.trim() !== ''

  const departmentOptions = useMemo(
    () => [
      { value: '', label: 'Все отделы' },
      ...departments.map((d) => ({ value: String(d.id), label: d.name })),
    ],
    [departments],
  )

  const tagOptions = useMemo(
    () => [
      { value: '', label: 'Все теги' },
      ...tags.map((t) => ({ value: String(t.id), label: t.name })),
    ],
    [tags],
  )

  const preservedTags = editingRestriction?.tags ?? []

  const resetFilters = () => {
    setDepartmentId('')
    setTagId('')
    setSearch('')
  }

  const openCreateModal = () => {
    setEditingRestriction(null)
    setForm({ ...EMPTY_FORM })
    setShowCreateModal(true)
  }

  const openEditModal = (rule: VacationRestriction) => {
    setEditingRestriction(rule)
    setForm({
      employeeIds: rule.employeeIds,
      maxConcurrent: rule.maxConcurrent ?? 1,
      description: rule.description ?? '',
    })
    setShowCreateModal(true)
  }

  const closeModal = () => {
    setShowCreateModal(false)
    setEditingRestriction(null)
  }

  useEffect(() => {
    if (!showCreateModal) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showCreateModal])

  const handleSubmit = async () => {
    if (form.employeeIds.length === 0 && preservedTags.length === 0) {
      toast.error('Выберите хотя бы одного работника')
      return
    }
    if (!Number.isInteger(form.maxConcurrent) || form.maxConcurrent < 0) {
      toast.error('Максимум одновременно должен быть целым числом не меньше 0')
      return
    }
    setCreating(true)
    try {
      const payload = {
        type: 'group' as const,
        employeeIds: form.employeeIds,
        tagIds: editingRestriction?.tagIds ?? [],
        maxConcurrent: form.maxConcurrent,
        description: form.description.trim() || undefined,
      }
      if (editingRestriction) {
        await vacationApi.updateRestriction(editingRestriction.id, editingRestriction.departmentId ?? '', payload)
        toast.success('Правило обновлено')
      } else {
        await vacationApi.createRestriction('', payload)
        toast.success('Правило создано')
      }
      closeModal()
      setForm({ ...EMPTY_FORM })
      const data = await vacationApi.getRestrictions({
        departmentId: departmentId || undefined,
        tagId: tagId || undefined,
        search: debouncedSearch || undefined,
      })
      setRules(data)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (rule: VacationRestriction) => {
    if (!(await confirmDialog({ title: 'Удалить правило', message: `Удалить правило «${rule.description || ruleKind(rule).label}»?`, confirmText: 'Удалить', variant: 'danger' }))) return
    try {
      await vacationApi.deleteRestriction(rule.id)
      toast.success('Правило удалено')
      const data = await vacationApi.getRestrictions({
        departmentId: departmentId || undefined,
        tagId: tagId || undefined,
        search: debouncedSearch || undefined,
      })
      setRules(data)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    }
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight">Пересечения отпусков</h2>
            <p className="text-xs text-muted-foreground">Кто не может быть в отпуске одновременно</p>
          </div>
        </div>
        <Button type="button" onClick={openCreateModal} className="gap-2">
          <Plus className="h-4 w-4" />
          Создать правило
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-5 py-3">
        <SelectDropdown
          options={departmentOptions}
          value={departmentId}
          onChange={setDepartmentId}
        />
        {skillsEnabled && tags.length > 0 && (
          <SelectDropdown
            options={tagOptions}
            value={tagId}
            onChange={setTagId}
          />
        )}
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию…"
            className="w-full rounded-[10px] border border-border bg-card py-2 pl-9 pr-3 text-[13px] text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
          />
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Сбросить
          </button>
        )}
      </div>

      <div className="p-5">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 py-10 text-center text-sm text-muted-foreground">
            Нет правил пересечения
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground/70">
                  <th className="px-3 py-2.5 font-medium">Название</th>
                  <th className="px-3 py-2.5 font-medium">Тип</th>
                  <th className="px-3 py-2.5 font-medium">Охват</th>
                  <th className="px-3 py-2.5 font-medium">Лимит</th>
                  <th className="px-3 py-2.5 font-medium">Отдел</th>
                  <th className="px-3 py-2.5 font-medium">Автор</th>
                  <th className="px-3 py-2.5 font-medium">Дата</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => {
                  const kind = ruleKind(rule)
                  return (
                    <tr key={rule.id} className="border-b border-border/60 align-top last:border-0">
                      <td className="max-w-[220px] px-3 py-3">
                        {rule.description ? (
                          <span className="block truncate font-medium text-foreground" title={rule.description}>
                            {rule.description}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">{kind.label}</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', kind.className)}>
                          {kind.label}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {rule.tags?.map((t) => (
                            <span
                              key={t.id}
                              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                            >
                              <Tag className="h-3 w-3" />
                              {t.name}
                            </span>
                          ))}
                          {(rule.employeeCount ?? rule.employeeIds.length) > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                              <Users className="h-3 w-3" />
                              {pluralWorkers(rule.employeeCount ?? rule.employeeIds.length)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                        {rule.maxConcurrent === 0
                          ? 'Строго не пересекаться'
                          : `≤ ${rule.maxConcurrent} одновременно`}
                      </td>
                      <td className="px-3 py-3">
                        {(rule.tagIds?.length ?? 0) > 0
                          ? 'Все отделы'
                          : rule.employeeDepartments?.join(', ') || rule.departmentName || '—'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">{rule.createdByName}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">{formatDate(rule.createdAt)}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEditModal(rule)}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title="Изменить"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(rule)}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          title="Удалить"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreateModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
          <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-scale-in">
            <div className="relative shrink-0 overflow-hidden border-b border-border px-5 py-4">
              <div className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-primary/10 blur-2xl" />
              <div className="relative flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl gradient-primary text-white shadow-md shadow-primary/25">
                  <ShieldAlert className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold leading-tight">
                    {editingRestriction ? 'Изменить правило пересечений' : 'Новое правило пересечений'}
                  </h3>
                  <p className="text-xs text-muted-foreground">Кто не сможет уйти в отпуск одновременно</p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto scrollbar-thin overscroll-contain p-5">
              <div className="space-y-2">
                <label className="block text-sm font-medium">Название (необязательно)</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Напр. для обеспечения непрерывной работы…"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>

              <RestrictionMemberPicker
                employees={employees}
                employeesLoading={employeesLoading}
                selected={form.employeeIds}
                onChange={(ids) => setForm((prev) => ({ ...prev, employeeIds: ids }))}
                skillsEnabled={skillsEnabled}
              />

              {preservedTags.length > 0 && (
                <div className="rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5">
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Правило также действует по тегам (сохранятся без изменений)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {preservedTags.map((t) => (
                      <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        <Tag className="h-3 w-3" />
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-medium">Максимум одновременно в отпуске</label>
                <input
                  type="number"
                  min="1"
                  max={Math.max(1, form.employeeIds.length)}
                  value={form.maxConcurrent}
                  onChange={(e) => setForm((prev) => ({ ...prev, maxConcurrent: parseInt(e.target.value) || 1 }))}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-muted/20 px-5 py-4">
              <Button type="button" variant="outline" onClick={closeModal} disabled={creating}>
                Отмена
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={creating} className="gap-2">
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingRestriction ? 'Сохранить' : 'Создать правило'}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

    </Card>
  )
}
