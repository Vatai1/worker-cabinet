import { useState, useRef, useEffect } from 'react'
import { X, GripVertical, ChevronUp, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { surveyApi } from '@/modules/surveys/services/surveyApi'
import { getErrorMessage } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { useDepartmentsStore } from '@/shared/store/departmentsStore'
import type { SurveyWithQuestions } from '@/shared/types'

type QuestionType = 'radio' | 'checkbox' | 'text' | 'scale'

interface LocalQuestion {
  localId: string
  type: QuestionType
  text: string
  options: string[]
  scaleMin: number
  scaleMax: number
  required: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editSurvey?: SurveyWithQuestions | null
}

const TYPE_LABELS: Record<QuestionType, string> = {
  radio: 'Один вариант',
  checkbox: 'Несколько вариантов',
  text: 'Текст',
  scale: 'Шкала',
}

function makeQuestion(type: QuestionType): LocalQuestion {
  return {
    localId: `q-${Date.now()}-${Math.random()}`,
    type,
    text: '',
    options: type === 'radio' || type === 'checkbox' ? [''] : [],
    scaleMin: 1,
    scaleMax: 5,
    required: false,
  }
}

export function SurveyBuilderModal({ open, onClose, onSaved, editSurvey }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [targetType, setTargetType] = useState<'all' | 'department' | 'employees'>('all')
  const [targetIds, setTargetIds] = useState<string[]>([])
  const [deadline, setDeadline] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [questions, setQuestions] = useState<LocalQuestion[]>([])
  const rawDepartments = useDepartmentsStore((s) => s.departments)
  const fetchDepartments = useDepartmentsStore((s) => s.fetchDepartments)
  const departments = rawDepartments.map((d: any) => ({ id: String(d.id), name: d.name }))
  const [employees, setEmployees] = useState<{ id: string; firstName: string; lastName: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dragIdx = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    if (editSurvey) {
      setTitle(editSurvey.title)
      setDescription(editSurvey.description ?? '')
      setTargetType(editSurvey.targetType)
      setTargetIds(editSurvey.targetIds)
      setDeadline(editSurvey.deadline ?? '')
      setAnonymous(editSurvey.anonymous)
      setQuestions(
        (editSurvey.questions || []).map((q) => ({
          localId: `q-${q.id}`,
          type: q.type as QuestionType,
          text: q.text,
          options: q.options || [],
          scaleMin: q.scaleMin ?? 1,
          scaleMax: q.scaleMax ?? 5,
          required: q.required,
        }))
      )
    } else {
      setTitle(''); setDescription(''); setTargetType('all')
      setTargetIds([]); setDeadline(''); setAnonymous(false); setQuestions([])
    }
  }, [open, editSurvey])

  useEffect(() => {
    const headers = getAuthHeaders()
    fetchDepartments()
    fetch(`${API_BASE_URL}/users`, { headers })
      .then((r) => r.json())
      .then((data) => setEmployees(Array.isArray(data) ? data.map((e: { id: number; firstName: string; lastName: string }) => ({ id: String(e.id), firstName: e.firstName, lastName: e.lastName })) : []))
      .catch((err) => console.error('Failed to load employees:', err))
  }, [])

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    const next = idx + dir
    if (next < 0 || next >= questions.length) return
    const arr = [...questions]
    ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
    setQuestions(arr)
  }

  const updateQuestion = (idx: number, patch: Partial<LocalQuestion>) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)))
  }

  const removeQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx))
  }

  const addOption = (idx: number) => {
    updateQuestion(idx, { options: [...questions[idx].options, ''] })
  }

  const updateOption = (qIdx: number, oIdx: number, val: string) => {
    const opts = [...questions[qIdx].options]
    opts[oIdx] = val
    updateQuestion(qIdx, { options: opts })
  }

  const removeOption = (qIdx: number, oIdx: number) => {
    const opts = questions[qIdx].options.filter((_, i) => i !== oIdx)
    updateQuestion(qIdx, { options: opts })
  }

  const buildPayload = () => ({
    title: title.trim(),
    description: description.trim(),
    targetType,
    targetIds,
    deadline: deadline || undefined,
    anonymous,
    questions: questions.map((q) => ({
      type: q.type,
      text: q.text,
      options: q.options.filter((o) => o.trim()),
      scaleMin: q.scaleMin,
      scaleMax: q.scaleMax,
      required: q.required,
    })),
  })

  const handleSaveDraft = async () => {
    if (!title.trim()) return setError('Введите название')
    setLoading(true); setError(null)
    try {
      if (editSurvey) await surveyApi.update(editSurvey.id, buildPayload())
      else await surveyApi.create(buildPayload())
      onSaved(); onClose()
    } catch (err: unknown) { setError(getErrorMessage(err)) }
    finally { setLoading(false) }
  }

  const handlePublish = async () => {
    if (!title.trim()) return setError('Введите название')
    if (!questions.length) return setError('Добавьте хотя бы один вопрос')
    setLoading(true); setError(null)
    try {
      let id = editSurvey?.id
      if (editSurvey) { await surveyApi.update(id!, buildPayload()) }
      else { const s = await surveyApi.create(buildPayload()); id = s.id }
      await surveyApi.publish(id!)
      onSaved(); onClose()
    } catch (err: unknown) { setError(getErrorMessage(err)) }
    finally { setLoading(false) }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-xl w-full max-w-5xl mx-auto flex flex-col h-[90vh] animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">{editSurvey ? 'Редактировать опрос' : 'Создать опрос'}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: question blocks */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Вопросы</p>

            {questions.map((q, idx) => (
              <div
                key={q.localId}
                draggable
                onDragStart={() => { dragIdx.current = idx }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(idx) }}
                onDrop={() => {
                  if (dragIdx.current === null || dragIdx.current === idx) return
                  const arr = [...questions]
                  const [removed] = arr.splice(dragIdx.current, 1)
                  arr.splice(idx, 0, removed)
                  setQuestions(arr)
                  dragIdx.current = null; setDragOver(null)
                }}
                onDragEnd={() => { dragIdx.current = null; setDragOver(null) }}
                className={`rounded-xl border p-4 transition-all ${dragOver === idx ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
              >
                <div className="flex gap-3">
                  <GripVertical className="h-5 w-5 text-muted-foreground mt-1 cursor-grab shrink-0" />
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground font-medium">Вопрос {idx + 1}</span>
                      <div className="flex items-center gap-1">
                        <select
                          value={q.type}
                          onChange={(e) => updateQuestion(idx, { type: e.target.value as QuestionType, options: [''] })}
                          className="text-xs bg-muted border border-border rounded px-2 py-1"
                        >
                          {(Object.entries(TYPE_LABELS) as [QuestionType, string][]).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveQuestion(idx, -1)}>
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveQuestion(idx, 1)}>
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => removeQuestion(idx)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <Input
                      placeholder="Текст вопроса"
                      value={q.text}
                      onChange={(e) => updateQuestion(idx, { text: e.target.value })}
                    />

                    {(q.type === 'radio' || q.type === 'checkbox') && (
                      <div className="space-y-2">
                        {q.options.map((opt, oIdx) => (
                          <div key={oIdx} className="flex gap-2">
                            <Input
                              placeholder={`Вариант ${oIdx + 1}`}
                              value={opt}
                              onChange={(e) => updateOption(idx, oIdx, e.target.value)}
                              className="flex-1"
                            />
                            {q.options.length > 1 && (
                              <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => removeOption(idx, oIdx)}>
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={() => addOption(idx)}>
                          <Plus className="h-3 w-3 mr-1" /> Вариант
                        </Button>
                      </div>
                    )}

                    {q.type === 'scale' && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium">Диапазон:</span>
                        <select
                          value={`${q.scaleMin}-${q.scaleMax}`}
                          onChange={(e) => {
                            const [min, max] = e.target.value.split('-').map(Number)
                            updateQuestion(idx, { scaleMin: min, scaleMax: max })
                          }}
                          className="text-xs bg-muted border border-border rounded px-2 py-1"
                        >
                          <option value="1-5">1 – 5</option>
                          <option value="1-10">1 – 10</option>
                        </select>
                      </div>
                    )}

                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) => updateQuestion(idx, { required: e.target.checked })}
                        className="rounded"
                      />
                      Обязательный вопрос
                    </label>
                  </div>
                </div>
              </div>
            ))}

            <div className="border border-dashed border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-3 text-center">Добавить вопрос</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {(['radio', 'checkbox', 'text', 'scale'] as QuestionType[]).map((type) => (
                  <Button
                    key={type}
                    variant="outline"
                    size="sm"
                    onClick={() => setQuestions((prev) => [...prev, makeQuestion(type)])}
                  >
                    {TYPE_LABELS[type]}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: settings */}
          <div className="w-80 border-l border-border overflow-y-auto p-6 space-y-4 shrink-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Настройки</p>

            <div>
              <label className="text-sm font-medium mb-1 block">Название *</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название опроса" />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Описание</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Необязательно"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none h-20"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Аудитория</label>
              <select
                value={targetType}
                onChange={(e) => { setTargetType(e.target.value as typeof targetType); setTargetIds([]) }}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm mb-2"
              >
                <option value="all">Все сотрудники</option>
                <option value="department">Конкретный отдел</option>
                <option value="employees">Конкретные сотрудники</option>
              </select>
              {targetType === 'department' && (
                <select
                  className="w-full rounded border border-border bg-background text-foreground px-2 py-1 text-sm mt-2"
                  value={targetIds[0] ?? ''}
                  onChange={(e) => setTargetIds(e.target.value ? [e.target.value] : [])}
                >
                  <option value="">— Выберите отдел —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              )}
              {targetType === 'employees' && (
                <div className="mt-2 border border-border rounded p-2 max-h-40 overflow-y-auto space-y-1">
                  {employees.map((emp) => (
                    <label key={emp.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={targetIds.includes(emp.id)}
                        onChange={(e) => {
                          setTargetIds((prev) =>
                            e.target.checked ? [...prev, emp.id] : prev.filter((id) => id !== emp.id)
                          )
                        }}
                      />
                      {emp.firstName} {emp.lastName}
                    </label>
                  ))}
                  {employees.length === 0 && <p className="text-xs text-muted-foreground">Загрузка...</p>}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Дедлайн</label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Анонимные ответы</label>
              <button
                type="button"
                onClick={() => setAnonymous((v) => !v)}
                className={`w-10 h-6 rounded-full transition-colors relative ${anonymous ? 'bg-primary' : 'bg-muted'}`}
              >
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-card transition-transform shadow-sm ${anonymous ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="space-y-2 pt-2">
              <Button variant="outline" className="w-full" onClick={handleSaveDraft} disabled={loading}>
                Сохранить черновик
              </Button>
              <Button className="w-full" onClick={handlePublish} disabled={loading}>
                {loading ? 'Публикация...' : 'Опубликовать'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
