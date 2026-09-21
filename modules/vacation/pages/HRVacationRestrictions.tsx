import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Search, ShieldAlert, Tag, Trash2, Users, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/Button'
import { Card } from '@/shared/components/ui/Card'
import { MultiSelectDropdown } from '@/shared/components/ui/MultiSelectDropdown'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { ConfirmModal } from '@/shared/components/ConfirmModal'
import { useModulesStore } from '@/shared/store/modulesStore'
import { apiGet } from '@/shared/lib/apiClient'
import { cn, formatDate, getErrorMessage, personName } from '@/shared/lib/utils'
import { vacationApi } from '@/modules/vacation/services/vacationApi'
import type { VacationRestriction } from '@/shared/types'

interface Department {
  id: number
  name: string
}

interface TagOption {
  id: number
  name: string
}

interface EmployeeRow {
  id: number
  first_name: string
  last_name: string
  middle_name?: string | null
  position?: string | null
  department_id?: number | null
}

interface CreateFormState {
  departmentId: string
  useTags: boolean
  tagIds: string[]
  useEmployees: boolean
  employeeIds: string[]
  maxConcurrent: number
  description: string
}

const EMPTY_FORM: CreateFormState = {
  departmentId: '',
  useTags: false,
  tagIds: [],
  useEmployees: false,
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
  const [employees, setEmployees] = useState<EmployeeRow[]>([])

  const [departmentId, setDepartmentId] = useState('')
  const [tagId, setTagId] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<VacationRestriction | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

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
    if (!showCreateModal || employees.length > 0) return
    apiGet<EmployeeRow[]>('/users').then(setEmployees).catch(() => setEmployees([]))
  }, [showCreateModal, employees.length])

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

  const formDepartmentId = form.departmentId
  const deptEmployees = useMemo(() => {
    if (!formDepartmentId) return []
    return employees
      .filter((e) => e.department_id === Number(formDepartmentId))
      .sort((a, b) => personName(a.last_name, a.first_name, a.middle_name).localeCompare(personName(b.last_name, b.first_name, b.middle_name), 'ru'))
  }, [employees, formDepartmentId])

  const employeeOptions = useMemo(
    () => deptEmployees.map((e) => ({
      value: String(e.id),
      label: personName(e.last_name, e.first_name, e.middle_name),
    })),
    [deptEmployees],
  )

  const selectedCount = form.employeeIds.length + form.tagIds.length
  const isPairRule = selectedCount === 2

  const resetFilters = () => {
    setDepartmentId('')
    setTagId('')
    setSearch('')
  }

  const openCreateModal = () => {
    setForm({ ...EMPTY_FORM })
    setShowCreateModal(true)
  }

  const handleCreate = async () => {
    if (!form.departmentId) {
      toast.error('Выберите отдел')
      return
    }
    if (selectedCount === 0) {
      toast.error('Выберите хотя бы одного работника или тег')
      return
    }
    if (selectedCount === 1) {
      toast.error('Для правила нужно минимум два участника (работника и/или тега)')
      return
    }
    if (!isPairRule && (!Number.isInteger(form.maxConcurrent) || form.maxConcurrent < 0)) {
      toast.error('Максимум одновременно должен быть целым числом не меньше 0')
      return
    }
    setCreating(true)
    try {
      await vacationApi.createRestriction(form.departmentId, {
        type: isPairRule ? 'pair' : 'group',
        employeeIds: form.employeeIds,
        tagIds: form.tagIds,
        maxConcurrent: isPairRule ? undefined : form.maxConcurrent,
        description: form.description.trim() || undefined,
      })
      toast.success('Правило создано')
      setShowCreateModal(false)
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

  const handleDelete = async () => {
    if (!deleting) return
    setDeleteLoading(true)
    try {
      await vacationApi.deleteRestriction(deleting.id)
      toast.success('Правило удалено')
      setDeleting(null)
      const data = await vacationApi.getRestrictions({
        departmentId: departmentId || undefined,
        tagId: tagId || undefined,
        search: debouncedSearch || undefined,
      })
      setRules(data)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    } finally {
      setDeleteLoading(false)
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
            placeholder="Поиск по описанию…"
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
                  <th className="px-3 py-2.5 font-medium">Тип</th>
                  <th className="px-3 py-2.5 font-medium">Охват</th>
                  <th className="px-3 py-2.5 font-medium">Лимит</th>
                  <th className="px-3 py-2.5 font-medium">Отдел</th>
                  <th className="px-3 py-2.5 font-medium">Автор</th>
                  <th className="px-3 py-2.5 font-medium">Дата</th>
                  <th className="px-3 py-2.5 font-medium">Описание</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => {
                  const kind = ruleKind(rule)
                  return (
                    <tr key={rule.id} className="border-b border-border/60 align-top last:border-0">
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
                          {rule.employeeIds.length > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                              <Users className="h-3 w-3" />
                              {pluralWorkers(rule.employeeIds.length)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                        {rule.type === 'pair' || rule.maxConcurrent === 0
                          ? 'Строго не пересекаться'
                          : `≤ ${rule.maxConcurrent} одновременно`}
                      </td>
                      <td className="px-3 py-3">{rule.departmentName ?? '—'}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{rule.createdByName}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">{formatDate(rule.createdAt)}</td>
                      <td className="max-w-[220px] px-3 py-3 text-muted-foreground">
                        {rule.description ? (
                          <span className="block truncate" title={rule.description}>
                            {rule.description}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setDeleting(rule)}
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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl animate-scale-in">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold">Новое правило пересечений</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-thin overscroll-contain p-5">
              <div className="space-y-2">
                <label className="block text-sm font-medium">Отдел <span className="text-destructive">*</span></label>
                <SelectDropdown
                  options={departments.length > 0
                    ? departments.map((d) => ({ value: String(d.id), label: d.name }))
                    : [{ value: '', label: 'Отделы загружаются…' }]}
                  value={form.departmentId}
                  onChange={(v) => setForm((prev) => ({ ...prev, departmentId: v, employeeIds: [] }))}
                />
              </div>

              <div className="space-y-2 rounded-xl border border-border/60 p-3.5">
                <label className="flex items-center gap-2.5 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={form.useTags}
                    onChange={(e) => setForm((prev) => ({ ...prev, useTags: e.target.checked, tagIds: e.target.checked ? prev.tagIds : [] }))}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                  />
                  По тегам
                </label>
                {form.useTags && (
                  skillsEnabled && tags.length > 0 ? (
                    <>
                      <MultiSelectDropdown
                        options={tags.map((t) => ({ value: String(t.id), label: t.name }))}
                        selected={form.tagIds}
                        onChange={(values) => setForm((prev) => ({ ...prev, tagIds: values }))}
                        placeholder="Теги не выбраны"
                        countLabel="Теги"
                        searchable
                      />
                      <p className="text-xs text-muted-foreground">
                        В правило войдут все работники с выбранными тегами (список обновляется автоматически)
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Справочник тегов пуст или модуль тегов отключён</p>
                  )
                )}
              </div>

              <div className="space-y-2 rounded-xl border border-border/60 p-3.5">
                <label className="flex items-center gap-2.5 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={form.useEmployees}
                    onChange={(e) => setForm((prev) => ({ ...prev, useEmployees: e.target.checked, employeeIds: e.target.checked ? prev.employeeIds : [] }))}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                  />
                  По сотрудникам
                </label>
                {form.useEmployees && (
                  form.departmentId ? (
                    <>
                      <MultiSelectDropdown
                        options={employeeOptions}
                        selected={form.employeeIds}
                        onChange={(values) => setForm((prev) => ({ ...prev, employeeIds: values }))}
                        placeholder="Работники не выбраны"
                        countLabel="Работники"
                        searchable
                        searchPlaceholder="Поиск по ФИО…"
                      />
                      {employeeOptions.length === 0 && (
                        <p className="text-xs text-muted-foreground">В выбранном отделе нет работников</p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Сначала выберите отдел</p>
                  )
                )}
              </div>

              <div className="rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-sm">
                {selectedCount === 0 && 'Выберите теги и/или работников — минимум двух участников'}
                {selectedCount === 1 && 'Нужен ещё один участник: работник или тег'}
                {selectedCount === 2 && 'Парное правило: выбранные участники не могут отдыхать одновременно'}
                {selectedCount > 2 && `Групповое правило: выбрано участников — ${selectedCount}`}
              </div>

              {selectedCount > 2 && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Максимум одновременно в отпуске</label>
                  <input
                    type="number"
                    min={0}
                    value={form.maxConcurrent}
                    onChange={(e) => setForm((prev) => ({ ...prev, maxConcurrent: parseInt(e.target.value) || 0 }))}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
                  />
                  <p className="text-xs text-muted-foreground">0 — строгий запрет пересечений</p>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-medium">Описание (необязательно)</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Напр. для обеспечения непрерывной работы…"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-4">
              <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)} disabled={creating}>
                Отмена
              </Button>
              <Button type="button" onClick={handleCreate} disabled={creating} className="gap-2">
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Создать правило
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <ConfirmModal
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Удалить правило"
        message={deleting ? `Удалить правило пересечений для отдела «${deleting.departmentName ?? '—'}»?` : ''}
        confirmText="Удалить"
        danger
        loading={deleteLoading}
      />
    </Card>
  )
}
