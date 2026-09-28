import { useCallback, useEffect, useRef, useState } from 'react'
import { Users, Trash2, Plus, Tag, AlertTriangle, ChevronDown, ChevronRight, UserRound, Pencil, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useVacationStore } from '@/modules/vacation/store/vacationStore'
import { vacationApi } from '@/modules/vacation/services/vacationApi'
import { RestrictionMemberPicker } from '@/modules/vacation/components/RestrictionMemberPicker'
import { useModulesStore } from '@/shared/store/modulesStore'
import { Button } from '@/shared/components/ui/Button'
import { Card } from '@/shared/components/ui/Card'
import { cn, formatDate, getErrorMessage } from '@/shared/lib/utils'
import type { RestrictionScopeEmployee, VacationRestriction } from '@/shared/types'

export function VacationRestrictions() {
  const restrictions = useVacationStore((state) => state.restrictions)
  const fetchRestrictions = useVacationStore((state) => state.fetchRestrictions)
  const violations = useVacationStore((state) => state.violations)
  const fetchViolations = useVacationStore((state) => state.fetchViolations)
  const isModuleEnabled = useModulesStore((s) => s.isModuleEnabled)
  const skillsEnabled = isModuleEnabled('skills')

  const [employees, setEmployees] = useState<RestrictionScopeEmployee[]>([])
  const [employeesLoading, setEmployeesLoading] = useState(true)
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([])
  const [maxConcurrent, setMaxConcurrent] = useState<number>(1)
  const [description, setDescription] = useState('')
  const [violationsExpanded, setViolationsExpanded] = useState(true)
  const [editing, setEditing] = useState<VacationRestriction | null>(null)
  const [saving, setSaving] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)

  const reload = useCallback(
    () => Promise.all([fetchRestrictions('', 'mine'), fetchViolations(undefined, 'mine')]),
    [fetchRestrictions, fetchViolations],
  )

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    setEmployeesLoading(true)
    vacationApi
      .getRestrictionScopeEmployees()
      .then(setEmployees)
      .catch((err: unknown) => {
        setEmployees([])
        toast.error(getErrorMessage(err))
      })
      .finally(() => setEmployeesLoading(false))
  }, [])

  const resetForm = () => {
    setEditing(null)
    setSelectedEmployees([])
    setMaxConcurrent(1)
    setDescription('')
  }

  const startEdit = (restriction: VacationRestriction) => {
    setEditing(restriction)
    setDescription(restriction.description ?? '')
    setSelectedEmployees(restriction.employeeIds)
    setMaxConcurrent(restriction.maxConcurrent ?? 1)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleSubmit = async () => {
    if (selectedEmployees.length === 0 && (editing?.tagIds?.length ?? 0) === 0) return
    setSaving(true)
    try {
      if (editing) {
        await vacationApi.updateRestriction(editing.id, editing.departmentId ?? '', {
          type: 'group',
          employeeIds: selectedEmployees,
          tagIds: editing.tagIds ?? [],
          maxConcurrent,
          description: description || undefined,
        })
        toast.success('Ограничение сохранено')
      } else {
        await useVacationStore.getState().createRestriction('', {
          type: 'group',
          employeeIds: selectedEmployees,
          tagIds: [],
          maxConcurrent,
          description: description || undefined,
        })
        toast.success('Ограничение создано')
      }
      await reload()
      resetForm()
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const knownIds = new Set(employees.map((e) => e.id))
  const hiddenSelectedCount = employeesLoading ? 0 : selectedEmployees.filter((id) => !knownIds.has(id)).length

  const handleDeleteRestriction = async (restrictionId: string) => {
    try {
      await useVacationStore.getState().deleteRestriction(restrictionId)
      if (editing?.id === restrictionId) resetForm()
      await reload()
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    }
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight">Пересечения отпусков</h2>
            <p className="text-xs text-muted-foreground">Кто не может быть в отпуске одновременно</p>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div ref={formRef} className="space-y-4 scroll-mt-24">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground/70">
              {editing ? 'Изменение ограничения' : 'Новое ограничение'}
            </h3>
            {editing && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5 text-sm">
                Вы редактируете ограничение{editing.description ? ` «${editing.description}»` : ''}. Измените название, состав или лимит и нажмите «Сохранить».
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium">Название (необязательно)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Напр. для обеспечения непрерывной работы…"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>

            <RestrictionMemberPicker
              employees={employees}
              employeesLoading={employeesLoading}
              selected={selectedEmployees}
              onChange={setSelectedEmployees}
              skillsEnabled={skillsEnabled}
            />

            {hiddenSelectedCount > 0 && (
              <p className="text-xs text-muted-foreground">
                Ещё {hiddenSelectedCount} из выбранных не входят в ваш список работников — они останутся в ограничении
              </p>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium">Максимум одновременно в отпуске</label>
              <input
                type="number"
                min="1"
                max={Math.max(1, selectedEmployees.length)}
                value={maxConcurrent}
                onChange={(e) => setMaxConcurrent(parseInt(e.target.value) || 1)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>

            {editing ? (
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={resetForm} disabled={saving} className="flex-1">
                  Отмена
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving || (selectedEmployees.length === 0 && (editing.tagIds?.length ?? 0) === 0)}
                  className="flex-1 gap-2"
                >
                  <Save className="h-4 w-4" />
                  Сохранить
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={saving || selectedEmployees.length === 0}
                className="w-full gap-2"
              >
                <Plus className="h-4 w-4" />
                Создать ограничение
              </Button>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground/70">
              Текущие ограничения{restrictions.length > 0 && ` (${restrictions.length})`}
            </h3>
            {restrictions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 py-10 text-center text-sm text-muted-foreground">
                Нет ограничений с вашими сотрудниками
              </div>
            ) : (
              <div className="space-y-2.5">
                {restrictions.map((restriction) => (
                  <div
                    key={restriction.id}
                    className={cn('rounded-xl border p-4 transition-colors', editing?.id === restriction.id ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20' : 'border-border/60')}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {restriction.description && (
                          <span className="text-sm font-medium">{restriction.description}</span>
                        )}
                        {restriction.maxConcurrent != null && (
                          <span className="text-xs text-muted-foreground">
                            максимум {restriction.maxConcurrent} одновременно
                          </span>
                        )}
                      </div>
                      {restriction.canManage && (
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => startEdit(restriction)}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            title="Изменить"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRestriction(restriction.id)}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            title="Удалить"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-sm">
                      {(restriction.employees ?? []).map((e) => e.name).join(', ') || 'Только теги'}
                    </p>
                    {(restriction.tags?.length ?? 0) > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {restriction.tags!.map((t) => (
                          <span
                            key={t.id}
                            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                          >
                            <Tag className="h-3 w-3" />
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <UserRound className="h-3 w-3" />
                      Владелец: {restriction.createdByName}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={() => setViolationsExpanded((v) => !v)}
            className="flex w-full items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground/70 transition-colors hover:text-foreground"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Текущие пересечения{violations.length > 0 && ` (${violations.length})`}
            {violationsExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {violationsExpanded && (
            violations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 py-6 text-center text-sm text-muted-foreground">
                Сейчас нет пересечений среди ваших сотрудников
              </div>
            ) : (
              <div className="space-y-2">
                {violations.map((v, i) => (
                  <div key={`${v.restrictionId}-${i}`} className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5">
                    <p className="text-sm font-medium">{v.names.join(', ')}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(v.startDate)} – {formatDate(v.endDate)}
                      {v.maxConcurrent != null && ` · лимит одновременно: ${v.maxConcurrent}`}
                      {v.tagNames.length > 0 && ` · по тегам: ${v.tagNames.join(', ')}`}
                    </p>
                    {v.description && <p className="mt-0.5 text-xs italic text-muted-foreground">{v.description}</p>}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </Card>
  )
}
